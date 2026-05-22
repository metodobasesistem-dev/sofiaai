-- Adiciona campo de observações manuais por lead no Radar de Leads
ALTER TABLE leads_radar ADD COLUMN IF NOT EXISTS notes TEXT;
