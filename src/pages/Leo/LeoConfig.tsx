import React, { useState, useEffect } from 'react';
import { Save, Info, RefreshCw, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

export default function LeoConfig({ role }: any) {
  const isAdmin = role === 'admin';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mensagemInicial, setMensagemInicial] = useState('');
  const [perguntas, setPerguntas] = useState<string[]>([]);
  const [score, setScore] = useState(70);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${session?.access_token || ''}`,
      'Content-Type': 'application/json'
    };
    return fetch(url, { ...options, headers });
  };

  const fetchConfig = async () => {
    try {
      const res = await authFetch('/api/leo/config');
      const data = await res.json();
      setMensagemInicial(data.mensagem_inicial || '');
      setPerguntas(data.perguntas_qualificacao || []);
      setScore(data.score_minimo || 70);
    } catch (error) {
      toast.error('Erro ao buscar configurações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authFetch('/api/leo/config', {
        method: 'POST',
        body: JSON.stringify({
          mensagem_inicial: mensagemInicial,
          perguntas_qualificacao: perguntas.filter(p => p.trim() !== ''),
          score_minimo: score
        })
      });
      if (res.ok) {
        toast.success('Configurações salvas com sucesso!');
      } else {
        throw new Error('Falha ao salvar');
      }
    } catch (error) {
      toast.error('Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const addPergunta = () => {
    setPerguntas([...perguntas, '']);
  };

  const updatePergunta = (index: number, value: string) => {
    const newPerguntas = [...perguntas];
    newPerguntas[index] = value;
    setPerguntas(newPerguntas);
  };

  const removePergunta = (index: number) => {
    const newPerguntas = perguntas.filter((_, i) => i !== index);
    setPerguntas(newPerguntas);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-400">
        <RefreshCw className="animate-spin text-amber-500" size={32} />
        <span className="font-bold animate-pulse">Carregando configurações...</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-8">
        <div>
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            Mensagem Inicial Automática
            <Info size={14} className="text-gray-300" />
          </h3>
          <textarea 
            value={mensagemInicial}
            onChange={(e) => setMensagemInicial(e.target.value)}
            className="w-full h-32 p-4 bg-gray-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-amber-500/20 placeholder:text-gray-300 outline-none"
            placeholder="Olá! Sou o Leo, assistente da Zyreo. Notei seu interesse e gostaria de tirar algumas dúvidas rápidas..."
            disabled={!isAdmin}
          />
        </div>

        <div>
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            Perguntas de Qualificação
            <Info size={14} className="text-gray-300" />
          </h3>
          <div className="space-y-3">
            {perguntas.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input 
                  type="text" 
                  value={p}
                  onChange={(e) => updatePergunta(i, e.target.value)}
                  className="flex-1 p-3 bg-gray-50 border-none rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20" 
                  placeholder="Ex: Já utiliza algum CRM?"
                  disabled={!isAdmin}
                />
                {isAdmin && (
                  <button onClick={() => removePergunta(i)} className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            {isAdmin && (
              <button onClick={addPergunta} className="flex items-center gap-2 px-4 py-2 mt-2 text-xs font-bold text-amber-600 bg-amber-50 rounded-xl hover:bg-amber-100 transition-all">
                <Plus size={14} />
                Adicionar Pergunta
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8">
          <div>
            <h3 className="font-bold text-gray-900 mb-4">Score Mínimo para Transferir para Sofia</h3>
            <div className="space-y-4 max-w-md">
              <input 
                type="range" min="0" max="100" value={score} 
                onChange={(e) => setScore(parseInt(e.target.value))}
                className="w-full accent-amber-500" 
                disabled={!isAdmin}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400">0 (Mais Rígido)</span>
                <span className="text-lg font-black text-amber-600">{score}</span>
                <span className="text-xs font-bold text-gray-400">100 (Mais Flexível)</span>
              </div>
              <p className="text-xs text-gray-400 font-medium text-center">Se a IA der uma nota maior ou igual a essa, o lead será passado adiante para o CRM.</p>
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="pt-6 border-t border-gray-50 flex justify-end">
            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-8 py-3 bg-amber-600 text-white font-bold rounded-2xl hover:bg-amber-700 transition-all shadow-lg shadow-amber-200 disabled:opacity-50"
            >
              {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
              Salvar Configurações
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
