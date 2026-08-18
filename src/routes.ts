/**
 * Mapa de rotas do app.
 *
 * Cada seção tem uma URL própria para que F5 mantenha a tela, o botão voltar
 * do navegador funcione e um link de seção possa ser compartilhado.
 *
 * Os slugs são os mesmos ids usados no menu (`Layout.tsx`) e no switch de
 * `App.tsx`. Manter essa igualdade é intencional: nenhum componente precisa
 * aprender um vocabulário novo, e `/integrations` — que o retorno do OAuth do
 * Google já usa — continua valendo.
 */

/** Seção mostrada quando a URL não aponta para nenhuma outra. */
export const DEFAULT_TAB = 'dashboard';

/** Todas as seções navegáveis. A ordem não importa; a busca é por igualdade. */
export const TABS = [
  'dashboard',
  'inbox',
  'kanban',
  'contacts',
  'clients',
  'agents',
  'leo',
  'campaigns',
  'quick_replies',
  'schedule',
  'availability',
  'integrations',
  'professionals',
  'settings',
  'finance',
  'reports',
  'admin',
  'admin_hub',
  'lead_radar',
  'sofia_config',
  'overview',
  'health',
  'meta_templates',
  'diagnostics',
  'onboarding',
] as const;

export type AppTab = (typeof TABS)[number];

/**
 * Seções que carregam uma sub-seção na URL (`/settings/account`).
 * O valor é a sub-aba usada quando a URL não traz nenhuma.
 */
export const SUB_TAB_DEFAULTS: Record<string, string> = {
  settings: 'account',
  admin: 'overview',
  leo: 'dashboard',
};

/** Sub-abas aceitas por seção — o que não estiver aqui cai no default. */
export const VALID_SUB_TABS: Record<string, readonly string[]> = {
  settings: ['account', 'subscription', 'ai_config'],
  admin: ['overview', 'users', 'config', 'billing', 'flags', 'meta_activator', 'lead_radar'],
  leo: ['dashboard', 'leads', 'campanhas', 'instagram', 'postagens', 'configuracoes'],
};

const TAB_SET = new Set<string>(TABS);

/** Monta o caminho de uma seção (com sub-seção, quando houver). */
export function buildPath(tab: string, subTab?: string): string {
  if (!TAB_SET.has(tab)) return `/${DEFAULT_TAB}`;

  const valid = VALID_SUB_TABS[tab];
  if (valid && subTab && valid.includes(subTab)) {
    return `/${tab}/${subTab}`;
  }
  return `/${tab}`;
}

/**
 * Lê a URL e devolve a seção ativa. Caminho desconhecido cai no default —
 * um link velho ou digitado errado abre o Dashboard em vez de tela em branco.
 */
export function parsePath(pathname: string): { tab: AppTab; subTab?: string } {
  const [rawTab, rawSubTab] = pathname.replace(/^\/+|\/+$/g, '').split('/');

  if (!rawTab || !TAB_SET.has(rawTab)) {
    return { tab: DEFAULT_TAB };
  }

  const tab = rawTab as AppTab;
  const valid = VALID_SUB_TABS[tab];
  if (!valid) return { tab };

  const subTab = rawSubTab && valid.includes(rawSubTab) ? rawSubTab : SUB_TAB_DEFAULTS[tab];
  return { tab, subTab };
}
