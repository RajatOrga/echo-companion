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
  /** Called the instant audio playback begins — use for echo-guard timing */
  onPlaybackStart?: () => void;
};

/**
 * Speaks a reply and drives the mouth from the loudness of the audio.
 * Streaming pipeline: Producer → Synthesizer (2 workers) → Player.
 * First sentence fires after only ~12 chars for minimal latency.
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

  useEffect(() => {
    return () => {
      cleanup();
      // Close AudioContext on unmount to prevent resource leak (browser cap: ~6 contexts)
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, [cleanup]);

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
        const naturalVoice =
          voices.find(
            (v) =>
              v.lang.startsWith("en") &&
              (v.name.includes("Natural") ||
                v.name.includes("Online") ||
                v.name.includes("Jenny") ||
                v.name.includes("Aria") ||
                v.name.includes("Guy") ||
                v.name.includes("Google") ||
                v.name.includes("Neural")),
          ) ?? voices.find((v) => v.lang.startsWith("en"));
        if (naturalVoice) utterance.voice = naturalVoice;

        let mouthDecayTimer: ReturnType<typeof setTimeout> | null = null;
        let t = 0;
        const tick = () => {
          if (cancelledRef.current) return;
          t += 0.08;
          const level =
            0.2 + Math.abs(Math.sin(t * 7.2)) * 0.35 + Math.abs(Math.sin(t * 3.1)) * 0.2;
          engine.setMouth(Math.min(level, 0.85));
          rafRef.current = requestAnimationFrame(tick);
        };

        utterance.onboundary = (event) => {
          if (event.name === "word") {
            engine.setMouth(0.65 + Math.random() * 0.3);
            if (mouthDecayTimer) clearTimeout(mouthDecayTimer);
            mouthDecayTimer = setTimeout(() => engine.setMouth(0.15), 110);
          }
        };

        rafRef.current = requestAnimationFrame(tick);

        const finish = () => {
          if (mouthDecayTimer) clearTimeout(mouthDecayTimer);
          if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
          engine.setMouth(0);
          resolve();
        };
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
      }),
    [engine],
  );

  const decodeChunk = useCallback(
    async (audio: string): Promise<AudioBuffer> => {
      if (!ctxRef.current || ctxRef.current.state === "closed") {
        ctxRef.current = new AudioContext();
      }
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      const bytes = base64ToBytes(audio);
      return ctx.decodeAudioData(bytes.buffer as ArrayBuffer);
    },
    [],
  );

  const playBuffer = useCallback(
    (buffer: AudioBuffer, onStart?: () => void): Promise<void> => {
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
          // 5.5x gain (was 4.2) for more visible lip movement
          engine.setMouth(Math.min(rms * 5.5, 1));
          rafRef.current = requestAnimationFrame(tick);
        };

        stopRef.current = () => {
          try { source.stop(); } catch { /* already ended */ }
        };
        source.onended = () => {
          if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
          engine.setMouth(0);
          resolve();
        };
        source.start();
        onStart?.(); // notify caller that audio actually started
        rafRef.current = requestAnimationFrame(tick);
      });
    },
    [engine],
  );

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
      const sentenceWaiters: Array<() => void> = [];

      const notifySentenceWaiters = () => {
        while (sentenceWaiters.length > 0) sentenceWaiters.shift()!();
      };

      const pushSentence = (sentence: string) => {
        const clean = stripSpeechText(sentence);
        if (clean) {
          sentenceQueue.push(clean);
          notifySentenceWaiters();
        }
      };

      const waitForNextSentence = async () => {
        if (sentenceQueue.length > 0) return sentenceQueue.shift()!;
        if (isStreamComplete) return null;
        await new Promise<void>((resolve) => { sentenceWaiters.push(resolve); });
        if (sentenceQueue.length > 0) return sentenceQueue.shift()!;
        return null;
      };

      /**
       * Producer: accumulates stream chunks and emits speakable sentence units.
       * First sentence threshold: 12 chars (down from 28) for near-instant first audio.
       */
      const producer = async () => {
        let buffer = "";
        let isFirst = true;
        try {
          for await (const chunk of stream) {
            if (cancelledRef.current) break;
            buffer += chunk;
            // 12 chars for first sentence (fast start), 30 thereafter (quality)
            const minChars = isFirst ? 12 : 30;

            const segments = splitIntoSentences(buffer, {
              minFirstChars: minChars,
              minChars: 30,
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
              const hasTerminal = /[.!?\u3002\uff01\uff1f]["')\]]*$/.test(single) || single.includes("\n");
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
          notifySentenceWaiters();
        }
      };

      const audioQueue: AudioBuffer[] = [];
      const audioWaiters: Array<() => void> = [];
      const backpressureWaiters: Array<() => void> = [];
      let isSynthComplete = false;
      let firstPlaybackFired = false;

      const notifyAudioWaiters = () => {
        while (audioWaiters.length > 0) audioWaiters.shift()!();
      };
      const notifyBackpressureWaiters = () => {
        while (backpressureWaiters.length > 0) backpressureWaiters.shift()!();
      };

      const pushAudio = (buf: AudioBuffer) => {
        audioQueue.push(buf);
        notifyAudioWaiters();
      };

      const waitForNextAudio = async () => {
        if (audioQueue.length > 0) {
          const buf = audioQueue.shift()!;
          notifyBackpressureWaiters();
          return buf;
        }
        if (isSynthComplete) return null;
        await new Promise<void>((resolve) => { audioWaiters.push(resolve); });
        if (audioQueue.length > 0) {
          const buf = audioQueue.shift()!;
          notifyBackpressureWaiters();
          return buf;
        }
        return null;
      };

      const readyAudio = new Map<number, AudioBuffer | null>();
      let nextDeliverIndex = 0;
      let nextSentenceIndex = 0;

      const deliverReadyAudio = () => {
        while (readyAudio.has(nextDeliverIndex)) {
          const buf = readyAudio.get(nextDeliverIndex);
          readyAudio.delete(nextDeliverIndex);
          nextDeliverIndex++;
          if (buf) pushAudio(buf);
        }
      };

      const defaultVoice =
        settings.ttsProvider === "kokoro" ? "af_heart"
        : settings.ttsProvider === "edge" ? "en-US-AvaMultilingualNeural"
        : settings.ttsProvider === "elevenlabs" ? "21m00Tcm4TlvDq8ikWAM"
        : "alloy";
      const voice = options?.voice || (settings.voice !== "auto" ? settings.voice : defaultVoice);

      const synthesizeOne = async (index: number, sentence: string) => {
        const useBrowser =
          settings.ttsProvider === "none" ||
          (settings.ttsProvider !== "edge" &&
            settings.ttsProvider !== "kokoro" &&
            !settings.ttsKey.trim());

        if (useBrowser) {
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
              ttsProvider: settings.ttsProvider as "edge" | "kokoro" | "openai" | "elevenlabs",
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
          while (audioQueue.length >= 3 && !cancelledRef.current) {
            await new Promise<void>((resolve) => { backpressureWaiters.push(resolve); });
          }
          if (cancelledRef.current) break;
          const sentence = await waitForNextSentence();
          if (!sentence) break;
          const idx = nextSentenceIndex++;
          await synthesizeOne(idx, sentence);
        }
      };

      const isBrowserTts =
        settings.ttsProvider === "none" ||
        (settings.ttsProvider !== "edge" &&
          settings.ttsProvider !== "kokoro" &&
          !settings.ttsKey.trim());

      const synthesizer = async () => {
        try {
          if (isBrowserTts) {
            await worker();
          } else {
            await Promise.all([worker(), worker()]);
          }
        } finally {
          isSynthComplete = true;
          notifyAudioWaiters();
          notifyBackpressureWaiters();
        }
      };

      const player = async () => {
        while (!cancelledRef.current) {
          const buffer = await waitForNextAudio();
          if (!buffer) break;
          await playBuffer(buffer, firstPlaybackFired ? undefined : () => {
            firstPlaybackFired = true;
            options?.onPlaybackStart?.();
          });
        }
      };

      if (isBrowserTts) {
        await Promise.all([producer(), synthesizer()]);
      } else {
        const synthTask = Promise.all([producer(), synthesizer()])
          .catch((err) => console.error("Speech pipeline error:", err))
          .finally(() => {
            isSynthComplete = true;
            notifyAudioWaiters();
            notifyBackpressureWaiters();
          });
        await player();
        await synthTask;
      }
    },
    [cleanup, browserVoice, speakFn, playBuffer, decodeChunk],
  );

  return { speak, stopSpeaking: cleanup };
}
