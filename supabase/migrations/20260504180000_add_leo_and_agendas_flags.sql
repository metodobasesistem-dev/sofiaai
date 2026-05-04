-- Adicionar Feature Flags para Leo e Agendas
INSERT INTO feature_flags (key, label, description, enabled)
VALUES 
  ('leo_ai', 'Automação Leo', 'Sistema de automação para Instagram e captura de leads via IA.', false),
  ('agendas', 'Gestão de Agendas', 'Módulo completo de agendamentos, calendários e disponibilidade.', false)
ON CONFLICT (key) DO NOTHING;
