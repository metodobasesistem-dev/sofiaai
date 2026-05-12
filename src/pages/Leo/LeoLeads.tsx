import React, { useState, useEffect } from 'react';
import { Search, Filter, MoreHorizontal, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function LeoLeads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const { data, error } = await supabase
        .from('leo_leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error('Erro ao buscar leads do Leo:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (!status) status = 'novo';
    const styles: any = {
      novo: 'bg-gray-100 text-gray-600',
      qualificado: 'bg-amber-100 text-amber-600',
      passado_sofia: 'bg-emerald-100 text-emerald-600',
      convertido: 'bg-primary-100 text-primary-600',
      perdido: 'bg-red-100 text-red-600',
    };
    return <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${styles[status] || styles.novo}`}>{status.replace('_', ' ')}</span>;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-gray-50 flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar leads..." className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchLeads} className="p-2 text-gray-400 hover:bg-gray-50 rounded-xl transition-all">
            <RefreshCw size={16} className={loading ? 'animate-spin text-amber-500' : ''} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-all">
            <Filter size={16} /> Filtros
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left">
          <thead className="bg-gray-50/50 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Lead</th>
              <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Origem/Plataforma</th>
              <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Score</th>
              <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Data</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm font-bold text-gray-400">Carregando leads...</td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm font-bold text-gray-400">Nenhum lead encontrado.</td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50/50 transition-all">
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-gray-900">{lead.nome || lead.instagram_uid}</p>
                    {lead.telefone && <p className="text-[10px] text-gray-400">{lead.telefone}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-[11px] font-medium text-gray-600 uppercase">{lead.origem || 'Orgânico'}</p>
                    <p className="text-[10px] text-gray-400 capitalize">{lead.plataforma || 'Instagram'}</p>
                  </td>
                  <td className="px-6 py-4">{getStatusBadge(lead.status)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 w-20 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${Math.min(lead.score || 0, 100)}%` }}></div>
                      </div>
                      <span className="text-[11px] font-bold text-gray-900">{lead.score || 0}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[11px] text-gray-500 font-medium">
                    {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"><MoreHorizontal size={16} /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
