# 📖 Documentação Técnica WppAi

Este diretório contém a documentação técnica e operacional do sistema WppAi. O objetivo é servir como guia para desenvolvedores, operadores e administradores do sistema.

## 🗂️ Conteúdo

1.  **[Manual Operacional](operational_manual.md)**
    *   Deploy (Coolify/Docker).
    *   Onboarding de novos clientes.
    *   Monitoramento e Troubleshooting.
    *   Zeladoria de instâncias órfãs.

2.  **[Fluxos Críticos](critical_flows.md)**
    *   Onboarding: Do registro à conexão.
    *   Mensagens: Ciclo de vida completo (Envio e Recebimento).
    *   Follow-up: Mecanismo de automação e reengajamento.

3.  **[Decisões Arquiteturais](architectural_decisions.md)**
    *   Uso de BullMQ e Redis.
    *   Constraint Composta (whatsapp_id + user_id).
    *   Atomicidade na Persistência.
    *   Segurança Tripla (Polling/Webhook).

---
*Última atualização: Abril de 2026*
