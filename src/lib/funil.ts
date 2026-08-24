/**
 * Estágios do funil — fonte única para Kanban, conversa e listas.
 *
 * Antes cada tela tinha a própria lista: o Kanban desenhava seis colunas, o
 * seletor da conversa oferecia seis opções com outros ids, e o banco aceitava
 * quatro valores. As telas gravavam o id da coluna ('novo_lead') na coluna que
 * espera o rótulo ('Lead'), e a escrita falhava sem ninguém perceber.
 *
 * `id` é o que a interface usa; `valorBanco` é o que vai para
 * contacts.status_funil. As cores são as mesmas do quadro, para o mesmo
 * estágio ter a mesma cor em qualquer lugar do sistema.
 */

export interface EtapaFunil {
  id: string;
  label: string;
  /** null = não é estágio de funil (Cliente vive em contacts.is_client). */
  valorBanco: string | null;
  desc: string;
  /** Classes Tailwind, para o estágio ter a mesma cor em todas as telas. */
  dot: string;
  bg: string;
  text: string;
  border: string;
}

export const ETAPAS_FUNIL: EtapaFunil[] = [
  {
    id: 'novo_lead',
    label: 'Novo Lead',
    valorBanco: 'Lead',
    desc: 'Primeiro contato recebido',
    dot: 'bg-slate-400', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200',
  },
  {
    id: 'primeiro_atend',
    label: 'Primeiro Atend.',
    valorBanco: 'Primeiro Atendimento',
    desc: 'Em conversa ativa com a equipe',
    dot: 'bg-blue-400', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100',
  },
  {
    id: 'sem_resposta',
    label: 'Sem Resposta',
    valorBanco: 'Sem Resposta',
    desc: 'Aguardando retorno do lead',
    dot: 'bg-amber-400', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100',
  },
  {
    id: 'qualificado',
    label: 'Qualificado',
    valorBanco: 'Qualificado',
    desc: 'Interesse confirmado, pronto para avançar',
    dot: 'bg-violet-400', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100',
  },
  {
    id: 'agendamento',
    label: 'Agendamento',
    valorBanco: 'Agendado',
    desc: 'Compromisso marcado no calendário',
    dot: 'bg-indigo-400', bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100',
  },
  {
    id: 'perdido',
    label: 'Perdido',
    valorBanco: 'Perdido',
    desc: 'Não avançou — sem interesse ou sem retorno',
    dot: 'bg-red-400', bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-100',
  },
  {
    id: 'cliente',
    label: 'Cliente',
    valorBanco: null, // marcado por contacts.is_client
    desc: 'Conversão concluída',
    dot: 'bg-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100',
  },
];

/** Estágios que de fato existem no funil (Cliente fica de fora). */
export const ETAPAS_DO_FUNIL = ETAPAS_FUNIL.filter(e => e.valorBanco !== null);

export const ETAPA_PADRAO = ETAPAS_FUNIL[0];

export function etapaPorId(id?: string | null): EtapaFunil {
  return ETAPAS_FUNIL.find(e => e.id === id) || ETAPA_PADRAO;
}

/** Converte o valor gravado no banco no id usado pela interface. */
export function idDaEtapa(valorBanco?: string | null): string {
  if (!valorBanco) return ETAPA_PADRAO.id;
  const achou = ETAPAS_FUNIL.find(e => e.valorBanco === valorBanco);
  if (achou) return achou.id;

  // Valores legados: 'Resolvido' era exibido como Cliente antes de is_client
  // virar a fonte da verdade, e ids de coluna chegaram a ser gravados na
  // coluna por engano.
  if (valorBanco === 'Resolvido') return 'novo_lead';
  const porId = ETAPAS_FUNIL.find(e => e.id === valorBanco);
  return porId ? porId.id : ETAPA_PADRAO.id;
}

/** Valor a gravar em contacts.status_funil para um id de etapa. */
export function valorBancoDaEtapa(id?: string | null): string | null {
  return etapaPorId(id).valorBanco;
}
