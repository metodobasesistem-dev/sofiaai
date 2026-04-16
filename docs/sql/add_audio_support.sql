-- SQL para rodar no Editor de SQL do Supabase:

-- 1. Adicionar coluna de áudio na tabela de mensagens
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- 2. Ativar Realtime para a nova coluna (geralmente automático)
-- 3. Criar Bucket de Storage se não existir (via Dashboard -> Storage -> New Bucket -> 'chat-audios' (Public))
