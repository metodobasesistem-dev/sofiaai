/**
 * Leitura do rastro de anúncio (Click-to-WhatsApp) na mensagem crua.
 *
 * Módulo puro de propósito: não toca banco nem rede, para que os dois
 * provedores (API oficial da Meta e Evolution) compartilhem exatamente a
 * mesma leitura e para que ela seja testável sem infraestrutura.
 * A gravação fica em services/leadOriginService.ts.
 */

/** Rastro de anúncio já normalizado, independente do provedor de origem. */
export interface AdReferral {
  source_id?: string;
  source_url?: string;
  source_type?: string;
  headline?: string;
  body?: string;
  ctwa_clid?: string;
  media_url?: string;
}

/** O que é gravado em contacts.ad_tracking. */
export interface AdTracking extends AdReferral {
  source: string;
  type: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_medium?: string;
  captured_at: string;
  /**
   * 'impulsionamento' quando o clique veio do botão do Instagram, cuja conta
   * de anúncios é implícita e cujo nome de campanha nunca vai existir.
   */
  tipo_de_anuncio?: 'impulsionamento';
  /** Como se chegou a esse veredito. */
  tipo_detectado_por?: 'config_da_clinica' | 'conta_inalcancavel';
}

/**
 * Chaves sob as quais o bloco de anúncio já apareceu no contextInfo da
 * Evolution. O nome muda conforme a versão do Baileys/Evolution, e vem tanto
 * em camelCase quanto em snake_case.
 */
const REFERRAL_KEYS = [
  'referral',
  'adReply',
  'ad_reply',
  'ctwaContext',
  'ctwa_context',
  'externalAdReply',
  'external_ad_reply',
];

/** Detecta chave nova com cara de anúncio, para descobrir sem adivinhar. */
const SUSPEITA_DE_ANUNCIO = /ctwa|referral|conversion|adreply/i;

/** Lê a primeira chave preenchida, aceitando camelCase e snake_case. */
function pick(obj: any, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Localiza o contextInfo na mensagem da Evolution. Ele chega FORA de
 * data.message quando o clique veio de anúncio — e dentro dele quando o
 * que existe é mensagem citada. Tentamos os dois.
 */
function findContextInfo(raw: any): any {
  const content = raw?.message || {};
  return (
    raw?.contextInfo ||
    raw?.context_info ||
    content.contextInfo ||
    content.extendedTextMessage?.contextInfo ||
    content.imageMessage?.contextInfo ||
    content.videoMessage?.contextInfo ||
    content.audioMessage?.contextInfo ||
    content.documentMessage?.contextInfo ||
    null
  );
}

/**
 * Extrai o rastro de anúncio da mensagem crua, seja ela da API oficial da
 * Meta ou da Evolution. Devolve null quando não há clique em anúncio.
 */
export function extractAdReferral(raw: any): AdReferral | null {
  if (!raw) return null;

  // Caminho 1 — API oficial da Meta: message.referral, em snake_case.
  const metaReferral = raw.referral;
  if (metaReferral && typeof metaReferral === 'object') {
    return {
      source_id: pick(metaReferral, 'source_id', 'sourceId'),
      source_url: pick(metaReferral, 'source_url', 'sourceUrl'),
      source_type: pick(metaReferral, 'source_type', 'sourceType'),
      headline: pick(metaReferral, 'headline'),
      body: pick(metaReferral, 'body'),
      ctwa_clid: pick(metaReferral, 'ctwa_clid', 'ctwaClid'),
      media_url: pick(metaReferral, 'image_url', 'imageUrl', 'video_url', 'videoUrl'),
    };
  }

  // Caminho 2 — Evolution: o bloco vive no contextInfo, sob um de vários nomes.
  const contextInfo = findContextInfo(raw);
  if (!contextInfo || typeof contextInfo !== 'object') return null;

  let bloco: any = null;
  for (const key of REFERRAL_KEYS) {
    const candidato = contextInfo[key];
    if (candidato && typeof candidato === 'object') {
      bloco = candidato;
      break;
    }
  }

  // ctwaClid solto no próprio contextInfo também caracteriza clique em anúncio.
  const clidSolto = pick(contextInfo, 'ctwaClid', 'ctwa_clid');
  if (!bloco && !clidSolto) {
    // Rede de segurança: registra chave desconhecida com cara de anúncio, para
    // que um nome de campo novo apareça no log em vez de sumir em silêncio.
    const desconhecidas = Object.keys(contextInfo).filter(
      k => SUSPEITA_DE_ANUNCIO.test(k) && !REFERRAL_KEYS.includes(k)
    );
    if (desconhecidas.length) {
      console.warn(
        `[LeadOrigin] ⚠️ contextInfo traz chave de anúncio não reconhecida: ${desconhecidas.join(', ')}`,
        JSON.stringify(contextInfo).slice(0, 800)
      );
    }
    return null;
  }

  const fonte = bloco || {};
  return {
    source_id: pick(fonte, 'sourceId', 'source_id', 'adId', 'ad_id'),
    source_url: pick(fonte, 'sourceUrl', 'source_url', 'sourceUrlV2'),
    source_type: pick(fonte, 'sourceType', 'source_type'),
    headline: pick(fonte, 'title', 'headline'),
    body: pick(fonte, 'body', 'description'),
    ctwa_clid: pick(fonte, 'ctwaClid', 'ctwa_clid') || clidSolto,
    media_url: pick(fonte, 'thumbnailUrl', 'thumbnail_url', 'mediaUrl', 'media_url'),
  };
}

/** Extrai os UTM da URL do anúncio. URL inválida é ignorada em silêncio. */
function extractUtms(sourceUrl?: string): Partial<AdTracking> {
  if (!sourceUrl) return {};
  try {
    const params = new URL(sourceUrl).searchParams;
    return {
      utm_source: params.get('utm_source') || undefined,
      utm_campaign: params.get('utm_campaign') || undefined,
      utm_content: params.get('utm_content') || undefined,
      utm_medium: params.get('utm_medium') || undefined,
    };
  } catch {
    return {};
  }
}

/** Monta o ad_tracking a partir do rastro bruto. */
export function buildAdTracking(referral: AdReferral): AdTracking {
  const utms = extractUtms(referral.source_url);
  return {
    ...referral,
    ...utms,
    source: utms.utm_source || 'Meta Ads',
    type: referral.source_type || 'ad',
    headline: referral.headline || utms.utm_campaign,
    captured_at: new Date().toISOString(),
  };
}
