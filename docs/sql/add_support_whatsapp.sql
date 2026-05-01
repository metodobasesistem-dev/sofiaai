-- Adiciona coluna para o WhatsApp de Suporte nas configurações globais
ALTER TABLE public.global_settings ADD COLUMN IF NOT EXISTS support_whatsapp TEXT;

COMMENT ON COLUMN public.global_settings.support_whatsapp IS 'Número de WhatsApp para suporte técnico exibido na tela de login';
