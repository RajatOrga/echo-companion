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
  /**
   * Pass a ref whose `.current` is true while the AI avatar is speaking.
   * Very short interim results detected during that window are suppressed
   * so the avatar's own voice does not trigger a barge-in.
   */
  isSpeakingRef?: React.MutableRefObject<boolean>;
};

/**
 * Browser speech-to-text with continuous Conversation Mode & adaptive VAD.
 * Allows natural pauses without prematurely cutting off thoughts.
 * Echo guard: ignores sub-3-word interim results while avatar is speaking.
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

  // Base silence timeout — adaptive logic adds to this based on trailing word
  const silenceTimeoutMs = options?.silenceTimeoutMs ?? 1200;
  const silenceTimeoutMsRef = useRef(silenceTimeoutMs);
  silenceTimeoutMsRef.current = silenceTimeoutMs;

  const accumulator = useRef("");
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldListen = useRef(false);
  // Track whether we're in a silence gap so onSpeechStart fires only once per utterance
  const wasSilent = useRef(true);
  // Timestamp after which barge-in is allowed (prevents echo self-interrupt)
  const bargeInAllowedAt = useRef<number>(0);

  // Computes adaptive silence timeout based on linguistic completeness cues
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
    if (INCOMPLETE_TRAILERS.has(trailingWord) || hasMidPunctuation) {
      return Math.max(2200, base + 700);
    }
    if (words.length < 4 && !/[.!?\u3002\uff01\uff1f]$/.test(trimmed)) {
      return Math.max(1600, base + 350);
    }
    if (/[.!?\u3002\uff01\uff1f]$/.test(trimmed)) {
      return Math.max(950, Math.min(base, 1100));
    }
    return Math.max(1200, base);
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

        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        if (fullPreview) {
          // Echo suppression: avatar is speaking + transcript is very short + cooldown active
          // → likely mic picked up the avatar's own voice, not the user
          const wordCount = fullPreview.trim().split(/\s+/).length;
          const echoLikely =
            isSpeakingRef?.current &&
            wordCount < 3 &&
            Date.now() < bargeInAllowedAt.current;
          if (echoLikely) return; // skip — this is probably avatar echo

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
              wasSilent.current = true;
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
      if (err === "no-speech") return; // normal pause during conversation
      if (err === "not-allowed" || err === "service-not-allowed") {
        shouldListen.current = false;
        setListening(false);
        setInterim("");
      }
    };

    instance.onend = () => {
      if (shouldListen.current && continuousRef.current) {
        // Auto-rearm: faster 60ms restart (was 150ms) for snappier always-on listening
        if (restartTimer.current) clearTimeout(restartTimer.current);
        restartTimer.current = setTimeout(() => {
          if (shouldListen.current) {
            try {
              instance.start();
              setListening(true);
            } catch {
              /* already started */
            }
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
    wasSilent.current = true;
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
    wasSilent.current = true;
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

  /**
   * Call this the moment the avatar begins playing audio.
   * Activates the echo guard for 1.5 s to prevent the mic from
   * picking up the avatar's own voice and triggering a false barge-in.
   */
  const notifySpeakingStart = useCallback(() => {
    bargeInAllowedAt.current = Date.now() + 1500;
  }, []);

  return { listening, interim, supported, start, stop, flush, notifySpeakingStart };
}
