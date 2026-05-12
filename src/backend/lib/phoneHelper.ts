/**
 * Normalização canônica de número de telefone.
 *
 * Regras garantidas:
 *   1. Remove sufixos de JID do WhatsApp (@s.whatsapp.net, @g.us, etc.)
 *   2. Remove todos os caracteres não-numéricos
 *   3. Adiciona código de país 55 (Brasil) quando o número parece ser local
 *      — 10 dígitos: DDD (2) + fixo (8)     ex: 1133333333   → 551133333333
 *      — 11 dígitos: DDD (2) + celular (9)  ex: 11999999999  → 5511999999999
 *
 * Formatos de entrada suportados:
 *   "5511999999999@s.whatsapp.net"  → "5511999999999"
 *   "+55 (11) 99999-9999"           → "5511999999999"
 *   "5511999999999"                 → "5511999999999"
 *   "11999999999"                   → "5511999999999"
 *   "1133333333"                    → "551133333333"
 *
 * IMPORTANTE: esta função é a ÚNICA fonte de normalização no sistema.
 * Nunca use `.replace(/\D/g, '')` inline fora deste helper.
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';

  // 1. Remove sufixo de JID (@s.whatsapp.net, @g.us, @c.us …)
  const raw = phone.includes('@') ? phone.split('@')[0] : phone;

  // 2. Remove tudo que não é dígito
  let clean = raw.replace(/\D/g, '');

  if (!clean) return '';

  // 3. Adiciona prefixo 55 para números locais brasileiros
  if (clean.length === 10 || clean.length === 11) {
    clean = '55' + clean;
  }

  return clean;
}

/**
 * Gera o threadId composto usado como PK na tabela threads.
 * Centraliza a lógica de composição para evitar inconsistências.
 */
export function getThreadId(userId: string, phone: string): string {
  return `${userId}_${normalizePhone(phone)}`;
}
