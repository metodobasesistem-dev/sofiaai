/**
 * Busca de leads no Instagram via Apify (ator apify~instagram-search-scraper).
 *
 * Este módulo existe porque a busca ingênua — uma única query "nicho cidade" —
 * rendia quase nada. Medições feitas contra a API real (Muriaé/MG):
 *
 *   "cirurgiao plastico muriae"   →  3 perfis
 *   "cirurgião plástico muriaé"   →  4 perfis (1 inédito)
 *   "harmonização facial muriaé"  →  8 perfis (8 inéditos)
 *   ────────────────────────────────────────────────────────
 *   união das três                → 12 perfis
 *
 * O ator resolve a busca via Google/Threads, então acento e sinônimo mudam
 * completamente o resultado. Buscar por várias frentes e deduplicar é o que
 * transforma 3 leads em 12.
 *
 * Também medido: `searchType: 'hashtag'` retorna `no_items` neste ator, e
 * `publicPhoneNumber` / `publicEmail` NUNCA vêm preenchidos — nem aqui nem no
 * instagram-profile-scraper. Todo contato precisa sair da bio e dos links.
 */
import axios from 'axios';
import { supabase } from '../lib/supabaseClient.js';
import { generateAIResponse } from './aiService.js';

const SEARCH_ACTOR = 'apify~instagram-search-scraper';

export interface InstagramProfile {
  username?: string;
  fullName?: string;
  biography?: string;
  externalUrl?: string;
  externalUrls?: Array<{ url?: string } | string>;
  followersCount?: number;
  postsCount?: number;
  isBusinessAccount?: boolean;
  businessCategoryName?: string;
  verified?: boolean;
  private?: boolean;
}

/**
 * Remove acentos para comparar/variar termos sem depender da grafia.
 * O intervalo ̀-ͯ são as marcas de acentuação que o NFD separa.
 */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ─────────────────────────────────────────────────────────────────────────
// 1. TERMOS DE BUSCA
// ─────────────────────────────────────────────────────────────────────────

/**
 * Variações determinísticas — usadas sozinhas se a IA falhar, e sempre
 * incluídas para garantir que a grafia digitada pelo usuário seja consultada.
 */
export function fallbackSearchTerms(niche: string, city: string): string[] {
  const n = niche.trim();
  const c = city.trim();
  const termos = [
    `${n} ${c}`,
    `${stripAccents(n)} ${stripAccents(c)}`,
    // Formatos que qualquer ramo usa, sem assumir segmento
    `${stripAccents(n)} em ${stripAccents(c)}`,
  ];
  return [...new Set(termos.map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean))];
}

/**
 * Pede à IA variações do termo: grafia correta com acento,
 * sinônimos e serviços correlatos do ramo buscado — seja ele qual for. É uma
 * chamada por varredura — barata perto do custo de cada run do Apify.
 */
