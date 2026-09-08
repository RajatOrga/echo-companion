import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { testConnection } from "@/lib/ai.functions";
import {
  DEFAULT_MODELS,
  ELEVENLABS_VOICES,
  OPENAI_VOICES,
  loadSettings,
  saveSettings,
  type KeySettings,
  type LlmProvider,
} from "@/lib/keys";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Connect your AI key — Aria" },
      {
        name: "description",
        content:
          "Add your own AI key and optional voice key. Keys stay in this browser and are sent only to the provider you choose.",
      },
      { property: "og:title", content: "Connect your AI key — Aria" },
      {
        property: "og:description",
        content: "Bring your own key from OpenAI, Anthropic, Google or any compatible endpoint.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SetupPage,
});

const PROVIDERS: { value: LlmProvider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Google Gemini" },
  { value: "custom", label: "Custom endpoint" },
];

function SetupPage() {
  const navigate = useNavigate();
  const runTest = useServerFn(testConnection);
  const [settings, setSettings] = useState<KeySettings | null>(null);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  if (!settings) return <main className="min-h-screen" />;

  const update = (patch: Partial<KeySettings>) => {
    setTested(false);
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleTest = async () => {
    if (!settings.apiKey.trim() && settings.provider !== "custom") {
      toast.error("Add your key first");
      return;
    }
    setTesting(true);
    try {
      const result = await runTest({
        data: {
          provider: settings.provider,
          apiKey: settings.apiKey || "none",
          model: settings.model,
          baseUrl: settings.baseUrl || undefined,
        },
      });
      setTested(true);
      toast.success(result.sample || "Connection works");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reach the provider");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    saveSettings(settings);
    toast.success("Saved on this device");
    navigate({ to: "/modes" });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-16">
      <div className="animate-rise">
        <h1 className="text-2xl font-medium tracking-tight">Connect your AI</h1>
        <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Your key is stored in this browser only. It is never saved to any account or database,
          and it is passed straight through to the provider you pick.
        </p>

        <div className="mt-10 space-y-7">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Provider
            </label>
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map((provider) => (
                <button
                  key={provider.value}
                  type="button"
                  onClick={() =>
                    update({
                      provider: provider.value,
                      model: DEFAULT_MODELS[provider.value] || settings.model,
                    })
                  }
                  className={`rounded-full border px-4 py-2 text-sm transition-all duration-400 ${
                    settings.provider === provider.value
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {provider.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="API key">
            <input
              type="password"
              value={settings.apiKey}
              onChange={(event) => update({ apiKey: event.target.value })}
              placeholder="sk-..."
              autoComplete="off"
              className="w-full rounded-xl border border-input bg-card/60 px-4 py-3 text-sm outline-none transition-colors duration-300 focus:border-primary/60"
            />
          </Field>

          <Field label="Model">
            <input
              value={settings.model}
              onChange={(event) => update({ model: event.target.value })}
              placeholder="gpt-4o-mini"
              className="w-full rounded-xl border border-input bg-card/60 px-4 py-3 text-sm outline-none transition-colors duration-300 focus:border-primary/60"
            />
          </Field>

          {settings.provider === "custom" ? (
            <Field label="Endpoint address">
              <input
                value={settings.baseUrl}
                onChange={(event) => update({ baseUrl: event.target.value })}
                placeholder="https://your-endpoint/v1"
                className="w-full rounded-xl border border-input bg-card/60 px-4 py-3 text-sm outline-none transition-colors duration-300 focus:border-primary/60"
              />
            </Field>
          ) : null}

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Voice (optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {(["none", "openai", "elevenlabs"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => update({ ttsProvider: option })}
                  className={`rounded-full border px-4 py-2 text-sm transition-all duration-400 ${
                    settings.ttsProvider === option
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option === "none"
                    ? "Browser voice"
                    : option === "openai"
                      ? "OpenAI voice"
                      : "ElevenLabs"}
                </button>
              ))}
            </div>
          </div>

          {settings.ttsProvider !== "none" ? (
            <>
              <Field label="Voice key">
                <input
                  type="password"
                  value={settings.ttsKey}
                  onChange={(event) => update({ ttsKey: event.target.value })}
                  autoComplete="off"
                  placeholder={settings.ttsProvider === "elevenlabs" ? "xi-api-key..." : "sk-..."}
                  className="w-full rounded-xl border border-input bg-card/60 px-4 py-3 text-sm outline-none transition-colors duration-300 focus:border-primary/60"
                />
              </Field>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Voice Preset
                </label>
                <div className="grid gap-2">
                  <select
                    value={settings.voice || "auto"}
                    onChange={(event) => update({ voice: event.target.value })}
                    className="w-full rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none transition-colors duration-300 focus:border-primary/60"
                  >
                    {(settings.ttsProvider === "elevenlabs" ? ELEVENLABS_VOICES : OPENAI_VOICES).map(
                      (v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} — {v.description}
                        </option>
                      ),
                    )}
                  </select>
                  {settings.ttsProvider === "elevenlabs" ? (
                    <input
                      value={settings.voice === "auto" ? "" : settings.voice}
                      onChange={(event) => update({ voice: event.target.value || "auto" })}
                      placeholder="Or enter custom ElevenLabs Voice ID (optional)"
                      className="w-full rounded-xl border border-input bg-card/60 px-4 py-2.5 text-xs outline-none transition-colors duration-300 focus:border-primary/60"
                    />
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {settings.voice === "auto" || !settings.voice
                    ? "✨ Auto selects the ideal voice for each section (Interview, Casual, Companionship, etc.)."
                    : "Using this specific voice across all conversation modes."}
                </p>
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : tested ? (
              <Check className="h-4 w-4 text-primary" />
            ) : null}
            Test connection
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-transform duration-500 hover:scale-[1.02]"
          >
            Save and continue
          </button>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Want your conversations kept between devices?{" "}
          <Link to="/auth" className="text-primary/90 underline-offset-4 hover:underline">
            Create an account
          </Link>
          . It is optional.
        </p>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
