import { Link } from "@tanstack/react-router";
import { ChevronLeft, ScrollText, Settings } from "lucide-react";

export function TopBar({ title, onTranscript }: { title: string; onTranscript?: () => void }) {
  return (
    <header className="flex items-center justify-between px-5 py-3.5 text-sm">
      <Link
        to="/modes"
        className="flex items-center gap-1.5 rounded-xl border border-transparent px-2.5 py-1.5 text-muted-foreground transition-all duration-300 hover:border-border hover:bg-card/60 hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        <span className="text-xs tracking-wide">Modes</span>
      </Link>

      {/* Logo + mode label */}
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center">
          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
            <circle cx="10" cy="10" r="9" fill="oklch(0.78 0.19 162)" />
            <circle cx="7" cy="9" r="2" fill="white" />
            <circle cx="13" cy="9" r="2" fill="white" />
            <circle cx="7.5" cy="9.5" r="1" fill="#0d1117" />
            <circle cx="13.5" cy="9.5" r="1" fill="#0d1117" />
            <path d="M7 13 Q10 15.5 13 13" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          </svg>
        </span>
        <span className="text-xs font-medium tracking-wide text-muted-foreground">{title}</span>
      </div>

      <div className="flex items-center gap-1">
        {onTranscript ? (
          <button
            type="button"
            onClick={onTranscript}
            aria-label="Show transcript"
            className="rounded-xl border border-transparent p-2 text-muted-foreground transition-all duration-300 hover:border-border hover:bg-card/60 hover:text-foreground"
          >
            <ScrollText className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <Link
          to="/settings"
          aria-label="Settings"
          className="rounded-xl border border-transparent p-2 text-muted-foreground transition-all duration-300 hover:border-border hover:bg-card/60 hover:text-foreground"
        >
          <Settings className="h-3.5 w-3.5" />
        </Link>
      </div>
    </header>
  );
}
