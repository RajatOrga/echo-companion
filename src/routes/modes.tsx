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

function ModeSelect() {
  const [needsKey, setNeedsKey] = useState(false);

  useEffect(() => {
    setNeedsKey(!hasKey(loadSettings()));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-16">
      <div className="animate-rise">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">What shall we do?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick a scene. You can change it any time.
            </p>
          </div>
          <div className="flex gap-3 pt-2 text-muted-foreground">
            <Link to="/history" aria-label="History" className="hover:text-foreground">
              <History className="h-4 w-4" />
            </Link>
            <Link to="/settings" aria-label="Settings" className="hover:text-foreground">
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {needsKey ? (
          <Link
            to="/setup"
            className="mt-8 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4 text-sm transition-colors duration-300 hover:bg-primary/10"
          >
            <KeyRound className="h-4 w-4 text-primary" />
            Add your AI key to start talking
          </Link>
        ) : null}

        <ul className="mt-10 space-y-3">
          {MODES.map((mode) => (
            <li key={mode.slug}>
              <Link
                to="/talk/$mode"
                params={{ mode: mode.slug }}
                className="group flex items-baseline justify-between gap-4 rounded-2xl border border-border px-6 py-5 transition-all duration-500 hover:border-primary/40 hover:bg-card/60"
              >
                <span className="text-lg transition-colors duration-300 group-hover:text-primary">
                  {mode.name}
                </span>
                <span className="text-right text-xs text-muted-foreground">{mode.tagline}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
