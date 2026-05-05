-- Adiciona constraint UNIQUE na tabela messages para evitar duplicatas por whatsapp_id + user_id
-- Isso resolve o problema de webhook echo e race conditions entre envio e confirmação.

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_whatsapp_id_user_id_key;
ALTER TABLE messages ADD CONSTRAINT messages_whatsapp_id_user_id_key UNIQUE (whatsapp_id, user_id);
