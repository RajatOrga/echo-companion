import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Thin, provider-agnostic proxy. The user's key travels with a single request
 * and is never stored, logged or persisted anywhere. This exists only because
 * some providers refuse direct browser calls (CORS) — nothing about it is
 * platform-specific, so the app stays portable to any host.
 */

const ChatInput = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "custom"]),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  baseUrl: z.string().optional(),
  system: z.string().min(1),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(60),
});

export type TurnResult = {
  reply: string;
  emotion: string;
  intensity: number;
  gaze: string;
  head: string;
};

export function stripSpeechText(text: string): string {
  return text
    .replace(/\[(emotion|intensity|gaze|head):\s*[^\]]+\]/gi, "") // strip metadata tags
    .replace(/\[[^\]]*\]/g, "") // strip any brackets
    .replace(/\*[^*]*\*/g, "")  // strip stage directions (*chuckles*, etc)
    .replace(/```[\s\S]*?```/g, "") // strip code blocks
    .replace(/[#*_~`]/g, "")    // strip markdown symbols
    .replace(/\s+/g, " ")       // collapse spaces
    .trim();
}

/**
 * Stream-safe speech stripper: removes closed brackets AND suppresses
 * any trailing unclosed '[' or '*' so incomplete tags are NEVER voiced.
 */
export function stripStreamingSpeech(text: string): string {
  let s = text.replace(/\[[^\]]*$/, "").replace(/\*[^*]*$/, "");
  return stripSpeechText(s);
}

export function inferEmotionAndGesture(text: string): { emotion: string; intensity: number; gaze: string; head: string } {
  const lower = text.toLowerCase();

  let emotion = "warm";
  let intensity = 0.6;
  let head = "still";
  let gaze = "user";

  if (/\b(haha|hehe|funny|joke|silly|kidding|lol|rofl|giggle)\b/.test(lower)) {
    emotion = "amused";
    intensity = 0.8;
    head = "nod";
  } else if (/\b(yay|awesome|great|wonderful|love|glad|happy|cool|sweet|fantastic)\b/.test(lower)) {
    emotion = "happy";
    intensity = 0.75;
    head = "nod";
  } else if (/\?|(\b(wonder|curious|how come|what if|really\?)\b)/.test(lower)) {
    emotion = "curious";
    intensity = 0.7;
    head = "tilt";
  } else if (/\b(sorry|worried|oh no|are you okay|sad|hurt|miss you|rough|tough)\b/.test(lower)) {
    emotion = "concerned";
    intensity = 0.7;
    head = "tilt";
    gaze = "down";
  } else if (/\b(hmm|perhaps|maybe|consider|think|interesting)\b/.test(lower)) {
    emotion = "thoughtful";
    intensity = 0.6;
    head = "tilt";
    gaze = "away";
  } else if (/\b(no|never|nah|can't|don't|not really|impossible)\b/.test(lower)) {
    head = "shake";
  } else if (/\b(yes|yeah|yep|totally|definitely|absolutely|agree|of course)\b/.test(lower)) {
    head = "nod";
  }

  return { emotion, intensity, gaze, head };
}

export function parseTurn(raw: string): TurnResult {
  const text = raw.trim();
  const inferred = inferEmotionAndGesture(text);

  const result: TurnResult = {
    reply: "",
    emotion: inferred.emotion,
    intensity: inferred.intensity,
    gaze: inferred.gaze,
    head: inferred.head,
  };

  // If explicit tags were present, allow them to override
  const tagRegex = /\[(emotion|intensity|gaze|head):\s*([^\]]+)\]/gi;
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim().toLowerCase();
    if (key === "emotion") result.emotion = value;
    if (key === "intensity") result.intensity = Math.min(1, Math.max(0, parseFloat(value) || 0.5));
    if (key === "gaze") result.gaze = value;
    if (key === "head") result.head = value;
  }

  // Pure spoken words only — never leak tags into speech
  result.reply = stripSpeechText(text);
  return result;
}

async function failure(res: Response): Promise<never> {
  const text = await res.text().catch(() => "");
  let message = text.slice(0, 400);
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") message = parsed.error;
    else if (parsed.error?.message) message = parsed.error.message;
  } catch {
    /* keep raw text */
  }
  throw new Error(message || `Provider returned ${res.status}`);
}

