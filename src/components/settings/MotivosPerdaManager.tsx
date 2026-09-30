import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  listLossReasons,
  createLossReason,
  deleteLossReason,
  type MotivoPerda,
} from '../../services/supabaseService';

/**
 * Curadoria da lista de motivos de perda.
 *
 * Por que não é o mesmo componente do modal de "marcar como perdido": lá os
 * motivos são BOTÕES DE ESCOLHA — clicar seleciona o motivo daquele lead. Aqui
 * eles são a lista em si. Um componente que servisse aos dois teria um modo
 * "selecionar" e um modo "editar", e pioraria o fluxo de perda para poupar
 * algumas linhas de JSX.
 *
 * O que NÃO se repete é a curadoria: remover motivo acontece só aqui. O modal
 * ficou com o atalho de criar, que é parte do fluxo — quem está perdendo um
 * lead e percebe que falta um motivo não deveria ter que sair do meio do
 * atendimento.
 */
export default function MotivosPerdaManager() {
  const [motivos, setMotivos] = useState<MotivoPerda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState('');
  const [criando, setCriando] = useState(false);

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
    const nome = novo.trim();
    if (!nome) return;
    try {
      setCriando(true);
      const criado = await createLossReason(nome);
      setMotivos(prev => [...prev, criado]);
      setNovo('');
      toast.success('Motivo adicionado.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCriando(false);
    }
  };

  const remover = async (m: MotivoPerda) => {
    if (
      !window.confirm(
        `Remover "${m.nome}" da lista? Os leads perdidos por esse motivo continuam registrados.`
      )
    )
      return;
    try {
      await deleteLossReason(m.id);
      setMotivos(prev => prev.filter(x => x.id !== m.id));
      toast.success('Motivo removido.');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (carregando) {
    return (
      <div className="py-10 flex justify-center text-slate-400">
        <Loader2 size={26} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
        Quando um lead é marcado como perdido, o atendente escolhe um destes motivos. Ter a lista
        pronta é o que transforma "perdemos" em algo que dá para contar depois — e cada ramo perde
        por razões diferentes.
      </p>

      <div className="flex items-center gap-2 max-w-xl">
        <input
          value={novo}
          onChange={e => setNovo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') criar(); }}
          placeholder="Novo motivo (ex: preço, escolheu concorrente, sem retorno…)"
          className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-700 focus:bg-white focus:border-primary-500 outline-none transition-all"
        />
        <button
          onClick={criar}
          disabled={criando || !novo.trim()}
          className="p-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-40"
          title="Adicionar motivo"
        >
          {criando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        </button>
      </div>

      {motivos.length === 0 ? (
        <p className="text-[13px] text-slate-500">
          Nenhum motivo cadastrado. Sem eles, marcar um lead como perdido não registra o porquê.
        </p>
      ) : (
        <div className="space-y-2 max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Motivos cadastrados ({motivos.length})
          </p>
          {motivos.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <p className="flex-1 min-w-0 text-[13px] font-semibold text-slate-700 truncate">{m.nome}</p>
              <button
                onClick={() => remover(m)}
                className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Remover motivo"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
