import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import type { EmotionEngine } from "@/lib/emotion";
import type { SceneConfig } from "@/lib/scenes";

const AvatarFace = lazy(() => import("@/components/avatar/AvatarFace"));

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <div className="h-24 w-24 rounded-full bg-primary/10 animate-breathe" />
      <span className="text-xs tracking-[0.25em] uppercase text-muted-foreground/60">
        {label}
      </span>
    </div>
  );
}

export function AvatarStage({
  engine,
  gazeRef,
  active,
  config,
}: {
  engine: EmotionEngine;
  gazeRef: { current: string };
  active: boolean;
  config: SceneConfig;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="relative h-full w-full">
        <ClientOnly fallback={<Placeholder label={`entering ${config.label}`} />}>
          <Suspense fallback={<Placeholder label={`entering ${config.label}`} />}>
            <AvatarFace engine={engine} gazeRef={gazeRef} active={active} config={config} />
          </Suspense>
        </ClientOnly>
      </div>
      {/* soft vignette so the room falls away at the edges, like a call window */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 42%, transparent 45%, color-mix(in oklab, var(--background) 85%, transparent) 100%)",
        }}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent transition-opacity duration-700 ${
          active ? "opacity-80" : "opacity-100"
        }`}
      />
    </div>
  );
}
