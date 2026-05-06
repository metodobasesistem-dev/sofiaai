import React from 'react';
import { Search, Filter, MoreHorizontal } from 'lucide-react';

export default function LeoLeads() {
  const leads = [
    { name: 'Ricardo Silva', origin: 'Campanha Black Friday', platform: 'Instagram', status: 'qualificado', score: 85, date: '02/05/2026' },
    { name: 'Ana Oliveira', origin: 'Direct', platform: 'WhatsApp', status: 'novo', score: 45, date: '03/05/2026' },
    { name: 'Carlos Santos', origin: 'Ads Lookalike', platform: 'Instagram', status: 'passado_sofia', score: 92, date: '01/05/2026' },
  ];

  const getStatusBadge = (status: string) => {
    const styles: any = {
      novo: 'bg-gray-100 text-gray-600',
      qualificado: 'bg-amber-100 text-amber-600',
      passado_sofia: 'bg-emerald-100 text-emerald-600',
      convertido: 'bg-primary-100 text-primary-600',
      perdido: 'bg-red-100 text-red-600',
    };
    return <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${styles[status]}`}>{status.replace('_', ' ')}</span>;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-50 flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar leads..." className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20" />
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-all">
            <Filter size={16} /> Filtros
          </button>
        </div>
      </div>
      <table className="w-full text-left">
        <thead className="bg-gray-50/50">
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
          {leads.map((lead, i) => (
            <tr key={i} className="hover:bg-gray-50/50 transition-all">
              <td className="px-6 py-4">
                <p className="text-sm font-bold text-gray-900">{lead.name}</p>
              </td>
              <td className="px-6 py-4">
                <p className="text-[11px] font-medium text-gray-600">{lead.origin}</p>
                <p className="text-[10px] text-gray-400">{lead.platform}</p>
              </td>
              <td className="px-6 py-4">{getStatusBadge(lead.status)}</td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 w-20 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${lead.score}%` }}></div>
                  </div>
                  <span className="text-[11px] font-bold text-gray-900">{lead.score}</span>
                </div>
              </td>
              <td className="px-6 py-4 text-[11px] text-gray-500 font-medium">{lead.date}</td>
              <td className="px-6 py-4 text-right">
                <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><MoreHorizontal size={16} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
