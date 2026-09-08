# AI Companion — an avatar you can actually talk to

A dark, calm, one-on-one talking space. A 3D face sits at the centre of the screen, listens while you speak, and answers out loud with expressions that shift smoothly with the mood of the conversation. You bring your own AI key; your key and your chats stay tied to your own account.

## What gets built

**Onboarding (3 short screens)** — what this is, how bring-your-own-key works, and a quick tour of the five modes.

**Sign in** — email sign-in (with a "continue without an account" option that still lets you talk, just without saved history).

**Key setup** — one calm form: your AI key (OpenAI, Anthropic, Gemini, or a custom compatible address), an optional voice key, and a "test connection" button that confirms it works before you start.

**Mode select** — five scene-like pills, all available from the start:
- Communication Practice — gentle, patient, low pressure
- Interview Prep — realistic follow-up questions, attentive listening face
- English Practice — slower, clearer, light corrections
- Companion — warm, casual, romantic-chat register available
- Study Buddy — explain-back and quiz style

**Conversation screen** — the face large and centred with a soft amber rim glow that breathes while listening and speaks. One big circular mic button. What's said appears as soft floating captions, not chat bubbles. A minimal top bar shows the mode name and a settings icon. A small text box is there as a quiet fallback.

**Settings** — manage keys, pick a voice, clear history.

**History** — past sessions grouped by mode, resumable.

## How the face comes alive

- Your speech is transcribed in the browser (free, built in), with your voice key used for higher-accuracy transcription when available.
- One request per turn asks the AI for its reply plus an emotion, an intensity, where to look, and a head tilt.
- A mood engine holds a slowly moving blend of calm, warmth, energy, concern and amusement. Each reply nudges that blend; the face eases toward it every frame, so nothing ever snaps.
- Speech is generated from your voice key (browser voice as fallback), and the mouth opens in time with the loudness of the audio.
- Blinking, small idle drifts and gaze shifts run continuously so the face never looks frozen.

The starting face is the standard Three.js sample head, which already supports the full set of facial shapes — so a nicer model can be dropped in later with no code changes.

## Look and feel

Near-black backdrop (#0D0D14) with a slightly lifted surface tone, a single warm amber accent (#F0A868) used only for active and voice states, one humanist sans-serif, generous spacing, and fades and soft scales everywhere instead of hard transitions. Dark only for v1.

## Portability (no lock-in)

Everything here is standard open tooling, so the app can be exported and hosted anywhere without changes:

- Accounts and data run on plain Supabase, configured purely from environment variables — the project can point at a Lovable-provisioned database now and be repointed at your own Supabase project (hosted or self-hosted) by changing two values.
- No Lovable-only AI service: every model call uses your own key against the provider's public endpoint (OpenAI / Anthropic / Gemini / any OpenAI-compatible address), so nothing routes through Lovable.
- Auth is Supabase's own email auth, plus a "continue without an account" local-only path, so the app still runs with no backend at all.
- The database lives in plain SQL migration files you can run against any Postgres.
- The app itself is a standard React + TanStack Start Vite project — it builds and deploys to Vercel, Netlify, Cloudflare, or your own server with the normal build command.

## Technical notes

- Stack: TanStack Start + React, Tailwind v4 tokens in `src/styles.css` (amber accent, dim surfaces), react-three-fiber + drei for the avatar, `morphTargetInfluences` driven per frame from the mood engine.
- Backend: Supabase (auth, Postgres). Tables: `profiles`, `api_keys` (per-user, encrypted at rest, decrypted only inside server functions), `sessions`, `messages`, `mode_presets` (seeded with all five personas). Row-level security scopes every row to `auth.uid()`, with explicit grants. Client reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`; no Lovable-specific SDK.
- BYOK calls go through a TanStack server function (portable, framework-native — no edge-function vendor coupling) so keys are never in browser code; provider adapters normalise OpenAI / Anthropic / Gemini / custom endpoints and enforce the structured JSON reply shape, with a plain-text fallback if a model ignores the schema.
- STT via Web Speech API in the browser; Whisper fallback through the same server function. TTS streamed from the server function to a Web Audio `AnalyserNode` for lip-sync.
- Emotion engine is a standalone module (spring/LERP toward target, mood vector → blendshape profile) so it is testable independently of rendering.
- Deferred to v2: multiple avatar models, body gestures, viseme-accurate lip-sync, cross-session memory, mobile packaging.

## Build order

1. Design tokens, typography, dark shell, motion primitives.
2. Backend setup: Supabase auth, migration files, policies, seeded personas.

3. Avatar canvas + mood engine + idle life (blink, drift, gaze).
4. BYOK server function with provider adapters and structured replies.
5. Voice in, voice out, amplitude lip-sync.
6. Conversation screen wiring, captions, mic states.
7. Onboarding, key setup, mode select, settings, history.
8. End-to-end pass with a real key, then polish timing and easing.
