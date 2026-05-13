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
  raw?: any;
}

const META_CODE_24H_WINDOW = 131047;
const META_CODE_RECIPIENT_INVALID = 131026;
const META_CODE_AUTH = 190;

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
      message: `[Meta ${code}${metaError.error_subcode ? `/${metaError.error_subcode}` : ''}] ${metaError.message || 'Unknown error'}`,
      is24hWindowClosed: code === META_CODE_24H_WINDOW,
      isAuthError: code === META_CODE_AUTH,
      isRecipientInvalid: code === META_CODE_RECIPIENT_INVALID,
      raw: metaError,
    };
  }

  // Evolution API shape: err.response.data.{message, error, status}
  const evoData = err?.response?.data;
  if (evoData && (evoData.message || evoData.error)) {
    return {
      provider: 'evolution',
      code: evoData.status || err?.response?.status,
      message: typeof evoData.message === 'string'
        ? evoData.message
        : (typeof evoData.error === 'string' ? evoData.error : JSON.stringify(evoData)),
      is24hWindowClosed: false,
      isAuthError: err?.response?.status === 401 || err?.response?.status === 403,
      isRecipientInvalid: false,
      raw: evoData,
    };
  }

  // Fallback: axios error sem body estruturado, ou Error nativo
  const status = err?.response?.status;
  return {
    provider: 'unknown',
    code: status,
    message: err?.message || 'Unknown provider error',
    is24hWindowClosed: false,
    isAuthError: status === 401 || status === 403,
    isRecipientInvalid: false,
    raw: err?.response?.data,
  };
}
