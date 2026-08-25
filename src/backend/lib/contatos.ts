/**
 * Resolução de contatos do CRM a partir de telefone.
 *
 * Fica separado das rotas porque três fluxos precisam da mesma regra —
 * campanha avulsa, disparo do Radar e o send-single — e cada cópia própria
 * seria uma chance a mais de gravar o telefone num formato diferente e
 * duplicar o lead.
 */
import { supabase } from './supabaseClient.js';

/** Dígitos em E.164 com o 55 do Brasil. */
export function normalizePhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.startsWith('55') ? digits : '55' + digits;
}

export interface ContatoResolvido {
  id: string;
  nome: string;
  telefone: string;
  jaExistia: boolean;
}

/**
 * Devolve o contato do CRM para este telefone, criando se ainda não existir.
 *
 * Sempre grava o telefone NORMALIZADO (com 55) no id e na coluna: o
 * agentService salva contatos como {userId}_{normalizePhone(phone)}, então usar
 * o número cru aqui faria o mesmo lead virar duas linhas quando ele
 * respondesse — duplicado no CRM e nas notificações.
 */
export async function garantirContato(
  userId: string,
  contato: { nome?: string | null; telefone: string; status_funil?: string }
): Promise<ContatoResolvido> {
  const phoneRaw = String(contato.telefone || '').replace(/\D/g, '');
  const phone = normalizePhone(phoneRaw);

  const { data: existentes } = await supabase
    .from('contacts')
    .select('id, nome, telefone')
    .eq('user_id', userId)
    .in('telefone', Array.from(new Set([phone, phoneRaw])))
    .limit(1);

  const existente = existentes?.[0];
  if (existente) {
    return {
      id: existente.id,
      nome: contato.nome || existente.nome || '',
      telefone: existente.telefone || phone,
      jaExistia: true,
    };
  }

  const { data: novo, error } = await supabase
    .from('contacts')
    .insert({
      id: `${userId}_${phone}`,
      user_id: userId,
      nome: contato.nome || 'Lead Isolado',
      telefone: phone,
      status_funil: contato.status_funil || 'Lead',
    })
    .select('id, nome, telefone')
    .single();

  if (error) throw new Error('Erro ao criar contato: ' + error.message);
  return { id: novo.id, nome: novo.nome, telefone: novo.telefone, jaExistia: false };
}
