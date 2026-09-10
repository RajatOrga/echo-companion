import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Settings, History, Shuffle, Play, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MODES, type ModeSlug } from "@/lib/modes";
import { hasKey, loadSettings } from "@/lib/keys";
import { useEffect, useRef, useState, useMemo } from "react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Aria — Home" },
      { name: "description", content: "Your Aria dashboard" },
    ],
  }),
  component: Dashboard,
});

// ─── Design tokens (mirrors echo-v3.html :root) ───────────────
const C = {
  bg:        "oklch(0.09 0.014 248)",
  s1:        "oklch(0.16 0.020 248)",
  s2:        "oklch(0.21 0.022 248)",
  s3:        "oklch(0.27 0.024 248)",
  b0:        "oklch(0.24 0.018 248)",
  b1:        "oklch(0.32 0.022 248)",
  t1:        "oklch(0.94 0.008 90)",
  t2:        "oklch(0.78 0.012 248)",
  t3:        "oklch(0.60 0.012 248)",
  jade:      "oklch(0.78 0.19 162)",
  jadeDim:   "oklch(0.20 0.07 162)",
  jadeMid:   "oklch(0.36 0.12 162)",
  jadeTxt:   "oklch(0.88 0.12 162)",
  jadeGlow:  "oklch(0.78 0.19 162 / 0.18)",
  amber:     "oklch(0.82 0.17 75)",
  amberDim:  "oklch(0.22 0.06 75)",
  rose:      "oklch(0.72 0.17 15)",
  roseDim:   "oklch(0.22 0.07 15)",
  sky:       "oklch(0.78 0.12 220)",
  skyDim:    "oklch(0.20 0.06 220)",
};

// per-mode colors for cards
const MODE_META: Record<string, { emoji: string; color: string; dim: string; txt: string; label: string; glowRgb: string }> = {
  interview:     { emoji: "🎤", color: C.rose,  dim: C.roseDim,  txt: "oklch(0.82 0.14 15)",  label: "Intense",  glowRgb: "244,63,94" },
  companion:     { emoji: "🧡", color: C.jade,  dim: C.jadeDim,  txt: C.jadeTxt,              label: "Friendly", glowRgb: "52,211,153" },
  english:       { emoji: "🌍", color: C.sky,   dim: C.skyDim,   txt: "oklch(0.82 0.10 220)", label: "Learning", glowRgb: "14,165,233" },
  communication: { emoji: "💡", color: C.amber, dim: C.amberDim, txt: "oklch(0.86 0.14 75)",  label: "Practice", glowRgb: "245,158,11" },
  study:         { emoji: "📚", color: "oklch(0.76 0.18 155)", dim: "oklch(0.18 0.07 155)", txt: "oklch(0.84 0.12 155)", label: "Focus", glowRgb: "16,185,129" },
};

function mm(slug: string) { return MODE_META[slug] ?? MODE_META["companion"]!; }

// ─── Ambient orbs (background) ────────────────────────────────
function AmbientOrbs() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      <div className="absolute" style={{ width: 480, height: 480, top: -120, left: -160, borderRadius: "50%", background: `radial-gradient(circle,${C.jadeGlow} 0%,transparent 65%)`, filter: "blur(40px)" }} />
      <div className="absolute" style={{ width: 360, height: 360, top: -60, right: -140, borderRadius: "50%", background: "radial-gradient(circle,rgba(244,63,94,0.12) 0%,transparent 65%)", filter: "blur(48px)" }} />
      <div className="absolute" style={{ width: 400, height: 400, bottom: -140, left: "30%", borderRadius: "50%", background: "radial-gradient(circle,rgba(14,165,233,0.08) 0%,transparent 65%)", filter: "blur(56px)" }} />
    </div>
  );
}

