import { useCallback, useEffect, useRef } from "react";
import type { EmotionEngine } from "@/lib/emotion";
import type { KeySettings } from "@/lib/keys";

type SpeakFn = (input: {
  data: {
    ttsProvider: "edge" | "kokoro" | "openai" | "elevenlabs";
    ttsKey: string;
    voice: string;
    text: string;
    emotion?: string;
    intensity?: number;
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
 * Falls back to the browser's own voice when no voice key is configured.
 */
export function useVoiceOutput(engine: EmotionEngine, speakFn: SpeakFn) {
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
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

  const speak = useCallback(
    async (text: string, settings: KeySettings, options?: VoiceOptions) => {
      cleanup();
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
        const { audio } = await speakFn({
          data: {
            ttsProvider: settings.ttsProvider,
            ttsKey: settings.ttsKey,
            voice,
            text,
            emotion: options?.emotion,
            intensity: options?.intensity,
          },
        });
        const ctx = ctxRef.current ?? new AudioContext();
        ctxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume().catch(() => {});
        const bytes = base64ToBytes(audio);
        const buffer = await ctx.decodeAudioData(bytes.buffer as ArrayBuffer);
        const source = ctx.createBufferSource();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.buffer = buffer;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        const data = new Uint8Array(analyser.fftSize);

        await new Promise<void>((resolve) => {
          const tick = () => {
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
            cleanup();
            resolve();
          };
          source.start();
          rafRef.current = requestAnimationFrame(tick);
        });
      } catch {
        await browserVoice(text, options?.browser);
      }
    },
    [browserVoice, cleanup, engine, speakFn],
  );

  return { speak, stopSpeaking: cleanup };
}
