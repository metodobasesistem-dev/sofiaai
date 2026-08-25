/**
 * Métricas da carteira de clientes.
 *
 * Vivem aqui, e não dentro de uma rota, porque duas telas dependem delas:
 * Clientes (carteira) e Financeiro (gestão). Cada cópia dessas contas seria
 * uma chance de os dois números divergirem na tela do usuário.
 */

export interface FichaComercial {
  mensalidade?: number | string | null;
  ciclo?: 'mensal' | 'anual' | 'unico' | string | null;
  status_contrato?: 'ativo' | 'pausado' | 'cancelado' | string | null;
  cliente_desde?: string | null;
  encerrado_em?: string | null;
}

/**
 * LTV realizado — quanto o cliente JÁ pagou desde que entrou na carteira.
 *
 * É o número histórico, não uma projeção: projetar exigiria uma taxa de
 * cancelamento que o sistema ainda não tem histórico para calcular.
 *
 * O período vai de cliente_desde até hoje, ou até encerrado_em quando o
 * contrato acabou — senão um cliente que saiu continuaria "faturando" para
 * sempre no relatório.
 *
 * Períodos são contados FECHADOS: quem entrou há 45 dias pagou 1 mensalidade,
 * não 1,5. Contar fração transformaria o LTV numa estimativa, e a graça dele
 * aqui é ser o valor que de fato entrou.
 */
export function calcularLTV(profile: FichaComercial | null | undefined): { ltv: number; meses: number } {
  if (!profile) return { ltv: 0, meses: 0 };

  const valor = Number(profile.mensalidade) || 0;
  const inicio = profile.cliente_desde ? new Date(profile.cliente_desde) : null;
  if (!valor || !inicio || isNaN(inicio.getTime())) return { ltv: 0, meses: 0 };

  const fim = profile.encerrado_em ? new Date(profile.encerrado_em) : new Date();
  if (isNaN(fim.getTime()) || fim < inicio) return { ltv: 0, meses: 0 };

  const meses =
    (fim.getFullYear() - inicio.getFullYear()) * 12 +
    (fim.getMonth() - inicio.getMonth()) -
    (fim.getDate() < inicio.getDate() ? 1 : 0);
  const mesesCompletos = Math.max(0, meses);

  if (profile.ciclo === 'unico') {
    // Pagamento único: o LTV é o próprio valor, desde o primeiro dia.
    return { ltv: valor, meses: mesesCompletos };
  }

  if (profile.ciclo === 'anual') {
    const anos = Math.floor(mesesCompletos / 12);
    return { ltv: valor * anos, meses: mesesCompletos };
  }

  return { ltv: valor * mesesCompletos, meses: mesesCompletos };
}

/**
 * Receita recorrente mensal. Só contrato ativo entra, e o ciclo anual é
 * diluído em 12 para que o número seja comparável mês a mês. Pagamento único
 * não é recorrente e fica de fora.
 */
export function calcularMRR(fichas: Array<FichaComercial | null | undefined>): number {
  return fichas.reduce((total, p) => {
    if (!p || p.status_contrato !== 'ativo' || !p.mensalidade) return total;
    const valor = Number(p.mensalidade) || 0;
    if (p.ciclo === 'anual') return total + valor / 12;
    if (p.ciclo === 'unico') return total;
    return total + valor;
  }, 0);
}

