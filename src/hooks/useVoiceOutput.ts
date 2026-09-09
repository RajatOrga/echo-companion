import { useCallback, useEffect, useRef } from "react";
import type { EmotionEngine } from "@/lib/emotion";
import type { KeySettings } from "@/lib/keys";
import { splitIntoSentences } from "@/lib/sentences";
import { stripSpeechText } from "@/lib/ai.functions";

type SpeakFn = (input: {
  data: {
    ttsProvider: "edge" | "kokoro" | "openai" | "elevenlabs";
    ttsKey?: string | undefined;
    voice: string;
    text: string;
    emotion?: string | undefined;
    intensity?: number | undefined;
  };
}) => Promise<{ audio: string; mimeType: string }>;

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export type VoiceOptions = {
  voice?: string;
  emotion?: string;
  intensity?: number;
  browser?: {
    rate: number;
    pitch: number;
  };
};

/**
 * Speaks a reply and drives the mouth from the loudness of the audio.
 * Supports streaming: splits long text into sentences and synthesizes/plays
 * them in a pipeline so the first sentence plays while later ones are still
 * being synthesized. Falls back to the browser's own voice when no key.
 */
export function useVoiceOutput(engine: EmotionEngine, speakFn: SpeakFn) {
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    cancelledRef.current = true;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopRef.current?.();
    stopRef.current = null;
    engine.setMouth(0);
  }, [engine]);

  useEffect(() => cleanup, [cleanup]);

  const browserVoice = useCallback(
    (text: string, options?: { rate?: number; pitch?: number }) =>
      new Promise<void>((resolve) => {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          resolve();
          return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = options?.rate ?? 0.98;
        utterance.pitch = options?.pitch ?? 1.0;

        const voices = window.speechSynthesis.getVoices();
        // Prefer natural / high-quality English voices
        const naturalVoice =
          voices.find(
            (v) =>
              v.lang.startsWith("en") &&
              (v.name.includes("Natural") ||
                v.name.includes("Online") ||
                v.name.includes("Google") ||
                v.name.includes("Premium") ||
                v.name.includes("Samantha") ||
                v.name.includes("Daniel") ||
                v.name.includes("Aria")),
          ) ?? voices.find((v) => v.lang.startsWith("en"));
        if (naturalVoice) utterance.voice = naturalVoice;

        // No audio graph available for browser speech: fake a natural mouth rhythm.
        let t = 0;
        const tick = () => {
          t += 0.05;
          const level =
            0.25 + Math.abs(Math.sin(t * 6.1)) * 0.4 + Math.abs(Math.sin(t * 2.3)) * 0.25;
          engine.setMouth(Math.min(level, 1));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        const finish = () => {
          cleanup();
          resolve();
        };
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
      }),
    [cleanup, engine],
  );

  /** Decode base64 audio into an AudioBuffer ready for playback */
  const decodeChunk = useCallback(
    async (audio: string): Promise<AudioBuffer> => {
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      const bytes = base64ToBytes(audio);
      return ctx.decodeAudioData(bytes.buffer as ArrayBuffer);
    },
    [],
  );

  /** Play a single AudioBuffer with mouth-sync analyser, returns when playback ends */
  const playBuffer = useCallback(
    (buffer: AudioBuffer): Promise<void> => {
      return new Promise<void>((resolve) => {
        const ctx = ctxRef.current!;
        const source = ctx.createBufferSource();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.buffer = buffer;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        const data = new Uint8Array(analyser.fftSize);

        const tick = () => {
          if (cancelledRef.current) return;
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) {
            const v = (data[i]! - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          engine.setMouth(Math.min(rms * 4.2, 1));
          rafRef.current = requestAnimationFrame(tick);
        };

        stopRef.current = () => {
          try {
            source.stop();
          } catch {
            /* already ended */
          }
        };
        source.onended = () => {
          if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
          // Settle mouth when no immediate next buffer is queued
          engine.setMouth(0);
          resolve();
        };
        source.start();
        rafRef.current = requestAnimationFrame(tick);
      });
    },
    [engine],
  );

  /**
   * Streaming speak: splits text into sentences, synthesizes them in a pipeline
   * (with concurrent lookahead prefetching), and plays them back-to-back with
   * zero silence gaps between sentences.
   */
  const speak = useCallback(
    async (textOrStream: string | AsyncIterable<string>, settings: KeySettings, options?: VoiceOptions) => {
      cleanup();
      cancelledRef.current = false;

      const stream =
        typeof textOrStream === "string"
          ? (async function* () { yield textOrStream; })()
          : textOrStream;

      const sentenceQueue: string[] = [];
      let isStreamComplete = false;
      let sentenceResolver: (() => void) | null = null;

      const pushSentence = (sentence: string) => {
        const clean = stripSpeechText(sentence);
        if (clean) {
          sentenceQueue.push(clean);
          if (sentenceResolver) {
            sentenceResolver();
            sentenceResolver = null;
          }
        }
      };

      const waitForNextSentence = async () => {
        if (sentenceQueue.length > 0) return sentenceQueue.shift()!;
        if (isStreamComplete) return null;
        await new Promise<void>((resolve) => { sentenceResolver = resolve; });
        if (sentenceQueue.length > 0) return sentenceQueue.shift()!;
        return null;
      };

      // Producer: accumulates incoming stream chunks and emits speakable units
      // Never emits tiny fragments (< 28 chars) alone to prevent TTS buffer starvation
      const producer = async () => {
        let buffer = "";
        let isFirst = true;
        try {
          for await (const chunk of stream) {
            if (cancelledRef.current) break;
            buffer += chunk;
            const minChars = isFirst ? 28 : 38;

            const segments = splitIntoSentences(buffer, {
              minFirstChars: minChars,
              minChars: 38,
              maxClauseChars: 85,
            });

            if (segments.length > 1) {
              const lastSegment = segments.pop()!;
              for (const s of segments) {
                pushSentence(s);
                isFirst = false;
              }
              buffer = lastSegment;
            } else if (segments.length === 1) {
              const single = segments[0]!;
              const hasTerminal = /[.!?。！？]["')\]]*$/.test(single) || single.includes("\n");
              if (hasTerminal && single.length >= minChars) {
                pushSentence(single);
                isFirst = false;
                buffer = "";
              }
            }
          }
        } catch (e) {
          console.error("Stream reading error:", e);
        } finally {
          if (buffer.trim()) {
            const remaining = splitIntoSentences(buffer);
            if (remaining.length > 0) {
              for (const s of remaining) pushSentence(s);
            } else {
              pushSentence(buffer.trim());
            }
          }
          isStreamComplete = true;
          if (sentenceResolver) sentenceResolver();
        }
      };

      const audioQueue: AudioBuffer[] = [];
      let audioResolver: (() => void) | null = null;
      let isSynthComplete = false;

      const pushAudio = (buffer: AudioBuffer) => {
        audioQueue.push(buffer);
        if (audioResolver) {
          audioResolver();
          audioResolver = null;
        }
      };

      const waitForNextAudio = async () => {
        if (audioQueue.length > 0) {
          const buf = audioQueue.shift()!;
          if (audioResolver) {
            audioResolver();
            audioResolver = null;
          }
          return buf;
        }
        if (isSynthComplete) return null;
        await new Promise<void>((resolve) => { audioResolver = resolve; });
        if (audioQueue.length > 0) {
          const buf = audioQueue.shift()!;
          if (audioResolver) {
            audioResolver();
            audioResolver = null;
          }
          return buf;
        }
        return null;
      };

      // Ordered delivery map to ensure AudioBuffers are delivered in exact sentence sequence
      const readyAudio = new Map<number, AudioBuffer | null>();
      let nextDeliverIndex = 0;
      let nextSentenceIndex = 0;

      const deliverReadyAudio = () => {
        while (readyAudio.has(nextDeliverIndex)) {
          const buf = readyAudio.get(nextDeliverIndex);
          readyAudio.delete(nextDeliverIndex);
          nextDeliverIndex++;
          if (buf) {
            pushAudio(buf);
          }
        }
      };

      const defaultVoice = settings.ttsProvider === "kokoro" ? "af_heart"
          : settings.ttsProvider === "edge" ? "en-US-AvaMultilingualNeural"
          : settings.ttsProvider === "elevenlabs" ? "21m00Tcm4TlvDq8ikWAM" : "alloy";
      const voice = options?.voice || (settings.voice !== "auto" ? settings.voice : defaultVoice);

      const synthesizeOne = async (index: number, sentence: string) => {
        if (settings.ttsProvider === "none" || (settings.ttsProvider !== "edge" && settings.ttsProvider !== "kokoro" && !settings.ttsKey.trim())) {
          let rate = options?.browser?.rate ?? 0.98;
          let pitch = options?.browser?.pitch ?? 1.0;
          if (options?.emotion === "happy" || options?.emotion === "amused") { rate *= 1.05; pitch *= 1.08; }
          else if (options?.emotion === "thoughtful" || options?.emotion === "sad") { rate *= 0.92; pitch *= 0.95; }
          await browserVoice(sentence, { rate, pitch });
          readyAudio.set(index, null);
          deliverReadyAudio();
          return;
        }

        try {
          const { audio } = await speakFn({
            data: {
              ttsProvider: settings.ttsProvider as any,
              ttsKey: settings.ttsKey,
              voice,
              text: sentence,
              emotion: options?.emotion,
              intensity: options?.intensity,
            },
          });
          if (cancelledRef.current) return;
          if (audio) {
            const buffer = await decodeChunk(audio);
            if (cancelledRef.current) return;
            readyAudio.set(index, buffer);
          } else {
            readyAudio.set(index, null);
          }
        } catch (e) {
          console.error("Synthesis error:", e);
          readyAudio.set(index, null);
        }
        deliverReadyAudio();
      };

      const worker = async () => {
        while (!cancelledRef.current) {
          // Backpressure: cap pre-synthesized audio queue to 3
          while (audioQueue.length >= 3 && !cancelledRef.current) {
            await new Promise<void>((resolve) => { audioResolver = resolve; });
          }
          if (cancelledRef.current) break;

          const sentence = await waitForNextSentence();
          if (!sentence) break;

          const idx = nextSentenceIndex++;
          await synthesizeOne(idx, sentence);
        }
      };

      const synthesizer = async () => {
        const isBrowserTts = settings.ttsProvider === "none" || (settings.ttsProvider !== "edge" && settings.ttsProvider !== "kokoro" && !settings.ttsKey.trim());
        // For browser TTS, run single worker to avoid voice overlapping
        // For remote/edge TTS, run 2 concurrent workers for lookahead prefetching
        if (isBrowserTts) {
          await worker();
        } else {
          await Promise.all([worker(), worker()]);
        }
        isSynthComplete = true;
        if (audioResolver) audioResolver();
      };

      const player = async () => {
        while (!cancelledRef.current) {
          const buffer = await waitForNextAudio();
          if (!buffer) break;
          await playBuffer(buffer);
        }
      };

      void producer();
      void synthesizer();
      await player();
    },
    [cleanup, browserVoice, speakFn, playBuffer, decodeChunk],
  );

  return { speak, stopSpeaking: cleanup };
}
