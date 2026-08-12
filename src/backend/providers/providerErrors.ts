/**
 * Normaliza erros de qualquer provider WhatsApp (Meta, Evolution, UazApi)
 * em uma forma estruturada e útil para logs/telemetria/UI.
 *
 * Meta Cloud API error codes referenciados:
 *   - 100   Invalid parameter
 *   - 190   Invalid OAuth access token
 *   - 131026 Message undeliverable (número inválido / sem WhatsApp)
 *   - 131047 Re-engagement message (fora da janela de 24h — requer template)
 *   - 131051 Unsupported message type
 *   - 131056 Pair rate limit
 */

export interface ProviderErrorInfo {
  message: string;
  provider: 'meta' | 'evolution' | 'unknown';
  code?: string | number;
  subcode?: string | number;
  /** Mensagem fora da janela de 24h — UI deve sugerir uso de template */
  is24hWindowClosed: boolean;
  /** Token inválido/expirado — admin precisa renovar credenciais */
  isAuthError: boolean;
  /** Destinatário inválido / sem WhatsApp */
  isRecipientInvalid: boolean;
  /**
   * A instância do WhatsApp perdeu a conexão com o servidor (socket caído).
   * Retentar em segundos é inútil: o socket só volta após reconexão da instância.
   * Deve falhar rápido e disparar alerta de instância fora do ar.
   */
  isConnectionClosed: boolean;
  raw?: any;
}

const META_CODE_24H_WINDOW = 131047;
const META_CODE_RECIPIENT_INVALID = 131026;
const META_CODE_AUTH = 190;

/**
 * A Evolution API devolve o motivo real aninhado em `response.message` (array),
 * enquanto `error` traz só o genérico "Bad Request". Sem achatar essa estrutura
 * o log fica com "Bad Request" e a causa verdadeira se perde.
 */
function flattenProviderMessage(data: any): string {
  const parts: string[] = [];
  const visit = (v: any, depth = 0) => {
    if (!v || depth > 4) return;
    if (typeof v === 'string') { parts.push(v); return; }
    if (Array.isArray(v)) { v.forEach(item => visit(item, depth + 1)); return; }
    if (typeof v === 'object') {
      visit(v.message, depth + 1);
      visit(v.response, depth + 1);
      visit(v.error, depth + 1);
    }
  };
  visit(data);
  const unique = [...new Set(parts.map(p => p.trim()).filter(Boolean))];
  return unique.length ? unique.join(' — ') : JSON.stringify(data);
}

const CONNECTION_CLOSED_PATTERN =
  /connection\s*closed|connection\s*lost|connection\s*terminated|not\s*connected|socket\s*(is\s*)?closed|instance\s*(not\s*connected|disconnected|close)|econnreset|econnrefused|etimedout|socket hang up/i;

function detectConnectionClosed(message: string, err: any): boolean {
  if (CONNECTION_CLOSED_PATTERN.test(message)) return true;
  const code = err?.code;
  return code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'EPIPE';
}

/**
 * Persists the last Meta error to profiles.meta_last_error for admin visibility.
 * No-op for non-Meta errors. Fire-and-forget (errors swallowed to avoid masking
 * the original failure).
 */
export async function recordMetaError(
  userId: string,
  info: ProviderErrorInfo,
  supabase: any
): Promise<void> {
  if (info.provider !== 'meta' || !userId) return;
  try {
    await supabase
      .from('profiles')
      .update({
        meta_last_error: info.message.substring(0, 500),
        meta_last_error_at: new Date().toISOString(),
      })
      .eq('id', userId);
  } catch {
    // intentionally silent — recording the error must never throw
  }
}

export function parseProviderError(err: any): ProviderErrorInfo {
  // Meta Graph API shape: err.response.data.error.{code, message, error_subcode, type}
  const metaError = err?.response?.data?.error;
  if (metaError && (typeof metaError.code === 'number' || metaError.message)) {
    const code = metaError.code;
    return {
      provider: 'meta',
      code,
      subcode: metaError.error_subcode,
      message: `[Meta ${code}${metaError.error_subcode ? `/${metaError.error_subcode}` : ''}] ${metaError.message || 'Unknown error'}${metaError.error_data?.details ? ` — ${metaError.error_data.details}` : ''}`,
      is24hWindowClosed: code === META_CODE_24H_WINDOW,
      isAuthError: code === META_CODE_AUTH,
      isRecipientInvalid: code === META_CODE_RECIPIENT_INVALID,
      isConnectionClosed: false,
      raw: metaError,
    };
  }

  // Evolution API shape: err.response.data.{message, error, status}
  const evoData = err?.response?.data;
  if (evoData && (evoData.message || evoData.error)) {
    const message = flattenProviderMessage(evoData);
    return {
      provider: 'evolution',
      code: evoData.status || err?.response?.status,
      message,
      is24hWindowClosed: false,
      isAuthError: err?.response?.status === 401 || err?.response?.status === 403,
      isRecipientInvalid: false,
      isConnectionClosed: detectConnectionClosed(message, err),
      raw: evoData,
    };
  }

  // Fallback: axios error sem body estruturado, ou Error nativo
  const status = err?.response?.status;
  const message = err?.message || 'Unknown provider error';
  return {
    provider: 'unknown',
    code: status,
    message,
    is24hWindowClosed: false,
    isAuthError: status === 401 || status === 403,
    isRecipientInvalid: false,
    isConnectionClosed: detectConnectionClosed(message, err),
    raw: err?.response?.data,
  };
}