/** Resumo da carteira usado pelas telas de Clientes e Financeiro. */
export function resumoCarteira(fichas: Array<FichaComercial | null | undefined>) {
  const ativos = fichas.filter(f => f?.status_contrato === 'ativo').length;
  const mrr = calcularMRR(fichas);
  const ltvs = fichas.map(f => calcularLTV(f).ltv);
  const ltvTotal = ltvs.reduce((a, b) => a + b, 0);
  const comLtv = ltvs.filter(v => v > 0).length;

  const arredonda = (n: number) => Math.round(n * 100) / 100;

  return {
    ativos,
    mrr: arredonda(mrr),
    ticket_medio: ativos > 0 ? arredonda(mrr / ativos) : 0,
    ltv_total: arredonda(ltvTotal),
    // Média só entre quem já gerou receita: incluir quem entrou ontem com
    // zero puxaria o indicador para baixo sem significar nada.
    ltv_medio: comLtv > 0 ? arredonda(ltvTotal / comLtv) : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// VIGÊNCIAS — o valor do contrato ao longo do tempo
// ─────────────────────────────────────────────────────────────────────────

export interface VigenciaContrato {
  id?: string;
  contact_id?: string;
  valor: number | string;
  moeda?: string | null;
  ciclo?: 'mensal' | 'anual' | 'unico' | string | null;
  inicio: string;
  /** null = vigente */
  fim?: string | null;
}

const dia = (d: string | Date) => (typeof d === 'string' ? new Date(`${d}T12:00:00`) : d);

/** Meses completos entre duas datas — a mesma regra de período fechado do LTV. */
function mesesCompletos(de: Date, ate: Date): number {
  if (ate < de) return 0;
  const m =
    (ate.getFullYear() - de.getFullYear()) * 12 +
    (ate.getMonth() - de.getMonth()) -
    (ate.getDate() < de.getDate() ? 1 : 0);
  return Math.max(0, m);
}

/**
 * LTV contratado somando faixa a faixa.
 *
 * Cada vigência rende pelo próprio valor, então um reajuste vale só do início
 * dele em diante — o passado continua no preço da época. O contrato encerrado
 * (encerrado_em na ficha) limita todas as faixas: quem saiu para de acumular.
 *
 * Vigência que ainda não começou (reajuste agendado) não soma nada.
 */
export function calcularLTVPorVigencias(
  vigencias: VigenciaContrato[],
  ficha?: FichaComercial | null,
  referencia: Date = new Date()
): { ltv: number; meses: number } {
  if (!vigencias?.length) return { ltv: 0, meses: 0 };

  const fimDoContrato = ficha?.encerrado_em ? dia(ficha.encerrado_em) : null;
  const teto = fimDoContrato && fimDoContrato < referencia ? fimDoContrato : referencia;

  let ltv = 0;
  let mesesTotais = 0;
  let inicioMaisAntigo: Date | null = null;

  for (const v of vigencias) {
    const valor = Number(v.valor) || 0;
    if (!valor || !v.inicio) continue;

    const inicio = dia(v.inicio);
    if (isNaN(inicio.getTime()) || inicio > teto) continue; // ainda não vigorou

    const fimFaixa = v.fim ? dia(v.fim) : teto;
    const ate = fimFaixa < teto ? fimFaixa : teto;

    if (!inicioMaisAntigo || inicio < inicioMaisAntigo) inicioMaisAntigo = inicio;

    if (v.ciclo === 'unico') {
      // Pagamento único conta uma vez, no momento em que a faixa começou.
      ltv += valor;
      continue;
    }

    const meses = mesesCompletos(inicio, ate);
    mesesTotais += meses;
    ltv += v.ciclo === 'anual' ? valor * Math.floor(meses / 12) : valor * meses;
  }

  // "Meses de casa" é o tempo total desde a primeira faixa, não a soma das
  // faixas — elas são contíguas, mas arredondamentos poderiam divergir.
  const mesesDeCasa = inicioMaisAntigo ? mesesCompletos(inicioMaisAntigo, teto) : mesesTotais;

  return { ltv: Math.round(ltv * 100) / 100, meses: mesesDeCasa };
}

/** Valor que vale numa data — usado pela geração de mensalidades. */
export function vigenciaEm(vigencias: VigenciaContrato[], data: Date | string): VigenciaContrato | null {
  const alvo = dia(data);
  const candidatas = (vigencias || [])
    .filter(v => {
      const inicio = dia(v.inicio);
      if (isNaN(inicio.getTime()) || inicio > alvo) return false;
      if (!v.fim) return true;
      return dia(v.fim) >= alvo;
    })
    .sort((a, b) => dia(b.inicio).getTime() - dia(a.inicio).getTime());

  return candidatas[0] || null;
}
