
-- MIGRATION: Fix Multi-tenant Message Persistence
-- Descrição: Altera a PK de 'messages' para composta (whatsapp_id, user_id) 
-- para evitar colisões entre diferentes inquilinos.

BEGIN;

-- 1. Remover a constraint de Primary Key atual
-- Nota: O nome padrão costuma ser 'messages_pkey'
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_pkey;

-- 2. Garantir que as colunas da nova PK não sejam nulas
ALTER TABLE messages ALTER COLUMN whatsapp_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN user_id SET NOT NULL;

-- 3. Limpar possíveis duplicatas órfãs que possam impedir a criação da PK
-- Mantemos apenas a versão mais recente de cada combinação (whatsapp_id, user_id)
DELETE FROM messages a USING (
    SELECT MIN(ctid) as ctid, whatsapp_id, user_id
    FROM messages 
    GROUP BY whatsapp_id, user_id 
    HAVING COUNT(*) > 1
) b
WHERE a.whatsapp_id = b.whatsapp_id 
  AND a.user_id = b.user_id 
  AND a.ctid <> b.ctid;

-- 4. Criar a nova Primary Key composta
ALTER TABLE messages ADD PRIMARY KEY (whatsapp_id, user_id);

-- 5. Criar índice otimizado para buscas por thread e usuário (comum no chat)
CREATE INDEX IF NOT EXISTS idx_messages_thread_user ON messages(thread_id, user_id);

-- 6. Atualizar a coluna 'id' para ser apenas um identificador secundário (opcional)
-- Se o 'id' era a PK antiga, agora ele é apenas uma coluna comum.
-- Se houver índices únicos no 'id' sozinho, devemos removê-los para permitir a multi-tenancy.
DROP INDEX IF EXISTS messages_id_key;

COMMIT;
