import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Loader2, Search, CheckCircle2, AlertTriangle, XCircle, Clock, BarChart3, TrendingUp, CloudDownload } from 'lucide-react';
import { getAdminTemplatesOverview, syncAdminTemplates, type AdminTemplatesOverview } from '../services/supabaseService';
import TemplateQualityBadge, { type QualityScore } from './TemplateQualityBadge';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactElement }> = {
  APPROVED:  { label: 'Aprovado',   color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={10} /> },
  PAUSED:    { label: 'Pausado',    color: 'bg-amber-100 text-amber-700 border-amber-200',       icon: <AlertTriangle size={10} /> },
  REJECTED:  { label: 'Rejeitado',  color: 'bg-red-100 text-red-700 border-red-200',             icon: <XCircle size={10} /> },
  DISABLED:  { label: 'Desativado', color: 'bg-red-100 text-red-700 border-red-200',             icon: <XCircle size={10} /> },
  FLAGGED:   { label: 'Sinalizado', color: 'bg-amber-100 text-amber-700 border-amber-200',       icon: <AlertTriangle size={10} /> },
  PENDING:   { label: 'Pendente',   color: 'bg-slate-100 text-slate-600 border-slate-200',       icon: <Clock size={10} /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[(status || '').toUpperCase()] || STATUS_CONFIG.PENDING;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
        <BarChart3 size={18} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-black text-slate-900">{value}</p>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        {sub && <p className="text-[9px] text-slate-300 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

type SortKey = 'tenant_email' | 'template_name' | 'status' | 'sends_30d' | 'warnings_30d';

export default function AdminTemplatesTab() {
  const [data, setData] = useState<AdminTemplatesOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterTenant, setFilterTenant] = useState('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('sends_30d');
  const [sortAsc, setSortAsc] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await getAdminTemplatesOverview());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await syncAdminTemplates();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => { load(); }, []);

  const tenants = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.rows.map(r => r.tenant_email));
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.rows
      .filter(r => {
        const s = (r.status || '').toUpperCase();
        if (filterStatus !== 'ALL' && s !== filterStatus) return false;
        if (filterTenant !== 'ALL' && r.tenant_email !== filterTenant) return false;
        if (search) {
          const q = search.toLowerCase();
          return r.template_name.toLowerCase().includes(q) || r.tenant_email.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        const av = a[sortKey] ?? 0;
        const bv = b[sortKey] ?? 0;
        const cmp = typeof av === 'string' ? (av as string).localeCompare(bv as string) : (av as number) - (bv as number);
        return sortAsc ? cmp : -cmp;
      });
  }, [data, search, filterStatus, filterTenant, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortTh({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th
        className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400 cursor-pointer select-none hover:text-slate-600 whitespace-nowrap"
        onClick={() => toggleSort(k)}
      >
        {label} {active ? (sortAsc ? '↑' : '↓') : ''}
      </th>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Gestão de Templates</h2>
          <p className="text-xs text-slate-400 mt-0.5">Visão consolidada de todos os tenants · status, qualidade e envios 30 dias</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing || loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold transition-colors disabled:opacity-40 border border-violet-200"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <CloudDownload size={14} />}
            {syncing ? 'Sincronizando…' : 'Sincronizar da Meta'}
          </button>
          <button
            onClick={load}
            disabled={loading || syncing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label="Total" value={data.stats.total} color="bg-slate-700" />
          <StatCard label="Aprovados" value={data.stats.approved} color="bg-emerald-500" />
          <StatCard label="Pausados" value={data.stats.paused} color="bg-amber-500" />
          <StatCard label="Rejeitados" value={data.stats.rejected} color="bg-red-500" />
          <StatCard label="Envios 30d" value={data.stats.sends_30d} sub="todos os tenants" color="bg-primary-600" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <XCircle size={16} /> {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar template ou tenant…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm focus:border-primary-400"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white"
        >
          <option value="ALL">Todos os status</option>
          {Object.keys(STATUS_CONFIG).map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
        <select
          value={filterTenant}
          onChange={e => setFilterTenant(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white max-w-[220px]"
        >
          <option value="ALL">Todos os tenants</option>
          {tenants.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading && !data && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      )}

      {!loading && data && filtered.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">
          Nenhum template encontrado com os filtros selecionados.
        </div>
      )}

      {data && filtered.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <SortTh label="Tenant" k="tenant_email" />
                  <SortTh label="Template" k="template_name" />
                  <SortTh label="Status" k="status" />
                  <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">Qualidade</th>
                  <SortTh label="Envios 30d" k="sends_30d" />
                  <SortTh label="Avisos 30d" k="warnings_30d" />
                  <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">Último evento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-3 text-[11px] text-slate-500 font-medium max-w-[140px] truncate" title={r.tenant_email}>
                      {r.tenant_email}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[12px] font-bold text-slate-900">{r.template_name}</div>
                      <div className="text-[10px] text-slate-400">{r.language_code}</div>
                      {r.reason && (
                        <div className="text-[10px] text-red-500 mt-0.5 max-w-[200px] truncate" title={r.reason}>
                          {r.reason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status || 'PENDING'} />
                    </td>
                    <td className="px-4 py-3">
                      {r.quality_score
                        ? <TemplateQualityBadge score={r.quality_score as QualityScore} />
                        : <span className="text-[10px] text-slate-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-black ${r.sends_30d > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                        {r.sends_30d}
                      </span>
                      {r.sent_ok_30d > 0 && r.sends_30d > 0 && (
                        <div className="text-[9px] text-slate-400">{Math.round(r.sent_ok_30d / r.sends_30d * 100)}% ok</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.warnings_30d > 0
                        ? <span className="text-sm font-black text-amber-500 flex items-center gap-0.5 justify-center"><TrendingUp size={11} />{r.warnings_30d}</span>
                        : <span className="text-slate-300 text-sm">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-[10px] text-slate-400 whitespace-nowrap">
                      {r.last_event_at
                        ? new Date(r.last_event_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                        : '—'}
                      {r.last_event && <div className="text-[9px] opacity-60">{r.last_event}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 text-[10px] text-slate-400">
            {filtered.length} template{filtered.length !== 1 ? 's' : ''} · atualizado agora
          </div>
        </div>
      )}
    </div>
  );
}
