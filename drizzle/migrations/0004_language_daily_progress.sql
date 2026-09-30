CREATE TABLE public.language_daily_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL DEFAULT (auth.uid())::text,
  day date NOT NULL DEFAULT (now())::date,
  target_language text NOT NULL,
  minutes_practiced numeric NOT NULL DEFAULT 0,
  items_completed integer NOT NULL DEFAULT 0,
  goal_minutes integer NOT NULL DEFAULT 15,
  UNIQUE (device_id, day, target_language)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.language_daily_progress TO authenticated;
GRANT ALL ON public.language_daily_progress TO service_role;
ALTER TABLE public.language_daily_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own language daily" ON public.language_daily_progress FOR ALL TO authenticated
  USING (device_id = (auth.uid())::text) WITH CHECK (device_id = (auth.uid())::text);
CREATE INDEX language_daily_progress_owner_language_day_idx ON public.language_daily_progress (device_id, target_language, day DESC);
-- Preserve previously recorded minutes without changing the legacy table.
-- Existing unlabelled rows are assigned to the learner's active language; rows
-- with a single matching day's set activity use that set's recorded language.
INSERT INTO public.language_daily_progress (device_id, day, target_language, minutes_practiced, items_completed, goal_minutes)
SELECT d.device_id, d.day,
  COALESCE((SELECT s.target_language FROM public.practice_attempts a
            JOIN public.learning_items i ON i.id = a.learning_item_id
            JOIN public.word_sets s ON s.id = i.set_id
            WHERE a.device_id = d.device_id AND a.created_at::date = d.day
            GROUP BY s.target_language ORDER BY count(*) DESC, s.target_language LIMIT 1),
           NULLIF(l.learning_language, 'English'), 'en'),
  d.minutes_practiced, d.items_completed, d.goal_minutes
FROM public.daily_progress d
LEFT JOIN public.learners l ON l.device_id = d.device_id
ON CONFLICT (device_id, day, target_language) DO NOTHING;