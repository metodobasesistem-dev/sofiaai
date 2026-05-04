-- Adiciona colunas para cache de foto de perfil
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profile_picture_updated_at TIMESTAMPTZ;

ALTER TABLE threads ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS profile_picture_updated_at TIMESTAMPTZ;

-- Comentários para documentação
COMMENT ON COLUMN contacts.profile_picture_url IS 'URL temporária da foto de perfil do WhatsApp';
COMMENT ON COLUMN contacts.profile_picture_updated_at IS 'Data da última busca da foto na Evolution API';
COMMENT ON COLUMN threads.profile_picture_url IS 'URL temporária da foto de perfil da thread';
COMMENT ON COLUMN threads.profile_picture_updated_at IS 'Data da última busca da foto na Evolution API';
