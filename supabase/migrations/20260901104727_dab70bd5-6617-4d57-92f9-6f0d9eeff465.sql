ALTER TABLE public.learners ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.words ADD COLUMN IF NOT EXISTS translation TEXT;
ALTER TABLE public.word_sets ADD COLUMN IF NOT EXISTS target_language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE public.word_sets ADD COLUMN IF NOT EXISTS native_language TEXT NOT NULL DEFAULT 'en';