import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History, Mic, Settings, Sparkles, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MODES, type ModeSlug } from "@/lib/modes";
import { hasKey, loadSettings } from "@/lib/keys";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard \u2014 Aria" },
      { name: "description", content: "Your Aria dashboard: recent sessions and quick start." },
    ],
  }),
  component: Dashboard,
});

const MODE_META: Record<string, { emoji: string; tagColor: string; tagBg: string }> = {
  interview:   { emoji: "\uD83C\uDFA4", tagColor: "text-rose-400",  tagBg: "bg-rose-400/10 border-rose-400/25"  },
  casual:      { emoji: "\u2615", tagColor: "text-amber-400", tagBg: "bg-amber-400/10 border-amber-400/25" },
  english:     { emoji: "\uD83C\uDF0D", tagColor: "text-sky-400",   tagBg: "bg-sky-400/10 border-sky-400/25"   },
  companion:   { emoji: "\uD83E\uDDE1", tagColor: "text-pink-400",  tagBg: "bg-pink-400/10 border-pink-400/25"  },
  study:       { emoji: "\uD83D\uDCDA", tagColor: "text-primary",   tagBg: "bg-primary/10 border-primary/25"   },
};

function Dashboard() {
  const { user, loading } = useAuth();
  const [needsKey, setNeedsKey] = useState(false);

  useEffect(() => {
    setNeedsKey(!hasKey(loadSettings()));
  }, []);

  const { data: sessions } = useQuery({
    queryKey: ["sessions", user?.id, "recent"],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("id, mode, title, created_at, messages(count)")
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["stats", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { count: totalSessions } = await supabase
        .from("sessions")
        .select("*", { count: "exact", head: true });
      const { count: totalMessages } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true });
      return { totalSessions: totalSessions ?? 0, totalMessages: totalMessages ?? 0 };
    },
  });

  const topModes = MODES.slice(0, 3);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-12">
      <div className="animate-rise flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center animate-float">
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-10 w-10">
              <ellipse cx="20" cy="21" rx="16" ry="15" fill="oklch(0.78 0.19 162)" />
              <circle cx="14" cy="18" r="4" fill="white" />
              <circle cx="26" cy="18" r="4" fill="white" />
              <circle cx="15" cy="19" r="2" fill="#0d1117" />
              <circle cx="27" cy="19" r="2" fill="#0d1117" />
              <path d="M14 25 Q20 30 26 25" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" />
              <ellipse cx="10" cy="23" rx="3" ry="1.5" fill="oklch(0.73 0.17 15)" opacity="0.5" />
              <ellipse cx="30" cy="23" rx="3" ry="1.5" fill="oklch(0.73 0.17 15)" opacity="0.5" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {!loading && user ? `Welcome back` : "Welcome to Aria"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">What shall we practise today?</p>
          </div>
        </div>
        <div className="flex gap-2 text-muted-foreground">
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

      {needsKey && (
        <Link to="/setup"
          className="mt-6 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/8 px-5 py-3.5 text-sm transition-all duration-300 hover:border-primary/50 hover:bg-primary/12 active:scale-[0.99] animate-rise">
          <Zap className="h-4 w-4 flex-shrink-0 text-primary" />
          <span>Connect your AI key to start talking</span>
          <span className="ml-auto text-xs text-primary/70">\u2192</span>
        </Link>
      )}

      {user && stats && (stats.totalSessions > 0) && (
        <div className="mt-6 grid grid-cols-2 gap-3 animate-rise">
          <div className="rounded-2xl border border-border bg-card/60 px-5 py-4">
            <p className="text-2xl font-semibold tabular-nums">{stats.totalSessions}</p>
            <p className="mt-1 text-xs text-muted-foreground">conversations</p>
          </div>
          <div className="rounded-2xl border border-border bg-card/60 px-5 py-4">
            <p className="text-2xl font-semibold tabular-nums">{stats.totalMessages}</p>
            <p className="mt-1 text-xs text-muted-foreground">messages exchanged</p>
          </div>
        </div>
      )}

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Quick Start</h2>
          <Link to="/modes" className="text-xs text-primary/80 hover:text-primary transition-colors">All modes \u2192</Link>
        </div>
        <ul className="mt-3 grid gap-2.5">
          {topModes.map((mode) => {
            const meta = MODE_META[mode.slug] ?? { emoji: "\uD83D\uDCA1", tagColor: "text-primary", tagBg: "bg-primary/10 border-primary/25" };
            return (
              <li key={mode.slug}>
                <Link
                  to="/talk/$mode"
                  params={{ mode: mode.slug as ModeSlug }}
                  className="group flex items-center gap-4 rounded-2xl border border-border bg-card/60 px-5 py-3.5 transition-all duration-300 hover:border-primary/40 hover:bg-card hover:shadow-lg hover:shadow-primary/5 active:scale-[0.99]"
                >
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-xl transition-transform duration-300 group-hover:scale-110">
                    {meta.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium transition-colors duration-300 group-hover:text-primary">{mode.name}</span>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{mode.tagline}</p>
                  </div>
                  <Mic className="h-4 w-4 text-border transition-all duration-300 group-hover:text-primary" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {user && sessions && sessions.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Recent</h2>
            <Link to="/history" className="text-xs text-primary/80 hover:text-primary transition-colors">View all \u2192</Link>
          </div>
          <ul className="mt-3 space-y-2">
            {(sessions as Array<{ id: string; mode: string; title: string; created_at: string; messages: unknown }>).map((session) => {
              const count = (session.messages as Array<{count: number}>)?.[0]?.count ?? 0;
              const meta = MODE_META[session.mode] ?? { emoji: "\uD83D\uDCA1", tagColor: "text-primary", tagBg: "bg-primary/10 border-primary/25" };
              return (
                <li key={session.id}>
                  <Link
                    to="/talk/$mode"
                    params={{ mode: session.mode as ModeSlug }}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3 transition-all duration-300 hover:border-border hover:bg-card/70 active:scale-[0.99]"
                  >
                    <span className="text-base">{meta.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{session.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(session.created_at).toLocaleDateString()} \u00b7 {count} msg
                      </p>
                    </div>
                    <span className="text-xs text-border">\u203a</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!user && !loading && (
        <div className="mt-8 rounded-2xl border border-border bg-card/40 px-6 py-6 text-center animate-rise">
          <Sparkles className="mx-auto h-6 w-6 text-primary mb-3" />
          <p className="text-sm text-muted-foreground">Sign in to save your conversations and see your progress.</p>
          <Link to="/auth"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all hover:opacity-90">
            Sign in
          </Link>
        </div>
      )}
    </main>
  );
}
