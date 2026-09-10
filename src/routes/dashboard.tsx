import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History, Mic, Settings, Sparkles, Zap, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MODES, type ModeSlug } from "@/lib/modes";
import { hasKey, loadSettings } from "@/lib/keys";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Aria \u2014 Home" },
      { name: "description", content: "Your Aria dashboard" },
    ],
  }),
  component: Dashboard,
});

// ── Per-mode visual identity ──
const MODE_IDENTITY: Record<string, {
  emoji: string;
  label: string;
  gradient: string;
  glowRgb: string;
  badgeClass: string;
  accentClass: string;
  borderRgba: string;
  previewGrad: string;
}> = {
  interview: {
    emoji: "\uD83C\uDFA4",
    label: "Intense",
    gradient: "linear-gradient(135deg,rgba(244,63,94,.13) 0%,rgba(249,115,22,.05) 100%)",
    glowRgb: "244,63,94",
    badgeClass: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
    accentClass: "text-rose-400",
    borderRgba: "rgba(244,63,94,.28)",
    previewGrad: "radial-gradient(ellipse at 70% 30%,rgba(244,63,94,.55) 0%,rgba(22,24,32,.0) 70%)",
  },
  companion: {
    emoji: "\uD83E\uDDE1",
    label: "Friendly",
    gradient: "linear-gradient(135deg,rgba(236,72,153,.13) 0%,rgba(168,85,247,.05) 100%)",
    glowRgb: "236,72,153",
    badgeClass: "bg-pink-500/15 text-pink-400 border border-pink-500/30",
    accentClass: "text-pink-400",
    borderRgba: "rgba(236,72,153,.28)",
    previewGrad: "radial-gradient(ellipse at 70% 30%,rgba(236,72,153,.5) 0%,rgba(22,24,32,.0) 70%)",
  },
  english: {
    emoji: "\uD83C\uDF0D",
    label: "Learning",
    gradient: "linear-gradient(135deg,rgba(14,165,233,.13) 0%,rgba(20,184,166,.05) 100%)",
    glowRgb: "14,165,233",
    badgeClass: "bg-sky-500/15 text-sky-400 border border-sky-500/30",
    accentClass: "text-sky-400",
    borderRgba: "rgba(14,165,233,.28)",
    previewGrad: "radial-gradient(ellipse at 70% 30%,rgba(14,165,233,.5) 0%,rgba(22,24,32,.0) 70%)",
  },
  communication: {
    emoji: "\uD83D\uDCA1",
    label: "Practice",
    gradient: "linear-gradient(135deg,rgba(245,158,11,.13) 0%,rgba(234,179,8,.05) 100%)",
    glowRgb: "245,158,11",
    badgeClass: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    accentClass: "text-amber-400",
    borderRgba: "rgba(245,158,11,.28)",
    previewGrad: "radial-gradient(ellipse at 70% 30%,rgba(245,158,11,.5) 0%,rgba(22,24,32,.0) 70%)",
  },
  study: {
    emoji: "\uD83D\uDCDA",
    label: "Focus",
    gradient: "linear-gradient(135deg,rgba(16,185,129,.13) 0%,rgba(6,182,212,.05) 100%)",
    glowRgb: "16,185,129",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    accentClass: "text-emerald-400",
    borderRgba: "rgba(16,185,129,.28)",
    previewGrad: "radial-gradient(ellipse at 70% 30%,rgba(16,185,129,.5) 0%,rgba(22,24,32,.0) 70%)",
  },
};

function getFallback(slug: string) {
  return (
    MODE_IDENTITY[slug] ?? {
      emoji: "\uD83D\uDCA1",
      label: "Go",
      gradient: "linear-gradient(135deg,rgba(120,120,140,.1) 0%,transparent 100%)",
      glowRgb: "120,120,140",
      badgeClass: "bg-border/15 text-muted-foreground border border-border/30",
      accentClass: "text-muted-foreground",
      borderRgba: "rgba(120,120,140,.2)",
      previewGrad: "radial-gradient(ellipse at 70% 30%,rgba(120,120,140,.3) 0%,rgba(22,24,32,.0) 70%)",
    }
  );
}

function AmbientOrbs() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      <div
        className="absolute animate-breathe"
        style={{
          width: 520, height: 520, top: -140, left: -180,
          borderRadius: "50%",
          background: "radial-gradient(circle,oklch(0.78 0.19 162 / 0.22) 0%,transparent 65%)",
          filter: "blur(40px)",
        }}
      />
      <div
        className="absolute animate-breathe"
        style={{
          width: 420, height: 420, top: -60, right: -160,
          borderRadius: "50%",
          background: "radial-gradient(circle,rgba(244,63,94,0.14) 0%,transparent 65%)",
          filter: "blur(48px)",
          animationDelay: "1.4s",
        }}
      />
      <div
        className="absolute animate-breathe"
        style={{
          width: 460, height: 460, bottom: -160, left: "30%",
          borderRadius: "50%",
          background: "radial-gradient(circle,rgba(14,165,233,0.1) 0%,transparent 65%)",
          filter: "blur(56px)",
          animationDelay: "2.6s",
        }}
      />
    </div>
  );
}

