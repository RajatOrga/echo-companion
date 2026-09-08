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
import { runTurn, speak as speakFnServer } from "@/lib/ai.functions";
import { EmotionEngine, isEmotionName } from "@/lib/emotion";
import { hasKey, loadSettings, type KeySettings } from "@/lib/keys";
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
  const [showTranscript, setShowTranscript] = useState(false);
  const [lastFailed, setLastFailed] = useState<string | null>(null);

  const ask = useServerFn(runTurn);
  const tts = useServerFn(speakFnServer);
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
        const result = await ask({
          data: {
            provider: settings.provider,
            apiKey: settings.apiKey,
            model: settings.model,
            baseUrl: settings.baseUrl || undefined,
            system: `${mode.systemPrompt}\n\n${REPLY_CONTRACT}`,
            messages: history.slice(-24),
          },
        });

        if (isEmotionName(result.emotion)) {
          engineRef.current.nudge(result.emotion, result.intensity);
        }
        gazeRef.current = result.gaze;

        setCaptions((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: result.reply },
        ]);
        turnsRef.current = [...turnsRef.current, { role: "assistant", content: result.reply }];
        void persist("assistant", result.reply, result.emotion, result.intensity);

        setBusy(false);
        setSpeaking(true);
        await speak(result.reply, settings);
        setSpeaking(false);
        engineRef.current.settle(0.2);
        gazeRef.current = "user";
        // Hands-free: hand the turn straight back to the user.
        if (handsFreeRef.current && speechRef.current?.supported) speechRef.current.start();
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

  const speech = useSpeechInput((text) => void send(text));
  speechRef.current = { start: speech.start, stop: speech.stop, supported: speech.supported };

  const toggleMic = useCallback(() => {
    if (speech.listening) speech.stop();
    else {
      stopSpeaking();
      setSpeaking(false);
      speech.start();
    }
  }, [speech, stopSpeaking]);

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
          config={scene}
        />
      </div>

      <div className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-background/90 to-transparent">
        <TopBar title={mode.name} onTranscript={() => setShowTranscript(true)} />
      </div>

      {/* live status, just under the top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center">
        <span className="rounded-full border border-border/60 bg-card/50 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80 backdrop-blur-md">
          {busy
            ? "thinking"
            : speaking
              ? "speaking"
              : speech.listening
                ? "listening"
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
        <div className="flex w-full max-w-xl items-center gap-2 rounded-full border border-border/70 bg-card/60 p-2 shadow-2xl backdrop-blur-xl">
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
              placeholder={speech.supported ? "Say it, or type…" : "Type your message"}
              className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {speech.supported ? (
              <button
                type="button"
                onClick={() => setHandsFree((value) => !value)}
                aria-pressed={handsFree}
                aria-label="Hands-free mode"
                title={`Hands-free ${handsFree ? "on" : "off"}`}
                className={`rounded-full p-2.5 transition-colors duration-300 ${
                  handsFree
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Radio className="h-4 w-4" />
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
