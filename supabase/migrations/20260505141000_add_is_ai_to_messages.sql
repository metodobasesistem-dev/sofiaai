-- Adiciona a coluna is_ai na tabela de mensagens para diferenciar mensagens enviadas pelo robô das enviadas pela equipe no painel
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_ai BOOLEAN DEFAULT FALSE;
