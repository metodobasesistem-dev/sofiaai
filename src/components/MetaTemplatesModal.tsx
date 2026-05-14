import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, AlertCircle, Loader2, MessageSquare, AlertTriangle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { listMetaTemplates, sendMetaTemplate, type MetaTemplate } from '../services/supabaseService';
import TemplateQualityBadge, { type QualityScore } from './TemplateQualityBadge';
import TemplateBuilderModal from './TemplateBuilderModal';

// Validação client-side leve, espelhando as regras críticas do
// templateValidator.ts (backend). A validação autoritativa acontece no
// servidor — aqui é só feedback visual rápido enquanto o usuário digita.
const URL_SHORTENERS = /(bit\.ly|tinyurl\.com|cutt\.ly|t\.co|shorte\.st|encurtaurl|rebrand\.ly|is\.gd|ow\.ly|buff\.ly|adf\.ly)/i;
const MONEY_PROMISES = /(ganhe\s+r\$|renda\s+extra|investimento\s+garantido|lucro\s+de\s+\d+%|milhares?\s+por\s+m[êe]s|fique\s+rico|dinheiro\s+f[áa]cil)/i;

function detectVariableWarnings(value: string): string[] {
  const out: string[] = [];
  if (!value) return out;
  const m1 = value.match(URL_SHORTENERS);
  if (m1) out.push(`URL encurtado (${m1[1]}) — pode aumentar denúncias e pausar o template.`);
  const m2 = value.match(MONEY_PROMISES);
  if (m2) out.push(`Linguagem promocional suspeita ("${m2[0]}").`);
  if (value.length >= 10) {
    const letters = value.replace(/[^a-zA-ZÀ-ú]/g, '');
    if (letters.length >= 10) {
      const upper = letters.replace(/[^A-ZÀ-Ú]/g, '');
      if (upper.length / letters.length > 0.7) {
        out.push('Texto majoritariamente em CAIXA ALTA — Meta interpreta como agressivo.');
      }
    }
  }
  return out;
}

interface MetaTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Recipient phone (with country code, no @s.whatsapp.net) */
  to: string;
  /** Optional callback after successful send */
  onSent?: (messageId?: string) => void;
}

/**
 * Modal shown when the Meta 24h window is closed (or proactively from the Inbox).
 * Lists approved templates, lets the user fill variables, and sends.
 */
