CREATE OR REPLACE FUNCTION public.review_interval_days(_stage integer)
 RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT CASE WHEN _stage <= 1 THEN 3 WHEN _stage = 2 THEN 7 WHEN _stage = 3 THEN 14
              WHEN _stage = 4 THEN 30 WHEN _stage = 5 THEN 60 WHEN _stage = 6 THEN 120
              WHEN _stage = 7 THEN 180 WHEN _stage = 8 THEN 270 ELSE 365 END
$$;

CREATE OR REPLACE FUNCTION public.complete_review_session(_session_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  s public.review_sessions%ROWTYPE;
  ws public.word_sets%ROWTYPE;
  cur_stage int; cur_next timestamptz; ts timestamptz := now();
  n_ok int := 0; n_bad int := 0; first_ok int := 0; first_total int := 0;
  acc numeric; rec text; tim text := 'on_time'; delay numeric := 0; base_int int;
  new_stage int; new_int int; new_next timestamptz; do_schedule boolean := false;
  prev_rec text;
BEGIN
  SELECT * INTO s FROM public.review_sessions WHERE id = _session_id AND device_id = (auth.uid())::text FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF s.status = 'completed' THEN RETURN jsonb_build_object('advanced', false, 'already', true); END IF;
  SELECT * INTO ws FROM public.word_sets WHERE id = s.set_id FOR UPDATE;

  IF s.kind = 'words' THEN cur_stage := ws.review_stage; cur_next := ws.next_review_at;
  ELSE cur_stage := ws.forms_review_stage; cur_next := ws.forms_next_review_at; END IF;

  -- Real graded answers in this session for this unit only (viewing/recognition is not recall;
  -- optional sentence writing is stored elsewhere and never counted).
  WITH a AS (
    SELECT pa.learning_item_id, pa.is_correct,
           row_number() OVER (PARTITION BY pa.learning_item_id ORDER BY pa.created_at) rn
    FROM public.practice_attempts pa JOIN public.learning_items li ON li.id = pa.learning_item_id
    WHERE li.set_id = s.set_id AND pa.device_id = s.device_id AND pa.skill <> 'recognition'
      AND pa.created_at >= s.started_at AND pa.created_at <= ts
      AND ((s.kind = 'words' AND li.form_id IS NULL) OR (s.kind = 'forms' AND li.form_id IS NOT NULL))
  )
  SELECT count(*) FILTER (WHERE is_correct), count(*) FILTER (WHERE NOT is_correct),
         count(*) FILTER (WHERE rn = 1 AND is_correct), count(*) FILTER (WHERE rn = 1)
    INTO n_ok, n_bad, first_ok, first_total FROM a;

  IF first_total = 0 THEN RAISE EXCEPTION 'No answers were recorded in this review'; END IF;
  -- First-attempt correctness decides recall; repeated errors on retries pull it down further.
  acc := round(first_ok::numeric / first_total, 3);
  IF n_bad > first_total - first_ok THEN acc := round(acc * 0.9, 3); END IF;
  rec := CASE WHEN acc >= 0.85 THEN 'strong' WHEN acc >= 0.6 THEN 'moderate' ELSE 'poor' END;

  SELECT recall INTO prev_rec FROM public.review_sessions
   WHERE set_id = s.set_id AND kind = s.kind AND status = 'completed' AND id <> s.id AND recall IS NOT NULL
   ORDER BY completed_at DESC LIMIT 1;

  IF s.purpose = 'initial' AND cur_stage = 0 THEN
    do_schedule := true; tim := 'initial';
    new_stage := 1;
    new_int := CASE rec WHEN 'strong' THEN 3 WHEN 'moderate' THEN 2 ELSE 1 END;
  ELSIF s.purpose = 'review' AND cur_next IS NOT NULL AND s.scheduled_for = cur_next AND cur_next <= ts THEN
    do_schedule := true;
    base_int := public.review_interval_days(cur_stage);
    delay := round(EXTRACT(EPOCH FROM (ts - cur_next)) / 86400.0, 2);
    tim := CASE WHEN delay < 1 THEN 'on_time' WHEN delay < base_int THEN 'late' ELSE 'long_delay' END;
    IF rec = 'strong' THEN
      IF tim = 'long_delay' THEN new_stage := cur_stage; ELSE new_stage := cur_stage + 1; END IF;
      new_int := public.review_interval_days(new_stage);
    ELSIF rec = 'moderate' THEN
      new_stage := CASE WHEN tim = 'long_delay' THEN GREATEST(1, cur_stage - 1) ELSE cur_stage END;
      new_int := GREATEST(1, round(public.review_interval_days(new_stage) * 0.5)::int);
    ELSE
      -- Repeated forgetting: back to stage 1 for focused relearning.
      new_stage := CASE WHEN tim = 'long_delay' OR prev_rec = 'poor' THEN 1 ELSE GREATEST(1, cur_stage - 2) END;
      new_int := 1;
    END IF;
  END IF;

  PERFORM set_config('lingoflow.schedule_write', 'on', true);
  IF do_schedule THEN
    new_next := ts + make_interval(days => new_int);
    IF s.kind = 'words' THEN
      UPDATE public.word_sets SET review_stage = new_stage, last_reviewed_at = ts, next_review_at = new_next WHERE id = ws.id;
    ELSE
      UPDATE public.word_sets SET forms_review_stage = new_stage, forms_last_reviewed_at = ts, forms_next_review_at = new_next WHERE id = ws.id;
    END IF;
  END IF;

  UPDATE public.review_sessions SET status = 'completed', completed_at = ts,
    correct_count = n_ok, incorrect_count = n_bad, accuracy = acc, recall = rec, timing = tim,
    delay_days = delay, stage_before = cur_stage, stage_after = COALESCE(new_stage, cur_stage),
    interval_days = new_int, next_review_at = new_next
  WHERE id = s.id;
  PERFORM set_config('lingoflow.schedule_write', 'off', true);

  RETURN jsonb_build_object('advanced', do_schedule, 'recall', rec, 'accuracy', acc, 'timing', tim,
    'stage', COALESCE(new_stage, cur_stage), 'stage_before', cur_stage, 'interval_days', new_int,
    'next_review_at', new_next, 'correct', n_ok, 'incorrect', n_bad);
END; $function$;