import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { clearSettings, loadSettings, saveSettings, type KeySettings } from "@/lib/keys";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Aria" },
      {
        name: "description",
        content: "Manage your AI key, choose a voice, sign out, or clear your saved conversations.",
      },
      { property: "og:title", content: "Settings — Aria" },
      { property: "og:description", content: "Keys, voice and history controls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<KeySettings | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const clearHistory = async () => {
    if (!user) {
      toast.success("Nothing saved on this device");
      return;
    }
    const { error } = await supabase.from("sessions").delete().eq("user_id", user.id);
    if (error) toast.error(error.message);
    else toast.success("Conversations cleared");
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-8 px-6 py-16">
      <div className="animate-rise">
        <h1 className="text-2xl font-medium tracking-tight">Settings</h1>

        <section className="mt-8 space-y-4">
          <Row label="AI provider" value={settings?.provider ?? "—"} />
          <Row
            label="Key"
            value={settings?.apiKey ? "Saved in this browser" : "Not set"}
          />
          <Row
            label="Voice"
            value={
              settings?.ttsProvider === "none"
                ? "Browser voice"
                : `${settings?.ttsProvider ?? "—"} · ${settings?.voice ?? ""}`
            }
          />
          <Row label="Account" value={user?.email ?? "Signed out (this device only)"} />
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            to="/setup"
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-transform duration-500 hover:scale-[1.02]"
          >
            Change keys
          </Link>
          <button
            type="button"
            onClick={() => {
              if (settings) saveSettings({ ...settings, ttsProvider: "none", ttsKey: "" });
              setSettings((prev) => (prev ? { ...prev, ttsProvider: "none", ttsKey: "" } : prev));
              toast.success("Switched to the browser voice");
            }}
            className="rounded-full border border-border px-5 py-2.5 text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground"
          >
            Use browser voice
          </button>
          <button
            type="button"
            onClick={() => {
              clearSettings();
              setSettings(loadSettings());
              toast.success("Keys removed from this browser");
            }}
            className="rounded-full border border-border px-5 py-2.5 text-sm text-muted-foreground transition-colors duration-300 hover:text-destructive"
          >
            Forget my keys
          </button>
          <button
            type="button"
            onClick={clearHistory}
            className="rounded-full border border-border px-5 py-2.5 text-sm text-muted-foreground transition-colors duration-300 hover:text-destructive"
          >
            Clear conversations
          </button>
          {user ? (
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/modes" });
              }}
              className="rounded-full border border-border px-5 py-2.5 text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground"
            >
              Sign out
            </button>
          ) : (
            <Link
              to="/auth"
              className="rounded-full border border-border px-5 py-2.5 text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground"
            >
              Sign in
            </Link>
          )}
        </div>

        <Link
          to="/modes"
          className="mt-10 inline-block text-xs text-muted-foreground transition-colors duration-300 hover:text-foreground"
        >
          Back to modes
        </Link>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
