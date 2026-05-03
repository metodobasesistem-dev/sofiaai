-- Adicionar restrição de unicidade para permitir o upsert correto dos leads
ALTER TABLE leo_leads 
ADD CONSTRAINT unique_company_insta_uid UNIQUE (company_id, instagram_uid);
