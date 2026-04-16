-- 1. Adicionar coluna para armazenar o QR Code temporário na tabela de perfis
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS whatsapp_qr TEXT;

-- 2. Habilitar Realtime para a tabela de perfis
-- Isso permite que o frontend receba atualizações instantâneas de status e QR
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- Nota: Se a publicação já existir, o comando acima pode falhar silenciosamente ou dar erro se já estiver lá.
-- Caso queira garantir a reconstrução (CUIDADO: remove todas as tabelas atuais do realtime):
-- DROP PUBLICATION IF EXISTS supabase_realtime;
-- CREATE PUBLICATION supabase_realtime FOR TABLE public.threads, public.messages, public.contacts, public.profiles;