// ─── Animated Echo mascot (from echo-v3.html) ─────────────────
function EchoMascot({ size = 90, color = "oklch(0.78 0.19 162)" }: { size?: number; color?: string }) {
  // Build a safe fill color — avoid appending to colors that already have '/'
  const shadowColor = color.includes("/") ? color : color.replace(")", " / 0.12)");
  return (
    <div style={{ width: size, height: size, animation: "efloat 3.2s ease-in-out infinite", flexShrink: 0 }}>
      <svg viewBox="0 0 120 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="60" cy="108" rx="28" ry="7" fill={shadowColor} />
        <path d="M60 16C88 16 104 34 104 60C104 86 88 104 60 104C32 104 16 86 16 60C16 34 32 16 60 16Z" fill={color}>
          <animateTransform attributeName="transform" type="scale" values="1;1.022;1" dur="2.4s" repeatCount="indefinite" additive="sum" calcMode="spline" keySplines=".4 0 .6 1;.4 0 .6 1" />
        </path>
        <ellipse cx="48" cy="40" rx="13" ry="8" fill="oklch(0.96 0.04 162 / 0.22)" />
        <ellipse cx="45" cy="58" rx="12" ry="13" fill="white" />
        <ellipse cx="75" cy="58" rx="12" ry="13" fill="white" />
        <ellipse cx="46" cy="59" rx="7" ry="8" fill="oklch(0.14 0.03 248)">
          <animateTransform attributeName="transform" type="translate" values="0,0;1,0;0,1;-1,0;0,0" dur="4s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx="76" cy="59" rx="7" ry="8" fill="oklch(0.14 0.03 248)">
          <animateTransform attributeName="transform" type="translate" values="0,0;1,0;0,1;-1,0;0,0" dur="4s" repeatCount="indefinite" />
        </ellipse>
        <circle cx="49" cy="54" r="2.5" fill="white" opacity=".9" />
        <circle cx="79" cy="54" r="2.5" fill="white" opacity=".9" />
        <ellipse cx="45" cy="58" rx="12" ry="0" fill={color} opacity="0">
          <animate attributeName="ry" values="0;13;0" dur="5s" begin="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;0" dur="5s" begin="1.5s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx="75" cy="58" rx="12" ry="0" fill={color} opacity="0">
          <animate attributeName="ry" values="0;13;0" dur="5s" begin="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;0" dur="5s" begin="1.5s" repeatCount="indefinite" />
        </ellipse>
        <path d="M46 76Q60 90 74 76" stroke="oklch(0.14 0.03 248)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <ellipse cx="33" cy="70" rx="7" ry="4.5" fill="oklch(0.75 0.18 20 / 0.35)" />
        <ellipse cx="87" cy="70" rx="7" ry="4.5" fill="oklch(0.75 0.18 20 / 0.35)" />
        <path d="M42 96Q30 112 20 102Q26 90 40 88Z" fill={color} opacity=".9">
          <animateTransform attributeName="transform" type="rotate" from="-4 42 96" to="6 42 96" dur="1.8s" repeatCount="indefinite" additive="sum" />
        </path>
      </svg>
    </div>
  );
}

// ─── Skill bar ────────────────────────────────────────────────
function SkillBar({ name, pct, color }: { name: string; pct: number; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: C.t2, fontWeight: 500 }}>{name}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.t3 }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: C.s3, borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 999, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

// ─── Mode card (Home mode grid — 3-col like echo-v3) ──────────
function ModeCard({ mode }: { mode: (typeof MODES)[number] }) {
  const m = mm(mode.slug);
  const [hov, setHov] = useState(false);
  return (
    <Link
      to="/talk/$mode"
      params={{ mode: mode.slug as ModeSlug }}
      style={{
        padding: "16px",
        background: hov ? C.s2 : C.s1,
        border: `1.5px solid ${hov ? C.b1 : C.b0}`,
        borderRadius: 14,
        cursor: "pointer",
        transition: "all 150ms",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        textDecoration: "none",
        transform: hov ? "translateY(-2px)" : "none",
        boxShadow: hov ? "0 6px 24px rgba(0,0,0,.4)" : "none",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={{ fontSize: 22, marginBottom: 7, display: "block" }}>{m.emoji}</span>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, letterSpacing: "-0.01em", marginBottom: 3 }}>{mode.name}</div>
      <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.4 }}>{mode.tagline}</div>
    </Link>
  );
}

// ─── Session row ──────────────────────────────────────────────
function SessionRow({ mode, title, date, count }: { mode: string; title: string; date: string; count: number }) {
  const m = mm(mode);
  const modeObj = MODES.find((x) => x.slug === mode);
  const [hov, setHov] = useState(false);
  return (
    <Link
      to="/talk/$mode"
      params={{ mode: mode as ModeSlug }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 14px",
        background: hov ? C.s2 : C.s1,
        border: `1px solid ${hov ? C.b1 : C.b0}`,
        borderRadius: 14,
        cursor: "pointer",
        transition: "all 150ms",
        textDecoration: "none",
        transform: hov ? "translateX(3px)" : "none",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ width: 36, height: 36, borderRadius: 8, background: m.dim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
        {m.emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        <div style={{ fontSize: 11.5, color: C.t3, marginTop: 1 }}>
          {new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          {" · "}{m.emoji} {modeObj?.name ?? mode}
          {" · "}{count} msg
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.t3 }}>→</div>
    </Link>
  );
}

// ─── Practice tab — mode setup picker ─────────────────────────
function PracticeTab() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState("companion");
  const selectedMode = MODES.find((m) => m.slug === selected) ?? MODES[0]!;
  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "270px 1fr", overflow: "hidden", minHeight: 0 }}>
      <aside style={{ padding: "24px 18px", borderRight: `1px solid ${C.b0}`, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto", alignItems: "center" }}>
        <EchoMascot size={90} />
        <div style={{ background: C.s2, border: `1px solid ${C.b1}`, borderRadius: 14, borderBottomLeftRadius: 4, padding: "12px 16px", fontSize: 13, color: C.t2, maxWidth: 220, lineHeight: 1.45 }}>
          Let's set the scene! Pick your{" "}
          <strong style={{ color: C.jadeTxt }}>mode</strong>{" "}
          — each one has a different vibe 👀
        </div>
        <div style={{ width: "100%", padding: 15, background: C.s1, border: `1px solid ${C.b0}`, borderRadius: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.t3, marginBottom: 8 }}>Session Preview</div>
          {([["Mode", selectedMode.name], ["Vibe", mm(selected).label], ["Ready?", "Hit Begin ↓"]] as const).map(([lbl, val]) => (
            <div key={lbl} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: `1px solid ${C.b0}` }}>
              <span style={{ fontSize: 12, color: C.t3 }}>{lbl}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{val}</span>
            </div>
          ))}
        </div>
      </aside>
      <main style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 22, overflowY: "auto" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.jadeTxt, marginBottom: 3 }}>Choose a mode</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.15, color: C.t1, fontFamily: "Georgia,serif", marginBottom: 5 }}>What do you want<br />to practise?</div>
          <div style={{ fontSize: 13, color: C.t3, lineHeight: 1.5 }}>Pick your vibe. Each mode is a different Aria with a different energy.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
          {MODES.map((mode) => {
            const m = mm(mode.slug);
            const sel = selected === mode.slug;
            return (
              <div
                key={mode.slug}
                onClick={() => setSelected(mode.slug)}
                style={{ padding: 14, background: sel ? m.dim : C.s1, border: `1.5px solid ${sel ? m.color : C.b0}`, borderRadius: 14, cursor: "pointer", transition: "all 150ms", boxShadow: sel ? `0 0 0 1px ${m.color},0 4px 20px rgba(${m.glowRgb},.18)` : "none" }}
              >
                <div style={{ fontSize: 22, marginBottom: 7 }}>{m.emoji}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, marginBottom: 3 }}>{mode.name}</div>
                <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.4 }}>{mode.tagline}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", paddingTop: 16, borderTop: `1px solid ${C.b0}` }}>
          <button
            onClick={() => navigate({ to: "/talk/$mode", params: { mode: selected as ModeSlug } })}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", background: C.jade, color: "oklch(0.1 0.02 162)", borderRadius: 999, fontSize: 15, fontWeight: 800, border: "none", cursor: "pointer" }}
          >
            ▶ Begin Session
          </button>
          <button
            onClick={() => navigate({ to: "/talk/$mode", params: { mode: selected as ModeSlug } })}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", background: C.s2, border: `1px solid ${C.b1}`, color: C.t2, borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            ← Back
          </button>
        </div>
      </main>
    </div>
  );
}

