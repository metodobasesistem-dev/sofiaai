/**
 * Classificação da origem do lead — FONTE ÚNICA.
 *
 * Inbox, Contatos, Kanban e relatórios leem daqui. Cada tela já teve a
 * própria cópia da regra, e elas divergiram: a mesma base saía com contagens
 * diferentes conforme a tela, e uma correção feita num lugar não chegava nos
 * outros.
 *
 * Os comentários abaixo registram o defeito real que motivou cada regra.
 * Antes de mexer em qualquer precedência, leia-os.
 */

export type LeadOriginCategory =
  | 'ad'               // anúncio pelo Gerenciador de Anúncios
  | 'impulsionamento'  // botão "Impulsionar" do Instagram, conta implícita
  | 'instagram'
  | 'google'
  | 'site'
  | 'telefone'
  | 'indicacao'
  | 'organico'
  | 'manual'
  | 'outros'
  | 'whatsapp';        // origem DESCONHECIDA (padrão), não um canal

/** O quanto o sistema confia na origem que apurou. */
export type OriginConfidence = 'alta' | 'media' | 'baixa' | 'nenhuma';

export interface LeadOrigin {
  category: LeadOriginCategory;
  /** Rótulo pronto para a tela. */
  label: string;
  /** Nome do anúncio ou da campanha, quando existe. */
  campaign?: string;
  confidence: OriginConfidence;
}

export interface ClassifyOptions {
  /** contacts.origin_locked — o atendente escolheu a origem à mão. */
  originLocked?: boolean;
}

/** Slugs de source que representam escolha humana. */
const MANUAL_SOURCES = new Set(['manual', 'balcao', 'atendente']);

const ROTULOS: Record<LeadOriginCategory, string> = {
  ad: 'Anúncio (Meta Ads)',
  impulsionamento: 'Impulsionamento',
  instagram: 'Instagram',
  google: 'Google',
  site: 'Site',
  telefone: 'Telefone',
  indicacao: 'Indicação',
  organico: 'Orgânico',
  manual: 'Cadastro manual',
  outros: 'Outros',
  // NÃO é "WhatsApp" nem "WhatsApp IA". É o valor padrão de quem apenas
  // mandou mensagem, sem nenhum sinal de por onde chegou. Chamá-lo de canal
  // fazia a maior parte da base — 343 de 389 numa clínica real — aparecer
  // como se fosse captação, e distorcia qualquer percentual calculado em
  // cima disso.
  whatsapp: 'Origem desconhecida',
};

/** Mapeia o slug de contacts.source para a categoria, quando basta ele. */
const CATEGORIA_POR_SOURCE: Record<string, LeadOriginCategory> = {
  instagram: 'instagram',
  google: 'google',
  site: 'site',
  telefone: 'telefone',
  indicacao: 'indicacao',
  organico: 'organico',
  facebook: 'instagram',
};

/**
 * O contato veio de um clique em anúncio?
 *
 * SÓ servem como sinal os campos que EXISTEM APENAS num clique. A condição
 * já foi `t.source || t.headline` — parece razoável e está errada: o detector
 * por frase preenche esses dois campos para QUALQUER padrão cadastrado,
 * inclusive um de Site ou de Indicação.
 *
 * O efeito era todo contato com ad_tracking cair em "Anúncio (Meta Ads)".
 * Numa clínica com um padrão de Site cadastrado, os leads do site apareciam
 * como vindos de anúncio, e qualquer contagem feita sobre aquela tela saía
 * inflada.
 */
function veioDeClique(t: any): boolean {
  if (!t) return false;
  return Boolean(
    t.source_id || t.sourceId || t.ctwa_clid || t.ctwaClid || t.utm_campaign || t.utm_content
  );
}

/** Marcado como frase cadastrada pelo detector por padrão. */
function veioDeFrase(t: any): boolean {
  return t?.type === 'ad_pattern';
}

/** Marcado como link rastreável. */
function veioDeLink(t: any): boolean {
  return t?.type === 'tracking_link' || Boolean(t?.tracking_link_slug);
}

