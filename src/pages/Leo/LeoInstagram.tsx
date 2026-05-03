import React from 'react';
import { Instagram, MessageCircle, Clock, CheckCircle2 } from 'lucide-react';

export default function LeoInstagram({ role }: any) {
  const isAdmin = role === 'admin';

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 rounded-2xl flex items-center justify-center text-white">
            <Instagram size={24} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Zyreo Oficial</h3>
            <p className="text-xs text-gray-400">@zyreo.ai • Conectado via Instagram Graph API</p>
          </div>
        </div>
        {isAdmin && (
          <button className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all">
            Alterar Conta
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle size={18} className="text-amber-500" />
              <h4 className="font-bold text-sm text-gray-900">Últimos Comentários Monitorados</h4>
            </div>
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> MONITORANDO
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            <CommentItem user="marcos_dev" text="Quero saber mais sobre o sistema!" time="5 min atrás" />
            <CommentItem user="julia_mkt" text="Como faço para contratar?" time="12 min atrás" />
            <CommentItem user="empresa_x" text="Tenho interesse no agente de IA." time="45 min atrás" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex items-center gap-2">
            <Clock size={18} className="text-amber-500" />
            <h4 className="font-bold text-sm text-gray-900">DMs Enviadas pelo Leo</h4>
          </div>
          <div className="divide-y divide-gray-50">
            <DMItem user="marcos_dev" status="Entregue" time="4 min atrás" />
            <DMItem user="julia_mkt" status="Respondido" time="10 min atrás" />
            <DMItem user="empresa_x" status="Entregue" time="44 min atrás" />
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentItem({ user, text, time }: any) {
  return (
    <div className="p-4 hover:bg-gray-50 transition-all">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-gray-900">@{user}</span>
        <span className="text-[10px] text-gray-400 font-medium">{time}</span>
      </div>
      <p className="text-xs text-gray-600 line-clamp-1">{text}</p>
    </div>
  );
}

function DMItem({ user, status, time }: any) {
  return (
    <div className="p-4 hover:bg-gray-50 transition-all flex items-center justify-between">
      <div>
        <p className="text-xs font-bold text-gray-900">Para @{user}</p>
        <p className="text-[10px] text-gray-400 font-medium">{time}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <CheckCircle2 size={12} className={status === 'Respondido' ? 'text-blue-500' : 'text-emerald-500'} />
        <span className={`text-[10px] font-bold uppercase ${status === 'Respondido' ? 'text-blue-500' : 'text-emerald-500'}`}>{status}</span>
      </div>
    </div>
  );
}
