CREATE TABLE public.audio_assets (
  cache_key text PRIMARY KEY,
  text text NOT NULL,
  language text NOT NULL,
  voice text NOT NULL,
  storage_path text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.audio_assets TO service_role;
ALTER TABLE public.audio_assets ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.audio_assets IS 'Persistent TTS cache: one stored file per (voice, language, text). Server-only (service role).';