// ─── Feedback tab — history & scores ──────────────────────────
function FeedbackTab() {
  const { user } = useAuth();
  const { data: sessions } = useQuery({
    queryKey: ["feedback-sessions", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("id, mode, title, created_at, messages(count)")
        .order("created_at", { ascending: false })
        .limit(12);
      return (data ?? []) as Array<{ id: string; mode: string; title: string; created_at: string; messages: unknown }>;
    },
  });

  const totalSessions = sessions?.length ?? 0;
  const totalMessages = sessions?.reduce((acc, s) => acc + ((s.messages as Array<{ count: number }>)?.[0]?.count ?? 0), 0) ?? 0;
  const circumference = 2 * Math.PI * 58; // 364.4
  const progress = totalSessions > 0 ? Math.min(totalSessions / 20, 1) : 0;
  const dashOffset = circumference * (1 - progress);

  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "310px 1fr", overflow: "hidden", minHeight: 0 }}>
      <aside style={{ padding: "24px 20px", borderRight: `1px solid ${C.b0}`, display: "flex", flexDirection: "column", gap: 16, alignItems: "center", overflowY: "auto" }}>
        <EchoMascot size={90} color={C.amber} />
        <div style={{ background: C.s2, border: `1px solid ${C.b1}`, borderRadius: 14, borderBottomLeftRadius: 4, padding: "12px 16px", fontSize: 13, color: C.t2, lineHeight: 1.45 }}>
          <strong style={{ color: C.jadeTxt }}>Keep going!</strong> Every session makes Aria smarter about what you need. 🔥
        </div>
        {/* Score ring */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 140, height: 140 }}>
          <svg style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }} viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="58" fill="none" stroke={C.s3} strokeWidth="10" />
            <circle cx="70" cy="70" r="58" fill="none" stroke={C.jade} strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 8px ${C.jade})`, transition: "stroke-dashoffset 1.8s ease" }}
            />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 }}>
            <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.04em", color: C.t1, lineHeight: 1 }}>{totalSessions}</span>
            <span style={{ fontSize: 11, color: C.t3, fontWeight: 600, marginTop: 2 }}>Sessions</span>
          </div>
        </div>
        {/* Breakdown bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7, width: "100%" }}>
          {[
            { name: "Total Messages", val: totalMessages, pct: Math.min(100, totalMessages / 2), color: C.jade },
            { name: "Avg per session", val: totalSessions > 0 ? Math.round(totalMessages / totalSessions) : 0, pct: Math.min(100, totalSessions > 0 ? (totalMessages / totalSessions) * 5 : 0), color: C.amber },
          ].map(({ name, val, pct, color }) => (
            <div key={name} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "12px 13px", background: C.s1, border: `1px solid ${C.b0}`, borderRadius: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.t2 }}>{name}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color }}>{val}</span>
              </div>
              <div style={{ height: 4, background: C.s3, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
      </aside>
      <main style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.jadeTxt, marginBottom: 3 }}>Your history</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.15, color: C.t1, fontFamily: "Georgia,serif" }}>Here's your<br />full report</div>
        </div>
        {sessions && sessions.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {sessions.map((s) => {
              const count = (s.messages as Array<{ count: number }>)?.[0]?.count ?? 0;
              const m = mm(s.mode);
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: C.s1, border: `1px solid ${C.b0}`, borderRadius: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: m.dim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{m.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                    <div style={{ fontSize: 11.5, color: C.t3, marginTop: 1 }}>
                      {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {" · "}{count} messages
                    </div>
                  </div>
                  <div style={{ padding: "4px 10px", background: m.dim, borderRadius: 999, fontSize: 11, fontWeight: 700, color: m.txt }}>{m.label}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: 32, textAlign: "center", background: C.s1, border: `1px solid ${C.b0}`, borderRadius: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎙️</div>
            <div style={{ fontSize: 14, color: C.t2, fontWeight: 600 }}>No sessions yet</div>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>Start a conversation and your history will appear here.</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link to="/talk/$mode" params={{ mode: "communication" }} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 22px", background: C.jade, color: "oklch(0.1 0.02 162)", borderRadius: 999, fontSize: 14, fontWeight: 800, border: "none", textDecoration: "none" }}>
            ↺ Practice Again
          </Link>
        </div>
      </main>
    </div>
  );
}

// ─── Home tab (two-column layout matching echo-v3.html) ───────
function HomeTab({ user, stats, sessions, needsKey }: {
  user: ReturnType<typeof useAuth>["user"];
  stats: { totalSessions: number; totalMessages: number } | undefined;
  sessions: Array<{ id: string; mode: string; title: string; created_at: string; messages: unknown }> | undefined;
  needsKey: boolean;
}) {
  const navigate = useNavigate();
  const dailyPrompts = [
    "Tell me about yourself.",
    "What's your greatest strength?",
    "Describe a time you led a team under pressure.",
    "How do you handle feedback?",
    "Where do you see yourself in 5 years?",
  ];
  const [promptIdx, setPromptIdx] = useState(0);
  const prompt = dailyPrompts[promptIdx]!;

  const skillData = useMemo(() => [
    { name: "Clarity of speech",  pct: stats ? Math.min(95, 40 + (stats.totalMessages * 2)) : 40, color: C.jade },
    { name: "Confidence level",   pct: stats ? Math.min(90, 35 + (stats.totalSessions * 3)) : 35, color: C.amber },
    { name: "Structure & flow",   pct: stats ? Math.min(92, 38 + Math.floor(stats.totalMessages * 1.5)) : 38, color: C.sky },
    { name: "Pressure handling",  pct: stats ? Math.min(85, 30 + Math.floor(stats.totalSessions * 2.5)) : 30, color: C.rose },
  ], [stats]);

  const now = new Date();
  const hour = now.getHours();
  const tod = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const dayName = now.toLocaleDateString(undefined, { weekday: "long" });
  const userName = user?.email?.split("@")[0] ?? "Adventurer";

  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "290px 1fr", overflow: "hidden", minHeight: 0 }}>

      {/* ── Left sidebar ── */}
      <aside style={{ padding: "22px 20px", borderRight: `1px solid ${C.b0}`, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>

        {/* Greeting card */}
        <div style={{ background: C.s1, border: `1px solid ${C.b0}`, borderRadius: 28, padding: 18, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: C.t3, marginBottom: 10 }}>{dayName} {tod}</div>
          <EchoMascot size={90} />
          <div style={{ background: C.s2, border: `1px solid ${C.b1}`, borderRadius: 14, borderBottomLeftRadius: 4, padding: "12px 16px", fontSize: 13, color: C.t2, maxWidth: 210, lineHeight: 1.45, marginTop: 10, marginLeft: 8, textAlign: "left" }}>
            Hey {userName}! Ready to{" "}
            <strong style={{ color: C.jadeTxt }}>level up</strong>{" "}
            today? 🔥
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: C.t1, marginTop: 10, lineHeight: 1.2 }}>
            Good {tod},<br />{userName}
          </div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 3 }}>
            {stats && stats.totalSessions > 0
              ? `${stats.totalSessions} sessions · keep going!`
              : "Your journey starts here"}
          </div>
        </div>

        {/* Stat items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {([
            { icon: "🎯", label: "Confidence",  val: stats ? `${Math.min(95, 40 + stats.totalMessages * 2)}%` : "–", color: C.jadeTxt },
            { icon: "🗣️", label: "Sessions",    val: String(stats?.totalSessions ?? 0),                            color: C.t1 },
            { icon: "⚡",  label: "Messages",    val: String(stats?.totalMessages ?? 0),                            color: C.amber },
            { icon: "📚",  label: "Skill level", val: stats ? `${Math.min(92, 38 + stats.totalSessions * 3)}%` : "–", color: C.sky },
          ] as const).map(({ icon, label, val, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: C.s1, border: `1px solid ${C.b0}`, borderRadius: 14 }}>
              <span style={{ fontSize: 12.5, color: C.t3, display: "flex", alignItems: "center", gap: 7 }}>{icon} {label}</span>
              <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", color }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Skill tracker */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.t3, marginBottom: 2 }}>Skill Tracker</div>
          {skillData.map((s) => <SkillBar key={s.name} {...s} />)}
        </div>
      </aside>

      {/* ── Right main ── */}
      <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>

        {needsKey && (
          <Link
            to="/setup"
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: `linear-gradient(135deg,${C.jadeDim} 0%,${C.skyDim} 100%)`, border: `1px solid oklch(0.78 0.19 162 / 0.25)`, borderRadius: 20, textDecoration: "none" }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.jadeDim, display: "flex", alignItems: "center", justifyContent: "center" }}>⚡</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>Connect your AI key</div>
              <div style={{ fontSize: 12, color: C.t3 }}>Takes 30 seconds to start talking</div>
            </div>
            <span style={{ color: C.t3 }}>→</span>
          </Link>
        )}

        {/* Quick start card */}
        <div style={{ background: C.s1, border: `1px solid ${C.b0}`, borderRadius: 28, padding: "22px 22px 22px 24px", display: "flex", gap: 18, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", background: C.jadeDim, border: `1px solid oklch(0.78 0.19 162 / 0.25)`, borderRadius: 999, fontSize: 11, fontWeight: 700, color: C.jadeTxt, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>✦ Daily warmup</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.15, color: C.t1, fontFamily: "Georgia,serif", marginBottom: 8 }}>"{prompt}"</div>
            <div style={{ fontSize: 13, color: C.t3, lineHeight: 1.55, marginBottom: 16, maxWidth: "55ch" }}>Aria's picked today's opener just for you. A classic — but harder than it looks. Nail this and you'll nail the room.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => navigate({ to: "/talk/$mode", params: { mode: "communication" } })}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 22px", background: C.jade, color: "oklch(0.1 0.02 162)", borderRadius: 999, fontSize: 14, fontWeight: 800, border: "none", cursor: "pointer" }}
              >
                ▶ Start Session
              </button>
              <button
                onClick={() => setPromptIdx((i) => (i + 1) % dailyPrompts.length)}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", background: C.s2, border: `1px solid ${C.b1}`, color: C.t2, borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                🔀 Shuffle
              </button>
            </div>
          </div>
          <div style={{ flexShrink: 0, alignSelf: "center" }}>
            <EchoMascot size={64} color={C.amber} />
          </div>
        </div>

        {/* Practice Modes — 3-col like echo-v3 */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.t3, marginBottom: 10 }}>Practice Modes</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {MODES.map((mode) => <ModeCard key={mode.slug} mode={mode} />)}
          </div>
        </div>

        {/* Recent Sessions */}
        {sessions && sessions.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.t3, marginBottom: 10 }}>Recent Sessions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {sessions.map((s) => {
                const count = (s.messages as Array<{ count: number }>)?.[0]?.count ?? 0;
                return <SessionRow key={s.id} mode={s.mode} title={s.title} date={s.created_at} count={count} />;
              })}
            </div>
          </div>
        )}

        {!user && (
          <div style={{ padding: 32, textAlign: "center", background: C.s1, border: `1px solid ${C.b0}`, borderRadius: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.t1, marginBottom: 4 }}>Sign in to track progress</div>
            <div style={{ fontSize: 12, color: C.t3, marginBottom: 16 }}>Save conversations and watch your skills grow.</div>
            <Link to="/auth" style={{ display: "inline-flex", padding: "10px 24px", background: C.jade, color: "oklch(0.1 0.02 162)", borderRadius: 999, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>Sign in</Link>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────
type Tab = "home" | "practice" | "feedback";

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("home");
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
      return (data ?? []) as Array<{ id: string; mode: string; title: string; created_at: string; messages: unknown }>;
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

  const TABS: { id: Tab | "session"; label: string }[] = [
    { id: "home",     label: "Home" },
    { id: "practice", label: "Practice" },
    { id: "session",  label: "Session" },
    { id: "feedback", label: "Feedback" },
  ];

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: C.bg, color: C.t1, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif", fontSize: 15, lineHeight: 1.5, WebkitFontSmoothing: "antialiased" }}>
      <AmbientOrbs />

      {/* ── Nav bar (echo-v3 exact style) ── */}
      <nav style={{ position: "relative", zIndex: 30, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: `1px solid ${C.b0}`, flexShrink: 0, background: "oklch(0.10 0.014 248)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 800, letterSpacing: "-0.04em", color: C.t1 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.jade, boxShadow: `0 0 10px ${C.jade}`, animation: "pdot 2.4s ease-in-out infinite" }} />
          aria
        </div>

        <div style={{ display: "flex", gap: 3, background: C.s1, padding: 4, borderRadius: 999, border: `1px solid ${C.b0}` }}>
          {TABS.map(({ id, label }) => {
            const isActive = id !== "session" && activeTab === id;
            return (
              <button
                key={id}
                onClick={() => {
                  if (id === "session") navigate({ to: "/talk/$mode", params: { mode: "companion" } });
                  else setActiveTab(id as Tab);
                }}
                style={{ padding: "6px 18px", borderRadius: 999, fontSize: 13, fontWeight: 500, color: isActive ? C.t1 : C.t3, cursor: "pointer", transition: "all 150ms", border: "none", background: isActive ? C.s3 : "transparent", boxShadow: isActive ? "0 1px 4px rgba(0,0,0,.4)" : "none", userSelect: "none" }}
              >{label}</button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {stats && stats.totalSessions > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px 6px 10px", background: C.amberDim, border: `1px solid oklch(0.82 0.17 75 / 0.3)`, borderRadius: 999, fontSize: 13, fontWeight: 700, color: C.amber }}>
              🔥 <span>{stats.totalSessions}</span>
            </div>
          )}
          <Link
            to="/settings"
            style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg,${C.jadeDim},${C.jadeMid})`, border: `2px solid oklch(0.78 0.19 162 / 0.3)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, cursor: "pointer", textDecoration: "none" }}
          >👤</Link>
        </div>
      </nav>

      {/* ── Tab content ── */}
      <div style={{ position: "relative", zIndex: 10, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {activeTab === "home"     && <HomeTab user={user} stats={stats} sessions={sessions} needsKey={needsKey} />}
        {activeTab === "practice" && <PracticeTab />}
        {activeTab === "feedback" && <FeedbackTab />}
      </div>

      <style>{`
        @keyframes efloat {
          0%,100% { transform: translateY(0) rotate(-1deg); }
          40%      { transform: translateY(-8px) rotate(1.5deg); }
          70%      { transform: translateY(-3px) rotate(-0.5deg); }
        }
        @keyframes pdot {
          0%,100% { box-shadow: 0 0 8px oklch(0.78 0.19 162); }
          50%     { box-shadow: 0 0 20px oklch(0.78 0.19 162), 0 0 35px oklch(0.78 0.19 162 / 0.18); }
        }
      `}</style>
    </div>
  );
}
