import React, { useEffect, useMemo, useState } from 'react';
import { X, Clock, Loader2, Send, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  listFollowUpTemplates,
  listScheduledMessages,
  createScheduledMessage,
  cancelScheduledMessage,
  type ModeloDeFollowUp,
  type MensagemProgramada,
} from '../services/supabaseService';
import { renderizarModelo, variaveisUsadas } from '../lib/mensagemModelo';

/**
 * Programar mensagem.
 *
 * Escolher um modelo aqui GRAVA O TEXTO FINAL, não a referência ao modelo: o
 * atendente leu a prévia antes de confirmar, e é ela que precisa chegar ao
 * paciente. Guardar o modelo faria editá-lo depois mudar, em silêncio, o que
 * já estava agendado.
 */

/** Atalhos de horário — o caso comum não deveria exigir escolher data. */
const ATALHOS = [
  { label: 'Em 1 hora', minutos: 60 },
  { label: 'Em 3 horas', minutos: 180 },
  { label: 'Amanhã, 9h', amanha: 9 },
  { label: 'Em 7 dias', minutos: 60 * 24 * 7 },
];

/** Date → valor de <input type="datetime-local">, no fuso do navegador. */
function paraInputLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const formatarQuando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function ProgramarMensagemModal({
  threadId,
  nomeDoContato,
  onFechar,
}: {
  threadId: string;
  nomeDoContato?: string;
  onFechar: () => void;
}) {
  const [modelos, setModelos] = useState<ModeloDeFollowUp[]>([]);
  const [agendadas, setAgendadas] = useState<MensagemProgramada[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [modeloId, setModeloId] = useState('');
  const [texto, setTexto] = useState('');
  const [quando, setQuando] = useState(() => paraInputLocal(new Date(Date.now() + 60 * 60 * 1000)));
  const [salvando, setSalvando] = useState(false);
  const [cancelando, setCancelando] = useState<string | null>(null);

  /**
   * Variáveis do modelo que esta tela não sabe preencher.
   *
   * O renderizador tira a variável sem deixar pontuação solta, mas não tem
   * como consertar preposição órfã: um modelo de lembrete vira "consulta com
   * a às." num envio avulso, porque {profissional} e {hora} vêm de um
   * agendamento que aqui não existe. Some sem avisar seria pior — o atendente
   * programaria uma frase quebrada sem perceber.
   */
  const [semDado, setSemDado] = useState<string[]>([]);

  const carregar = async () => {
    try {
      const [ms, ag] = await Promise.all([listFollowUpTemplates(), listScheduledMessages(threadId)]);
      // Modelo desligado não é oferecido: a lista aqui é o que pode sair.
      setModelos(ms.filter(m => m.ativo));
      setAgendadas(ag);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, [threadId]);

  const primeiroNome = (nomeDoContato || '').trim().split(/\s+/)[0] || '';

  /**
   * As variáveis conhecidas na conversa. {data}, {hora} e {profissional}
   * dependem de um agendamento, que um envio avulso não tem — elas somem,
   * pela regra do renderizador, e a prévia mostra isso antes de confirmar.
   */
  const valores = useMemo(
    () => ({ nome: primeiroNome, nome_completo: (nomeDoContato || '').trim() }),
    [nomeDoContato, primeiroNome]
  );

  const escolherModelo = (id: string) => {
    setModeloId(id);
    const m = modelos.find(x => x.id === id);
    if (!m) { setSemDado([]); return; }

    setTexto(renderizarModelo(m.conteudo, valores));
    setSemDado(
      variaveisUsadas(m.conteudo).filter(v => !String((valores as any)[v] || '').trim())
    );
  };

  const aplicarAtalho = (a: typeof ATALHOS[number]) => {
    const d = new Date();
    if (a.amanha != null) {
      d.setDate(d.getDate() + 1);
      d.setHours(a.amanha, 0, 0, 0);
    } else {
      d.setMinutes(d.getMinutes() + (a.minutos || 0));
    }
    setQuando(paraInputLocal(d));
  };

  const agendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) { toast.error('Escreva a mensagem.'); return; }
    if (!quando) { toast.error('Escolha quando enviar.'); return; }

    setSalvando(true);
    try {
      const nova = await createScheduledMessage({
        thread_id: threadId,
        conteudo: texto.trim(),
        enviar_em: new Date(quando).toISOString(),
        template_id: modeloId || null,
      });
      setAgendadas(prev => [...prev, nova].sort((a, b) => a.enviar_em.localeCompare(b.enviar_em)));
      setTexto('');
      setModeloId('');
      toast.success(`Mensagem programada para ${formatarQuando(nova.enviar_em)}.`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao agendar');
    } finally {
      setSalvando(false);
    }
  };

  const cancelar = async (m: MensagemProgramada) => {
    setCancelando(m.id);
    try {
      await cancelScheduledMessage(m.id);
      setAgendadas(prev => prev.map(x => (x.id === m.id ? { ...x, status: 'cancelada' } : x)));
      toast.success('Agendamento cancelado.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cancelar');
    } finally {
      setCancelando(null);
    }
  };

  const pendentes = agendadas.filter(m => m.status === 'pendente');
  const falhas = agendadas.filter(m => m.status === 'falhou');

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Programar mensagem</h3>
            <p className="text-[12px] text-slate-500">
              {nomeDoContato ? `Para ${nomeDoContato}.` : ''} O sistema envia na hora marcada.
            </p>
          </div>
          <button onClick={onFechar} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>

        {carregando ? (
          <div className="py-16 flex justify-center text-slate-400">
            <Loader2 size={26} className="animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {pendentes.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Já programadas ({pendentes.length})
                </p>
                {pendentes.map(m => (
                  <div key={m.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                    <Clock size={14} className="text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-slate-700">{formatarQuando(m.enviar_em)}</p>
                      <p className="text-[12px] text-slate-500 line-clamp-2">{m.conteudo}</p>
                    </div>
                    <button
                      onClick={() => cancelar(m)}
                      disabled={cancelando === m.id}
                      className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      aria-label="Cancelar o agendamento"
                    >
                      {cancelando === m.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {falhas.length > 0 && (
              <div className="flex gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
                <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-900 leading-relaxed">
                  {falhas.length === 1 ? 'Uma mensagem não pôde ser enviada' : `${falhas.length} mensagens não puderam ser enviadas`}:{' '}
                  {falhas[0].erro || 'motivo não registrado'}.
                </p>
              </div>
            )}

            <form onSubmit={agendar} className="space-y-4">
              {modelos.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Partir de um modelo
                  </label>
                  <select
                    value={modeloId}
                    onChange={e => escolherModelo(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Escrever do zero</option>
                    {modelos.map(m => (
                      <option key={m.id} value={m.id}>{m.nome}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Mensagem
                </label>
                <textarea
                  rows={4}
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  placeholder="O que o paciente vai receber."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                {semDado.length > 0 && (
                  <div className="flex gap-2.5 mt-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
                    <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      Este modelo usa {semDado.map(v => `{${v}}`).join(', ')}, que só existem num
                      agendamento. Saíram do texto — <strong>releia a frase</strong> antes de
                      programar.
                    </p>
                  </div>
                )}

                <p className="text-[11px] text-slate-400 mt-1.5">
                  É este texto que será enviado. Editar o modelo depois não muda o que já está agendado.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Quando
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {ATALHOS.map(a => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => aplicarAtalho(a)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:border-primary-300 hover:text-primary-700 transition-colors"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                <input
                  type="datetime-local"
                  value={quando}
                  onChange={e => setQuando(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <button
                type="submit"
                disabled={salvando}
                className="w-full py-2.5 bg-primary-600 text-white rounded-xl text-[13px] font-semibold hover:bg-primary-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {salvando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Programar envio
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
