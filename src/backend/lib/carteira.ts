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
