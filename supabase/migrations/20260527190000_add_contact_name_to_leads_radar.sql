-- Adiciona contact_name à tabela leads_radar.
--
-- Contexto: o campo `name` contém o nome do negócio (ex: "Psicóloga Muriaé"),
-- que muitas vezes não é o nome próprio do responsável. O campo contact_name
-- permite ao usuário inserir manualmente o nome correto da pessoa
-- (ex: "Michele Alves") para ser usado como {{1}} no template WhatsApp.
--
-- Quando contact_name é NULL, o sistema faz fallback para a parte do name
-- antes do "|" ou "-" (shortenEstablishmentName no backend).

ALTER TABLE public.leads_radar
  ADD COLUMN IF NOT EXISTS contact_name TEXT;

COMMENT ON COLUMN public.leads_radar.contact_name IS
  'Nome próprio do responsável pelo estabelecimento. Quando preenchido, substitui o campo name como variável {{1}} no template WhatsApp.';
