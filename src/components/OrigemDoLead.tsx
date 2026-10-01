import React, { useEffect, useState } from 'react';
import { Globe, Lock, Loader2, Check } from 'lucide-react';
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
          <Globe size={14} className="text-primary-500" /> De onde veio esse lead?
        </h4>
        {originLocked && (
          <span
            className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-600"
            title="Escolhido à mão — nenhum detector sobrescreve"
          >
            <Lock size={10} /> Travada
          </span>
        )}
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        {originLocked
          ? 'Marcada à mão. Os detectores não vão mais alterá-la.'
          : `Detectada automaticamente como ${atual.label}. Escolher abaixo trava a origem.`}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {opcoes.map(o => {
          const escolhida = o.slug === slugAtual;
          return (
            <button
              key={o.slug}
              onClick={() => escolher(o.slug, o.nome)}
              disabled={salvando !== null}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all disabled:opacity-50
                ${escolhida
                  ? 'bg-primary-50 border-primary-300 text-primary-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
            >
              {salvando === o.slug ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <span aria-hidden>{o.emoji}</span>
              )}
              {o.nome}
              {escolhida && originLocked && <Check size={11} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
