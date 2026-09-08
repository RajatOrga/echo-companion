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

function parseTurn(raw: string): TurnResult {
  const fallback: TurnResult = {
    reply: raw.trim(),
    emotion: "neutral",
    intensity: 0.5,
    gaze: "user",
    head: "still",
  };
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return fallback;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<TurnResult>;
    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) return fallback;
    return {
      reply: parsed.reply.trim(),
      emotion: typeof parsed.emotion === "string" ? parsed.emotion : "neutral",
      intensity:
        typeof parsed.intensity === "number" && Number.isFinite(parsed.intensity)
          ? Math.min(Math.max(parsed.intensity, 0), 1)
          : 0.5,
      gaze: typeof parsed.gaze === "string" ? parsed.gaze : "user",
      head: typeof parsed.head === "string" ? parsed.head : "still",
    };
  } catch {
    return fallback;
  }
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

async function chat(data: z.infer<typeof ChatInput>): Promise<TurnResult> {
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
        }),
      });
      if (!res.ok) await failure(res);
      const json = (await res.json()) as { content?: { text?: string }[] };
      return parseTurn(json.content?.map((c) => c.text ?? "").join("") ?? "");
    }

    if (provider === "gemini") {
      const root = base || "https://generativelanguage.googleapis.com/v1beta";
      const res = await fetch(
        `${root}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: messages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
            generationConfig: { responseMimeType: "application/json", maxOutputTokens: 700 },
          }),
        },
      );
      if (!res.ok) await failure(res);
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text =
        json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      return parseTurn(text);
    }

    // openai + any OpenAI-compatible endpoint
    const root = base || "https://api.openai.com/v1";
    const res = await fetch(`${root}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...messages],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) await failure(res);
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
  return parseTurn(json.choices?.[0]?.message?.content ?? "");
}

export const runTurn = createServerFn({ method: "POST" })
  .validator((input: unknown) => ChatInput.parse(input))
  .handler(({ data }) => chat(data));

const SpeakInput = z.object({
  ttsProvider: z.enum(["edge", "openai", "elevenlabs"]),
  ttsKey: z.string().optional().default(""),
  voice: z.string().min(1),
  text: z.string().min(1).max(4000),
  emotion: z.string().optional(),
  intensity: z.number().optional(),
});

export const speak = createServerFn({ method: "POST" })
  .validator((input: unknown) => SpeakInput.parse(input))
  .handler(async ({ data }): Promise<{ audio: string; mimeType: string }> => {
    if (data.ttsProvider === "edge") {
      const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
      const tts = new MsEdgeTTS();
      await tts.setMetadata(
        data.voice || "en-US-AvaMultilingualNeural",
        OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
      );
      const { audioStream } = tts.toStream(data.text);
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
        audioStream.on("end", () => resolve());
        audioStream.on("error", reject);
      });
      try {
        tts.close();
      } catch {
        /* close if open */
      }
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
            text: data.text,
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
          input: data.text,
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
    const result = await chat({
      ...data,
      system: 'Reply with JSON only: {"reply":"Hello, I can hear you.","emotion":"warm","intensity":0.5,"gaze":"user","head":"nod"}',
      messages: [{ role: "user", content: "Say hello." }],
    });
    return { ok: true, sample: result.reply };
  });
