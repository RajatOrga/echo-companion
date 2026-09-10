import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { History, KeyRound, Settings } from "lucide-react";
import { MODES } from "@/lib/modes";
import { hasKey, loadSettings } from "@/lib/keys";

export const Route = createFileRoute("/modes")({
  head: () => ({
    meta: [
      { title: "Choose a scene — Aria" },
      {
        name: "description",
        content:
          "Pick how you want to talk today: conversation practice, interview prep, English practice, easy company, or a study partner.",
      },
      { property: "og:title", content: "Choose a scene — Aria" },
      {
        property: "og:description",
        content: "Five conversation modes, one responsive face.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ModeSelect,
});

// Emoji + tag colour per mode
const MODE_META: Record<string, { emoji: string; tagColor: string; tagBg: string; tagLabel: string }> = {
  interview:   { emoji: "🎤", tagColor: "text-rose-400",   tagBg: "bg-rose-400/10 border-rose-400/25",   tagLabel: "Intense" },
  casual:      { emoji: "☕",   tagColor: "text-amber-400",  tagBg: "bg-amber-400/10 border-amber-400/25",  tagLabel: "Relaxed" },
  english:     { emoji: "🌍",  tagColor: "text-sky-400",    tagBg: "bg-sky-400/10 border-sky-400/25",    tagLabel: "Learning" },
  companion:   { emoji: "🧡",  tagColor: "text-pink-400",   tagBg: "bg-pink-400/10 border-pink-400/25",   tagLabel: "Friendly" },
  study:       { emoji: "📚",  tagColor: "text-primary",    tagBg: "bg-primary/10 border-primary/25",    tagLabel: "Focus" },
};

function getFallbackMeta(slug: string) {
  return MODE_META[slug] ?? { emoji: "💡", tagColor: "text-primary", tagBg: "bg-primary/10 border-primary/25", tagLabel: "Practice" };
}

function ModeSelect() {
  const [needsKey, setNeedsKey] = useState(false);

  useEffect(() => {
    setNeedsKey(!hasKey(loadSettings()));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-16">
      <div className="animate-rise">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            {/* Compact Echo mascot */}
            <div className="mb-4 flex items-center gap-3">
              <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center animate-float">
                <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-10 w-10">
                  <ellipse cx="20" cy="21" rx="16" ry="15" fill="oklch(0.78 0.19 162)" />
                  {/* eyes */}
                  <circle cx="14" cy="18" r="4" fill="white" />
                  <circle cx="26" cy="18" r="4" fill="white" />
                  <circle cx="15" cy="19" r="2" fill="#0d1117" />
                  <circle cx="27" cy="19" r="2" fill="#0d1117" />
                  {/* smile */}
                  <path d="M14 25 Q20 30 26 25" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                  {/* blush */}
                  <ellipse cx="10" cy="23" rx="3" ry="1.5" fill="oklch(0.73 0.17 15)" opacity="0.5" />
                  <ellipse cx="30" cy="23" rx="3" ry="1.5" fill="oklch(0.73 0.17 15)" opacity="0.5" />
                </svg>
              </div>
              <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Aria</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">What shall we do?</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Pick a scene. You can change it any time.
            </p>
          </div>
          <div className="flex gap-3 pt-2 text-muted-foreground">
            <Link to="/history" aria-label="History"
              className="rounded-xl border border-transparent p-2 transition-all duration-300 hover:border-border hover:bg-card hover:text-foreground">
              <History className="h-4 w-4" />
            </Link>
            <Link to="/settings" aria-label="Settings"
              className="rounded-xl border border-transparent p-2 transition-all duration-300 hover:border-border hover:bg-card hover:text-foreground">
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* API key banner */}
        {needsKey ? (
          <Link
            to="/setup"
            className="mt-7 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/8 px-5 py-3.5 text-sm transition-all duration-300 hover:border-primary/50 hover:bg-primary/12 active:scale-[0.99]"
          >
            <KeyRound className="h-4 w-4 flex-shrink-0 text-primary" />
            <span>Add your AI key to start talking</span>
            <span className="ml-auto text-xs text-primary/70">→</span>
          </Link>
        ) : null}

        {/* Mode grid */}
        <ul className="mt-8 grid gap-3">
          {MODES.map((mode, i) => {
            const meta = getFallbackMeta(mode.slug);
            return (
              <li key={mode.slug} style={{ animationDelay: `${i * 60}ms` }}>
                <Link
                  to="/talk/$mode"
                  params={{ mode: mode.slug }}
                  className="group flex items-center gap-4 rounded-2xl border border-border bg-card/60 px-5 py-4 transition-all duration-300 hover:border-primary/40 hover:bg-card hover:shadow-lg hover:shadow-primary/5 active:scale-[0.99]"
                >
                  {/* Emoji icon */}
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-xl transition-transform duration-300 group-hover:scale-110">
                    {meta.emoji}
                  </span>

                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium transition-colors duration-300 group-hover:text-primary">
                        {mode.name}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide ${meta.tagBg} ${meta.tagColor}`}>
                        {meta.tagLabel}
                      </span>
                    </div>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {mode.tagline}
                    </span>
                  </div>

                  {/* Arrow */}
                  <span className="text-border transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-primary">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
