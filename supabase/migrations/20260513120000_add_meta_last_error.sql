-- Coluna para armazenar o último erro reportado pela Meta Cloud API para
-- um tenant. Permite que o AdminPanel mostre o problema ao admin sem
-- precisar abrir logs do servidor.
--
-- Exemplos típicos: "[Meta 190] Invalid OAuth access token",
-- "[Meta 131047] Re-engagement message", "phone_quality: RED".

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS meta_last_error TEXT,
ADD COLUMN IF NOT EXISTS meta_last_error_at TIMESTAMPTZ;
