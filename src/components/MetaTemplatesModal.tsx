import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, AlertCircle, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { listMetaTemplates, sendMetaTemplate, type MetaTemplate } from '../services/supabaseService';

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
    listMetaTemplates('APPROVED')
      .then(t => setTemplates(t))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen]);

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
      toast.success('Template enviado com sucesso');
      onSent?.(result.messageId);
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar template');
    } finally {
      setSending(false);
    }
  };

  return (
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
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-slate-500" />
              </button>
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
                  <p className="font-bold mb-1">Nenhum template aprovado disponível.</p>
                  <p className="text-xs text-slate-500">
                    Crie e aguarde aprovação de templates no Business Manager da Meta antes de tentar re-engajar clientes fora da janela de 24h.
                  </p>
                </div>
              )}

              {!loading && !error && templates.length > 0 && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Template</label>
                    <select
                      value={selectedName || ''}
                      onChange={e => setSelectedName(e.target.value || null)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 outline-none transition-all text-sm bg-white"
                    >
                      <option value="">Selecione um template…</option>
                      {templates.map(t => (
                        <option key={`${t.name}_${t.language}`} value={t.name}>
                          {t.name} ({t.language}) · {t.category || 'GENERAL'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selected && (
                    <>
                      {bodyVarCount > 0 && (
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Variáveis do corpo ({bodyVarCount})
                          </label>
                          {bodyVars.map((v, i) => (
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
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 outline-none text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pré-visualização</label>
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
  );
}
