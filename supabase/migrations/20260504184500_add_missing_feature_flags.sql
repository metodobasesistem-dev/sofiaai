-- Adicionar Feature Flags faltantes para CRM, Chat e Analytics
INSERT INTO feature_flags (key, label, description, enabled)
VALUES 
  ('crm', 'Módulo CRM', 'Gestão de contatos, equipe e funil de vendas.', true),
  ('chat', 'Caixa de Entrada', 'Chat em tempo real e gestão de conversas via WhatsApp.', true),
  ('analytics', 'Relatórios & Analytics', 'Dashboards detalhados de performance e métricas do sistema.', true)
ON CONFLICT (key) DO UPDATE 
SET enabled = EXCLUDED.enabled;
