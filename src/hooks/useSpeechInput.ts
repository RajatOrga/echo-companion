import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechInputOptions = {
  continuous?: boolean;
  silenceTimeoutMs?: number;
  onSpeechStart?: () => void;
  isSpeakingRef?: React.MutableRefObject<boolean>;
};

/**
 * Browser speech-to-text with confidence-ranked alternatives.
 * Picks the highest-confidence transcript from up to 5 alternatives
 * to reduce mis-recognition (e.g. "husband" vs "I've been really nice").
 */
export function useSpeechInput(
  onFinal: (text: string) => void,
  options?: SpeechInputOptions,
) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);

  const recognition = useRef<RecognitionLike | null>(null);
  const finalHandler = useRef(onFinal);
  finalHandler.current = onFinal;

  const onSpeechStartHandler = useRef(options?.onSpeechStart);
  onSpeechStartHandler.current = options?.onSpeechStart;

  const isSpeakingRef = options?.isSpeakingRef;

  const continuous = options?.continuous ?? false;
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;

  const silenceTimeoutMs = options?.silenceTimeoutMs ?? 1200;
  const silenceTimeoutMsRef = useRef(silenceTimeoutMs);
  silenceTimeoutMsRef.current = silenceTimeoutMs;

  const accumulator = useRef("");
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldListen = useRef(false);
  const wasSilent = useRef(true);
  const bargeInAllowedAt = useRef<number>(0);

  /**
   * Pick best transcript from result alternatives using confidence scores.
   * Falls back to [0] if no confidences are returned (Chrome sometimes omits them).
   */
  const bestTranscript = (result: ArrayLike<{ transcript: string; confidence?: number }>) => {
    let best = result[0]?.transcript ?? "";
    let bestConf = result[0] && "confidence" in result[0] ? (result[0].confidence ?? 0) : -1;
    for (let j = 1; j < result.length; j++) {
      const alt = result[j];
      if (!alt) continue;
      const conf = "confidence" in alt ? (alt.confidence ?? 0) : 0;
      if (conf > bestConf) { bestConf = conf; best = alt.transcript; }
    }
    return best;
  };

  const getAdaptiveDelay = (text: string, base: number) => {
    const trimmed = text.trim().toLowerCase();
    if (!trimmed) return base;
    const words = trimmed.split(/\s+/);
    const trailingWord = words[words.length - 1] ?? "";
    const INCOMPLETE_TRAILERS = new Set([
      "and", "or", "but", "nor", "so", "because", "although", "though", "while", "whereas",
      "if", "unless", "until", "since", "like", "then", "also", "besides", "plus",
      "in", "on", "at", "to", "for", "of", "with", "about", "between", "into", "through",
      "after", "before", "above", "below", "from", "up", "down", "off", "over", "under", "by", "as",
      "is", "am", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did",
      "will", "would", "shall", "should", "can", "could", "may", "might", "must",
      "the", "a", "an", "my", "your", "his", "her", "its", "our", "their",
      "this", "that", "these", "those", "which", "what", "who", "whom", "whose",
      "where", "when", "why", "how",
      "um", "uh", "er", "ah", "hmm", "well", "actually", "basically", "literally",
    ]);
    const hasMidPunctuation = /[,;:\-\u2014~]$/.test(trimmed) || trimmed.endsWith("...");
    if (INCOMPLETE_TRAILERS.has(trailingWord) || hasMidPunctuation) return Math.max(2200, base + 700);
    if (words.length < 4 && !/[.!?\u3002\uff01\uff1f]$/.test(trimmed)) return Math.max(1600, base + 350);
    if (/[.!?\u3002\uff01\uff1f]$/.test(trimmed)) return Math.max(950, Math.min(base, 1100));
    return Math.max(1200, base);
  };

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { setSupported(false); return; }
    const instance = new Ctor();
    instance.continuous = continuous;
    instance.interimResults = true;
    instance.lang = "en-US";
    instance.maxAlternatives = 5; // key fix: get 5 alternatives and pick best confidence

    instance.onresult = (event: unknown) => {
      const e = event as {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }> & { isFinal: boolean }>;
      };

      if (continuousRef.current) {
        let live = "";
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const result = e.results[i]!;
          const transcript = bestTranscript(result);
          if (result.isFinal) {
            const text = transcript.trim();
            if (text) {
              accumulator.current = accumulator.current
                ? `${accumulator.current} ${text}`
                : text;
            }
          } else {
            live += transcript;
          }
        }

        const fullPreview = (accumulator.current + (live ? ` ${live}` : "")).trim();
        setInterim(fullPreview);

        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        if (fullPreview) {
          const wordCount = fullPreview.trim().split(/\s+/).length;
          const echoLikely =
            isSpeakingRef?.current &&
            wordCount < 2 &&
            Date.now() < bargeInAllowedAt.current;
          if (echoLikely) return;

          if (wasSilent.current) {
            wasSilent.current = false;
            onSpeechStartHandler.current?.();
          }
          const dynamicDelay = getAdaptiveDelay(fullPreview, silenceTimeoutMsRef.current);
          silenceTimer.current = setTimeout(() => {
            const toSubmit = (accumulator.current + (live ? ` ${live}` : "")).trim();
            if (toSubmit) {
              accumulator.current = "";
              wasSilent.current = true;
              setInterim("");
              finalHandler.current(toSubmit);
            }
          }, dynamicDelay);
        }
      } else {
        let live = "";
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const result = e.results[i]!;
          const transcript = bestTranscript(result);
          if (result.isFinal) {
            const text = transcript.trim();
            if (text) finalHandler.current(text);
          } else {
            live += transcript;
          }
        }
        setInterim(live);
      }
    };

    instance.onerror = (event: unknown) => {
      const err = (event as { error?: string })?.error;
      if (err === "no-speech") return;
      if (err === "not-allowed" || err === "service-not-allowed") {
        shouldListen.current = false;
        setListening(false);
        setInterim("");
      }
    };

    instance.onend = () => {
      if (shouldListen.current && continuousRef.current) {
        if (restartTimer.current) clearTimeout(restartTimer.current);
        restartTimer.current = setTimeout(() => {
          if (shouldListen.current) {
            try { instance.start(); setListening(true); } catch { /* already started */ }
          }
        }, 60);
      } else {
        setListening(false);
        setInterim("");
      }
    };

    recognition.current = instance;
    return () => {
      shouldListen.current = false;
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      if (restartTimer.current) clearTimeout(restartTimer.current);
      instance.onresult = null;
      instance.onend = null;
      instance.onerror = null;
      try { instance.abort(); } catch { /* already stopped */ }
    };
  }, [continuous]);

  const start = useCallback(() => {
    shouldListen.current = true;
    accumulator.current = "";
    wasSilent.current = true;
    setInterim("");
    const instance = recognition.current;
    if (!instance) return;
    try { instance.start(); setListening(true); } catch { /* already running */ }
  }, []);

  const stop = useCallback(() => {
    shouldListen.current = false;
    wasSilent.current = true;
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    if (restartTimer.current) clearTimeout(restartTimer.current);
    accumulator.current = "";
    setInterim("");
    try { recognition.current?.stop(); } catch { /* not running */ }
    setListening(false);
  }, []);

  const flush = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    const toSubmit = (accumulator.current + (interim ? ` ${interim}` : "")).trim();
    if (toSubmit) {
      accumulator.current = "";
      setInterim("");
      finalHandler.current(toSubmit);
    }
  }, [interim]);

  const notifySpeakingStart = useCallback(() => {
    bargeInAllowedAt.current = Date.now() + 800;
  }, []);

  return { listening, interim, supported, start, stop, flush, notifySpeakingStart };
}
