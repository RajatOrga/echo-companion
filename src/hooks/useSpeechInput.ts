import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
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
};

/**
 * Browser speech-to-text with continuous Conversation Mode & silence timeout (VAD).
 * Allows natural pauses without prematurely cutting off thoughts or requiring repeated mic tapping.
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

  const continuous = options?.continuous ?? false;
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;

  const silenceTimeoutMs = options?.silenceTimeoutMs ?? 1500;
  const silenceTimeoutMsRef = useRef(silenceTimeoutMs);
  silenceTimeoutMsRef.current = silenceTimeoutMs;

  const accumulator = useRef("");
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldListen = useRef(false);
  // Track whether we're in a silence gap so onSpeechStart fires only once per utterance
  const wasSilent = useRef(true);

  // Computes adaptive silence timeout based on linguistic completeness cues in the spoken text
  const getAdaptiveDelay = (text: string, base: number) => {
    const trimmed = text.trim().toLowerCase();
    if (!trimmed) return base;

    const words = trimmed.split(/\s+/);
    const trailingWord = words[words.length - 1] ?? "";

    // Connectives, conjunctions, prepositions, auxiliaries, pronouns, or hesitation fillers
    // indicating the speaker is mid-clause or searching for words
    const INCOMPLETE_TRAILERS = new Set([
      // Conjunctions & connectives
      "and", "or", "but", "nor", "so", "because", "although", "though", "while", "whereas",
      "if", "unless", "until", "since", "like", "then", "also", "besides", "plus",
      // Prepositions
      "in", "on", "at", "to", "for", "of", "with", "about", "between", "into", "through",
      "after", "before", "above", "below", "from", "up", "down", "off", "over", "under", "by", "as",
      // Auxiliary verbs & copulas
      "is", "am", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did",
      "will", "would", "shall", "should", "can", "could", "may", "might", "must",
      // Determiners & relative/interrogative pronouns
      "the", "a", "an", "my", "your", "his", "her", "its", "our", "their",
      "this", "that", "these", "those", "which", "what", "who", "whom", "whose",
      "where", "when", "why", "how",
      // Fillers & hesitations
      "um", "uh", "er", "ah", "hmm", "well", "actually", "basically", "literally"
    ]);

    // Punctuation indicating pause mid-thought (comma, ellipsis, dash, colon)
    const hasMidPunctuation = /[,;:\-—~]$/.test(trimmed) || trimmed.endsWith("...");

    if (INCOMPLETE_TRAILERS.has(trailingWord) || hasMidPunctuation) {
      // User paused mid-clause or paused to think: give generous breathing room (2.2s - 2.5s)
      return Math.max(2250, base + 750);
    }

    // Short phrase without punctuation (< 4 words): e.g. "Hey there", "I think", "Wait"
    if (words.length < 4 && !/[.!?。！？]$/.test(trimmed)) {
      return Math.max(1850, base + 350);
    }

    // If ends with sentence terminal (. ! ?), thought is complete -> brisk 1150ms
    if (/[.!?。！？]$/.test(trimmed)) {
      return Math.max(1150, Math.min(base, 1300));
    }

    // Default natural conversational pause threshold: at least 1500ms
    return Math.max(1500, base);
  };

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    const instance = new Ctor();
    instance.continuous = continuous;
    instance.interimResults = true;
    instance.lang = "en-US";

    instance.onresult = (event: unknown) => {
      const e = event as {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      };

      if (continuousRef.current) {
        let live = "";
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const result = e.results[i]!;
          const transcript = result[0]?.transcript ?? "";
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

        const fullPreview = (
          accumulator.current + (live ? ` ${live}` : "")
        ).trim();
        setInterim(fullPreview);

        // Reset silence timer every time user speaks
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        if (fullPreview) {
          // Only fire onSpeechStart once per utterance (when transitioning from silence)
          if (wasSilent.current) {
            wasSilent.current = false;
            onSpeechStartHandler.current?.();
          }
          const dynamicDelay = getAdaptiveDelay(fullPreview, silenceTimeoutMsRef.current);
          silenceTimer.current = setTimeout(() => {
            const toSubmit = (
              accumulator.current + (live ? ` ${live}` : "")
            ).trim();
            if (toSubmit) {
              accumulator.current = "";
              wasSilent.current = true; // reset for next utterance
              setInterim("");
              finalHandler.current(toSubmit);
            }
          }, dynamicDelay);
        }
      } else {
        // Single-phrase mode
        let live = "";
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const result = e.results[i]!;
          const transcript = result[0]?.transcript ?? "";
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
      if (err === "no-speech") {
        // Normal pause during conversation mode
        return;
      }
      if (err === "not-allowed" || err === "service-not-allowed") {
        shouldListen.current = false;
        setListening(false);
        setInterim("");
      }
    };

    instance.onend = () => {
      if (shouldListen.current && continuousRef.current) {
        // Auto-rearm watchdog if recognition drops during conversation mode
        if (restartTimer.current) clearTimeout(restartTimer.current);
        restartTimer.current = setTimeout(() => {
          if (shouldListen.current) {
            try {
              instance.start();
              setListening(true);
            } catch {
              /* already started or aborted */
            }
          }
        }, 150);
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
      try {
        instance.abort();
      } catch {
        /* already stopped */
      }
    };
  }, [continuous]);

  const start = useCallback(() => {
    shouldListen.current = true;
    accumulator.current = "";
    wasSilent.current = true; // ensure onSpeechStart fires for first utterance
    setInterim("");
    const instance = recognition.current;
    if (!instance) return;
    try {
      instance.start();
      setListening(true);
    } catch {
      /* already running */
    }
  }, []);

  const stop = useCallback(() => {
    shouldListen.current = false;
    wasSilent.current = true; // reset for next session
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    if (restartTimer.current) clearTimeout(restartTimer.current);
    accumulator.current = "";
    setInterim("");
    try {
      recognition.current?.stop();
    } catch {
      /* not running */
    }
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

  return { listening, interim, supported, start, stop, flush };
}
