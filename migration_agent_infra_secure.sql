-- 1. Atualização da tabela de Agentes para metadados de infraestrutura
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS whatsapp_provider VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS whatsapp_provider_config JSONB DEFAULT '{}'::jsonb;

-- 2. Criação da tabela de Segredos (Vault) para Tokens sensíveis
CREATE TABLE IF NOT EXISTS agent_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    secret_key TEXT NOT NULL, -- Ex: 'meta_access_token'
    secret_value TEXT NOT NULL, -- O token em si
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(agent_id, secret_key)
);

-- 3. Habilitar RLS na tabela de segredos
ALTER TABLE agent_secrets ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de RLS (Somente o dono do agente pode ler/escrever seus segredos)
CREATE POLICY "Users can manage their own agent secrets" 
ON agent_secrets 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. Função para atualizar o timestamp de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agent_secrets_updated_at
    BEFORE UPDATE ON agent_secrets
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- Comentário informativo para o Schema
COMMENT ON TABLE agent_secrets IS 'Armazena tokens sensíveis de provedores (ex: Meta Access Token) fora da tabela principal de agentes por segurança.';
