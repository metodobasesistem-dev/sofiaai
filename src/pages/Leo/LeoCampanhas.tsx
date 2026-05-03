import React from 'react';
import { ExternalLink, DollarSign, Users } from 'lucide-react';

export default function LeoCampanhas() {
  const campaigns = [
    { name: 'Geração de Demanda - Abril', status: 'Active', budget: 1500, spend: 840, leads: 62, cpl: 13.54 },
    { name: 'Lookalike High LTV', status: 'Active', budget: 3000, spend: 1200, leads: 45, cpl: 26.66 },
    { name: 'Retargeting Website', status: 'Paused', budget: 500, spend: 500, leads: 12, cpl: 41.66 },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Campanhas Meta Ads</h2>
          <button className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-bold rounded-xl hover:bg-amber-700 transition-all">
            Sincronizar Meta
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Campanha</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Orçamento</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Gasto</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Leads</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider">CPL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {campaigns.map((c, i) => (
                <tr key={i} className="hover:bg-gray-50/50 transition-all">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{c.name}</span>
                      <ExternalLink size={12} className="text-gray-300" />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.status === 'Active' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">R$ {c.budget.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">R$ {c.spend.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">{c.leads}</td>
                  <td className="px-6 py-4 text-sm font-bold text-amber-600">R$ {c.cpl.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
