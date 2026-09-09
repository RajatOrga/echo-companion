import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Radio, RotateCcw, Send, Square } from "lucide-react";
import { toast } from "sonner";
import { AvatarStage } from "@/components/AvatarStage";
import { Captions, type Caption } from "@/components/Captions";
import { MicButton } from "@/components/MicButton";
import { TopBar } from "@/components/TopBar";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import { useVoiceOutput } from "@/hooks/useVoiceOutput";
import { useAuth } from "@/hooks/useAuth";
import { runTurn, speak as speakFnServer, prewarmTts as warmTtsServer, parseTurn, stripStreamingSpeech } from "@/lib/ai.functions";
import { EmotionEngine, isEmotionName } from "@/lib/emotion";
import { getVoiceForMode, hasKey, loadSettings, type KeySettings } from "@/lib/keys";
import { getMode, REPLY_CONTRACT } from "@/lib/modes";
import { getScene } from "@/lib/scenes";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/talk/$mode")({
  validateSearch: (search: Record<string, unknown>): { session?: string } =>
    typeof search['session'] === "string" ? { session: search['session'] } : {},
  head: ({ params }) => {
    const mode = getMode(params.mode);
    return {
      meta: [
        { title: `${mode.name} — Aria` },
        { name: "description", content: mode.tagline },
        { property: "og:title", content: `${mode.name} — Aria` },
        { property: "og:description", content: mode.tagline },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: TalkPage,
});

type Turn = { role: "user" | "assistant"; content: string };

function TalkPage() {
  const { mode: modeSlug } = Route.useParams();
  const { session: resumeId } = Route.useSearch();
  const mode = useMemo(() => getMode(modeSlug), [modeSlug]);
  const scene = useMemo(() => getScene(mode.slug), [mode.slug]);
  const navigate = useNavigate();
  const { user } = useAuth();

  const engineRef = useRef<EmotionEngine>(new EmotionEngine());
  const gazeRef = useRef<string>("user");
  const sessionId = useRef<string | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  const settingsRef = useRef<KeySettings | null>(null);
  const handsFreeRef = useRef(false);

  const [captions, setCaptions] = useState<Caption[]>([]);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [draft, setDraft] = useState("");
  const [handsFree, setHandsFree] = useState(false);
  const [headGesture, setHeadGesture] = useState<string>("still");
  const [gestureKey, setGestureKey] = useState<number>(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [lastFailed, setLastFailed] = useState<string | null>(null);

  const ask = useServerFn(runTurn);
  const tts = useServerFn(speakFnServer);
  const warmTts = useServerFn(warmTtsServer);
  const { speak, stopSpeaking } = useVoiceOutput(engineRef.current, tts);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    const loaded = loadSettings();
    settingsRef.current = loaded;
    if (!hasKey(loaded)) navigate({ to: "/setup" });
  }, [navigate]);

  // Pick a saved conversation back up exactly where it stopped.
  useEffect(() => {
    if (!resumeId || !user) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, role, content")
        .eq("session_id", resumeId)
        .order("created_at", { ascending: true });
      if (cancelled || error || !data) return;
      const turns = data
        .filter((row): row is typeof row & { role: "user" | "assistant" } =>
          row.role === "user" || row.role === "assistant",
        )
        .map((row) => ({ role: row.role, content: row.content }));
      sessionId.current = resumeId;
      turnsRef.current = turns;
      setCaptions(turns.map((turn, index) => ({ id: `${resumeId}-${index}`, ...turn })));
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeId, user]);

  const persist = useCallback(
    async (role: Turn["role"], content: string, emotion?: string, intensity?: number) => {
      if (!user) return;
      try {
        if (!sessionId.current) {
          const { data, error } = await supabase
            .from("sessions")
            .insert({
              user_id: user.id,
              mode: mode.slug,
              title: content.slice(0, 60) || mode.name,
            })
            .select("id")
            .single();
          if (error) throw error;
          sessionId.current = data.id;
        }
        await supabase.from("messages").insert({
          session_id: sessionId.current,
          user_id: user.id,
          role,
          content,
          emotion: emotion ?? null,
          intensity: intensity ?? null,
        });
      } catch {
        /* saved history is a nice-to-have; never block the conversation */
      }
    },
    [user, mode],
  );

  const speechRef = useRef<{ start: () => void; stop: () => void; supported: boolean } | null>(null);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      const settings = settingsRef.current;
      if (!message || !settings) return;
      speechRef.current?.stop();
      stopSpeaking();
      setBusy(true);
      setLastFailed(null);
      setCaptions((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: message },
      ]);
      const history = [...turnsRef.current, { role: "user" as const, content: message }];
      turnsRef.current = history;
      void persist("user", message);

      try {
        const res = await ask({
          data: {
            provider: settings.provider,
            apiKey: settings.apiKey,
            model: settings.model,
            baseUrl: settings.baseUrl || undefined,
            system: `${mode.systemPrompt}\n\n${REPLY_CONTRACT}`,
            messages: history.slice(-24),
          },
        });

        const responseObj = res as unknown as Response;
        if (responseObj.ok === false) {
          const errText = await responseObj.text().catch(() => "");
          throw new Error(errText || `Server returned ${responseObj.status}`);
        }

        const reader = responseObj.body?.getReader();
        if (!reader) throw new Error("No response body received from stream");

        // Switch from "thinking" to "speaking" immediately
        setBusy(false);
        setSpeaking(true);

        const aiId = crypto.randomUUID();
        setCaptions((prev) => [...prev, { id: aiId, role: "assistant", content: "" }]);

        let fullText = "";
        // Use a ref-like object so cleanStream closure always reads the latest parsed values
        let parsed = { reply: "", emotion: "neutral", intensity: 0.5, gaze: "user", head: "still" };
        let previousReplyLength = 0;

        const streamIterable = (async function* () {
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
              const payload = trimmed.slice(6);
              if (payload === "[DONE]") return;
              try {
                const parsedPayload = JSON.parse(payload);
                if (parsedPayload.text) yield parsedPayload.text;
              } catch {}
            }
          }
        })();

        const cleanStream = async function* () {
          for await (const chunk of streamIterable) {
            fullText += chunk;
            const cleanFull = stripStreamingSpeech(fullText);
            parsed = parseTurn(fullText);

            const newText = cleanFull.slice(previousReplyLength);
            if (newText.length > 0) {
              if (isEmotionName(parsed.emotion)) {
                engineRef.current.nudge(parsed.emotion as any, parsed.intensity);
              }
              gazeRef.current = parsed.gaze;
              if (parsed.head !== "still") {
                setHeadGesture(parsed.head);
                setGestureKey((k) => k + 1);
              }

              yield newText;
              previousReplyLength = cleanFull.length;
            }

            setCaptions((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.id === aiId) last.content = cleanFull;
              return next;
            });
          }
        };

        const activeVoice = getVoiceForMode(settings, mode);
        await speak(cleanStream(), settings, {
          voice: activeVoice,
          // Note: emotion/intensity are passed from opts but the synthesizer reads them
          // at synthesis time — we pass "warm" as a sensible default; the real emotion
          // was already applied live to the EmotionEngine during streaming above.
          emotion: "warm",
          intensity: 0.6,
          browser: mode.voice.browser,
        });

        // NOW parsed has the fully-streamed final values — persist them
        turnsRef.current = [...turnsRef.current, { role: "assistant", content: parsed.reply }];
        void persist("assistant", parsed.reply, parsed.emotion, parsed.intensity);

        setSpeaking(false);
        engineRef.current.settle(0.2);
        gazeRef.current = "user";
        // Hands-free / Live Conversation: hand the turn straight back to the user with small pause
        if (handsFreeRef.current && speechRef.current?.supported) {
          setTimeout(() => {
            if (handsFreeRef.current) speechRef.current?.start();
          }, 280);
        }
      } catch (error) {
        setBusy(false);
        setSpeaking(false);
        // Drop the failed turn so the next attempt is not sent twice.
        turnsRef.current = turnsRef.current.filter((turn) => turn !== history[history.length - 1]);
        setLastFailed(message);
        toast.error(error instanceof Error ? error.message : "That did not go through");
      }
    },
    [ask, mode, persist, speak, stopSpeaking],
  );

  const speech = useSpeechInput((text) => void send(text), {
    continuous: handsFree,
    onSpeechStart: () => {
      // Instant Barge-in / Interruption: silence avatar when user speaks
      stopSpeaking();
      setSpeaking(false);
      // Pre-warm Edge TTS WebSocket in the background while user is speaking
      if (settingsRef.current?.ttsProvider === "edge") {
        const activeVoice = getVoiceForMode(settingsRef.current, mode);
        void warmTts({ data: { voice: activeVoice } }).catch(() => {});
      }
    },
  });
  speechRef.current = { start: speech.start, stop: speech.stop, supported: speech.supported };

  const toggleMic = useCallback(() => {
    if (speech.listening) speech.stop();
    else {
      stopSpeaking();
      setSpeaking(false);
      speech.start();
    }
  }, [speech, stopSpeaking]);

  const toggleConversationMode = useCallback(() => {
    setHandsFree((prev) => {
      const next = !prev;
      if (next) {
        toast.success("Live Conversation Mode: Always listening without button taps");
        setTimeout(() => speechRef.current?.start(), 100);
      } else {
        speechRef.current?.stop();
        toast.info("Switched to push-to-talk");
      }
      return next;
    });
  }, []);

  const interrupt = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
    engineRef.current.settle(0.4);
  }, [stopSpeaking]);

  return (
    <div className="relative h-screen overflow-hidden">
      {/* the room fills the screen; everything else floats over it */}
      <div className="absolute inset-0">
        <AvatarStage
          engine={engineRef.current}
          gazeRef={gazeRef}
          active={speaking || speech.listening}
          listening={speech.listening}
          headGesture={headGesture}
          gestureKey={gestureKey}
          config={scene}
        />
      </div>

      <div className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-background/90 to-transparent">
        <TopBar title={mode.name} onTranscript={() => setShowTranscript(true)} />
      </div>

      {/* live status, just under the top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center">
        <span className="flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3.5 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/90 backdrop-blur-md">
          {handsFree ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
          ) : null}
          {busy
            ? "thinking"
            : speaking
              ? "speaking"
              : speech.listening
                ? handsFree
                  ? "listening to you"
                  : "listening"
                : handsFree
                  ? "live ready"
                  : scene.label}
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 px-4 pb-6">
        <Captions items={captions} interim={speech.interim} />

        <div className="flex items-center gap-2">
          {speaking ? (
            <button
              type="button"
              onClick={interrupt}
              className="flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-md transition-colors duration-300 hover:text-foreground"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          ) : null}
          {lastFailed && !busy ? (
            <button
              type="button"
              onClick={() => void send(lastFailed)}
              className="flex items-center gap-2 rounded-full border border-primary/40 bg-card/60 px-3 py-1.5 text-xs text-primary/90 backdrop-blur-md transition-colors duration-300 hover:border-primary"
            >
              <RotateCcw className="h-3 w-3" />
              Try again
            </button>
          ) : null}
        </div>

        {/* control dock */}
        <div
          className={`flex w-full max-w-xl items-center gap-2 rounded-full border bg-card/60 p-2 shadow-2xl backdrop-blur-xl transition-all duration-300 ${
            handsFree ? "border-emerald-500/40 ring-1 ring-emerald-500/20" : "border-border/70"
          }`}
        >
          <MicButton
            listening={speech.listening}
            busy={busy}
            disabled={!speech.supported}
            onToggle={toggleMic}
          />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const text = draft;
              setDraft("");
              void send(text);
            }}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                handsFree
                  ? "Live conversation active… speak naturally"
                  : speech.supported
                    ? "Say it, or type…"
                    : "Type your message"
              }
              className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {speech.supported ? (
              <button
                type="button"
                onClick={toggleConversationMode}
                aria-pressed={handsFree}
                aria-label="Live Conversation Mode"
                title={
                  handsFree
                    ? "Live Conversation Mode ON (auto-listening)"
                    : "Turn on Live Conversation Mode (no mic taps needed)"
                }
                className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-all duration-300 ${
                  handsFree
                    ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-sm"
                    : "border border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <Radio className={`h-3.5 w-3.5 ${handsFree ? "animate-pulse text-emerald-400" : ""}`} />
                <span className="text-[11px] tracking-wide">
                  {handsFree ? "Live ON" : "Live Mode"}
                </span>
              </button>
            ) : null}
            <button
              type="submit"
              aria-label="Send"
              disabled={busy || !draft.trim()}
              className="rounded-full bg-primary p-2.5 text-primary-foreground transition-transform duration-300 hover:scale-105 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {showTranscript ? (
        <TranscriptPanel
          items={captions}
          title={mode.name}
          onClose={() => setShowTranscript(false)}
        />
      ) : null}
    </div>
  );
}
