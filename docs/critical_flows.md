# 🔄 Fluxos Críticos do Sistema

Descrição detalhada dos processos que movem o WppAi.

## 1. Onboarding Completo do Cliente
Este fluxo garante que um novo usuário esteja pronto para operar em minutos.

1.  **Registro:** O usuário cria conta e um `profile` é gerado no Supabase.
2.  **Solicitação de Conexão:** No Dashboard, ao clicar em "Conectar", o backend verifica se existe uma instância na Evolution. Se não, cria uma (`createInstance`).
3.  **QR Code:** O sistema solicita o QR Code à Evolution e o exibe no frontend via polling/realtime.
4.  **Pareamento:** O usuário escaneia. A Evolution dispara o webhook `CONNECTION_UPDATE`.
5.  **Configuração Automática:** Ao detectar a conexão, o WppAi configura o Webhook URL, ativa o modo "Always Online" e desabilita grupos para otimizar a performance da instância.

## 2. Ciclo de Vida de uma Mensagem (Outbound)
Como garantimos que o que o atendente digita chega ao cliente e fica salvo.

1.  **Envio (Optimistic):** O atendente clica em enviar. O frontend gera um ID temporário (`sending-...`) e exibe na tela imediatamente.
2.  **Persistência Temporária:** O backend salva a mensagem no banco com `status='sending'`.
3.  **Chamada API:** O sistema chama a Evolution API para enviar a mensagem real.
4.  **Persistência Definitiva (Atomicidade):** 
    *   O sistema recebe o ID real do WhatsApp.
    *   O sistema insere a mensagem real no banco.
    *   **Somente após o sucesso** da inserção real, o sistema deleta a mensagem temporária.
5.  **Reconciliação:** O frontend recebe o evento de `INSERT` da mensagem real e `DELETE` da temporária via Realtime, substituindo-as na tela de forma fluida.

## 3. Funcionamento do Follow-up (Recuperação de Leads)
O motor de reengajamento automático.

1.  **Agendamento:** Sempre que um lead envia uma mensagem (Inbound), o sistema cancela qualquer follow-up pendente e agenda um novo (Nível 0) para X minutos no futuro via **BullMQ**.
2.  **Execução:** Quando o tempo expira, o Worker do BullMQ acorda.
3.  **Validação de Status:** O Worker verifica se a conversa ainda está em modo `IA` e se o cliente não respondeu nada nesse intervalo.
4.  **Disparo:** Se validado, a IA gera uma mensagem de reengajamento baseada no contexto e envia.
5.  **Cascata:** O sistema agenda o próximo nível de follow-up (Nível 1, 2...) até que o cliente responda ou a sequência acabe.
6.  **Interrupção:** Se o cliente responder a qualquer momento, o webhook de entrada dispara o `cancelFollowUp`, limpando a fila para aquele contato.

---