export default function MetaTemplatesModal({ isOpen, onClose, to, onSent }: MetaTemplatesModalProps) {
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [bodyVars, setBodyVars] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);

  const selected = useMemo(() => templates.find(t => t.name === selectedName) || null, [templates, selectedName]);

  // The number of {{N}} placeholders in the body component
  const bodyVarCount = useMemo(() => {
    if (!selected) return 0;
    const body = selected.components.find(c => c.type === 'BODY');
    if (!body?.text) return 0;
    const matches = body.text.match(/\{\{\d+\}\}/g);
    return matches?.length || 0;
  }, [selected]);

  // Reset state on open/close
  useEffect(() => {
    if (!isOpen) {
      setSelectedName(null);
      setBodyVars([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    // Listar TODOS para que o atendente VEJA os bloqueados também
    // (com motivo claro), em vez de ficar achando que não existem.
    listMetaTemplates('')
      .then(t => setTemplates(t))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen]);

  // Separa disponíveis (APPROVED) dos bloqueados (PAUSED/DISABLED/REJECTED/PENDING)
  const usableTemplates = useMemo(
    () => templates.filter(t => (t.status || '').toUpperCase() === 'APPROVED'),
    [templates]
  );
  const blockedTemplates = useMemo(
    () => templates.filter(t => ['PAUSED', 'DISABLED', 'REJECTED', 'FLAGGED', 'PENDING'].includes((t.status || '').toUpperCase())),
    [templates]
  );

  // When user picks a template, reset variable inputs to empty strings
  useEffect(() => {
    setBodyVars(Array(bodyVarCount).fill(''));
  }, [bodyVarCount, selectedName]);

  // Live preview of the body with vars substituted
  const livePreview = useMemo(() => {
    if (!selected) return '';
    const body = selected.components.find(c => c.type === 'BODY');
    if (!body?.text) return '';
    let txt = body.text;
    bodyVars.forEach((v, i) => {
      txt = txt.replace(`{{${i + 1}}}`, v || `{{${i + 1}}}`);
    });
    return txt;
  }, [selected, bodyVars]);

  const canSend = !!selected && bodyVars.every(v => v.trim().length > 0) && !sending;

  const handleSend = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const components = bodyVarCount > 0
        ? [{
            type: 'body',
            parameters: bodyVars.map(v => ({ type: 'text', text: v })),
          }]
        : undefined;

      const result = await sendMetaTemplate(to, selected.name, selected.language, components);
      if (!result.success) {
        toast.error(result.error || 'Falha ao enviar template');
        return;
      }
      // Server pode retornar warnings detectadas pelo templateValidator —
      // mensagem foi entregue, mas registramos aviso pro atendente.
      const serverWarnings = (result as any).warnings as Array<{ message: string }> | undefined;
      if (serverWarnings && serverWarnings.length > 0) {
        toast.warning(`Template enviado com ${serverWarnings.length} aviso(s)`, {
          description: serverWarnings.map(w => w.message).join(' · '),
        });
      } else {
        toast.success('Template enviado com sucesso');
      }
      onSent?.(result.messageId);
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar template');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary-50 flex items-center justify-center">
                  <MessageSquare size={18} className="text-primary-600" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">Enviar Template Aprovado</h2>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Necessário quando a janela de 24h está fechada · destino: {to}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBuilder(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 font-black uppercase tracking-widest text-[10px] transition-colors"
                >
                  <Plus size={13} />
                  Criar Template
                </button>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
                >
                  <X size={18} className="text-slate-500" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {loading && (
                <div className="flex items-center justify-center py-12 text-slate-500">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              )}

              {error && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-2">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-black uppercase tracking-widest text-[10px]">Erro</div>
                    <div>{error}</div>
                  </div>
                </div>
              )}

              {!loading && !error && templates.length === 0 && (
                <div className="p-6 rounded-2xl bg-slate-50 text-slate-600 text-sm text-center">
                  <p className="font-bold mb-1">Nenhum template encontrado.</p>
                  <p className="text-xs text-slate-500">
                    Crie e aguarde aprovação de templates no Business Manager da Meta antes de tentar re-engajar clientes fora da janela de 24h.
                  </p>
                </div>
              )}

              {!loading && !error && templates.length > 0 && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Template disponível ({usableTemplates.length})
                    </label>
                    {usableTemplates.length === 0 ? (
                      <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs">
                        <p className="font-black uppercase tracking-widest text-[10px] mb-1">⚠️ Nenhum template aprovado</p>
                        <p>Todos os templates estão pausados, desativados ou pendentes. Veja a lista abaixo e aja conforme o status.</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {usableTemplates.map(t => {
                          const qScore = ((t.quality_score as any)?.score || (t as any).quality_score || 'UNKNOWN') as QualityScore;
                          const isSelected = selectedName === t.name;
                          return (
                            <button
                              key={`${t.name}_${t.language}`}
                              type="button"
                              onClick={() => setSelectedName(isSelected ? null : t.name)}
                              className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                                isSelected
                                  ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-300'
                                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-bold text-slate-900 truncate">{t.name}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5">{t.language} · {t.category || 'GENERAL'}</div>
                              </div>
                              <TemplateQualityBadge score={qScore} />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {blockedTemplates.length > 0 && (
                    <details className="rounded-2xl border border-slate-200 bg-slate-50">
                      <summary className="px-4 py-3 cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-500 select-none">
                        Templates indisponíveis ({blockedTemplates.length})
                      </summary>
                      <div className="px-4 pb-4 space-y-2">
                        {blockedTemplates.map(t => {
                          const status = (t.status || '').toUpperCase();
                          const reason = (t as any).cache_reason as string | undefined;
                          const lastEvent = (t as any).cache_last_event_at as string | undefined;
                          const tone =
                            status === 'PAUSED' ? 'bg-amber-50 border-amber-200 text-amber-900' :
                            status === 'DISABLED' ? 'bg-red-50 border-red-200 text-red-900' :
                            status === 'REJECTED' ? 'bg-red-50 border-red-200 text-red-900' :
                            status === 'FLAGGED' ? 'bg-amber-50 border-amber-200 text-amber-900' :
                            'bg-slate-100 border-slate-200 text-slate-700';
                          const label =
                            status === 'PAUSED' ? '⏸️ Pausado pela Meta' :
                            status === 'DISABLED' ? '⛔ Desativado' :
                            status === 'REJECTED' ? '❌ Rejeitado' :
                            status === 'FLAGGED' ? '⚠️ Sinalizado' :
                            status === 'PENDING' ? '⏳ Aguardando aprovação' :
                            status;
                          return (
                            <div key={`${t.name}_${t.language}`} className={`p-3 rounded-xl border text-[11px] ${tone}`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-black text-slate-900">{t.name}</span>
                                <span className="font-bold uppercase tracking-widest text-[9px]">{label}</span>
                              </div>
                              <div className="text-[10px] mt-1 opacity-80">
                                {t.language} · {t.category || 'GENERAL'}
                                {lastEvent && ` · ${new Date(lastEvent).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
                              </div>
                              {reason && (
                                <div className="text-[10px] mt-1 opacity-90">
                                  <strong>Motivo:</strong> {reason}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}

                  {selected && (
                    <>
                      {bodyVarCount > 0 && (
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Variáveis do corpo ({bodyVarCount})
                          </label>
                          {bodyVars.map((v, i) => {
                            const varWarnings = detectVariableWarnings(v);
                            return (
                              <div key={i} className="space-y-1">
                                <label className="text-[10px] text-slate-400 font-bold">{`{{${i + 1}}}`}</label>
                                <input
                                  type="text"
                                  value={v}
                                  onChange={e => {
                                    const next = [...bodyVars];
                                    next[i] = e.target.value;
                                    setBodyVars(next);
                                  }}
                                  placeholder={`Valor para {{${i + 1}}}`}
                                  className={`w-full px-4 py-2.5 rounded-xl border outline-none text-sm transition-all ${
                                    varWarnings.length > 0
                                      ? 'border-amber-300 focus:border-amber-500 bg-amber-50/30'
                                      : 'border-slate-200 focus:border-primary-500'
                                  }`}
                                />
                                {varWarnings.map((w, wi) => (
                                  <div
                                    key={wi}
                                    className="flex items-start gap-1.5 px-2 py-1 text-[10px] text-amber-700 leading-snug"
                                  >
                                    <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                                    <span>{w}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pré-visualização</label>
                          {selected && (
                            <TemplateQualityBadge
                              score={((selected.quality_score as any)?.score || (selected as any).quality_score || 'UNKNOWN') as QualityScore}
                              size="sm"
                            />
                          )}
                        </div>
                        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-sm text-slate-800 whitespace-pre-wrap">
                          {livePreview || <span className="text-slate-400 italic">Selecione um template…</span>}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="px-5 py-3 rounded-2xl border border-slate-200 bg-white text-slate-600 font-black uppercase tracking-widest text-[10px] hover:bg-slate-100 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="px-6 py-3 rounded-2xl bg-primary-600 text-white font-black uppercase tracking-widest text-[10px] hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sending ? 'Enviando…' : 'Enviar Template'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

      <TemplateBuilderModal
        isOpen={showBuilder}
        onClose={() => setShowBuilder(false)}
        onSubmitted={() => {
          setShowBuilder(false);
          listMetaTemplates('').then(t => setTemplates(t)).catch(() => {});
        }}
      />
    </>
  );
}
