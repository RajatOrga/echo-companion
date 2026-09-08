import { useEffect, useRef } from "react";
import { Copy, Download, X } from "lucide-react";
import { toast } from "sonner";
import type { Caption } from "@/components/Captions";

function toText(items: Caption[], title: string) {
  const header = `${title} — ${new Date().toLocaleString()}\n\n`;
  return (
    header +
    items.map((item) => `${item.role === "user" ? "You" : "Aria"}: ${item.content}`).join("\n\n")
  );
}

export function TranscriptPanel({
  items,
  title,
  onClose,
}: {
  items: Caption[];
  title: string;
  onClose: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toText(items, title));
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const download = () => {
    const blob = new Blob([toText(items, title)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replace(/\s+/g, "-")}-transcript.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="animate-rise absolute inset-0 z-20 flex flex-col bg-background/95 backdrop-blur-sm">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <span className="text-sm tracking-wide text-muted-foreground">Transcript</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={copy}
            aria-label="Copy transcript"
            className="text-muted-foreground transition-colors duration-300 hover:text-foreground"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={download}
            aria-label="Download transcript"
            className="text-muted-foreground transition-colors duration-300 hover:text-foreground"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close transcript"
            className="text-muted-foreground transition-colors duration-300 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-5 overflow-y-auto px-6 py-6">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing said yet.</p>
        ) : null}
        {items.map((item) => (
          <div key={item.id} className="space-y-1">
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
              {item.role === "user" ? "You" : "Aria"}
            </span>
            <p
              className={`text-sm leading-relaxed ${
                item.role === "user" ? "text-primary/90" : "text-foreground"
              }`}
            >
              {item.content}
            </p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </aside>
  );
}
