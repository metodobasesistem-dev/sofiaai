-- Adiciona coluna is_client para separar a identidade de cliente do status do funil
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_client BOOLEAN DEFAULT false;

-- Migra os contatos que estavam com status_funil = 'Cliente' para is_client = true e status_funil = 'Lead'
UPDATE contacts SET is_client = true, status_funil = 'Lead' WHERE status_funil = 'Cliente';
