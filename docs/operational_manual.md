# 🛠️ Manual Operacional

Guia prático para deploy, monitoramento e manutenção do ecossistema WppAi.

## 1. Deploy do Sistema

O WppAi é um sistema containerizado (Docker), ideal para deploy via **Coolify** ou direto via Docker Compose.

### Variáveis de Ambiente Críticas
Certifique-se de configurar as seguintes variáveis no seu ambiente de produção:
*   `DATABASE_URL`: URL de conexão direta com o Postgres/Supabase.
*   `REDIS_HOST` / `REDIS_PORT`: Conexão com o Redis (Essencial para BullMQ).
*   `EVOLUTION_API_URL` / `EVOLUTION_API_KEY`: Endereço e chave da API Evolution.
*   `BACKEND_WEBHOOK_URL`: A URL pública do seu servidor (usada para a Evolution enviar mensagens de volta).

### Passos para Deploy (Coolify)
1.  Conecte o repositório Git.
2.  Adicione as Variáveis de Ambiente.
3.  O Coolify usará o `Dockerfile` na raiz para construir a imagem.
4.  Certifique-se de que a porta `3000` (Frontend/Backend unificado) está exposta.

## 2. Adicionando um Novo Cliente
O sistema é multi-tenancy e automatizado:
1.  O cliente se registra via interface.
2.  Ao acessar o dashboard e clicar em "Gerar QR Code", o backend cria automaticamente uma instância na Evolution com o nome `wppai_{prefixo_id}`.
3.  **Não é necessário** intervenção manual no painel da Evolution.

## 3. Monitoramento e Logs (Coolify)
Para monitorar a saúde do sistema, observe os logs no Coolify:
*   `[WhatsAppService]`: Logs de conexão e status de instâncias.
*   `[AgentService]`: Logs de processamento de IA e ferramentas.
*   `[BullMQ]`: Status de processamento de filas (Sucesso/Falha).
*   `[Webhook]`: Chegada de mensagens em tempo real.

## 4. Troubleshooting: "O que fazer se..."

### Sistema caiu ou está lento
1.  **Reinicie o Redis:** Muitas vezes o BullMQ pode travar se o Redis ficar sem memória.
2.  **Verifique a Evolution API:** O sistema depende 100% da Evolution estar online.

### Instâncias Órfãs na Evolution
Se você perceber que o painel da Evolution está cheio de instâncias que não pertencem a ninguém:
*   **Solução Automática:** O `Maintenance Worker` roda a cada 30 minutos e deleta instâncias que começam com `wppai_` e não têm dono no banco de dados.
*   **Solução Manual:** Você pode rodar o comando `whatsappService.cleanupOldStorageFiles()` se houver acúmulo de arquivos de mídia.

### Mensagens não chegam (Webhook falhando)
1.  Acesse o Dashboard do usuário.
2.  Clique em **"Sincronizar Conexão"**. Isso força o sistema a reconfigurar o Webhook na Evolution API instantaneamente.

---
