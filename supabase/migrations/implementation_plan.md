# Plano de Implementação - Envio de Mensagem de Teste no Radar de Leads

Adicionar a possibilidade de os usuários enviarem uma mensagem de teste do template oficial Meta selecionado para um número específico antes de iniciar o disparo em massa no piloto automático.

## Proposed Changes

### Backend

#### [MODIFY] [radarRoutes.ts](file:///c:/Users/Natan/Documents/Sofia/src/backend/routes/radarRoutes.ts)
- Adicionar uma nova rota `POST /leads/test-send`.
- Validar se o telefone e o nome do template foram informados.
- Validar se o provedor do WhatsApp está ativo e conectado.
- Buscar o perfil do usuário atual (`profiles`) para obter o nome do remetente (`nome_completo` ou `name`).
- Enviar o template oficial via Meta API utilizando `provider.sendTemplate` com:
  - `{{1}}` $\rightarrow$ `'Clínica de Teste'` (placeholder fixo do estabelecimento de teste)
  - `{{2}}` $\rightarrow$ Nome do usuário remetente (para simular a mensagem exata)

### Frontend

#### [MODIFY] [AdminPanel.tsx](file:///c:/Users/Natan/Documents/Sofia/src/components/AdminPanel.tsx)
- Adicionar os estados `isTestInputVisible` (boolean), `testPhone` (string) e `isTestSending` (boolean).
- Dentro do modal de configuração do piloto automático:
  - Exibir o botão **"Enviar Teste"** entre os botões "Cancelar" e "Iniciar Disparos".
  - Ao clicar em "Enviar Teste", buscar opcionalmente no Supabase o telefone do perfil do próprio usuário autenticado para pré-preencher o campo de telefone.
  - Alternar a exibição para a caixa de input de telefone com botões de "Enviar" (que chama a rota `/api/v2/radar/leads/test-send`) e "Voltar" (que retorna para as opções do modal principal).
  - Tratar loading de envio e exibir Toasts informando sucesso ou erro do envio de teste.

## Verification Plan

### Manual Verification
1. Abrir a tela do "Radar de Leads" e clicar no botão "Piloto Automático".
2. Selecionar um template oficial aprovado da Meta.
3. Clicar em "Enviar Teste".
4. Preencher o telefone de teste desejado e clicar em "Enviar".
5. Confirmar que a mensagem de teste chegou no WhatsApp do destinatário exatamente com os dados simulados (`Clínica de Teste` e o nome do usuário remetente), sem causar erros e sem enviar para nenhum outro lead da lista ainda.
