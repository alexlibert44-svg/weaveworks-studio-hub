ALTER TABLE public.review_sessions
  ADD COLUMN IF NOT EXISTS correct_count integer,
  ADD COLUMN IF NOT EXISTS incorrect_count integer,
  ADD COLUMN IF NOT EXISTS accuracy numeric,
  ADD COLUMN IF NOT EXISTS recall text,
  ADD COLUMN IF NOT EXISTS timing text,
  ADD COLUMN IF NOT EXISTS delay_days numeric,
  ADD COLUMN IF NOT EXISTS stage_before integer,
  ADD COLUMN IF NOT EXISTS stage_after integer,
  ADD COLUMN IF NOT EXISTS interval_days integer,
  ADD COLUMN IF NOT EXISTS next_review_at timestamptz;

CREATE OR REPLACE FUNCTION public.complete_review_session(_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.review_sessions%ROWTYPE;
  ws public.word_sets%ROWTYPE;
  cur_stage int; cur_next timestamptz; ts timestamptz := now();
  n_ok int := 0; n_bad int := 0; sent_ok int := 0; sent_bad int := 0;
  acc numeric; rec text; tim text := 'on_time'; delay numeric := 0; base_int int;
  new_stage int; new_int int; new_next timestamptz; do_schedule boolean := false;
BEGIN
  SELECT * INTO s FROM public.review_sessions WHERE id = _session_id AND device_id = (auth.uid())::text FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF s.status = 'completed' THEN RETURN jsonb_build_object('advanced', false, 'already', true); END IF;
  SELECT * INTO ws FROM public.word_sets WHERE id = s.set_id FOR UPDATE;

  IF s.kind = 'words' THEN cur_stage := ws.review_stage; cur_next := ws.next_review_at;
  ELSE cur_stage := ws.forms_review_stage; cur_next := ws.forms_next_review_at; END IF;

  -- Real answers given during this session (only this unit's items).
  SELECT count(*) FILTER (WHERE pa.is_correct), count(*) FILTER (WHERE NOT pa.is_correct)
    INTO n_ok, n_bad
  FROM public.practice_attempts pa JOIN public.learning_items li ON li.id = pa.learning_item_id
  WHERE li.set_id = s.set_id AND pa.device_id = s.device_id
    AND pa.created_at >= s.started_at AND pa.created_at <= ts
    AND ((s.kind = 'words' AND li.form_id IS NULL) OR (s.kind = 'forms' AND li.form_id IS NOT NULL));

  SELECT count(*) FILTER (WHERE (e.value->>'correct')::boolean IS TRUE),
         count(*) FILTER (WHERE e.value->>'status' = 'evaluated' AND (e.value->>'correct')::boolean IS FALSE)
    INTO sent_ok, sent_bad
  FROM jsonb_each(COALESCE(s.state->'sentences', '{}'::jsonb)) e;

  n_ok := n_ok + sent_ok; n_bad := n_bad + sent_bad;
  IF n_ok + n_bad = 0 THEN RAISE EXCEPTION 'No answers were recorded in this review'; END IF;
  acc := round(n_ok::numeric / (n_ok + n_bad), 3);
  rec := CASE WHEN acc >= 0.85 THEN 'strong' WHEN acc >= 0.6 THEN 'moderate' ELSE 'poor' END;

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
      IF tim = 'long_delay' THEN new_stage := cur_stage;            -- recall held, but don't assume it held throughout
      ELSE new_stage := cur_stage + 1; END IF;
      new_int := public.review_interval_days(new_stage);
    ELSIF rec = 'moderate' THEN
      new_stage := CASE WHEN tim = 'long_delay' THEN GREATEST(1, cur_stage - 1) ELSE cur_stage END;
      new_int := GREATEST(1, round(public.review_interval_days(new_stage) * 0.5)::int);
    ELSE
      new_stage := CASE WHEN tim = 'long_delay' THEN 1 ELSE GREATEST(1, cur_stage - 2) END;
      new_int := 1;                                                 -- focused relearning tomorrow
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