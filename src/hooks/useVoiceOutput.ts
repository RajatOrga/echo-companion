import { useCallback, useEffect, useRef } from "react";
import type { EmotionEngine } from "@/lib/emotion";
import type { KeySettings } from "@/lib/keys";
import { splitIntoSentences } from "@/lib/sentences";

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
   * (up to 2 ahead), and plays them back-to-back for near-instant first-sentence
   * playback while later sentences are still being synthesized.
   */
  const speak = useCallback(
    async (text: string, settings: KeySettings, options?: VoiceOptions) => {
      cleanup();
      cancelledRef.current = false;

      // Browser fallback (no TTS key / provider=none)
      if (
        settings.ttsProvider === "none" ||
        (settings.ttsProvider !== "edge" &&
          settings.ttsProvider !== "kokoro" &&
          !settings.ttsKey.trim())
      ) {
        let rate = options?.browser?.rate ?? 0.98;
        let pitch = options?.browser?.pitch ?? 1.0;
        if (options?.emotion === "happy" || options?.emotion === "amused") {
          rate *= 1.05;
          pitch *= 1.08;
        } else if (options?.emotion === "thoughtful" || options?.emotion === "sad") {
          rate *= 0.92;
          pitch *= 0.95;
        } else if (options?.emotion === "curious" || options?.emotion === "surprised") {
          pitch *= 1.05;
        }
        await browserVoice(text, { rate, pitch });
        return;
      }

      try {
        const defaultVoice =
          settings.ttsProvider === "kokoro"
            ? "af_heart"
            : settings.ttsProvider === "edge"
              ? "en-US-AvaMultilingualNeural"
              : settings.ttsProvider === "elevenlabs"
                ? "21m00Tcm4TlvDq8ikWAM"
                : "alloy";
        const voice =
          options?.voice || (settings.voice !== "auto" ? settings.voice : defaultVoice);

        const sentences = splitIntoSentences(text);
        if (sentences.length === 0) return;

        // For a single sentence, skip the pipeline overhead
        if (sentences.length === 1) {
          const { audio } = await speakFn({
            data: {
              ttsProvider: settings.ttsProvider as "edge" | "kokoro" | "openai" | "elevenlabs",
              ttsKey: settings.ttsKey,
              voice,
              text: sentences[0]!,
              emotion: options?.emotion,
              intensity: options?.intensity,
            },
          });
          if (cancelledRef.current) return;
          const buffer = await decodeChunk(audio);
          if (cancelledRef.current) return;
          await playBuffer(buffer);
          return;
        }

        // Pipeline: pre-synthesize up to 2 sentences ahead while playing current
        const synthPromises: Promise<AudioBuffer | null>[] = [];

        const synthesize = (idx: number): Promise<AudioBuffer | null> => {
          if (idx >= sentences.length) return Promise.resolve(null);
          return speakFn({
            data: {
              ttsProvider: settings.ttsProvider as "edge" | "kokoro" | "openai" | "elevenlabs",
              ttsKey: settings.ttsKey,
              voice,
              text: sentences[idx]!,
              emotion: options?.emotion,
              intensity: options?.intensity,
            },
          })
            .then(({ audio }) => (cancelledRef.current ? null : decodeChunk(audio)))
            .catch(() => null);
        };

        // Kick off first 2 sentences immediately
        synthPromises[0] = synthesize(0);
        if (sentences.length > 1) {
          synthPromises[1] = synthesize(1);
        }

        // Play each sentence as it becomes available, launch next synthesis
        for (let i = 0; i < sentences.length; i++) {
          if (cancelledRef.current) return;

          // Wait for this sentence's audio to be ready
          const buffer = await synthPromises[i];
          if (!buffer || cancelledRef.current) return;

          // Kick off synthesis for i+2 (look-ahead by 2)
          const nextIdx = i + 2;
          if (nextIdx < sentences.length) {
            synthPromises[nextIdx] = synthesize(nextIdx);
          }

          // Play this chunk
          await playBuffer(buffer);
          if (cancelledRef.current) return;
        }
      } catch {
        // On any synthesis failure, fall back to browser voice
        if (!cancelledRef.current) {
          await browserVoice(text, options?.browser);
        }
      }
    },
    [browserVoice, cleanup, decodeChunk, engine, playBuffer, speakFn],
  );

  return { speak, stopSpeaking: cleanup };
}
