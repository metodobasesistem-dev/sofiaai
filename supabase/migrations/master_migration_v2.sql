-- ############################################################
-- MASTER MIGRATION V2: IA MULTI-PROVEDOR, FINANCEIRO E SEGURANÇA
-- ############################################################

-- 0. Estrutura de Perfil (Garantir que as colunas de WhatsApp existem)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_qr TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_instance_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_status TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS llm_provider TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS openai_api_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_ai_model TEXT;

-- 1. Tabela de Configurações Globais
CREATE TABLE IF NOT EXISTS global_settings (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000',
    llm_provider TEXT DEFAULT 'openai',
    default_ai_model TEXT DEFAULT 'gpt-4o',
    openai_api_key TEXT,
    gemini_api_key TEXT,
    usd_brl_rate DECIMAL(10,2) DEFAULT 5.30,
    maintenance_mode BOOLEAN DEFAULT false,
    allow_signups BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Garantir que existe pelo menos uma linha padrão
INSERT INTO global_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000000') 
ON CONFLICT (id) DO NOTHING;

-- 2. Atualizar tabela de Mensagens com Colunas Financeiras
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tokens_prompt INTEGER;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tokens_completion INTEGER;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS cost_brl DECIMAL(10,4);

-- 3. Segurança RLS (Row Level Security)
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;

-- Política: Apenas ADM pode ver e editar configurações globais
DROP POLICY IF EXISTS "Admins can manage global settings" ON global_settings;
CREATE POLICY "Admins can manage global settings" ON global_settings
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );
