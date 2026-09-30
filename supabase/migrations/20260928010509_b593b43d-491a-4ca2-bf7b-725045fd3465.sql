CREATE TABLE public.word_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  set_id uuid NOT NULL REFERENCES public.word_sets(id) ON DELETE CASCADE,
  word_id uuid NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
  text text NOT NULL,
  form_label text NOT NULL,
  form_kind text NOT NULL DEFAULT 'inflection',
  is_regular boolean,
  translation text,
  explanation text,
  example text,
  example_translation text,
  pronunciation text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.word_forms TO anon, authenticated;
GRANT ALL ON public.word_forms TO service_role;
ALTER TABLE public.word_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "word_forms open access" ON public.word_forms FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX word_forms_set_idx ON public.word_forms(set_id);

ALTER TABLE public.learning_items ADD COLUMN form_id uuid REFERENCES public.word_forms(id) ON DELETE CASCADE;
ALTER TABLE public.word_sets ADD COLUMN forms_generated_at timestamptz;
ALTER TABLE public.words ADD COLUMN forms_category text;