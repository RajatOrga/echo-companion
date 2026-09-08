import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Aria" },
      {
        name: "description",
        content:
          "Create an optional account to keep your conversation history. You can also use Aria entirely on this device.",
      },
      { property: "og:title", content: "Sign in — Aria" },
      {
        property: "og:description",
        content: "Optional account for saved conversations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your email to confirm your account");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/modes" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-16">
      <div className="animate-rise">
        <h1 className="text-2xl font-medium tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create an account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only used to keep your conversation history. Your AI key never leaves this browser.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-input bg-card/60 px-4 py-3 text-sm outline-none transition-colors duration-300 focus:border-primary/60"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-input bg-card/60 px-4 py-3 text-sm outline-none transition-colors duration-300 focus:border-primary/60"
          />
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-transform duration-500 hover:scale-[1.01] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>


        <div className="mt-8 flex flex-col gap-2 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-left transition-colors duration-300 hover:text-foreground"
          >
            {mode === "signin" ? "No account yet? Create one" : "Already have an account? Sign in"}
          </button>
          <Link to="/modes" className="transition-colors duration-300 hover:text-foreground">
            Continue without an account
          </Link>
        </div>
      </div>
    </main>
  );
}
