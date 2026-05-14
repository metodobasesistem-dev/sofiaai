import { useEffect, useState } from 'react';
import { BarChart3, Loader2, AlertTriangle, TrendingUp } from 'lucide-react';
import { getTemplateMetrics, type TemplateMetric } from '../services/supabaseService';

interface Props {
  /** Only render when expanded to avoid unnecessary requests */
  visible: boolean;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold text-slate-500 w-5 text-right">{value}</span>
    </div>
  );
}

export default function TemplateMetricsPanel({ visible }: Props) {
  const [metrics, setMetrics] = useState<TemplateMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    getTemplateMetrics(30)
      .then(setMetrics)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [visible]);

  if (!visible) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-slate-400">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-600 py-3">
        <AlertTriangle size={13} /> {error}
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <p className="text-[11px] text-slate-400 text-center py-4">
        Nenhum envio registrado nos últimos 30 dias.
      </p>
    );
  }

  const maxTotal = Math.max(...metrics.map(m => m.total), 1);

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_60px_60px_60px_60px] gap-2 px-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Template</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Enviados</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Falhas</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Avisos</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Último</span>
      </div>

      {metrics.map(m => {
        const successRate = m.total > 0 ? Math.round((m.sent / m.total) * 100) : 0;
        const lastDate = m.last_sent
          ? new Date(m.last_sent).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
          : '—';

        return (
          <div
            key={m.template_name}
            className="p-3 rounded-xl bg-white border border-slate-100 space-y-1.5"
          >
            <div className="grid grid-cols-[1fr_60px_60px_60px_60px] gap-2 items-center">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-900 truncate">{m.template_name}</p>
                <p className="text-[9px] text-slate-400">{m.total} total · {successRate}% entregues</p>
              </div>
              <span className="text-[11px] font-black text-emerald-600 text-center">{m.sent}</span>
              <span className={`text-[11px] font-black text-center ${m.failed > 0 ? 'text-red-500' : 'text-slate-300'}`}>{m.failed}</span>
              <span className={`text-[11px] font-black text-center ${m.with_warnings > 0 ? 'text-amber-500' : 'text-slate-300'}`}>{m.with_warnings}</span>
              <span className="text-[9px] text-slate-400 text-center">{lastDate}</span>
            </div>
            <Bar value={m.sent} max={maxTotal} color="bg-emerald-400" />
          </div>
        );
      })}

      <p className="text-[9px] text-slate-300 text-center pt-1">Últimos 30 dias · apenas envios desta conta</p>
    </div>
  );
}
