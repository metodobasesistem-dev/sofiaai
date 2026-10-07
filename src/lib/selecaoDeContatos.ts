/**
 * Lógica da lista de contatos da campanha — módulo puro.
 *
 * Fica fora do componente para ser testável sem tela e sem banco, e porque as
 * regras aqui são as que dão errado em silêncio: a junção de telefones, a data
 * "nunca", o tempo de envio.
 */

import { normalizarTexto } from './leadOriginPattern';

// ─── Intervalo entre mensagens ──────────────────────────────────────────────

/**
 * Intervalo anti-ban entre duas mensagens de uma campanha, em segundos.
 *
 * É a MESMA faixa que o servidor sorteia a cada envio. Mora aqui para que a
 * estimativa mostrada na tela e o envio real usem o mesmo número: com duas
 * cópias, quem mudasse uma deixaria a tela prometendo um tempo que o envio não
 * cumpre.
 */
export const ATRASO_MIN_SEG = 60;
export const ATRASO_MAX_SEG = 180;
export const ATRASO_MEDIO_SEG = (ATRASO_MIN_SEG + ATRASO_MAX_SEG) / 2;

export interface Duracao {
  /** Média esperada, em segundos. */
  segundos: number;
  /** "≈ 4h 44min" — o que vai na tela. */
  texto: string;
  /** "entre 3h 56min e 11h 51min" — para o tooltip, já que o intervalo sorteia. */
  faixa: string;
}

