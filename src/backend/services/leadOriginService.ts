import { supabase } from '../lib/supabaseClient.js';
import { normalizePhone } from '../lib/phoneHelper.js';
import { buildAdTracking, type AdReferral } from '../lib/adReferral.js';
import { escolherPadrao } from '../../lib/leadOriginPattern.js';

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
export { escolherPadrao, normalizarTexto } from '../../lib/leadOriginPattern.js';

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
 * A clínica declarou que só anuncia pelo botão "Impulsionar"?
 *
 * Só é consultado no clique em anúncio, que é raro perto do volume de
 * mensagens. Na dúvida responde false: marcar como impulsionamento por
 * engano esconde o nome de uma campanha que existe.
 */
async function clinicaSoImpulsiona(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('anuncios_sao_impulsionamento')
      .eq('id', userId)
      .maybeSingle();
    return Boolean(data?.anuncios_sao_impulsionamento);
  } catch {
    return false;
  }
}

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
        .select('ad_tracking, source, origin_locked')
        .eq('id', contactId)
        .maybeSingle();

      if (!contato) continue; // persistMessage ainda não criou a linha

      if (contato.origin_locked) {
        console.log(`[LeadOrigin] 🔒 ${contactId} tem origem travada à mão, não sobrescreve`);
        return;
      }
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

      // A clínica que só anuncia pelo botão "Impulsionar" declara isso nas
      // Configurações. O clique é idêntico ao de um anúncio do Gerenciador —
      // nada no que o WhatsApp entrega separa os dois —, então a declaração é
      // o único sinal disponível enquanto não houver token de leitura de
      // anúncios para perguntar à Graph API.
      if (await clinicaSoImpulsiona(userId)) {
        adTracking.tipo_de_anuncio = 'impulsionamento';
        adTracking.tipo_detectado_por = 'config_da_clinica';
      }

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

// ─── Detector por frase cadastrada ──────────────────────────────────────────

/** Rótulo legível a partir do slug gravado em contacts.source. */
const ROTULOS_DE_SOURCE: Record<string, string> = {
  instagram: 'Instagram',
  google: 'Google',
  site: 'Site',
  facebook: 'Facebook',
  indicacao: 'Indicação',
  telefone: 'Telefone',
  meta_ads: 'Meta Ads',
  organico: 'Orgânico',
};

function rotuloDeSource(slug: string): string {
  return ROTULOS_DE_SOURCE[slug.toLowerCase()] || slug;
}

/**
 * Marca a origem do lead pela frase da mensagem, quando nenhum sinal mais
 * forte já respondeu por ela.
 *
 * Roda a cada mensagem recebida, em paralelo ao atendimento: nunca lança, e
 * falhar aqui não pode derrubar a resposta ao paciente.
 */
export async function detectAndTagLeadOrigin(
  userId: string,
  phoneNumber: string,
  mensagem: string
): Promise<void> {
  try {
    // Mensagem sem letra nenhuma (só emoji, número ou pontuação) não carrega
    // frase de campanha e não tem o que casar.
    if (!mensagem || !/\p{L}/u.test(mensagem)) return;

    const cleanPhone = normalizePhone(phoneNumber);
    const contactId = `${userId}_${cleanPhone}`;

    const { data: contato } = await supabase
      .from('contacts')
      .select('ad_tracking, source, origin_locked')
      .eq('id', contactId)
      .maybeSingle();

    if (!contato) return; // ainda não persistido; a próxima mensagem tenta

    if (contato.origin_locked) return;                       // escolha manual vence
    const atual = contato.ad_tracking as any;
    if (atual?.source || atual?.headline) return;            // já tem origem
    if (contato.source && contato.source !== 'whatsapp') return; // idem

    const { data: padroes, error } = await supabase
      .from('lead_origin_patterns')
      .select('pattern, source, campaign_name')
      .eq('user_id', userId);

    if (error) throw error;
    if (!padroes?.length) return;

    const escolhido = escolherPadrao(mensagem, padroes);
    if (!escolhido) return;

    const { error: updateError } = await supabase
      .from('contacts')
      .update({
        source: escolhido.source,
        ad_tracking: {
          source: rotuloDeSource(escolhido.source),
          // MARCA O DETECTOR. O classificador precisa distinguir frase de
          // clique em anúncio: os campos source e headline são preenchidos
          // pelos dois, inclusive para um padrão de Site ou de Indicação.
          type: 'ad_pattern',
          headline: escolhido.campaign_name,
          body: mensagem,
          captured_at: new Date().toISOString(),
        },
      })
      .eq('id', contactId);

    if (updateError) throw updateError;

    console.log(
      `[LeadOrigin] 🏷️ ${contactId} marcado como ${escolhido.source} pela frase "${escolhido.pattern}"`
    );
  } catch (err) {
    console.error('[LeadOrigin] Erro no detector por frase:', err);
  }
}
