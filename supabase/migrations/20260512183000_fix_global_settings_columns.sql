-- Garantir que a tabela global_settings tenha todas as colunas necessárias para o Painel Admin
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_signups BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS admin_notification_phone TEXT,
ADD COLUMN IF NOT EXISTS admin_notification_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Notificar o PostgREST para recarregar o cache do schema (se estiver em um ambiente que suporte NOTIFY)
-- NOTIFY pgrst, 'reload schema';
