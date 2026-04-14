-- Migration: Expansão de Perfis & Trial de 10 Dias

-- 1. Adicionar colunas extras na tabela de perfis
-- 1. Renomear name para nome_completo para padronizar com o sistema
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='name') THEN
    ALTER TABLE public.profiles RENAME COLUMN name TO nome_completo;
  ELSE
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nome_completo TEXT;
  END IF;
END $$;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS nome_empresa TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_organizacao TEXT,
ADD COLUMN IF NOT EXISTS nicho TEXT,
ADD COLUMN IF NOT EXISTS plano TEXT DEFAULT 'Trial',
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + interval '10 days');

-- 2. Trigger para automatizar a criação do perfil com metadados do auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    email, 
    nome_completo, 
    whatsapp_organizacao, 
    nome_empresa, 
    nicho, 
    plano, 
    trial_ends_at,
    role,
    whatsapp_status
  )
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'nome_completo', ''), 
    COALESCE(new.raw_user_meta_data->>'whatsapp_organizacao', ''), 
    COALESCE(new.raw_user_meta_data->>'nome_empresa', ''), 
    COALESCE(new.raw_user_meta_data->>'nicho', ''), 
    COALESCE(new.raw_user_meta_data->>'plano', 'Trial'),
    COALESCE((new.raw_user_meta_data->>'trial_ends_at')::timestamptz, now() + interval '10 days'),
    COALESCE(new.raw_user_meta_data->>'role', 'client'),
    'disconnected'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remover se já existir e recriar
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON COLUMN public.profiles.trial_ends_at IS 'Data em que o período de teste gratuito de 10 dias expira.';
COMMENT ON COLUMN public.profiles.nicho IS 'Área de atuação ou nicho de mercado do cliente.';
