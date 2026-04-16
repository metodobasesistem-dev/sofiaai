-- Adiciona colunas para configuração individual de IA (BYOK)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS llm_provider TEXT,
ADD COLUMN IF NOT EXISTS openai_api_key TEXT,
ADD COLUMN IF NOT EXISTS gemini_api_key TEXT,
ADD COLUMN IF NOT EXISTS default_ai_model TEXT;

COMMENT ON COLUMN public.profiles.llm_provider IS 'Provedor de IA preferencial (openai/gemini)';
COMMENT ON COLUMN public.profiles.openai_api_key IS 'Chave de API OpenAI individual do cliente';
COMMENT ON COLUMN public.profiles.gemini_api_key IS 'Chave de API Google Gemini individual do cliente';
COMMENT ON COLUMN public.profiles.default_ai_model IS 'Modelo de IA preferencial para este usuário';
