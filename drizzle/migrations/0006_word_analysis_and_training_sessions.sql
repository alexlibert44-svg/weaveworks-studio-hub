ALTER TABLE public.words ADD COLUMN IF NOT EXISTS analysis_status text NOT NULL DEFAULT 'ready';
ALTER TABLE public.words ADD COLUMN IF NOT EXISTS analysis_error text;
ALTER TABLE public.words ADD COLUMN IF NOT EXISTS meaning_options jsonb;
ALTER TABLE public.word_forms ADD COLUMN IF NOT EXISTS meaning_options jsonb;
ALTER TABLE public.practice_attempts ADD COLUMN IF NOT EXISTS training_session_id uuid;
CREATE INDEX IF NOT EXISTS practice_attempts_training_session_idx ON public.practice_attempts(training_session_id);

CREATE TABLE public.training_sessions (
  id uuid PRIMARY KEY,
  device_id text NOT NULL DEFAULT (auth.uid())::text,
  set_id uuid REFERENCES public.word_sets(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'words',
  target_language text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  local_day date,
  duration_seconds integer,
  total_attempts integer,
  correct_attempts integer,
  incorrect_attempts integer,
  corrected_attempts integer,
  accuracy numeric,
  points integer NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT ON public.training_sessions TO authenticated;
GRANT ALL ON public.training_sessions TO service_role;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own training read" ON public.training_sessions FOR SELECT TO authenticated
  USING (device_id = (auth.uid())::text);
CREATE POLICY "own training insert" ON public.training_sessions FOR INSERT TO authenticated
  WITH CHECK (device_id = (auth.uid())::text AND (set_id IS NULL OR public.owns_set(set_id)));
CREATE INDEX training_sessions_device_idx ON public.training_sessions(device_id, status);

-- New rows always start active with no results; results are written only by the function below.
CREATE OR REPLACE FUNCTION public.protect_training_session()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.status := 'active'; NEW.started_at := now(); NEW.completed_at := NULL; NEW.local_day := NULL;
  NEW.duration_seconds := NULL; NEW.total_attempts := NULL; NEW.correct_attempts := NULL;
  NEW.incorrect_attempts := NULL; NEW.corrected_attempts := NULL; NEW.accuracy := NULL; NEW.points := 0;
  RETURN NEW;
END; $$;
CREATE TRIGGER training_sessions_protect BEFORE INSERT ON public.training_sessions
FOR EACH ROW EXECUTE FUNCTION public.protect_training_session();

-- Completes a training session exactly once, from its real recorded answers.
CREATE OR REPLACE FUNCTION public.complete_training_session(_session_id uuid, _local_day date, _active_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  s public.training_sessions%ROWTYPE;
  ts timestamptz := now();
  n_total int; n_ok int; n_fixed int; acc numeric; pts int; dur int; day date;
BEGIN
  SELECT * INTO s FROM public.training_sessions
   WHERE id = _session_id AND device_id = (auth.uid())::text FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training session not found'; END IF;

  IF s.status <> 'completed' THEN
    -- First answer per exercise decides accuracy; recognition (just viewing) is not an answer.
    WITH a AS (
      SELECT learning_item_id, is_correct, created_at,
             row_number() OVER (PARTITION BY learning_item_id ORDER BY created_at) AS rn,
             bool_or(is_correct) OVER (PARTITION BY learning_item_id) AS ever_ok
      FROM public.practice_attempts
      WHERE training_session_id = s.id AND device_id = s.device_id AND skill <> 'recognition'
    )
    SELECT count(*), count(*) FILTER (WHERE is_correct), count(*) FILTER (WHERE NOT is_correct AND ever_ok)
      INTO n_total, n_ok, n_fixed FROM a WHERE rn = 1;

    acc := CASE WHEN n_total > 0 THEN round(n_ok::numeric * 100 / n_total, 1) END;
    pts := CASE WHEN n_total > 0 THEN round(n_ok::numeric * 20 / n_total)::int ELSE 0 END;
    dur := LEAST(GREATEST(COALESCE(_active_seconds, 0), 0), ceil(EXTRACT(EPOCH FROM (ts - s.started_at)))::int);
    day := COALESCE(_local_day, ts::date);
    IF day > (ts::date + 1) OR day < (ts::date - 1) THEN day := ts::date; END IF;

    UPDATE public.training_sessions SET status = 'completed', completed_at = ts, local_day = day,
      duration_seconds = dur, total_attempts = n_total, correct_attempts = n_ok,
      incorrect_attempts = n_total - n_ok, corrected_attempts = n_fixed, accuracy = acc, points = pts
    WHERE id = s.id RETURNING * INTO s;
  END IF;

  RETURN jsonb_build_object('id', s.id, 'duration_seconds', s.duration_seconds, 'total', s.total_attempts,
    'correct', s.correct_attempts, 'incorrect', s.incorrect_attempts, 'corrected', s.corrected_attempts,
    'accuracy', s.accuracy, 'points', s.points, 'local_day', s.local_day);
END; $$;
REVOKE ALL ON FUNCTION public.complete_training_session(uuid, date, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_training_session(uuid, date, integer) TO authenticated;