export async function buildSearchTerms(niche: string, city: string, maxTerms = 5): Promise<string[]> {
  const base = fallbackSearchTerms(niche, city);

  try {
    const prompt =
      `Gere termos de busca para encontrar perfis de Instagram de negócios e ` +
      `profissionais do ramo "${niche}" na cidade de "${city}" (Brasil).\n\n` +
      `Regras:\n` +
      `- Use a grafia correta, COM acentos, do nicho e da cidade.\n` +
      `- Inclua sinônimos do ramo e os serviços que esse tipo de negócio costuma anunciar.\n` +
      `- Não presuma um segmento: siga exatamente o ramo informado.\n` +
      `- Cada termo deve ter de 2 a 4 palavras e conter o nome da cidade.\n` +
      `- Nada de hashtags, aspas ou operadores de busca.\n\n` +
      `Retorne estritamente JSON: {"termos":["...","..."]}`;

    const res = await generateAIResponse(prompt, [{ role: 'user', content: 'Gere os termos.' }]);
    const parsed = JSON.parse(res.text.replace(/```json/g, '').replace(/```/g, '').trim());
    const doIA: string[] = Array.isArray(parsed.termos) ? parsed.termos : [];

    const todos = [...base, ...doIA.map(t => String(t).trim()).filter(Boolean)];
    // Dedup case-insensitive e sem acento: "muriae" e "muriaé" contam como um só
    const vistos = new Set<string>();
    const unicos: string[] = [];
    for (const t of todos) {
      const chave = stripAccents(t.toLowerCase());
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      unicos.push(t);
    }
    return unicos.slice(0, maxTerms);
  } catch {
    return base.slice(0, maxTerms);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 2. DESCOBERTA
// ─────────────────────────────────────────────────────────────────────────

/**
 * Roda uma busca por termo (em paralelo, com teto de concorrência) e devolve
 * os perfis únicos por username. Um termo que falha não derruba os outros.
 */
export async function searchProfiles(params: {
  apifyToken: string;
  terms: string[];
  perTermLimit: number;
  concurrency?: number;
}): Promise<InstagramProfile[]> {
  const { apifyToken, terms, perTermLimit, concurrency = 3 } = params;
  const encontrados = new Map<string, InstagramProfile>();

  for (let i = 0; i < terms.length; i += concurrency) {
    const lote = terms.slice(i, i + concurrency);

    const resultados = await Promise.allSettled(
      lote.map(term =>
        axios.post(
          `https://api.apify.com/v2/acts/${SEARCH_ACTOR}/run-sync-get-dataset-items?token=${apifyToken}`,
          { search: term, searchType: 'user', searchLimit: perTermLimit },
          { headers: { 'Content-Type': 'application/json' }, timeout: 180000 }
        )
      )
    );

    resultados.forEach((r, idx) => {
      const term = lote[idx];
      if (r.status !== 'fulfilled') {
        const err: any = (r as PromiseRejectedResult).reason;
        console.warn(`[InstagramSearch] termo "${term}" falhou:`, err?.response?.data || err?.message);
        return;
      }
      const itens: InstagramProfile[] = r.value.data || [];
      let novos = 0;
      for (const p of itens) {
        if (!p?.username || encontrados.has(p.username)) continue;
        encontrados.set(p.username, p);
        novos++;
      }
      console.log(`[InstagramSearch] "${term}" → ${itens.length} perfis (${novos} inéditos)`);
    });
  }

  return [...encontrados.values()];
}

// ─────────────────────────────────────────────────────────────────────────
// 3. CONTATO
// ─────────────────────────────────────────────────────────────────────────

/**
 * Valida um telefone brasileiro de verdade. Sem isso entram números como
 * 3728732372111 e 3298886833332 — pedaços de registro profissional, CNPJ e
 * regex genérica da bio captura e que passariam por um teste de comprimento.
 */
export function normalizeBrazilPhone(raw: string): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');

  // DDI: só remove quando o que sobra tem tamanho de número nacional
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;

  const ddd = parseInt(d.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return null;

  const numero = d.slice(2);
  if (numero.length === 9) {
    // Celular: sempre começa com 9
    if (numero[0] !== '9') return null;
  } else {
    // Fixo: primeiro dígito de 2 a 5
    if (!/[2-5]/.test(numero[0])) return null;
  }

  // Repetição total (00000000, 999999999) é preenchimento, não telefone
  if (/^(\d)\1+$/.test(numero)) return null;

  return d;
}

function linksOf(profile: InstagramProfile): string[] {
  const extras = Array.isArray(profile.externalUrls)
    ? profile.externalUrls.map(l => (typeof l === 'string' ? l : l?.url)).filter(Boolean)
    : [];
  return [profile.externalUrl, ...extras].filter(Boolean) as string[];
}

/**
 * Extrai o telefone do perfil. Ordem: link de WhatsApp (mais confiável) → bio.
 *
 * O padrão wa.me/<numero> é o que mais aparece nos perfis de negócio e era
 * justamente o que a regex antiga não pegava: ela esperava os dígitos colados
 * em "wa.me", sem a barra, então só casava api.whatsapp.com.
 */
export function extractPhone(profile: InstagramProfile): string | null {
  const links = linksOf(profile).join(' ');

  // wa.me/5532999999999 | api.whatsapp.com/send?phone=55... | ...&phoneNumber=32...
  const linkMatch = links.match(
    /(?:wa\.me\/|whatsapp\.com\/(?:send|message)\/?(?:\?|&)?(?:phone|phoneNumber)=|(?:\?|&)phone(?:Number)?=)\+?(\d{8,15})/i
  );
  if (linkMatch?.[1]) {
    const tel = normalizeBrazilPhone(linkMatch[1]);
    if (tel) return tel;
  }

  // Bio: (32) 98866-2080, 32 98866 2080, +55 32 98866-2080
  const bio = profile.biography || '';
  const bioMatch = bio.match(/(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/g) || [];
  for (const candidato of bioMatch) {
    const tel = normalizeBrazilPhone(candidato);
    if (tel) return tel;
  }

  return null;
}

/** E-mail na bio — o campo publicEmail do ator nunca vem preenchido. */
export function extractEmail(profile: InstagramProfile): string | null {
  const bio = profile.biography || '';
  const match = bio.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : null;
}

/** Links que escondem o contato atrás de um agregador (beacons, linktree…). */
const AGREGADORES = /beacons\.ai|linktr\.ee|linktree|bio\.link|lnk\.bio|linkr\.bio|campsite\.bio|milkshake\.app|about\.me|zaap\.bio|ktr\.ee/i;

export function hasAggregatorLink(profile: InstagramProfile): boolean {
  return AGREGADORES.test(linksOf(profile).join(' '));
}

// ─────────────────────────────────────────────────────────────────────────
// 4. RELEVÂNCIA E SCORES
// ─────────────────────────────────────────────────────────────────────────

/**
 * Relevância do perfil para a busca — sem nenhum vocabulário de segmento.
 *
 * A versão anterior media "parece profissional de saúde?" com listas fixas
 * (CRO/CRM, odonto, dermato…). Isso servia a um nicho só: para uma busca de
 * "advogado", "personal trainer" ou "arquiteto", todo perfil bom pontuava
 * zero e era descartado. Agora os sinais são derivados do que o usuário
 * pediu — nicho e cidade — mais indícios de que o perfil é um NEGÓCIO, que
 * valem para qualquer ramo.
 */
export function profileRelevance(profile: InstagramProfile, niche: string, city: string): {
  score: number;
  sinais: string[];
  doRamo: boolean;
} {
  const sinais: string[] = [];
  let score = 0;

  const bio = profile.biography || '';
  const nome = profile.fullName || '';
  const username = profile.username || '';
  const categoria = profile.businessCategoryName || '';
  const texto = stripAccents(`${nome} ${bio} ${username}`.toLowerCase());

  // Palavras do nicho pedido. Curtas demais ("de", "e") viram ruído e saem.
  // Compara pelo RADICAL, não pela palavra inteira: o perfil raramente usa a
  // mesma flexão que o usuário digitou — "arquiteto" precisa casar com
  // "Arquitetura", "advogado" com "Advogada", "dentista" com "Dentistas".
  const radical = (w: string) => (w.length >= 6 ? w.slice(0, w.length - 2) : w);
  const palavrasNicho = stripAccents(niche.toLowerCase())
    .split(/\s+/)
    .filter(w => w.length >= 4)
    .map(radical);

  // 1. O ramo aparece no texto do perfil
  const acertos = palavrasNicho.filter(w => texto.includes(w));
  const nichoCompleto = palavrasNicho.length > 0 && acertos.length === palavrasNicho.length;
  if (acertos.length) {
    score += nichoCompleto ? 3 : 2;
    sinais.push(`nicho no perfil (${acertos.join(', ')})`);
  }

  // 2. A categoria do Instagram é uma autodeclaração de ramo — quando bate com
  //    o que foi buscado, é o sinal mais confiável que existe no perfil.
  //    Categoria que NÃO bate não pontua: "Pet Store" não ajuda numa busca por
  //    advogado, e dar ponto por existir fazia todo negócio empatar.
  const catNorm = stripAccents(categoria.toLowerCase());
  const categoriaCasa = Boolean(catNorm) && palavrasNicho.some(w => catNorm.includes(w));
  if (categoriaCasa) {
    score += 2;
    sinais.push(`categoria: ${categoria}`);
  }

  // Sem nenhum dos dois, é um negócio qualquer que a busca aberta trouxe junto
  const doRamo = acertos.length > 0 || categoriaCasa;

  // 3. Região pedida
  const cidadeNorm = stripAccents(city.toLowerCase()).trim();
  if (cidadeNorm && texto.includes(cidadeNorm)) {
    score += 2;
    sinais.push('cidade no perfil');
  }

  // 4. Indícios de que é negócio, e não perfil pessoal. Valem pouco sozinhos:
  //    servem para desempatar, nunca para qualificar.
  if (profile.isBusinessAccount) {
    score += 1;
    sinais.push('conta comercial');
  }
  if (/\b(agende|agendar|marque|orcament|orçament|atendimento|whatsapp|contato|delivery|pedidos|consultoria)\b/i.test(bio)) {
    score += 1;
    sinais.push('chamada para contato');
  }
  if (/\b(rua|av\.|avenida|endereco|endereço|unidade|loja)\b/i.test(bio)) {
    score += 1;
    sinais.push('endereço na bio');
  }

  return { score, sinais, doRamo };
}


/** Dor e oportunidade, no mesmo espírito do fluxo do Google Maps. */
export function scoreProfile(profile: InstagramProfile): { pain_score: number; opportunity_score: number } {
  let pain = 1;
  let opportunity = 0;

  const followers = profile.followersCount || 0;
  const posts = profile.postsCount || 0;
  const temSite = Boolean(profile.externalUrl);

  if (followers > 0 && followers < 1000) pain += 2;
  else if (followers < 5000) pain += 1;
  if (!temSite) pain += 2;
  if (posts > 0 && posts < 30) pain += 1;
  if (!profile.isBusinessAccount) pain += 1;

  if (profile.verified) opportunity += 2;
  if (followers > 10000) opportunity += 1;
  if (profile.isBusinessAccount) opportunity += 1;

  return {
    pain_score: Math.min(pain, 5),
    opportunity_score: Math.min(opportunity, 5),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 5. VARREDURA COMPLETA
// ─────────────────────────────────────────────────────────────────────────

/**
 * Descobre, qualifica e grava os leads de uma varredura do Instagram.
 *
 * Vive aqui — e não na rota — porque existem duas cópias do Radar
 * (radarRoutes para todos e adminApiRoutes para admin). Com a lógica em cada
 * uma delas, a correção de um lado não chegava no outro.
 */
export async function runInstagramLeadScan(params: {
  niche: string;
  city: string;
  limit: number;
  context: string;
  apifyToken: string;
  campaignId: string;
}): Promise<{ total: number; comTelefone: number }> {
  const { niche, city, limit, context, apifyToken, campaignId } = params;

  const terms = await buildSearchTerms(niche, city);
  console.log(`[InstagramSearch] ${terms.length} termos: ${terms.map(t => `"${t}"`).join(', ')}`);

  const rawProfiles = await searchProfiles({
    apifyToken,
    terms,
    perTermLimit: Math.max(10, Math.ceil(limit * 1.5)),
  });

  if (rawProfiles.length === 0) {
    console.warn('[InstagramSearch] Nenhum perfil retornado.');
    return { total: 0, comTelefone: 0 };
  }

  // Mais relevantes primeiro: com o teto de `limit`, é quem entra na campanha.
  const candidatos = rawProfiles
    .filter(p => !p.private)
    .map(p => ({ profile: p, rel: profileRelevance(p, niche, city) }))
    .sort((a, b) => b.rel.score - a.rel.score);

  console.log(`[InstagramSearch] ${rawProfiles.length} perfis únicos; ${candidatos.length} públicos.`);

  const salvos: any[] = [];

  for (const { profile, rel } of candidatos) {
    if (salvos.length >= limit) break;

    const phone = extractPhone(profile);

    // Com telefone, basta um sinal da área. Sem telefone o lead só vale se o
    // perfil for claramente do ramo E da região — senão entram negócios de
    // outras cidades e até de outros países, que a busca aberta traz junto.
    // Sem telefone, o lead só vale se o perfil for reconhecidamente do ramo
    // buscado (texto ou categoria) — senão a busca aberta enche a campanha de
    // negócios de outros segmentos que por acaso citam a cidade.
    if (!phone && !rel.doRamo) continue;
    if (phone && rel.score === 0) continue;

    const biography = profile.biography || '';
    const website = profile.externalUrl || '';
    const username = profile.username || '';
    const displayName = profile.fullName || username || 'Sem nome';
    const email = extractEmail(profile);
    const followers = profile.followersCount || 0;
    const { pain_score, opportunity_score } = scoreProfile(profile);

    // O número existe, mas atrás de um beacons.ai/linktr.ee, que bloqueia
    // leitura automatizada (403). Vira aviso para abordagem manual.
    const contatoNoAgregador = !phone && hasAggregatorLink(profile);

    let reviewSummary = 'Sem resumo';
    try {
      const aiContextStr = context ? `\nContexto: ${context}` : '';
      const aiPrompt =
        `Você é um Estratégico Especialista em Vendas. Analise este perfil profissional do Instagram e identifique pontos de dor ou oportunidades de melhoria.\n\n` +
        `Perfil:\nNome: ${displayName}\nUsername: @${username}\n` +
        `Categoria: ${profile.businessCategoryName || 'Não informada'}\n` +
        `Seguidores: ${followers || 'Não informado'}\nBiografia: ${biography || 'Não informado'}\n` +
        `Site: ${website || 'Não possui'}\n` +
        `Sinais de relevância: ${rel.sinais.join(', ') || 'nenhum'}\n` +
        `Score de Dor: ${pain_score}/5\nScore de Oportunidade: ${opportunity_score}/5${aiContextStr}\n\n` +
        `Retorne estritamente JSON:\n{"observacao_ia":"..."}`;
      const aiRes = await generateAIResponse(aiPrompt, [{ role: 'user', content: 'Gere a análise.' }]);
      const aiJson = JSON.parse(aiRes.text.replace(/```json/g, '').replace(/```/g, '').trim());
      reviewSummary = aiJson.observacao_ia || reviewSummary;
    } catch { /* IA falhou — segue sem análise */ }

    // Lead sem telefone continua valendo: o contato sai por DM ou pelo link da
    // bio. Antes ele era descartado no meio do caminho e a campanha aparecia
    // vazia mesmo com perfis bons encontrados.
    if (contatoNoAgregador) {
      reviewSummary = `[Contato no link da bio — abordar por DM] ${reviewSummary}`;
    } else if (!phone) {
      reviewSummary = `[Sem telefone público — abordar por DM] ${reviewSummary}`;
    }

    const { data: savedLead, error: upsertErr } = await supabase
      .from('leads_radar')
      .upsert({
        name: displayName,
        phone,
        website: website || null,
        review_summary: reviewSummary,
        instagram: `https://instagram.com/${username}`,
        email,
        pain_score,
        opportunity_score,
        place_id: `ig_${username}`,
        niche,
        city,
        status: 'novo',
        campaign_id: campaignId || null,
      }, { onConflict: 'place_id' })
      .select()
      .single();

    if (upsertErr) {
      console.warn(`[InstagramSearch] Falha ao salvar @${username}:`, upsertErr.message);
      continue;
    }
    salvos.push(savedLead);
  }

  const comTelefone = salvos.filter(l => l?.phone).length;
  console.log(
    `[InstagramSearch] ✅ ${salvos.length} leads salvos ` +
    `(${comTelefone} com telefone, ${salvos.length - comTelefone} só com Instagram).`
  );

  return { total: salvos.length, comTelefone };
}
