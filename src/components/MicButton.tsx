import { Mic, Square, Loader2 } from "lucide-react";

export function MicButton({
  listening,
  busy,
  disabled,
  onToggle,
}: {
  listening: boolean;
  busy: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || busy}
      aria-label={listening ? "Stop listening" : "Start talking"}
      className="group relative flex h-20 w-20 items-center justify-center rounded-full border border-border bg-card/70 text-foreground transition-all duration-500 ease-out hover:scale-[1.03] disabled:opacity-50 disabled:hover:scale-100"
    >
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full transition-opacity duration-700 ${
          listening ? "bg-primary/25 animate-breathe opacity-100" : "opacity-0"
        }`}
      />
      <span
        aria-hidden
        className={`absolute -inset-3 rounded-full transition-opacity duration-700 ${
          listening ? "glow-ring opacity-100" : "opacity-0"
        }`}
      />
      {busy ? (
        <Loader2 className="relative h-7 w-7 animate-spin text-primary" />
      ) : listening ? (
        <Square className="relative h-6 w-6 text-primary" />
      ) : (
        <Mic className="relative h-7 w-7 text-muted-foreground transition-colors duration-300 group-hover:text-primary" />
      )}
    </button>
  );
}
