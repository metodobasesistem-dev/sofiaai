import React from 'react';
import { Zap, Target, TrendingUp, Users } from 'lucide-react';

export default function LeoDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total de Leads" value="128" icon={<Users className="text-amber-500" />} trend="+12% vs last week" />
        <StatCard title="Qualificados" value="42" icon={<Target className="text-amber-500" />} trend="+5% vs last week" />
        <StatCard title="Taxa de Qualificação" value="32.8%" icon={<Zap className="text-amber-500" />} trend="+2% vs last week" />
        <StatCard title="Custo/Lead Qual." value="R$ 12,50" icon={<TrendingUp className="text-amber-500" />} trend="-R$ 1,20" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-80 flex items-center justify-center text-gray-400">
          Gráfico de Origem (Campanhas)
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-80 flex items-center justify-center text-gray-400">
          Gráfico de Status dos Leads
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, trend }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
          {icon}
        </div>
        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-1 rounded-full">{trend}</span>
      </div>
      <h3 className="text-gray-500 text-sm font-medium">{title}</h3>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
