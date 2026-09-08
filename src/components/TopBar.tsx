import { Link } from "@tanstack/react-router";
import { ChevronLeft, ScrollText, Settings } from "lucide-react";

export function TopBar({ title, onTranscript }: { title: string; onTranscript?: () => void }) {
  return (
    <header className="flex items-center justify-between px-5 py-4 text-sm">
      <Link
        to="/modes"
        className="flex items-center gap-1 text-muted-foreground transition-colors duration-300 hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Modes
      </Link>
      <span className="tracking-wide text-muted-foreground">{title}</span>
      <div className="flex items-center gap-4">
        {onTranscript ? (
          <button
            type="button"
            onClick={onTranscript}
            aria-label="Show transcript"
            className="text-muted-foreground transition-colors duration-300 hover:text-foreground"
          >
            <ScrollText className="h-4 w-4" />
          </button>
        ) : null}
        <Link
          to="/settings"
          aria-label="Settings"
          className="text-muted-foreground transition-colors duration-300 hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
