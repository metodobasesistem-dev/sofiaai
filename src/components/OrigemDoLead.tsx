import React, { useEffect, useState } from 'react';
import { Globe, Lock, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  listLeadOrigins,
  setContactOrigin,
  type OrigemDaClinica,
} from '../services/supabaseService';
import { classifyLeadOrigin, CANAIS_DE_ORIGEM, origemParaExibicao } from '../lib/leadOrigin';

/**
 * "De onde veio esse lead?" — a correção manual da origem.
 *
 * Fecha o ciclo do rastreio: os detectores cobrem clique em anúncio e frase
 * cadastrada, e nada mais. O paciente que LIGOU dizendo que veio pelo
 * convênio só entra no relatório se alguém marcar à mão.
 *
 * Escolher aqui TRAVA a origem (contacts.origin_locked): nenhum detector
 * sobrescreve depois. Sem a trava, a correção seria desfeita na mensagem
 * seguinte, porque o detector por frase roda a cada mensagem recebida.
 */

/** 'whatsapp' é ausência de sinal, não escolha: ninguém marca um lead assim. */
const ESCOLHAS_NATIVAS = CANAIS_DE_ORIGEM;

export default function OrigemDoLead({
  contactId,
  source,
  adTracking,
  originLocked,
  onMudou,
}: {
  contactId: string;
  source?: string | null;
  adTracking?: any;
  originLocked?: boolean;
  /** Avisa a tela de cima para recarregar o contato. */
  onMudou?: (patch: { source: string; origin_locked: boolean; ad_tracking: any }) => void;
}) {
  const [origens, setOrigens] = useState<OrigemDaClinica[]>([]);
  const [salvando, setSalvando] = useState<string | null>(null);

  useEffect(() => {
    // Falhar aqui não pode esconder as origens nativas: sem as próprias, a
    // correção manual continua funcionando para todas as do sistema.
    listLeadOrigins()
      .then(setOrigens)
      .catch(err => console.error('[OrigemDoLead] Falha ao carregar origens próprias:', err));
  }, []);

  const atual = classifyLeadOrigin(source, adTracking, { originLocked });
  const slugAtual = String(source || '').toLowerCase().trim();

  const escolher = async (slug: string, nome: string) => {
    if (slug === slugAtual && originLocked) return;
    setSalvando(slug);
    try {
      // Só o nome: o emoji é enfeite da tela e o rótulo gravado vira o que o
      // classificador mostra para origem própria — "💳 Convênio" no relatório
      // e no Inbox seria o emoji duplicado ao lado do chip.
      const atualizado = await setContactOrigin(contactId, { source: slug, label: nome });
      toast.success(`Origem marcada como ${nome}.`);
      onMudou?.({
        source: slug,
        origin_locked: true,
        ad_tracking: atualizado?.ad_tracking ?? null,
      });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar a origem');
    } finally {
      setSalvando(null);
    }
  };

  const opcoes = [
    ...ESCOLHAS_NATIVAS.map(c => {
      const { label, emoji } = origemParaExibicao(c);
      // A escolha grava um slug em contacts.source. As categorias do
      // classificador quase sempre coincidem com o slug; 'ad' é a exceção.
      return { slug: c === 'ad' ? 'meta_ads' : c, nome: label, emoji };
    }),
    ...origens.map(o => ({ slug: o.slug, nome: o.nome, emoji: o.emoji })),
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] flex items-center gap-2">
          <Globe size={14} className="text-primary-500" /> De onde veio esse lead?
        </label>
        {originLocked && (
          <span
            className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-600 shrink-0"
            title="Escolhido à mão — nenhum detector sobrescreve"
          >
            <Lock size={10} /> Travada
          </span>
        )}
      </div>

      <div className="relative">
        {/* Emoji fora do <select>: dentro das <option> ele some em parte dos
            navegadores, e colorir opção nativa não funciona de forma
            confiável. Fora, o ícone acompanha o valor escolhido. */}
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] pointer-events-none" aria-hidden>
          {opcoes.find(o => o.slug === slugAtual)?.emoji || '❔'}
        </span>

        <select
          value={slugAtual}
          disabled={salvando !== null}
          onChange={e => {
            const o = opcoes.find(x => x.slug === e.target.value);
            if (o) escolher(o.slug, o.nome);
          }}
          className="w-full appearance-none pl-9 pr-9 py-2.5 bg-white border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-700 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all disabled:opacity-60"
        >
          {/* A origem atual pode não estar na lista — um slug antigo, ou uma
              origem própria que foi removida. Sem esta entrada o select
              mostraria outra coisa como se fosse a escolhida. */}
          {!opcoes.some(o => o.slug === slugAtual) && (
            <option value={slugAtual}>{atual.label}</option>
          )}
          {opcoes.map(o => (
            <option key={o.slug} value={o.slug}>{o.nome}</option>
          ))}
        </select>

        <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={16} />}
        </span>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        {originLocked
          ? 'Marcada à mão. Os detectores não vão mais alterá-la.'
          : `Detectada automaticamente. Escolher aqui trava a origem.`}
      </p>
    </div>
  );
}
