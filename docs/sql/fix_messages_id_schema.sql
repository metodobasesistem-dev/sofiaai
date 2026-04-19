-- 1. Remover a restrição de tipo UUID da coluna ID (precisamos converter para TEXT)
-- Primeiro, criamos uma coluna temporária
ALTER TABLE messages ADD COLUMN id_new TEXT;

-- Movemos os dados (UUIDs antigos são válidos como texto)
UPDATE messages SET id_new = id::text;

-- Removemos a coluna antiga (pode ser necessário remover chaves estrangeiras se existirem)
ALTER TABLE messages DROP COLUMN id;

-- Renomeamos a nova coluna para id
ALTER TABLE messages RENAME COLUMN id_new TO id;

-- Tornamos a coluna ID a chave primária novamente
ALTER TABLE messages ADD PRIMARY KEY (id);

-- 2. Adicionar uma coluna específica para whatsapp_id para garantir idempotência sem quebrar o ID primário
ALTER TABLE messages ADD COLUMN IF NOT EXISTS whatsapp_id TEXT;

-- Criar um índice de unicidade no conjunto (user_id, whatsapp_id) para evitar duplicidade
-- ou apenas no whatsapp_id se for único globalmente na Evolution
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_whatsapp_id ON messages (whatsapp_id) WHERE whatsapp_id IS NOT NULL;

-- 3. Adicionar coluna display_phone nas threads se não existir (ajuda na UI)
ALTER TABLE threads ADD COLUMN IF NOT EXISTS display_phone TEXT;
