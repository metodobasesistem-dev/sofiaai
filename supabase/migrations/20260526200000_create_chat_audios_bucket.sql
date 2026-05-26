-- Cria o bucket de mídia do chat (imagens, vídeos, documentos, áudios)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-audios', 'chat-audios', true, 52428800, null)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública (necessário para exibir imagens no chat sem autenticação)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'chat-audios public read'
  ) THEN
    CREATE POLICY "chat-audios public read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'chat-audios');
  END IF;
END $$;

-- Upload permitido para usuários autenticados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'chat-audios authenticated insert'
  ) THEN
    CREATE POLICY "chat-audios authenticated insert"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'chat-audios');
  END IF;
END $$;

-- Update e delete para usuários autenticados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'chat-audios authenticated modify'
  ) THEN
    CREATE POLICY "chat-audios authenticated modify"
    ON storage.objects FOR ALL
    USING (bucket_id = 'chat-audios')
    WITH CHECK (bucket_id = 'chat-audios');
  END IF;
END $$;