function AriaMascot({ size = 44 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size} className="flex-shrink-0">
      <ellipse cx="20" cy="21" rx="16" ry="15" fill="oklch(0.78 0.19 162)" />
      <circle cx="14" cy="18" r="4" fill="white" />
      <circle cx="26" cy="18" r="4" fill="white" />
      <circle cx="15" cy="19" r="2" fill="#0d1117" />
      <circle cx="27" cy="19" r="2" fill="#0d1117" />
      <path d="M14 25 Q20 30 26 25" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <ellipse cx="10" cy="23" rx="3" ry="1.5" fill="oklch(0.73 0.17 15)" opacity="0.5" />
      <ellipse cx="30" cy="23" rx="3" ry="1.5" fill="oklch(0.73 0.17 15)" opacity="0.5" />
    </svg>
  );
}

function ModeCard({ mode }: { mode: (typeof MODES)[number] }) {
  const id = getFallback(mode.slug);
  return (
    <Link
      to="/talk/$mode"
      params={{ mode: mode.slug as ModeSlug }}
      className="group relative flex flex-col overflow-hidden rounded-2xl p-5 transition-all duration-300 active:scale-[0.98]"
      style={{ background: id.gradient, border: `1px solid ${id.borderRgba}`, boxShadow: "0 2px 12px rgba(0,0,0,.18)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px rgba(${id.glowRgb},.22), 0 2px 8px rgba(0,0,0,.25)`;
        (e.currentTarget as HTMLElement).style.borderColor = id.borderRgba.replace(".28", ".55");
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,.18)";
        (e.currentTarget as HTMLElement).style.borderColor = id.borderRgba;
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-28 w-28 opacity-60 transition-opacity duration-300 group-hover:opacity-90"
        style={{ background: id.previewGrad }}
      />
      <div
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl text-2xl transition-transform duration-300 group-hover:scale-110"
        style={{ background: `rgba(${id.glowRgb},.12)`, border: `1px solid rgba(${id.glowRgb},.22)` }}
      >
        {id.emoji}
      </div>
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-[15px] leading-tight transition-colors duration-300 group-hover:text-white">
          {mode.name}
        </span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${id.badgeClass}`}>
          {id.label}
        </span>
      </div>
      <p className="text-xs text-muted-foreground/80 leading-relaxed mb-3 line-clamp-2">
        {mode.tagline}
      </p>
      <div className="mt-auto flex items-center justify-between">
        <span
          className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide opacity-0 transition-all duration-300 group-hover:opacity-100"
          style={{ color: `rgb(${id.glowRgb})` }}
        >
          <Mic className="h-3 w-3" />
          Start talking
        </span>
        <ChevronRight className="h-4 w-4 text-border transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
    </Link>
  );
}

function StatPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-full px-4 py-2"
      style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="text-base font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function SessionRow({ mode, title, date, count }: { mode: string; title: string; date: string; count: number }) {
  const id = getFallback(mode);
  return (
    <Link
      to="/talk/$mode"
      params={{ mode: mode as ModeSlug }}
      className="group flex items-center gap-3.5 rounded-xl px-4 py-3.5 transition-all duration-200 hover:bg-white/[.04] active:scale-[0.99]"
      style={{ border: "1px solid transparent" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = `rgba(${id.glowRgb},.18)`; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}
    >
      <span
        className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: `rgb(${id.glowRgb})`, boxShadow: `0 0 8px rgba(${id.glowRgb},.5)` }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-snug group-hover:text-white transition-colors duration-200">{title}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          {" \u00b7 "}
          {id.emoji} {MODES.find((m) => m.slug === mode)?.name ?? mode}
          {" \u00b7 "}
          {count} msg
        </p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-border/50 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
    </Link>
  );
}

function Dashboard() {
  const { user, loading } = useAuth();
  const [needsKey, setNeedsKey] = useState(false);

  useEffect(() => { setNeedsKey(!hasKey(loadSettings())); }, []);

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
      const { count: totalSessions } = await supabase.from("sessions").select("*", { count: "exact", head: true });
      const { count: totalMessages } = await supabase.from("messages").select("*", { count: "exact", head: true });
      return { totalSessions: totalSessions ?? 0, totalMessages: totalMessages ?? 0 };
    },
  });

  const hasActivity = user && stats && stats.totalSessions > 0;

  return (
    <>
      <AmbientOrbs />
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-5 py-4"
        style={{ background: "rgba(9,10,16,.75)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,.06)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="animate-float"><AriaMascot size={32} /></div>
          <span className="text-sm font-semibold" style={{ letterSpacing: "0.12em" }}>ARIA</span>
        </div>
        <div className="flex items-center gap-1">
          <Link to="/history" aria-label="History" className="rounded-xl p-2 text-muted-foreground transition-all duration-200 hover:bg-white/[.06] hover:text-foreground">
            <History className="h-4 w-4" />
          </Link>
          <Link to="/settings" aria-label="Settings" className="rounded-xl p-2 text-muted-foreground transition-all duration-200 hover:bg-white/[.06] hover:text-foreground">
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-16" style={{ paddingTop: "2rem" }}>
        <section className="animate-rise mb-8">
          <div className="relative mx-auto mb-5 h-20 w-20">
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{ background: "radial-gradient(circle,oklch(0.78 0.19 162 / 0.3) 0%,transparent 70%)", animationDuration: "2.4s" }}
            />
            <span
              className="absolute inset-2 rounded-full animate-breathe"
              style={{ background: "radial-gradient(circle,oklch(0.78 0.19 162 / 0.18) 0%,transparent 80%)" }}
            />
            <div className="absolute inset-0 flex items-center justify-center animate-float">
              <AriaMascot size={52} />
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {!loading && user ? "Welcome back" : "Welcome to Aria"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {user ? "Ready to practise today?" : "Your AI conversation partner"}
            </p>
          </div>
          {hasActivity && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <StatPill value={stats.totalSessions} label={stats.totalSessions === 1 ? "session" : "sessions"} color="oklch(0.78 0.19 162)" />
              <StatPill value={stats.totalMessages} label="messages" color="oklch(0.78 0.14 220)" />
            </div>
          )}
        </section>

        {needsKey && (
          <Link
            to="/setup"
            className="animate-rise mb-8 flex items-center gap-3 rounded-2xl px-5 py-4 transition-all duration-300 hover:opacity-90 active:scale-[0.99]"
            style={{ background: "linear-gradient(135deg,rgba(120,200,150,.12) 0%,rgba(14,165,233,.06) 100%)", border: "1px solid rgba(120,200,150,.25)" }}
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(120,200,150,.15)", border: "1px solid rgba(120,200,150,.25)" }}>
              <Zap className="h-4 w-4" style={{ color: "oklch(0.78 0.19 162)" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Connect your AI key</p>
              <p className="text-xs text-muted-foreground">Takes 30 seconds to start talking</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        )}

        <section className="animate-rise mb-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Start a conversation</h2>
            <Link to="/modes" className="text-[11px] font-medium transition-colors duration-200 hover:text-foreground" style={{ color: "oklch(0.78 0.19 162)" }}>All modes \u2192</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {MODES.map((mode) => (<ModeCard key={mode.slug} mode={mode} />))}
          </div>
        </section>

        {user && sessions && sessions.length > 0 && (
          <section className="animate-rise">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Resume</h2>
              <Link to="/history" className="text-[11px] font-medium transition-colors duration-200 hover:text-foreground" style={{ color: "oklch(0.78 0.19 162)" }}>View all \u2192</Link>
            </div>
            <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.07)" }}>
              {(sessions as Array<{ id: string; mode: string; title: string; created_at: string; messages: unknown }>).map((s, i) => {
                const count = (s.messages as Array<{ count: number }>)?.[0]?.count ?? 0;
                return (
                  <div key={s.id}>
                    <SessionRow mode={s.mode} title={s.title} date={s.created_at} count={count} />
                    {i < sessions.length - 1 && (
                      <div className="mx-4" style={{ height: 1, background: "rgba(255,255,255,.05)" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {!user && !loading && (
          <section className="animate-rise mt-8 rounded-2xl px-6 py-8 text-center" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.07)" }}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl animate-breathe" style={{ background: "rgba(120,200,150,.12)", border: "1px solid rgba(120,200,150,.2)" }}>
              <Sparkles className="h-5 w-5" style={{ color: "oklch(0.78 0.19 162)" }} />
            </div>
            <p className="text-sm font-medium">Sign in to track your progress</p>
            <p className="mt-1 text-xs text-muted-foreground">Save conversations and see how far you've come.</p>
            <Link to="/auth" className="mt-5 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-200 hover:opacity-90 active:scale-95" style={{ background: "oklch(0.78 0.19 162)", color: "oklch(0.09 0.014 248)" }}>
              Sign in
            </Link>
          </section>
        )}
      </main>
    </>
  );
}
