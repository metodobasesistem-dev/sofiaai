-- Atualiza as restrições da coluna status_funil para aceitar 'Resolvido' em vez de 'Cliente'
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_status_funil_check;

ALTER TABLE contacts ADD CONSTRAINT contacts_status_funil_check 
CHECK (status_funil IN ('Lead', 'Qualificado', 'Resolvido'));

-- Garante que não existam valores órfãos
UPDATE contacts SET status_funil = 'Lead' WHERE status_funil NOT IN ('Lead', 'Qualificado', 'Resolvido');
