CREATE TABLE public.sentence_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL DEFAULT (auth.uid())::text,
  word_id uuid NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
  training_session_id uuid,
  sentence text NOT NULL CHECK (length(btrim(sentence)) > 0),
  is_correct boolean NOT NULL,
  corrected text,
  explanation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.sentence_attempts IS 'Optional sentence-writing history. Never used for points, mastery or review scheduling.';
GRANT SELECT, INSERT ON public.sentence_attempts TO authenticated;
GRANT ALL ON public.sentence_attempts TO service_role;
ALTER TABLE public.sentence_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sentence attempts read" ON public.sentence_attempts FOR SELECT TO authenticated USING (device_id = (auth.uid())::text);
CREATE POLICY "own sentence attempts insert" ON public.sentence_attempts FOR INSERT TO authenticated WITH CHECK (device_id = (auth.uid())::text AND public.owns_word(word_id));
CREATE INDEX sentence_attempts_word_idx ON public.sentence_attempts(word_id, created_at);