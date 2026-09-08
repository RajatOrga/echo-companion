import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, KeyRound, MessagesSquare, Sparkles } from "lucide-react";
import { MODES } from "@/lib/modes";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aria — an AI companion you can talk to out loud" },
      {
        name: "description",
        content:
          "A calm, private space to practise speaking with a face that listens and reacts. Bring your own AI key; your conversations stay yours.",
      },
      { property: "og:title", content: "Aria — an AI companion you can talk to out loud" },
      {
        property: "og:description",
        content:
          "Practise conversation, interviews or English with a responsive 3D face. Voice in, voice out, powered by your own AI key.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Onboarding,
});

const STEPS = [
  {
    icon: Sparkles,
    title: "A face that actually listens",
    body: "Speak out loud and a face answers out loud — its expression, gaze and timing follow the conversation instead of sitting still.",
  },
  {
    icon: KeyRound,
    title: "Your key, your conversation",
    body: "You bring your own AI key. It is kept in this browser and sent only to the provider you chose. Nothing about your talks is sold, shared or trained on.",
  },
  {
    icon: MessagesSquare,
    title: "Five ways to practise",
    body: "Choose a scene: everyday conversation, interview prep, English practice, easy company, or a study partner that quizzes you.",
  },
];

function Onboarding() {
  const [step, setStep] = useState(0);
  const current = STEPS[step]!;
  const Icon = current.icon;
  const last = step === STEPS.length - 1;

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl animate-breathe"
      />
      <div key={step} className="animate-rise relative w-full max-w-md text-center">
        <Icon className="mx-auto h-7 w-7 text-primary" />
        <h1 className="mt-8 text-3xl font-medium tracking-tight text-balance-tight">
          {current.title}
        </h1>
        <p className="mt-5 text-base leading-relaxed text-muted-foreground">{current.body}</p>

        {last ? (
          <ul className="mt-8 flex flex-wrap justify-center gap-2">
            {MODES.map((mode) => (
              <li
                key={mode.slug}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
              >
                {mode.name}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-12 flex flex-col items-center gap-5">
          {last ? (
            <Link
              to="/setup"
              className="group flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-medium text-primary-foreground transition-all duration-500 hover:scale-[1.02]"
            >
              Set up your key
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="group flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-medium text-primary-foreground transition-all duration-500 hover:scale-[1.02]"
            >
              Continue
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
          )}

          <div className="flex gap-1.5">
            {STEPS.map((s, index) => (
              <span
                key={s.title}
                className={`h-1 rounded-full transition-all duration-500 ${
                  index === step ? "w-6 bg-primary" : "w-1.5 bg-border"
                }`}
              />
            ))}
          </div>

          <Link
            to="/modes"
            className="text-xs text-muted-foreground transition-colors duration-300 hover:text-foreground"
          >
            Skip for now
          </Link>
        </div>
      </div>
    </main>
  );
}
