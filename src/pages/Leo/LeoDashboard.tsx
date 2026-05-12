import React, { useState, useEffect } from 'react';
import { Zap, Target, TrendingUp, Users, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function LeoDashboard() {
  const [stats, setStats] = useState({
    totalLeads: 0,
    qualificados: 0,
    taxa: 0,
    custo: 0 // Mocked for now until Ads integration
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('leo_leads').select('id, status');
      if (error) throw error;

      const total = data.length;
      const qualificados = data.filter(l => l.status === 'qualificado' || l.status === 'passado_sofia').length;
      const taxa = total > 0 ? ((qualificados / total) * 100).toFixed(1) : 0;

      setStats({
        totalLeads: total,
        qualificados,
        taxa: Number(taxa),
        custo: 0 // Placeholder
      });
    } catch (error) {
      console.error('Erro ao carregar estatísticas do Leo:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={fetchStats} className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-xl transition-all">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total de Leads" value={loading ? '...' : stats.totalLeads} icon={<Users className="text-amber-500" />} />
        <StatCard title="Qualificados" value={loading ? '...' : stats.qualificados} icon={<Target className="text-amber-500" />} />
        <StatCard title="Taxa de Qualificação" value={loading ? '...' : `${stats.taxa}%`} icon={<Zap className="text-amber-500" />} />
        <StatCard title="Custo/Lead Qual." value="R$ --" icon={<TrendingUp className="text-amber-500" />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm h-80 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <TrendingUp className="mx-auto mb-2 opacity-50" size={32} />
            <p className="text-sm font-bold">Gráfico de Origem</p>
            <p className="text-[10px]">Em breve com Meta Ads API</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm h-80 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Target className="mx-auto mb-2 opacity-50" size={32} />
            <p className="text-sm font-bold">Distribuição de Status</p>
            <p className="text-[10px]">Coletando dados...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, trend }: any) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:border-amber-200 transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center">
          {icon}
        </div>
        {trend && <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-1 rounded-full">{trend}</span>}
      </div>
      <h3 className="text-gray-500 text-[11px] font-black uppercase tracking-wider">{title}</h3>
      <p className="text-3xl font-black text-gray-900 mt-1">{value}</p>
    </div>
  );
}
