import { Mic, Loader2 } from "lucide-react";

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
      className={`group relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 ${
        listening
          ? "bg-primary shadow-lg glow-jade"
          : "border border-border bg-card/70 hover:border-primary/50 hover:bg-card"
      }`}
    >
      {/* Ping ring when listening */}
      {listening && !busy ? (
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-primary opacity-25"
        />
      ) : null}

      {busy ? (
        /* Waveform bars when AI is thinking */
        <span className="flex items-center gap-[3px]">
          <span className="h-3.5 w-[3px] origin-bottom rounded-full bg-primary animate-wave-1" />
          <span className="h-3.5 w-[3px] origin-bottom rounded-full bg-primary animate-wave-2" />
          <span className="h-3.5 w-[3px] origin-bottom rounded-full bg-primary animate-wave-3" />
          <span className="h-3.5 w-[3px] origin-bottom rounded-full bg-primary animate-wave-4" />
          <span className="h-3.5 w-[3px] origin-bottom rounded-full bg-primary animate-wave-5" />
        </span>
      ) : listening ? (
        /* Square stop icon when listening */
        <span className="relative h-4 w-4 rounded-[3px] bg-primary-foreground" />
      ) : (
        <Mic className="relative h-4.5 w-4.5 text-muted-foreground transition-colors duration-300 group-hover:text-primary" />
      )}
    </button>
  );
}
