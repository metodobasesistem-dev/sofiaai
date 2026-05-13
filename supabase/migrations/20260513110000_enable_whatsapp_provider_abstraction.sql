-- Habilita a flag que o WhatsAppProviderFactory consulta antes de resolver
-- o provedor por tenant (profiles.whatsapp_provider).
--
-- Sem essa flag, o Factory sempre retorna EvolutionProvider (legacy fallback)
-- e nenhum cliente consegue usar Meta Cloud API — mesmo com credenciais válidas.

INSERT INTO feature_flags (key, label, description, enabled)
VALUES (
  'whatsapp_provider_abstraction',
  'Abstração de Provedor WhatsApp',
  'Habilita o WhatsAppProviderFactory a resolver o provedor por tenant (profiles.whatsapp_provider). Sem isso, todos os clientes usam Evolution por padrão.',
  true
)
ON CONFLICT (key) DO UPDATE SET enabled = true;
