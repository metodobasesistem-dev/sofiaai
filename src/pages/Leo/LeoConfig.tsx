import React, { useState } from 'react';
import { Save, Info } from 'lucide-react';

export default function LeoConfig({ role }: any) {
  const [score, setScore] = useState(70);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm space-y-8">
        <div>
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            Mensagem Inicial Automática
            <Info size={14} className="text-gray-300" />
          </h3>
          <textarea 
            className="w-full h-32 p-4 bg-gray-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-amber-500/20 placeholder:text-gray-300"
            placeholder="Olá! Sou o Leo, assistente da Zyreo. Notei seu interesse e gostaria de tirar algumas dúvidas rápidas..."
          />
        </div>

        <div>
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            Perguntas de Qualificação
            <Info size={14} className="text-gray-300" />
          </h3>
          <div className="space-y-3">
            <input type="text" className="w-full p-3 bg-gray-50 border-none rounded-xl text-sm" defaultValue="Qual o volume médio de leads atual?" />
            <input type="text" className="w-full p-3 bg-gray-50 border-none rounded-xl text-sm" defaultValue="Já utiliza algum CRM?" />
            <input type="text" className="w-full p-3 bg-gray-50 border-none rounded-xl text-sm" defaultValue="Qual o seu orçamento mensal para Ads?" />
            <button className="text-xs font-bold text-amber-600 hover:text-amber-700">+ Adicionar Pergunta</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="font-bold text-gray-900 mb-4">Score Mínimo para Sofia</h3>
            <div className="space-y-4">
              <input 
                type="range" min="0" max="100" value={score} 
                onChange={(e) => setScore(parseInt(e.target.value))}
                className="w-full accent-amber-500" 
              />
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400">Rígido</span>
                <span className="text-lg font-black text-amber-600">{score}</span>
                <span className="text-xs font-bold text-gray-400">Flexível</span>
              </div>
            </div>
          </div>
          <div>
            <h3 className="font-bold text-gray-900 mb-4">Timeout de Inatividade</h3>
            <div className="flex items-center gap-3">
              <input type="number" className="w-20 p-3 bg-gray-50 border-none rounded-xl text-sm font-bold text-center" defaultValue="24" />
              <span className="text-sm font-medium text-gray-500">Horas</span>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-50 flex justify-end">
          <button className="flex items-center gap-2 px-8 py-3 bg-amber-600 text-white font-bold rounded-2xl hover:bg-amber-700 transition-all shadow-lg shadow-amber-200">
            <Save size={18} /> Salvar Configurações
          </button>
        </div>
      </div>
    </div>
  );
}
