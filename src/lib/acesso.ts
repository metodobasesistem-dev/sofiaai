/**
 * Quem pode ver cada item de navegação — FONTE ÚNICA.
 *
 * A regra vive aqui porque agora dois lugares decidem: o menu lateral
 * (Layout) e o rail das Configurações. Uma cópia em cada um divergiria, e o
 * sintoma seria o pior possível — um cliente enxergando uma tela que o plano
 * dele não cobre, ou perdendo uma que cobre.
 */

/** Ordem dos planos, do menor para o maior. */
const PLANOS = ['Trial', 'Starter', 'Pro', 'Elite', 'Enterprise'];

export interface RestricaoDeAcesso {
  /** Feature flag que precisa estar ligada. */
  flag?: string;
  /** Plano mínimo que enxerga o item. */
  minPlan?: string;
}

export interface ContextoDeAcesso {
  role?: string | null;
  plano?: string | null;
  flags: Record<string, boolean | undefined>;
}

/**
 * O item aparece para este usuário?
 *
 * A flag vale para todo mundo, inclusive admin: ela desliga a funcionalidade,
 * não o acesso a ela. O plano mínimo é que o admin ignora, para conseguir dar
 * suporte a qualquer inquilino.
 */
export function podeVer(
  restricao: RestricaoDeAcesso,
  { role, plano, flags }: ContextoDeAcesso
): boolean {
  if (restricao.flag && flags[restricao.flag] === false) return false;

  if (role === 'admin') return true;

  if (restricao.minPlan) {
    const doUsuario = PLANOS.indexOf(plano || 'Trial');
    const exigido = PLANOS.indexOf(restricao.minPlan);
    if (doUsuario < exigido) return false;
  }

  return true;
}
