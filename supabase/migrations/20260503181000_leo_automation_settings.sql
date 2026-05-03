ALTER TABLE leo_config
ADD COLUMN IF NOT EXISTS insta_auto_follow_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS insta_auto_follow_msg TEXT DEFAULT 'Olá! Obrigado por me seguir. Como posso te ajudar hoje?',
ADD COLUMN IF NOT EXISTS insta_auto_comment_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS insta_auto_comment_msg TEXT DEFAULT 'Obrigado pelo seu comentário! Te enviei uma mensagem no privado para conversarmos melhor.';
