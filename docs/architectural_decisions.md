# 🏛️ Decisões Arquiteturais

Registro das escolhas técnicas fundamentais do WppAi e suas motivações.

## 1. BullMQ e Redis
**Decisão:** Utilizar BullMQ (baseado em Redis) para processamento de mensagens e follow-ups.
**Motivo:** 
*   **Concorrência:** Gerencia picos de tráfego sem derrubar o servidor.
*   **Resiliência:** Se o servidor reiniciar, os jobs de follow-up não são perdidos; eles continuam de onde pararam.
*   **Delay:** Permite agendamentos precisos de mensagens no futuro.

## 2. Constraint Composta (`whatsapp_id` + `user_id`)
**Decisão:** Alterar a chave de unicidade de mensagens de apenas `whatsapp_id` para o par `(whatsapp_id, user_id)`.
**Motivo:** 
*   **Multi-tenancy:** Em um sistema de CRM, dois usuários diferentes podem estar conversando entre si ou com o mesmo lead. Como o WhatsApp ID é global, uma conta acabava "roubando" a mensagem da outra ao tentar fazer `upsert`. 
*   **Isolamento:** Garante que cada usuário tenha sua própria cópia da mensagem no banco, independente de quem mais no sistema recebeu a mesma mensagem.

## 3. Atomicidade na Persistência de Mensagens
**Decisão:** O backend deve aguardar o sucesso da inserção da mensagem definitiva antes de deletar a temporária.
**Motivo:** 
*   **Prevenção de Perda de Dados:** Se deletássemos a temporária antes ou durante a tentativa de salvar a definitiva, e a definitiva falhasse (por erro de rede ou banco), a mensagem sumiria completamente. A abordagem atual garante que sempre haverá ao menos uma cópia da mensagem no banco.

## 4. Segurança Tripla (Polling/Webhook/Auto-Cura)
**Decisão:** Combinar Webhooks com Polling ativo no frontend e lógica de auto-cura no backend.
**Motivo:** 
*   **Confiabilidade:** Webhooks são rápidos mas não 100% garantidos (podem ser perdidos). 
*   **Redundância:** O Polling garante que se um Webhook de conexão falhar, o Dashboard se recuperará sozinho em no máximo 8 segundos.
*   **Integridade:** A verificação proativa de configuração de Webhook durante cada checagem de status garante que o canal de comunicação esteja sempre aberto.

---
