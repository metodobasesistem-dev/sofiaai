/**
 * Pop-up de motivo da perda.
 *
 * Aparece sempre que um lead vai para "Perdido" — pelo seletor da conversa ou
 * arrastando o card no Kanban. Marcar perdido sem registrar o porquê descarta
 * a informação mais útil do funil.
 *
 * Os motivos são cadastrados uma vez e reaproveitados; dá para criar um novo
 * aqui mesmo, para não obrigar o usuário a sair do fluxo no meio do
 * atendimento.
 */
import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Plus, Loader2, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  listLossReasons, createLossReason, deleteLossReason, markLeadAsLost,
  type MotivoPerda,
} from '../services/supabaseService';

interface Props {
  contactId: string;
  nomeContato?: string;
  onClose: () => void;
  /** Chamado depois que a perda foi registrada com sucesso. */
  onConfirmado: () => void;
}

export default function MotivoPerdaModal({ contactId, nomeContato, onClose, onConfirmado }: Props) {
  const [motivos, setMotivos] = useState<MotivoPerda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [novoMotivo, setNovoMotivo] = useState('');
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [gerenciando, setGerenciando] = useState(false);

  const carregar = async () => {
    try {
      setMotivos(await listLossReasons());
    } catch (e: any) {
      toast.error('Erro ao carregar motivos: ' + e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const criar = async () => {
    const nome = novoMotivo.trim();
    if (!nome) return;
    try {
      setCriando(true);
      const criado = await createLossReason(nome);
      setMotivos(prev => [...prev, criado]);
      setSelecionado(criado.id);   // já deixa escolhido: foi para isso que ele criou
      setNovoMotivo('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCriando(false);
    }
  };

  const remover = async (motivo: MotivoPerda) => {
    if (!window.confirm(`Remover "${motivo.nome}" da lista? Os leads perdidos por esse motivo continuam registrados.`)) return;
    try {
      await deleteLossReason(motivo.id);
      setMotivos(prev => prev.filter(m => m.id !== motivo.id));
      if (selecionado === motivo.id) setSelecionado(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const confirmar = async () => {
    try {
      setSalvando(true);
      await markLeadAsLost(contactId, selecionado, observacao);
      toast.success('Lead marcado como perdido');
      onConfirmado();
      onClose();
    } catch (e: any) {
      toast.error('Erro ao marcar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !salvando && onClose()} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center mb-3">
              <XCircle size={22} className="text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Por que foi perdido?</h2>
            <p className="text-[12px] text-slate-500 truncate">
              {nomeContato ? `${nomeContato} sai do funil ativo.` : 'O lead sai do funil ativo.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {carregando ? (
            <div className="py-8 flex justify-center text-slate-400">
              <Loader2 size={26} className="animate-spin" />
            </div>
          ) : (
            <>
              {motivos.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {motivos.map(m => {
                    const ativo = selecionado === m.id;
                    return (
                      <div key={m.id} className="relative group">
                        <button
                          onClick={() => setSelecionado(ativo ? null : m.id)}
                          className={`px-3.5 py-2 rounded-xl border text-[13px] font-semibold transition-all ${
                            ativo
                              ? 'bg-red-50 border-red-200 text-red-700'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {m.nome}
                        </button>
                        {gerenciando && (
                          <button
                            onClick={() => remover(m)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-red-600 flex items-center justify-center shadow-sm"
                            title="Remover motivo"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[13px] text-slate-500">
                  Nenhum motivo cadastrado ainda. Crie o primeiro abaixo — depois é só selecionar.
                </p>
              )}

              <div className="flex items-center gap-2">
                <input
                  value={novoMotivo}
                  onChange={e => setNovoMotivo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') criar(); }}
                  placeholder="Novo motivo (ex: preço, sem retorno…)"
                  className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-700 focus:bg-white focus:border-primary-500 outline-none transition-all"
                />
                <button
                  onClick={criar}
                  disabled={criando || !novoMotivo.trim()}
                  className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-40"
                  title="Adicionar motivo à lista"
                >
                  {criando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                </button>
              </div>

              {motivos.length > 0 && (
                <button
                  onClick={() => setGerenciando(v => !v)}
                  className="text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {gerenciando ? 'Concluir edição da lista' : 'Editar lista de motivos'}
                </button>
              )}

              <div>
                <label className="text-[11px] font-medium text-slate-500 mb-1.5 block">
                  Observação <span className="text-slate-300">(opcional)</span>
                </label>
                <textarea
                  rows={3}
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                  placeholder="Algo que ajude a entender essa perda…"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:border-primary-500 outline-none transition-all resize-none"
                />
              </div>
            </>
          )}
        </div>

        <div className="p-6 bg-slate-50 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={salvando}
            className="flex-1 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl text-[13px] font-semibold hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={salvando}
            className="flex-1 py-3 bg-red-600 text-white rounded-xl text-[13px] font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
            Marcar como perdido
          </button>
        </div>
      </motion.div>
    </div>
  );
}
