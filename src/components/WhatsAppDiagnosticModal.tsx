import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, AlertCircle, CheckCircle2, Phone, Shield, MessageSquare, Activity, History } from 'lucide-react';
import { getAdminWhatsAppDiagnostic, type WhatsAppDiagnostic } from '../services/supabaseService';

interface WhatsAppDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: string | null;
  targetUserEmail?: string;
}

const qualityColor: Record<string, string> = {
  GREEN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  YELLOW: 'bg-amber-50 text-amber-700 border-amber-200',
  RED: 'bg-red-50 text-red-700 border-red-200',
};

export default function WhatsAppDiagnosticModal({ isOpen, onClose, targetUserId, targetUserEmail }: WhatsAppDiagnosticModalProps) {
  const [data, setData] = useState<WhatsAppDiagnostic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !targetUserId) return;
    setLoading(true);
    setError(null);
    setData(null);
    getAdminWhatsAppDiagnostic(targetUserId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen, targetUserId]);

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
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <Activity size={18} className="text-slate-700" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">Diagnóstico WhatsApp</h2>
                  <p className="text-[11px] text-slate-500 font-medium">{targetUserEmail || targetUserId}</p>
                </div>
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {loading && (
                <div className="flex items-center justify-center py-12 text-slate-500">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              )}

              {error && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-2">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <div>{error}</div>
                </div>
              )}

              {data && (
                <>
                  {/* Profile snapshot */}
                  <Section title="Perfil" icon={<Shield size={14} />}>
                    <Row label="Provider" value={<Badge tone={data.profile.provider === 'meta_official' ? 'emerald' : 'slate'}>{data.profile.provider}</Badge>} />
                    <Row label="Status WhatsApp" value={data.profile.status || '—'} />
                    <Row label="Última atualização" value={fmtDate(data.profile.updated_at)} />
                    <Row label="Mensagens 24h" value={String(data.messages_24h)} />
                    <Row label="Mensagens falhadas (total)" value={
                      <span className={data.failed_messages_total > 0 ? 'text-red-600 font-bold' : ''}>
                        {data.failed_messages_total}
                      </span>
                    } />
                  </Section>

                  {/* Meta-specific */}
                  {data.meta && (
                    <Section title="Meta Cloud API" icon={<Phone size={14} />}>
                      <Row label="Phone Number ID" value={<Mono>{data.meta.phone_id}</Mono>} />
                      <Row label="WABA ID" value={data.meta.waba_id ? <Mono>{data.meta.waba_id}</Mono> : <span className="text-slate-400">—</span>} />
                      <Row label="Access Token" value={data.meta.access_token_set ? <CheckCircle2 size={14} className="text-emerald-600" /> : <X size={14} className="text-red-600" />} />
                      <Row label="App Secret per-tenant" value={data.meta.app_secret_set ? <CheckCircle2 size={14} className="text-emerald-600" /> : <span className="text-slate-400 text-xs">(usa global)</span>} />

                      {data.meta.live && (
                        <>
                          <Row label="Número exibido" value={data.meta.live.display_phone_number || '—'} />
                          <Row label="Nome verificado" value={data.meta.live.verified_name || '—'} />
                          <Row label="Quality rating" value={
                            data.meta.live.quality_rating
                              ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${qualityColor[data.meta.live.quality_rating] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                                  {data.meta.live.quality_rating}
                                </span>
                              : '—'
                          } />
                          <Row label="Verificação" value={data.meta.live.verification_status || '—'} />
                          <Row label="Status do nome" value={data.meta.live.name_status || '—'} />
                        </>
                      )}

                      {data.meta.live_error && (
                        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs">
                          <strong>Probe ao vivo falhou:</strong> {data.meta.live_error}
                        </div>
                      )}

                      {data.meta.last_error && (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                          <strong>Último erro persistido:</strong> {data.meta.last_error}
                          <div className="text-[10px] text-amber-600 mt-0.5">{fmtDate(data.meta.last_error_at)}</div>
                        </div>
                      )}

                      {data.meta.templates && (
                        <Row label="Templates aprovados" value={`${data.meta.templates.approved}${data.meta.templates.total ? ` / ${data.meta.templates.total}` : ''}`} />
                      )}
                    </Section>
                  )}

                  {/* Evolution-specific */}
                  {data.evolution && (
                    <Section title="Evolution API" icon={<MessageSquare size={14} />}>
                      <Row label="Instance ID" value={data.evolution.instance_id ? <Mono>{data.evolution.instance_id}</Mono> : <span className="text-slate-400">—</span>} />
                    </Section>
                  )}

                  {/* Audit log */}
                  <Section title="Histórico (últimas 10 ações)" icon={<History size={14} />}>
                    {data.audit.length === 0 ? (
                      <div className="text-xs text-slate-500 italic">Sem registros.</div>
                    ) : (
                      <div className="space-y-2">
                        {data.audit.map((a, i) => (
                          <div key={i} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-[11px]">
                            <div className="flex items-center justify-between">
                              <span className="font-black text-slate-800 uppercase tracking-wider">{a.action}</span>
                              <span className="text-slate-400">{fmtDate(a.performed_at)}</span>
                            </div>
                            {a.details && Object.keys(a.details).length > 0 && (
                              <pre className="mt-1 text-[10px] text-slate-600 whitespace-pre-wrap break-all">
                                {JSON.stringify(a.details, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={onClose} className="px-5 py-3 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-all">
                Fechar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <h3 className="text-[10px] font-black uppercase tracking-widest">{title}</h3>
      </div>
      <div className="p-4 rounded-2xl border border-slate-100 bg-white space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-500 font-bold">{label}</span>
      <span className="text-slate-900 text-right break-all">{value}</span>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-mono">{children}</code>;
}

function Badge({ tone, children }: { tone: 'emerald' | 'slate'; children: React.ReactNode }) {
  const cls = tone === 'emerald' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200';
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${cls}`}>{children}</span>;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
