-- Insert the new feature flag for Meta Official API
INSERT INTO feature_flags (key, label, description, enabled)
VALUES (
  'meta_official',
  'API Oficial (Meta)',
  'Habilita a conexão com o provedor WhatsApp Cloud API Oficial no painel de integrações do cliente.',
  false
)
ON CONFLICT (key) DO NOTHING;