function formatarDuracao(segundos: number): string {
  if (segundos < 60) return 'menos de 1 min';
  const totalMin = Math.round(segundos / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

/**
 * Quanto tempo leva enviar para `qtd` contatos.
 *
 * A primeira mensagem sai sem espera, então são `qtd - 1` intervalos.
 */
export function estimarDuracao(qtd: number): Duracao {
  const intervalos = Math.max(0, qtd - 1);
  const media = intervalos * ATRASO_MEDIO_SEG;
  return {
    segundos: media,
    texto: `≈ ${formatarDuracao(media)}`,
    faixa: `entre ${formatarDuracao(intervalos * ATRASO_MIN_SEG)} e ${formatarDuracao(intervalos * ATRASO_MAX_SEG)}`,
  };
}

// ─── Datas ──────────────────────────────────────────────────────────────────

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias inteiros entre duas datas, pelo calendário local (não por 24h corridas). */
function diasEntre(de: Date, ate: Date): number {
  const a = new Date(de.getFullYear(), de.getMonth(), de.getDate()).getTime();
  const b = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate()).getTime();
  return Math.round((b - a) / DIA_MS);
}

/**
 * "há 3 dias", "ontem", "há 2 meses".
 *
 * Conta dias de CALENDÁRIO, não 24 horas corridas: uma mensagem de ontem às
 * 23h50 lida hoje às 00:10 é "ontem", não "hoje".
 *
 * Sem data devolve `nuncaTexto` — o contato nunca teve conversa, o que é
 * diferente de uma conversa antiga e precisa se ver assim na lista.
 */
export function formatarHa(
  iso: string | null | undefined,
  agora: Date = new Date(),
  nuncaTexto = 'nunca'
): string {
  if (!iso) return nuncaTexto;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return nuncaTexto;

  const dias = diasEntre(data, agora);
  if (dias <= 0) return 'hoje'; // inclui data no futuro por relógio desalinhado
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;

  // Meses e anos viram na MESMA data (365 dias). Cortar os meses em "12" e os
  // anos em "365" deixava 360 a 364 dias sem faixa: 12 meses de 30 dias, mas
  // 0 anos — "há 0 anos".
  if (dias < 365) {
    const meses = Math.min(11, Math.floor(dias / 30));
    return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
  }

  const anos = Math.floor(dias / 365);
  return anos === 1 ? 'há 1 ano' : `há ${anos} anos`;
}

// ─── Linhas da lista ────────────────────────────────────────────────────────

export interface LinhaDeContato {
  id: string;
  nome: string;
  /** Só dígitos, como está em contacts.telefone. */
  telefone: string;
  statusFunil: string | null;
  isClient: boolean;
  /** Última mensagem em qualquer sentido (threads.last_message_time). */
  ultimaConversa: string | null;
  /** Última vez que o contato escreveu (threads.last_inbound_at). */
  ultimaResposta: string | null;
}

/** O que a campanha guarda de quem foi escolhido. */
export interface ContatoSelecionado {
  id: string;
  nome: string;
  telefone: string;
}

export function paraSelecionado(l: LinhaDeContato): ContatoSelecionado {
  return { id: l.id, nome: l.nome, telefone: l.telefone };
}

const soDigitos = (s: string | null | undefined) => String(s || '').replace(/\D/g, '');

/**
 * O contato tem número que o envio consegue usar?
 *
 * Menos de 10 dígitos não é telefone com DDD. Um contato assim, se pudesse ser
 * marcado, entraria na campanha, ocuparia um intervalo de 1 a 3 minutos e
 * falharia no fim.
 */
export function ehEnviavel(l: Pick<LinhaDeContato, 'telefone'>): boolean {
  return soDigitos(l.telefone).length >= 10;
}

// ─── Junção com as conversas ────────────────────────────────────────────────

export interface ContatoDoBanco {
  id: string;
  nome: string | null;
  telefone: string | null;
  status_funil: string | null;
  is_client: boolean | null;
}

export interface ConversaDoBanco {
  /** `{userId}_{telefone}` */
  id: string;
  last_message_time: string | null;
  last_inbound_at: string | null;
}

/** O telefone dentro do id da conversa (`{userId}_{telefone}`). */
export function telefoneDaConversa(threadId: string): string {
  const i = threadId.indexOf('_');
  return soDigitos(i >= 0 ? threadId.slice(i + 1) : threadId);
}

/** Maior de duas datas ISO, tratando nulo como "sem data". */
function maisRecente(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * Junta cada contato à sua conversa e traz as duas datas.
 *
 * As datas vêm de `threads`, e não de `contacts.ultima_interacao`: esta última
 * nasce com NOW() na criação do contato, então um contato importado e nunca
 * contatado apareceria com "última conversa: hoje". Sem conversa, a data é
 * nula — e a tela diz "nunca".
 *
 * A junção é pelo telefone. O id de `contacts` nem sempre segue o formato
 * `{userId}_{telefone}` (pode ser UUID), mas o telefone existe nos dois lados.
 * Quando o número exato não casa, tenta pelos 8 últimos dígitos, que é o que
 * o resto do sistema já faz para o nono dígito dos celulares brasileiros.
 */
export function juntarComConversas(
  contatos: ContatoDoBanco[],
  conversas: ConversaDoBanco[]
): LinhaDeContato[] {
  const exato = new Map<string, ConversaDoBanco>();
  const finais = new Map<string, ConversaDoBanco>();

  for (const c of conversas) {
    const tel = telefoneDaConversa(c.id);
    if (!tel) continue;
    exato.set(tel, c);
    if (tel.length >= 8) {
      const chave = tel.slice(-8);
      const atual = finais.get(chave);
      // Em colisão dos 8 dígitos, vale a conversa mais recente.
      if (!atual || maisRecente(c.last_message_time, atual.last_message_time) === c.last_message_time) {
        finais.set(chave, c);
      }
    }
  }

  return contatos.map(c => {
    const tel = soDigitos(c.telefone);
    const conversa = exato.get(tel) || (tel.length >= 8 ? finais.get(tel.slice(-8)) : undefined);
    return {
      id: c.id,
      nome: (c.nome || '').trim() || tel || 'Sem nome',
      telefone: tel,
      statusFunil: c.status_funil,
      isClient: c.is_client === true,
      ultimaConversa: conversa?.last_message_time || null,
      ultimaResposta: conversa?.last_inbound_at || null,
    };
  });
}

// ─── Busca e ordenação ──────────────────────────────────────────────────────

/**
 * Procura por nome (sem acento, sem caixa) ou por trecho do telefone.
 *
 * A busca por telefone só vale quando o termo É um número — dígitos, espaço,
 * parênteses, "+", hífen. Um termo com letras ("Dr 123", "Contato 011") é
 * nome: tirar os dígitos dele e procurá-los nos telefones trazia todo paciente
 * cujo número contém "123".
 */
export function filtrarPorBusca(linhas: LinhaDeContato[], termo: string): LinhaDeContato[] {
  const t = termo.trim();
  if (!t) return linhas;

  const nomeAlvo = normalizarTexto(t);
  const pareceTelefone = /^[\d\s()+\-.]+$/.test(t);
  const digitos = soDigitos(t);

  return linhas.filter(l => {
    if (normalizarTexto(l.nome).includes(nomeAlvo)) return true;
    // "32" não pode casar todo número de DDD 32: busca por telefone só vale
    // com 3 dígitos ou mais.
    return pareceTelefone && digitos.length >= 3 && l.telefone.includes(digitos);
  });
}

export type OrdemDaLista = 'conversa_antiga' | 'conversa_recente' | 'nome';

/**
 * Ordena sem mexer na lista original.
 *
 * Quem nunca conversou vai SEMPRE para o fim, nas duas direções de data: não
 * é o mais antigo nem o mais recente, é a ausência de data, e no topo de
 * "mais antigas primeiro" ele esconderia as conversas antigas de verdade.
 */
export function ordenar(linhas: LinhaDeContato[], ordem: OrdemDaLista): LinhaDeContato[] {
  const copia = [...linhas];

  if (ordem === 'nome') {
    return copia.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  }

  const sentido = ordem === 'conversa_antiga' ? 1 : -1;
  return copia.sort((a, b) => {
    if (!a.ultimaConversa && !b.ultimaConversa) return a.nome.localeCompare(b.nome, 'pt-BR');
    if (!a.ultimaConversa) return 1;
    if (!b.ultimaConversa) return -1;
    return (new Date(a.ultimaConversa).getTime() - new Date(b.ultimaConversa).getTime()) * sentido;
  });
}

// ─── Paginação ──────────────────────────────────────────────────────────────

export function paginar<T>(lista: T[], pagina: number, tamanho: number) {
  const totalPaginas = Math.max(1, Math.ceil(lista.length / tamanho));
  // Uma busca que encolhe a lista não pode deixar a tela numa página que
  // deixou de existir.
  const atual = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = (atual - 1) * tamanho;
  return { itens: lista.slice(inicio, inicio + tamanho), pagina: atual, totalPaginas };
}
