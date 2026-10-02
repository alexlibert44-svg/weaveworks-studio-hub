ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'set';
ALTER TABLE public.training_sessions ADD CONSTRAINT training_sessions_scope_check CHECK (scope IN ('set','single'));

CREATE OR REPLACE FUNCTION public.protect_training_session()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  NEW.status := 'active'; NEW.started_at := now(); NEW.completed_at := NULL; NEW.local_day := NULL;
  NEW.duration_seconds := NULL; NEW.total_attempts := NULL; NEW.correct_attempts := NULL;
  NEW.incorrect_attempts := NULL; NEW.corrected_attempts := NULL; NEW.accuracy := NULL; NEW.points := 0;
  IF NEW.scope IS NULL OR NEW.scope NOT IN ('set','single') THEN NEW.scope := 'set'; END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.complete_training_session(_session_id uuid, _local_day date, _active_seconds integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  s public.training_sessions%ROWTYPE;
  ts timestamptz := now();
  n_total int; n_ok int; n_fixed int; acc numeric; pts int; dur int; day date; max_pts int;
BEGIN
  SELECT * INTO s FROM public.training_sessions
   WHERE id = _session_id AND device_id = (auth.uid())::text FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training session not found'; END IF;

  IF s.status <> 'completed' THEN
    -- First answer per exercise decides accuracy; recognition (just viewing) and sentence writing are not counted.
    WITH a AS (
      SELECT learning_item_id, is_correct, created_at,
             row_number() OVER (PARTITION BY learning_item_id ORDER BY created_at) AS rn,
             bool_or(is_correct) OVER (PARTITION BY learning_item_id) AS ever_ok
      FROM public.practice_attempts
      WHERE training_session_id = s.id AND device_id = s.device_id AND skill NOT IN ('recognition','sentence_usage')
    )
    SELECT count(*), count(*) FILTER (WHERE is_correct), count(*) FILTER (WHERE NOT is_correct AND ever_ok)
      INTO n_total, n_ok, n_fixed FROM a WHERE rn = 1;

    max_pts := CASE WHEN s.scope = 'single' THEN 5 ELSE 15 END;
    acc := CASE WHEN n_total > 0 THEN round(n_ok::numeric * 100 / n_total, 1) END;
    pts := CASE WHEN n_total > 0 THEN round(n_ok::numeric * max_pts / n_total)::int ELSE 0 END;
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
    'accuracy', s.accuracy, 'points', s.points, 'local_day', s.local_day, 'scope', s.scope);
END; $function$;