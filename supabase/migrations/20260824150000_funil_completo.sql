-- Completa os estágios do funil e acrescenta "Perdido".
--
-- CONTEXTO: o quadro Kanban sempre mostrou seis colunas, mas o CHECK de
-- contacts.status_funil só aceitava quatro valores — 'Primeiro Atendimento' e
-- 'Sem Resposta' não existiam no banco. Mover um card para essas colunas, ou
-- escolhê-las no seletor da conversa, falhava silenciosamente: o card voltava
-- ao lugar no reload.
--
-- 'Perdido' entra agora como estágio de saída: o lead que não vai fechar sai
-- do fluxo sem sumir da base.
--
-- 'Cliente' NÃO é estágio de funil: quem vira cliente tem contacts.is_client
-- e passa a viver na tela de Clientes, com ficha comercial própria.

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_status_funil_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_status_funil_check
    CHECK (status_funil IN (
      'Lead',
      'Primeiro Atendimento',
      'Sem Resposta',
      'Qualificado',
      'Agendado',
      'Perdido',
      'Resolvido'
    ));

COMMENT ON COLUMN public.contacts.status_funil IS
  'Estágio no funil: Lead → Primeiro Atendimento → Sem Resposta → Qualificado '
  '→ Agendado → Resolvido, com Perdido como saída. Cliente é is_client, não '
  'um estágio.';
