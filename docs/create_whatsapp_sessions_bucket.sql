-- Criar bucket para armazenar sessões WhatsApp
-- Execute isso no Supabase Dashboard > SQL Editor

INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'whatsapp-sessions',
  'whatsapp-sessions',
  false,
  ARRAY['application/zip', 'application/octet-stream'],
  52428800  -- 50MB
)
ON CONFLICT (id) DO NOTHING;

-- Política: apenas service role pode acessar (backend)
CREATE POLICY "Service role only - whatsapp-sessions"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'whatsapp-sessions');
