import { useEffect, useRef } from "react";

export type Caption = { id: string; role: "user" | "assistant"; content: string };

export function Captions({ items, interim }: { items: Caption[]; interim?: string }) {
  const recent = items.slice(-4);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, interim]);

  return (
    <div className="pointer-events-none flex w-full max-w-2xl flex-col items-center gap-3 px-6 text-center">
      {recent.map((item, index) => {
        const isLast = index === recent.length - 1;
        return (
          <p
            key={item.id}
            className={`animate-rise transition-opacity duration-700 ${
              item.role === "assistant"
                ? isLast
                  ? "text-xl leading-relaxed text-foreground"
                  : "text-base text-muted-foreground/70"
                : isLast
                  ? "text-base text-primary/90"
                  : "text-sm text-muted-foreground/50"
            }`}
          >
            {item.content}
          </p>
        );
      })}
      {interim ? (
        <p className="animate-rise text-base italic text-muted-foreground/60">{interim}</p>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
