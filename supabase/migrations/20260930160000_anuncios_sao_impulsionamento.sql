-- A clínica anuncia só pelo botão "Impulsionar" do Instagram.
--
-- O clique num post impulsionado chega igual ao de qualquer anúncio: mesmo
-- ctwa_clid, mesmo formato. Nada no que o WhatsApp entrega distingue os dois.
-- Quem distingue é o backend.
--
-- A forma completa de descobrir isso é perguntar à Graph API e ver que o
-- anúncio não existe (a conta de anúncios do botão é implícita, fora da
-- Business Manager). Isso exige um token com escopo de leitura de anúncios.
--
-- Esta flag é o caminho curto, para a clínica que sabe que só impulsiona:
-- ela declara, e todo clique em anúncio passa a ser marcado como
-- impulsionamento, sem token nenhum.
--
-- Por que separar impulsionamento de anúncio: o nome da campanha NUNCA vai
-- existir para ele. Mostrar "Anúncio (Meta Ads)" e um identificador cru manda
-- a clínica procurar para sempre uma campanha que não está no Gerenciador.
-- E não dá para somá-lo ao Instagram orgânico, porque é mídia paga: uma
-- clínica que só impulsiona apareceria sem verba nenhuma no relatório.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS anuncios_sao_impulsionamento BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.anuncios_sao_impulsionamento IS
  'A clínica declarou que só anuncia pelo botão Impulsionar. Todo clique em anúncio vira impulsionamento.';
