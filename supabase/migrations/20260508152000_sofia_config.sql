-- Adicionar configurações da Sofia na tabela profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sofia_prompt TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sofia_active BOOLEAN DEFAULT TRUE;

-- Comentários para documentação
COMMENT ON COLUMN profiles.sofia_prompt IS 'System prompt personalizado para a assistente Sofia';
COMMENT ON COLUMN profiles.sofia_active IS 'Habilita ou desabilita o chat da Sofia para o usuário';
