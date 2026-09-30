CREATE TYPE public.skill_kind AS ENUM ('recognition','listening','reading','writing','speaking','recall','sentence_usage','form');
CREATE TYPE public.mastery_state AS ENUM ('new','learning','familiar','strong','mastered');

CREATE TABLE public.learners (
  device_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Learner',
  learning_language TEXT NOT NULL DEFAULT 'English',
  native_language TEXT NOT NULL DEFAULT 'Arabic',
  daily_goal_minutes INTEGER NOT NULL DEFAULT 15,
  streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  audio_autoplay BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learners TO anon, authenticated;
GRANT ALL ON public.learners TO service_role;
ALTER TABLE public.learners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learners open access" ON public.learners FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.word_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  last_practiced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX word_sets_device_idx ON public.word_sets(device_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.word_sets TO anon, authenticated;
GRANT ALL ON public.word_sets TO service_role;
ALTER TABLE public.word_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "word_sets open access" ON public.word_sets FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id UUID NOT NULL REFERENCES public.word_sets(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  meaning TEXT,
  pronunciation TEXT,
  part_of_speech TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX words_set_idx ON public.words(set_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.words TO anon, authenticated;
GRANT ALL ON public.words TO service_role;
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "words open access" ON public.words FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sentences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  translation TEXT,
  form TEXT NOT NULL DEFAULT 'base',
  variation_index INTEGER NOT NULL DEFAULT 0,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sentences_word_idx ON public.sentences(word_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentences TO anon, authenticated;
GRANT ALL ON public.sentences TO service_role;
ALTER TABLE public.sentences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sentences open access" ON public.sentences FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.learning_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  set_id UUID NOT NULL REFERENCES public.word_sets(id) ON DELETE CASCADE,
  word_id UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
  sentence_id UUID REFERENCES public.sentences(id) ON DELETE SET NULL,
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
CREATE INDEX learning_items_due_idx ON public.learning_items(device_id, next_review_at);
CREATE INDEX learning_items_set_idx ON public.learning_items(set_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_items TO anon, authenticated;
GRANT ALL ON public.learning_items TO service_role;
ALTER TABLE public.learning_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learning_items open access" ON public.learning_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.practice_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  learning_item_id UUID NOT NULL REFERENCES public.learning_items(id) ON DELETE CASCADE,
  skill public.skill_kind NOT NULL,
  is_correct BOOLEAN NOT NULL,
  score NUMERIC,
  response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX practice_attempts_item_idx ON public.practice_attempts(learning_item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_attempts TO anon, authenticated;
GRANT ALL ON public.practice_attempts TO service_role;
ALTER TABLE public.practice_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "practice_attempts open access" ON public.practice_attempts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.daily_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  day DATE NOT NULL DEFAULT (now()::date),
  minutes_practiced NUMERIC NOT NULL DEFAULT 0,
  items_completed INTEGER NOT NULL DEFAULT 0,
  goal_minutes INTEGER NOT NULL DEFAULT 15,
  UNIQUE (device_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_progress TO anon, authenticated;
GRANT ALL ON public.daily_progress TO service_role;
ALTER TABLE public.daily_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_progress open access" ON public.daily_progress FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);