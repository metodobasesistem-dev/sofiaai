-- Insert the campaigns feature flag
INSERT INTO feature_flags (key, label, description, enabled)
VALUES ('campaigns', 'Campanhas', 'Habilita o módulo de disparos em massa via templates oficiais da Meta.', false)
ON CONFLICT (key) DO NOTHING;
