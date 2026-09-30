ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS difficulty smallint,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.sentences
  ADD COLUMN IF NOT EXISTS word_hints jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.pronunciation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  learning_item_id uuid NOT NULL REFERENCES public.learning_items(id) ON DELETE CASCADE,
  target_text text NOT NULL,
  transcript text NOT NULL DEFAULT '',
  score numeric NOT NULL DEFAULT 0,
  matched_words text[] NOT NULL DEFAULT '{}',
  missed_words text[] NOT NULL DEFAULT '{}',
  attempt_index integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pronunciation_attempts TO anon, authenticated;
GRANT ALL ON public.pronunciation_attempts TO service_role;
ALTER TABLE public.pronunciation_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage pronunciation attempts" ON public.pronunciation_attempts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS pronunciation_attempts_item_idx ON public.pronunciation_attempts(learning_item_id);