/**
 * Classifica a origem de um contato.
 *
 * Precedência, da maior para a menor:
 *   1. Escolha manual      — origin_locked, ou source manual/balcao/atendente
 *   2. Clique em anúncio   — campos que só existem num clique
 *   3. Frase cadastrada    — type 'ad_pattern'
 *   4. Link rastreável     — type 'tracking_link'
 *   5. Nada                — origem desconhecida
 */
export function classifyLeadOrigin(
  source?: string | null,
  adTracking?: any,
  opts: ClassifyOptions = {}
): LeadOrigin {
  const slug = String(source || '').toLowerCase().trim();
  const t = adTracking || null;

  // 1 — Escolha manual vence tudo.
  //
  // Travada à mão, o canal escolhido é o que vale: quem marcou "Instagram"
  // quer ver Instagram, não "Cadastro manual". "Cadastro manual" fica só
  // para quem foi cadastrado sem canal, ou marcado como balcão/atendente.
  if (opts.originLocked || MANUAL_SOURCES.has(slug)) {
    const categoria: LeadOriginCategory = MANUAL_SOURCES.has(slug) || !slug || slug === 'whatsapp'
      ? 'manual'
      : CATEGORIA_POR_SOURCE[slug] || (slug === 'meta_ads' ? 'ad' : 'outros');

    return {
      category: categoria,
      label: ROTULOS[categoria],
      campaign: t?.headline || undefined,
      confidence: 'alta',
    };
  }

  // 2 — Clique em anúncio.
  if (veioDeClique(t)) {
    // Impulsionamento é categoria própria, decidida no backend. Não é
    // Instagram orgânico (é mídia paga: somá-los faria uma clínica que só
    // impulsiona aparecer sem verba nenhuma no relatório) e não é Anúncio
    // (o nome da campanha nunca vai existir, porque a conta de anúncios é
    // implícita — insistir em "Anúncio (Meta Ads)" manda a clínica procurar
    // para sempre uma campanha que não existe).
    if (t.tipo_de_anuncio === 'impulsionamento') {
      return {
        category: 'impulsionamento',
        label: ROTULOS.impulsionamento,
        confidence: 'alta',
      };
    }
    return {
      category: 'ad',
      label: ROTULOS.ad,
      // Sem token com ads_read a Graph API não resolve o nome, e sobra o ID.
      campaign: t.ad_name || t.campaign_name || t.headline || t.source_id || t.sourceId || undefined,
      confidence: 'alta',
    };
  }

  // 3 — Frase cadastrada. O slug gravado pelo padrão é que diz o canal.
  if (veioDeFrase(t)) {
    const categoria = CATEGORIA_POR_SOURCE[slug] || 'outros';
    return {
      category: categoria,
      label: ROTULOS[categoria],
      campaign: t.headline || undefined,
      confidence: 'media',
    };
  }

  // 4 — Link rastreável.
  if (veioDeLink(t)) {
    const categoria = CATEGORIA_POR_SOURCE[slug] || 'outros';
    return {
      category: categoria,
      label: ROTULOS[categoria],
      campaign: t.headline || t.tracking_link_slug || undefined,
      confidence: 'media',
    };
  }

  // 5 — Só o slug, sem rastro nenhum que o sustente.
  if (slug && slug !== 'whatsapp') {
    const categoria = CATEGORIA_POR_SOURCE[slug] || 'outros';
    return { category: categoria, label: ROTULOS[categoria], confidence: 'baixa' };
  }

  return { category: 'whatsapp', label: ROTULOS.whatsapp, confidence: 'nenhuma' };
}

/**
 * O quanto o sistema confia na origem apurada. Serve para a tela mostrar o
 * peso do dado, em vez de afirmar tudo com a mesma segurança.
 */
export function classifyOriginConfidence(
  source?: string | null,
  adTracking?: any,
  opts: ClassifyOptions = {}
): OriginConfidence {
  return classifyLeadOrigin(source, adTracking, opts).confidence;
}

/** Rótulo da categoria, para legendas e cabeçalhos. */
export function labelForCategory(category: LeadOriginCategory): string {
  return ROTULOS[category];
}
