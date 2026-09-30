CREATE TYPE public.skill_kind AS ENUM ('recognition','listening','reading','writing','speaking','recall','sentence_usage','form');
CREATE TYPE public.mastery_state AS ENUM ('new','learning','familiar','strong','mastered');

-- Profiles ------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Learners (device_id = auth user id as text) --------------------------
CREATE TABLE public.learners (
  device_id TEXT PRIMARY KEY DEFAULT (auth.uid())::text,
  display_name TEXT NOT NULL DEFAULT 'Learner',
  learning_language TEXT NOT NULL DEFAULT 'English',
  native_language TEXT NOT NULL DEFAULT 'Arabic',
  daily_goal_minutes INTEGER NOT NULL DEFAULT 15,
  streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  audio_autoplay BOOLEAN NOT NULL DEFAULT true,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learners TO authenticated;
GRANT ALL ON public.learners TO service_role;
ALTER TABLE public.learners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own learner" ON public.learners FOR ALL TO authenticated
  USING (device_id = (auth.uid())::text) WITH CHECK (device_id = (auth.uid())::text);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.learners (device_id, display_name)
  VALUES (NEW.id::text, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'Learner'))
  ON CONFLICT (device_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Word sets (with independent Words / Tenses & Forms schedules) --------
CREATE TABLE public.word_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL DEFAULT (auth.uid())::text,
  name TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  last_practiced_at TIMESTAMPTZ,
  target_language TEXT NOT NULL DEFAULT 'en',
  native_language TEXT NOT NULL DEFAULT 'en',
  forms_generated_at TIMESTAMPTZ,
  review_stage INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  forms_review_stage INTEGER NOT NULL DEFAULT 0,
  forms_last_reviewed_at TIMESTAMPTZ,
  forms_next_review_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX word_sets_device_idx ON public.word_sets(device_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.word_sets TO authenticated;
GRANT ALL ON public.word_sets TO service_role;
ALTER TABLE public.word_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sets" ON public.word_sets FOR ALL TO authenticated
  USING (device_id = (auth.uid())::text) WITH CHECK (device_id = (auth.uid())::text);

-- Schedule fields may only change through complete_review_session().
CREATE OR REPLACE FUNCTION public.protect_review_schedule()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('lingoflow.schedule_write', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.review_stage := 0; NEW.last_reviewed_at := NULL; NEW.next_review_at := NULL;
    NEW.forms_review_stage := 0; NEW.forms_last_reviewed_at := NULL; NEW.forms_next_review_at := NULL;
  ELSE
    NEW.review_stage := OLD.review_stage; NEW.last_reviewed_at := OLD.last_reviewed_at; NEW.next_review_at := OLD.next_review_at;
    NEW.forms_review_stage := OLD.forms_review_stage; NEW.forms_last_reviewed_at := OLD.forms_last_reviewed_at; NEW.forms_next_review_at := OLD.forms_next_review_at;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER word_sets_protect_schedule BEFORE INSERT OR UPDATE ON public.word_sets
  FOR EACH ROW EXECUTE FUNCTION public.protect_review_schedule();

CREATE OR REPLACE FUNCTION public.owns_set(_set_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.word_sets WHERE id = _set_id AND device_id = (auth.uid())::text)
$$;

CREATE TABLE public.words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id UUID NOT NULL REFERENCES public.word_sets(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  translation TEXT,
  meaning TEXT,
  pronunciation TEXT,
  part_of_speech TEXT,
  alternative_parts_of_speech TEXT[] NOT NULL DEFAULT '{}',
  difficulty SMALLINT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  forms_category TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX words_set_idx ON public.words(set_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.words TO authenticated;
GRANT ALL ON public.words TO service_role;
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own words" ON public.words FOR ALL TO authenticated
  USING (public.owns_set(set_id)) WITH CHECK (public.owns_set(set_id));

CREATE OR REPLACE FUNCTION public.owns_word(_word_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.words w JOIN public.word_sets s ON s.id = w.set_id
                 WHERE w.id = _word_id AND s.device_id = (auth.uid())::text)
$$;

CREATE TABLE public.sentences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  translation TEXT,
  form TEXT NOT NULL DEFAULT 'base',
  variation_index INTEGER NOT NULL DEFAULT 0,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  word_hints JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sentences_word_idx ON public.sentences(word_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentences TO authenticated;
GRANT ALL ON public.sentences TO service_role;
ALTER TABLE public.sentences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sentences" ON public.sentences FOR ALL TO authenticated
  USING (public.owns_word(word_id)) WITH CHECK (public.owns_word(word_id));

CREATE TABLE public.word_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL DEFAULT (auth.uid())::text,
  set_id UUID NOT NULL REFERENCES public.word_sets(id) ON DELETE CASCADE,
  word_id UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  form_label TEXT NOT NULL,
  form_kind TEXT NOT NULL DEFAULT 'inflection',
  is_regular BOOLEAN,
  translation TEXT,
  explanation TEXT,
  example TEXT,
  example_translation TEXT,
  pronunciation TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX word_forms_set_idx ON public.word_forms(set_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.word_forms TO authenticated;
GRANT ALL ON public.word_forms TO service_role;
ALTER TABLE public.word_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own forms" ON public.word_forms FOR ALL TO authenticated
  USING (device_id = (auth.uid())::text) WITH CHECK (device_id = (auth.uid())::text AND public.owns_set(set_id));

CREATE TABLE public.learning_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL DEFAULT (auth.uid())::text,
  set_id UUID NOT NULL REFERENCES public.word_sets(id) ON DELETE CASCADE,
  word_id UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
  sentence_id UUID REFERENCES public.sentences(id) ON DELETE SET NULL,
  form_id UUID REFERENCES public.word_forms(id) ON DELETE CASCADE,
  skill public.skill_kind NOT NULL,
  form TEXT NOT NULL DEFAULT 'base',
  mastery NUMERIC NOT NULL DEFAULT 0,
  state public.mastery_state NOT NULL DEFAULT 'new',
  attempts INTEGER NOT NULL DEFAULT 0,
  mistakes INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  difficulty NUMERIC NOT NULL DEFAULT 0.3,
  ease NUMERIC NOT NULL DEFAULT 2.5,
  interval_days NUMERIC NOT NULL DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (word_id, skill, form)
);
CREATE INDEX learning_items_device_idx ON public.learning_items(device_id);
CREATE INDEX learning_items_set_idx ON public.learning_items(set_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_items TO authenticated;
GRANT ALL ON public.learning_items TO service_role;
ALTER TABLE public.learning_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own items" ON public.learning_items FOR ALL TO authenticated
  USING (device_id = (auth.uid())::text) WITH CHECK (device_id = (auth.uid())::text AND public.owns_set(set_id));

CREATE TABLE public.practice_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL DEFAULT (auth.uid())::text,
  learning_item_id UUID NOT NULL REFERENCES public.learning_items(id) ON DELETE CASCADE,
  skill public.skill_kind NOT NULL,
  is_correct BOOLEAN NOT NULL,
  score NUMERIC,
  response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX practice_attempts_item_idx ON public.practice_attempts(learning_item_id);
GRANT SELECT, INSERT ON public.practice_attempts TO authenticated;
GRANT ALL ON public.practice_attempts TO service_role;
ALTER TABLE public.practice_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attempts read" ON public.practice_attempts FOR SELECT TO authenticated USING (device_id = (auth.uid())::text);
CREATE POLICY "own attempts insert" ON public.practice_attempts FOR INSERT TO authenticated WITH CHECK (device_id = (auth.uid())::text);

CREATE TABLE public.pronunciation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL DEFAULT (auth.uid())::text,
  learning_item_id UUID NOT NULL REFERENCES public.learning_items(id) ON DELETE CASCADE,
  target_text TEXT NOT NULL,
  transcript TEXT NOT NULL DEFAULT '',
  score NUMERIC NOT NULL DEFAULT 0,
  matched_words TEXT[] NOT NULL DEFAULT '{}',
  missed_words TEXT[] NOT NULL DEFAULT '{}',
  attempt_index INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pronunciation_attempts_item_idx ON public.pronunciation_attempts(learning_item_id);
GRANT SELECT, INSERT ON public.pronunciation_attempts TO authenticated;
GRANT ALL ON public.pronunciation_attempts TO service_role;
ALTER TABLE public.pronunciation_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pron read" ON public.pronunciation_attempts FOR SELECT TO authenticated USING (device_id = (auth.uid())::text);
CREATE POLICY "own pron insert" ON public.pronunciation_attempts FOR INSERT TO authenticated WITH CHECK (device_id = (auth.uid())::text);

CREATE TABLE public.daily_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL DEFAULT (auth.uid())::text,
  day DATE NOT NULL DEFAULT (now()::date),
  minutes_practiced NUMERIC NOT NULL DEFAULT 0,
  items_completed INTEGER NOT NULL DEFAULT 0,
  goal_minutes INTEGER NOT NULL DEFAULT 15,
  UNIQUE (device_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_progress TO authenticated;
GRANT ALL ON public.daily_progress TO service_role;
ALTER TABLE public.daily_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own daily" ON public.daily_progress FOR ALL TO authenticated
  USING (device_id = (auth.uid())::text) WITH CHECK (device_id = (auth.uid())::text);

-- Review sessions: resumable; an active one that was left = Ignored ----
CREATE TABLE public.review_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL DEFAULT (auth.uid())::text,
  set_id UUID NOT NULL REFERENCES public.word_sets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('words','forms')),
  purpose TEXT NOT NULL CHECK (purpose IN ('initial','review')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  scheduled_for TIMESTAMPTZ,
  phase TEXT NOT NULL DEFAULT 'units',
  position INTEGER NOT NULL DEFAULT 0,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX review_sessions_one_active ON public.review_sessions(set_id, kind) WHERE status = 'active';
CREATE INDEX review_sessions_device_idx ON public.review_sessions(device_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_sessions TO authenticated;
GRANT ALL ON public.review_sessions TO service_role;
ALTER TABLE public.review_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own review sessions" ON public.review_sessions FOR ALL TO authenticated
  USING (device_id = (auth.uid())::text) WITH CHECK (device_id = (auth.uid())::text AND public.owns_set(set_id));

-- Clients may not mark sessions completed directly.
CREATE OR REPLACE FUNCTION public.protect_session_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('lingoflow.schedule_write', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'active'; NEW.completed_at := NULL;
  ELSE
    IF OLD.status = 'completed' THEN RAISE EXCEPTION 'Session already completed'; END IF;
    NEW.status := OLD.status; NEW.completed_at := OLD.completed_at;
    NEW.purpose := OLD.purpose; NEW.kind := OLD.kind; NEW.set_id := OLD.set_id; NEW.scheduled_for := OLD.scheduled_for;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER review_sessions_protect BEFORE INSERT OR UPDATE ON public.review_sessions
  FOR EACH ROW EXECUTE FUNCTION public.protect_session_status();

-- Deterministic interval ladder (days) for the stage being entered.
CREATE OR REPLACE FUNCTION public.review_interval_days(_stage int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _stage <= 1 THEN 3 WHEN _stage = 2 THEN 7 WHEN _stage = 3 THEN 14
              WHEN _stage = 4 THEN 30 WHEN _stage = 5 THEN 60 WHEN _stage = 6 THEN 120 ELSE 180 END
$$;

-- Completes a session once and advances the matching schedule exactly one stage.
CREATE OR REPLACE FUNCTION public.complete_review_session(_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.review_sessions%ROWTYPE;
  ws public.word_sets%ROWTYPE;
  cur_stage int; cur_next timestamptz; new_stage int; ts timestamptz := now(); advanced boolean := false;
BEGIN
  SELECT * INTO s FROM public.review_sessions WHERE id = _session_id AND device_id = (auth.uid())::text FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF s.status = 'completed' THEN RETURN jsonb_build_object('advanced', false, 'already', true); END IF;
  SELECT * INTO ws FROM public.word_sets WHERE id = s.set_id FOR UPDATE;

  IF s.kind = 'words' THEN cur_stage := ws.review_stage; cur_next := ws.next_review_at;
  ELSE cur_stage := ws.forms_review_stage; cur_next := ws.forms_next_review_at; END IF;

  PERFORM set_config('lingoflow.schedule_write', 'on', true);

  IF s.purpose = 'initial' AND cur_stage = 0 THEN
    new_stage := 1; advanced := true;
  ELSIF s.purpose = 'review' AND cur_next IS NOT NULL AND s.scheduled_for = cur_next AND cur_next <= ts THEN
    new_stage := cur_stage + 1; advanced := true;
  END IF;

  IF advanced THEN
    IF s.kind = 'words' THEN
      UPDATE public.word_sets SET review_stage = new_stage, last_reviewed_at = ts,
        next_review_at = ts + make_interval(days => public.review_interval_days(new_stage)) WHERE id = ws.id;
    ELSE
      UPDATE public.word_sets SET forms_review_stage = new_stage, forms_last_reviewed_at = ts,
        forms_next_review_at = ts + make_interval(days => public.review_interval_days(new_stage)) WHERE id = ws.id;
    END IF;
  END IF;

  UPDATE public.review_sessions SET status = 'completed', completed_at = ts WHERE id = s.id;
  PERFORM set_config('lingoflow.schedule_write', 'off', true);
  RETURN jsonb_build_object('advanced', advanced, 'stage', COALESCE(new_stage, cur_stage));
END; $$;
REVOKE ALL ON FUNCTION public.complete_review_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_review_session(uuid) TO authenticated;