async function* chatGenerator(data: z.infer<typeof ChatInput>): AsyncGenerator<string, void, unknown> {
    const { provider, apiKey, model, system, messages } = data;
    const base = (data.baseUrl || "").replace(/\/+$/, "");

    if (provider === "anthropic") {
      const res = await fetch(`${base || "https://api.anthropic.com"}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 700,
          system,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });
      if (!res.ok) await failure(res);
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === "[DONE]") return;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              yield parsed.delta.text;
            }
          } catch {}
        }
      }
      return;
    }

    if (provider === "gemini") {
      const root = base || "https://generativelanguage.googleapis.com/v1beta";
      const res = await fetch(
        `${root}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: messages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
            generationConfig: { maxOutputTokens: 700 },
          }),
        },
      );
      if (!res.ok) await failure(res);
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const dataStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(dataStr);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) yield text;
          } catch {}
        }
      }
      return;
    }

    // openai + any OpenAI-compatible endpoint
    const root = base || "https://api.openai.com/v1";
    const res = await fetch(`${root}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...messages],
        stream: true,
      }),
    });
    if (!res.ok) await failure(res);
    
    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") return;
        try {
          const parsed = JSON.parse(dataStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {}
      }
    }
}

async function chat(data: z.infer<typeof ChatInput>): Promise<Response> {
  const gen = chatGenerator(data);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of gen) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
    },
  });
}

export const runTurn = createServerFn({ method: "POST" })
  .validator((input: unknown) => ChatInput.parse(input))
  .handler(async ({ data }): Promise<Response> => chat(data));

// Kokoro-82M model instance cache for fast offline inference
let kokoroInstance: unknown = null;

async function getKokoro() {
  if (!kokoroInstance) {
    const { KokoroTTS } = await import("kokoro-js");
    kokoroInstance = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: "q8",
    });
  }
  return kokoroInstance as {
    generate: (
      text: string,
      options: { voice: string },
    ) => Promise<{ toWav: () => ArrayBuffer }>;
  };
}

export const installKokoro = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: boolean; message: string }> => {
    await getKokoro();
    return { ok: true, message: "Kokoro-82M is downloaded and ready for offline use!" };
  },
);

export const getKokoroStatus = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ installed: boolean }> => {
    return { installed: kokoroInstance !== null };
  },
);

const SpeakInput = z.object({
  ttsProvider: z.enum(["edge", "kokoro", "openai", "elevenlabs"]),
  ttsKey: z.string().optional().default(""),
  voice: z.string().min(1),
  text: z.string().min(1).max(4000),
  emotion: z.string().optional(),
  intensity: z.number().optional(),
});

// Module-level Edge TTS connection cache (eliminates ~150ms handshake per sentence)
// Typed as unknown to avoid importing the class; cast locally after dynamic import
let edgeTtsCache: unknown = null;
let edgeTtsCacheVoice: string | null = null;


export const speak = createServerFn({ method: "POST" })
  .validator((input: unknown) => SpeakInput.parse(input))
  .handler(async ({ data }): Promise<{ audio: string; mimeType: string }> => {
    const cleanText = stripSpeechText(data.text);
    if (!cleanText) {
      return { audio: "", mimeType: "audio/wav" };
    }

    if (data.ttsProvider === "kokoro") {
      const tts = await getKokoro();
      const rawAudio = await tts.generate(cleanText, {
        voice: data.voice || "af_heart",
      });
      const wavBuffer = Buffer.from(rawAudio.toWav());
      return { audio: wavBuffer.toString("base64"), mimeType: "audio/wav" };
    }

    if (data.ttsProvider === "edge") {
      const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
      // Cache Edge TTS instance per voice to avoid reconnecting on every sentence
      const voiceKey = data.voice || "en-US-AvaMultilingualNeural";
      if (!edgeTtsCache || edgeTtsCacheVoice !== voiceKey) {
        const instance = new MsEdgeTTS();
        await instance.setMetadata(voiceKey, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        edgeTtsCache = instance;
        edgeTtsCacheVoice = voiceKey;
      }
      const tts = edgeTtsCache as InstanceType<typeof MsEdgeTTS>;
      const { audioStream } = tts.toStream(cleanText);
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
        audioStream.on("end", () => resolve());
        audioStream.on("error", (err: unknown) => {
          // If stream errors, reset cache so next call reconnects
          edgeTtsCache = null;
          edgeTtsCacheVoice = null;
          reject(err);
        });
      });
      const buffer = Buffer.concat(chunks);
      return { audio: buffer.toString("base64"), mimeType: "audio/mpeg" };
    }

    let res: Response;
    if (data.ttsProvider === "elevenlabs") {
      let stability = 0.45;
      let style = 0.35;
      if (data.emotion === "happy" || data.emotion === "amused") {
        stability = 0.38;
        style = 0.55;
      } else if (data.emotion === "warm" || data.emotion === "companion") {
        stability = 0.42;
        style = 0.45;
      } else if (data.emotion === "thoughtful" || data.emotion === "sad" || data.emotion === "concerned") {
        stability = 0.60;
        style = 0.20;
      } else if (data.emotion === "curious" || data.emotion === "surprised") {
        stability = 0.40;
        style = 0.48;
      }

      res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(data.voice)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "xi-api-key": data.ttsKey },
          body: JSON.stringify({
            text: cleanText,
            model_id: "eleven_turbo_v2_5",
            voice_settings: {
              stability,
              similarity_boost: 0.85,
              style,
              use_speaker_boost: true,
            },
          }),
        },
      );
    } else {
      const speed =
        data.emotion === "thoughtful" || data.emotion === "sad"
          ? 0.94
          : data.emotion === "happy" || data.emotion === "amused"
            ? 1.05
            : 1.0;

      res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${data.ttsKey}` },
        body: JSON.stringify({
          model: "tts-1",
          input: cleanText,
          voice: data.voice,
          response_format: "mp3",
          speed,
        }),
      });
    }
    if (!res.ok) await failure(res);
    const buffer = Buffer.from(await res.arrayBuffer());
    return { audio: buffer.toString("base64"), mimeType: "audio/mpeg" };
  });

const TestInput = ChatInput.pick({
  provider: true,
  apiKey: true,
  model: true,
  baseUrl: true,
});

export const testConnection = createServerFn({ method: "POST" })
  .validator((input: unknown) => TestInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; sample: string }> => {
    const stream = chatGenerator({
      ...data,
      system: 'Reply with exactly: [emotion: warm] Hello, I can hear you.',
      messages: [{ role: "user", content: "Say hello." }],
    });
    let full = "";
    for await (const chunk of stream) full += chunk;
    const result = parseTurn(full);
    return { ok: true, sample: result.reply || full };
  });
