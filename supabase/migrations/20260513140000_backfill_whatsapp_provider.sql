-- Garante que toda linha em profiles tenha um valor explícito em
-- whatsapp_provider. O Factory já trata NULL como 'evolution', mas
-- normalizar no DB simplifica queries de relatório/filtro e evita
-- comportamentos surpreendentes em joins.

UPDATE profiles
SET whatsapp_provider = 'evolution'
WHERE whatsapp_provider IS NULL;

-- Reforça o default para inserções futuras (já estava em 'evolution',
-- mas garantimos para casos de schemas restaurados de backup antigo).
ALTER TABLE profiles
ALTER COLUMN whatsapp_provider SET DEFAULT 'evolution';
