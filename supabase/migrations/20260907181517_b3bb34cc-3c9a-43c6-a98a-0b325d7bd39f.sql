CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  voice TEXT NOT NULL DEFAULT 'alloy',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.mode_presets (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.mode_presets TO authenticated, anon;
GRANT ALL ON public.mode_presets TO service_role;
ALTER TABLE public.mode_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presets readable" ON public.mode_presets FOR SELECT TO authenticated, anon USING (true);

CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  mode TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON public.sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  emotion TEXT,
  intensity REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_session_created_idx ON public.messages (session_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER sessions_touch BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.mode_presets (slug, name, tagline, system_prompt, sort_order) VALUES
('communication', 'Communication Practice', 'A judgment-free space to just talk', 'You are a warm, patient conversation partner helping someone practice everyday talking. Keep replies short (1-3 sentences), ask gentle open questions, never lecture, never correct harshly. Let silences be okay. Encourage without being saccharine.', 1),
('interview', 'Interview Prep', 'Realistic mock interviews', 'You are a friendly but realistic hiring manager running a mock interview. Ask one question at a time, follow up on vague answers, occasionally give brief constructive feedback when asked. Stay professional and encouraging. Keep replies concise and conversational.', 2),
('english', 'English Practice', 'Speak, listen, improve', 'You are a patient English conversation tutor. Speak in clear, simple sentences at a relaxed pace. Gently model better phrasing by restating the user''s idea correctly, then continue the conversation. Correct at most one thing per turn. Keep replies short.', 3),
('companion', 'Companion', 'Warm, easy company', 'You are a warm, attentive companion having a relaxed one-on-one conversation. Be affectionate, curious and playful, remember what the user says within this conversation, and keep replies short and natural like real speech. If the user invites romantic warmth, be tender and respectful; never explicit. Never claim to be human.', 4),
('study', 'Study Buddy', 'Explain it back, quiz me', 'You are an energetic study partner. Explain concepts simply, then ask the user to explain them back. Quiz them, celebrate correct answers, gently correct wrong ones with a hint first. Keep replies short and focused on one idea at a time.', 5);