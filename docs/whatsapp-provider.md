# WhatsApp Provider Integration Guide

This project uses a provider-agnostic architecture for WhatsApp integration. This allows switching between different providers (e.g., UAZAPI, Meta Cloud API) with minimal code changes.

## Architecture

The integration is built around an adapter pattern:

1.  **`providers/whatsappProvider.ts`**: Defines the `WhatsAppProvider` interface and the `CanonicalInboundEvent` type.
2.  **`providers/uazapiProvider.ts`**: Implementation for UAZAPI.
3.  **`providers/metaCloudProvider.ts`**: Placeholder for future Meta Cloud API integration.
4.  **`providers/providerFactory.ts`**: Factory function that returns the configured provider based on the `WHATSAPP_PROVIDER` environment variable.

## Setup (UAZAPI)

1.  **Environment Variables**:
    Set the following variables in your `.env` file or AI Studio Secrets:
    ```env
    WHATSAPP_PROVIDER="uazapi"
    UAZAPI_BASE_URL="https://api.uazapi.com"
    UAZAPI_API_KEY="your_api_key"
    UAZAPI_WEBHOOK_SECRET="your_secret"
    ```

2.  **Webhook Configuration**:
    Configure your UAZAPI instance to send webhooks to:
    `https://your-app-url.run.app/api/webhooks/whatsapp`

    If you configured `UAZAPI_WEBHOOK_SECRET`, ensure it is sent in the `x-uazapi-secret` header or as a `secret` query parameter.

## Canonical Event Structure

All inbound messages are normalized to this format:

```typescript
type CanonicalInboundEvent = {
  uid: string;
  channel: 'whatsapp';
  provider: string;
  from: string;
  to?: string;
  contactName?: string;
  messageId: string;
  timestamp: number;
  type: 'text' | 'image' | 'audio' | 'document' | 'unknown';
  text?: string;
  mediaUrl?: string;
};
```

## Adding a New Provider

To add a new provider (e.g., Twilio):

1.  Create `providers/twilioProvider.ts` implementing the `WhatsAppProvider` interface.
2.  Update `providers/providerFactory.ts` to include the new provider in the switch statement.
3.  Set `WHATSAPP_PROVIDER="twilio"` in your environment variables.
