-- Adiciona configuração de atraso de resposta (agrupamento de mensagens)
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS response_delay INTEGER DEFAULT 15;

COMMENT ON COLUMN public.agents.response_delay IS 'Tempo de espera em segundos para agrupar mensagens picadas antes de responder';
