-- Adiciona coluna full_name à tabela profiles.
--
-- Contexto: usuários que cadastraram via Google OAuth têm o nome completo salvo em
-- auth.users.raw_user_meta_data->>'full_name', mas essa informação nunca foi copiada
-- para profiles. O código em AdminPanel.tsx e radarRoutes.ts já fazia referência a
-- profiles.full_name como fallback, mas a coluna não existia — causando falha no
-- PostgREST (400) e o aviso "Seu nome não está configurado" na modal de campanhas.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Backfill para usuários existentes:
-- 1. Prioriza nome_completo já preenchido manualmente nas configurações.
-- 2. Caso contrário, usa full_name dos metadados do Google/OAuth.
UPDATE public.profiles p
SET    full_name = COALESCE(
         p.nome_completo,
         u.raw_user_meta_data->>'full_name',
         u.raw_user_meta_data->>'name'
       )
FROM   auth.users u
WHERE  p.id = u.id
  AND  p.full_name IS NULL
  AND  COALESCE(
         p.nome_completo,
         u.raw_user_meta_data->>'full_name',
         u.raw_user_meta_data->>'name'
       ) IS NOT NULL;

COMMENT ON COLUMN public.profiles.full_name IS
  'Nome completo do usuário. Populado automaticamente via OAuth (Google) ou atualizado manualmente nas Configurações (campo nome_completo).';
