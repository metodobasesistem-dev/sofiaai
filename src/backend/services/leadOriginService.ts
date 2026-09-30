import { supabase } from '../lib/supabaseClient.js';
import { normalizePhone } from '../lib/phoneHelper.js';
import { buildAdTracking, type AdReferral } from '../lib/adReferral.js';

/**
 * Gravação da origem do lead capturada num clique em anúncio (Click-to-WhatsApp).
 *
 * Fonte única para os dois provedores: a API oficial da Meta e a Evolution
 * gravam a MESMA coluna (contacts.ad_tracking), por esta função. Uma regra
 * aplicada só em um dos caminhos faria a classificação depender do provedor
 * de WhatsApp que a clínica usa.
 *
 * A leitura do rastro na mensagem crua fica em lib/adReferral.ts.
 */

export { extractAdReferral, buildAdTracking } from '../lib/adReferral.js';
export type { AdReferral, AdTracking } from '../lib/adReferral.js';

/** Slugs de source que representam escolha humana — nenhum detector sobrescreve. */
const MANUAL_SOURCES = new Set(['manual', 'balcao', 'atendente']);

/**
 * Esperas entre tentativas de achar o contato. O clique em anúncio chega na
 * PRIMEIRA mensagem, quando o contato ainda não existe: quem o cria é o
 * persistMessage, logo depois. Um UPDATE disparado antes disso não encontra
 * linha e o rastro se perde em silêncio — era o que acontecia antes.
 *
 * Esperar aqui é barato porque esta função roda fora do caminho da mensagem.
 */
const ESPERAS_ATE_O_CONTATO_EXISTIR = [0, 400, 1200, 3000];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Grava a origem do contato. Primeiro toque vence: a origem de um lead não
 * muda, então a função sai cedo se já houver rastro gravado ou se a origem
 * tiver sido escolhida à mão.
 *
 * Nunca lança: falhar aqui não pode derrubar o atendimento ao paciente.
 */
export async function captureLeadOrigin(
  userId: string,
  phoneNumber: string,
  referral: AdReferral
): Promise<void> {
  try {
    const cleanPhone = normalizePhone(phoneNumber);
    const contactId = `${userId}_${cleanPhone}`;

    for (const espera of ESPERAS_ATE_O_CONTATO_EXISTIR) {
      if (espera) await sleep(espera);

      const { data: contato } = await supabase
        .from('contacts')
        .select('ad_tracking, source')
        .eq('id', contactId)
        .maybeSingle();

      if (!contato) continue; // persistMessage ainda não criou a linha

      const atual = contato.ad_tracking as any;
      if (atual?.source || atual?.headline) {
        console.log(`[LeadOrigin] ⏭️ ${contactId} já tem origem gravada, mantendo a primeira`);
        return;
      }
      if (contato.source && MANUAL_SOURCES.has(String(contato.source).toLowerCase())) {
        console.log(`[LeadOrigin] 🔒 ${contactId} tem origem manual, não sobrescreve`);
        return;
      }

      const adTracking = buildAdTracking(referral);

      const { error } = await supabase
        .from('contacts')
        .update({ ad_tracking: adTracking, source: 'meta_ads' })
        .eq('id', contactId);

      if (error) throw error;

      console.log(
        `[LeadOrigin] 🎯 Origem capturada para ${contactId}: ${adTracking.headline || adTracking.source_id || adTracking.source}`
      );
      return;
    }

    console.warn(`[LeadOrigin] ⚠️ Contato ${contactId} não apareceu a tempo; rastro do anúncio descartado`);
  } catch (err) {
    console.error('[LeadOrigin] Erro ao gravar origem do lead:', err);
  }
}
