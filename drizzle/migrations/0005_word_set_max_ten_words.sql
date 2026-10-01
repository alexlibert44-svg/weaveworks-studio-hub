CREATE OR REPLACE FUNCTION public.enforce_word_set_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  -- Lock the set row so parallel inserts can't race past the limit.
  PERFORM 1 FROM public.word_sets WHERE id = NEW.set_id FOR UPDATE;
  IF (SELECT count(*) FROM public.words WHERE set_id = NEW.set_id) >= 10 THEN
    RAISE EXCEPTION 'A word set can contain at most 10 original words';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS words_enforce_set_limit ON public.words;
CREATE TRIGGER words_enforce_set_limit BEFORE INSERT ON public.words
FOR EACH ROW EXECUTE FUNCTION public.enforce_word_set_limit();