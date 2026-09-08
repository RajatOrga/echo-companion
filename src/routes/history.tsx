import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getMode, type ModeSlug } from "@/lib/modes";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Past conversations — Aria" },
      {
        name: "description",
        content: "Look back at your saved conversations, grouped by the mode you were practising.",
      },
      { property: "og:title", content: "Past conversations — Aria" },
      { property: "og:description", content: "Your saved sessions, per mode." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: sessions,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["sessions", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("sessions")
        .select("id, mode, title, created_at, messages(count)")
        .order("created_at", { ascending: false });
      if (queryError) throw queryError;
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await supabase.from("sessions").delete().eq("id", id);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      toast.success("Conversation removed");
      void queryClient.invalidateQueries({ queryKey: ["sessions", user?.id] });
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-16">
      <div className="animate-rise">
        <h1 className="text-2xl font-medium tracking-tight">Past conversations</h1>

        {!user && !loading ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Conversations are only kept when you are signed in.{" "}
            <Link to="/auth" className="text-primary/90 underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        ) : null}

        {user && isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-destructive">
            Your conversations could not be loaded just now.
          </p>
        ) : null}

        {user && sessions?.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nothing here yet.</p>
        ) : null}

        <ul className="mt-8 space-y-3">
          {(sessions ?? []).map((session) => {
            const count = session.messages?.[0]?.count ?? 0;
            return (
              <li
                key={session.id}
                className="rounded-2xl border border-border px-5 py-4 transition-colors duration-500 hover:border-primary/40"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <Link
                    to="/talk/$mode"
                    params={{ mode: session.mode as ModeSlug }}
                    search={{ session: session.id }}
                    className="text-sm transition-colors duration-300 hover:text-primary"
                  >
                    {session.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {getMode(session.mode).name}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-4">
                  <span className="text-xs text-muted-foreground">
                    {new Date(session.created_at).toLocaleString()} · {count}{" "}
                    {count === 1 ? "message" : "messages"}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${session.title}`}
                    onClick={() => remove.mutate(session.id)}
                    className="text-muted-foreground transition-colors duration-300 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

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
