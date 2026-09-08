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

/** Browser speech-to-text. Free, built in, no key required. */
export function useSpeechInput(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const recognition = useRef<RecognitionLike | null>(null);
  const finalHandler = useRef(onFinal);
  finalHandler.current = onFinal;

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    const instance = new Ctor();
    instance.continuous = false;
    instance.interimResults = true;
    instance.lang = "en-US";
    instance.onresult = (event: unknown) => {
      const e = event as {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      };
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
    };
    instance.onerror = () => {
      setListening(false);
      setInterim("");
    };
    instance.onend = () => {
      setListening(false);
      setInterim("");
    };
    recognition.current = instance;
    return () => {
      instance.onresult = null;
      instance.onend = null;
      instance.onerror = null;
      try {
        instance.abort();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  const start = useCallback(() => {
    const instance = recognition.current;
    if (!instance) return;
    try {
      instance.start();
      setListening(true);
    } catch {
      /* already started */
    }
  }, []);

  const stop = useCallback(() => {
    try {
      recognition.current?.stop();
    } catch {
      /* not running */
    }
    setListening(false);
  }, []);

  return { listening, interim, supported, start, stop };
}
