import React, { useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createClientField,
  deleteClientField,
  type CampoCliente,
  type TipoCampoCliente,
} from '../../services/supabaseService';

/**
 * Gestão dos campos da ficha do cliente — IMPLEMENTAÇÃO ÚNICA.
 *
 * Vive aqui, sem moldura, para ser a mesma em dois lugares: a seção de
 * Configurações e o modal "Campos da ficha" dentro de Clientes. Duas cópias
 * divergiriam — e o campo que aparece na ficha depende desta lista.
 *
 * É controlado de propósito: quem chama já costuma ter os campos carregados
 * (Clientes usa a mesma lista para montar a ficha) e recarrega por `onMudou`.
 */

export const TIPOS_LABEL: Record<TipoCampoCliente, string> = {
  texto: 'Texto',
  numero: 'Número',
  data: 'Data',
  selecao: 'Escolha única',
  multi_selecao: 'Escolha múltipla',
  booleano: 'Sim / Não',
};

const campo =
  'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:border-primary-500 outline-none transition-all';
const rotulo = 'text-[11px] font-medium text-slate-500 mb-1.5 block';

export default function CamposClienteManager({
  campos,
  onMudou,
}: {
  campos: CampoCliente[];
  onMudou: () => void;
}) {
  const [label, setLabel] = useState('');
  const [tipo, setTipo] = useState<TipoCampoCliente>('texto');
  const [opcoesTexto, setOpcoesTexto] = useState('');
  const [salvando, setSalvando] = useState(false);

  const precisaOpcoes = tipo === 'selecao' || tipo === 'multi_selecao';

  const criar = async () => {
    if (!label.trim()) {
      toast.error('Dê um nome ao campo');
      return;
    }
    const opcoes = opcoesTexto.split(/[\n,]/).map(o => o.trim()).filter(Boolean);
    if (precisaOpcoes && opcoes.length === 0) {
      toast.error('Liste as opções, uma por linha');
      return;
    }
    try {
      setSalvando(true);
      await createClientField({ label: label.trim(), tipo, opcoes });
      toast.success(`Campo "${label.trim()}" criado`);
      setLabel('');
      setOpcoesTexto('');
      setTipo('texto');
      onMudou();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (c: CampoCliente) => {
    if (
      !window.confirm(
        `Remover o campo "${c.label}" da ficha? O que já foi preenchido nos clientes continua guardado.`
      )
    )
      return;
    try {
      await deleteClientField(c.id);
      toast.success('Campo removido');
      onMudou();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      {campos.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Campos atuais
          </p>
          {campos.map(c => (
            <div key={c.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-700 truncate">{c.label}</p>
                <p className="text-[11px] text-slate-400">
                  {TIPOS_LABEL[c.tipo]}
                  {c.opcoes?.length ? ` · ${c.opcoes.join(', ')}` : ''}
                </p>
              </div>
              <button
                onClick={() => remover(c)}
                className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Remover campo"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3 pt-2 border-t border-slate-100">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 pt-4">
          Novo campo
        </p>

        <div>
          <label className={rotulo}>Nome</label>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Ex: Plataformas de anúncio"
            className={campo}
          />
        </div>

        <div>
          <label className={rotulo}>Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value as TipoCampoCliente)} className={campo}>
            {Object.entries(TIPOS_LABEL).map(([id, nome]) => (
              <option key={id} value={id}>{nome}</option>
            ))}
          </select>
        </div>

        {precisaOpcoes && (
          <div>
            <label className={rotulo}>Opções — uma por linha</label>
            <textarea
              rows={3}
              value={opcoesTexto}
              onChange={e => setOpcoesTexto(e.target.value)}
              placeholder={'Meta\nGoogle'}
              className={`${campo} resize-none`}
            />
          </div>
        )}

        <button
          onClick={criar}
          disabled={salvando}
          className="w-full py-2.5 bg-primary-600 text-white rounded-xl text-[13px] font-semibold hover:bg-primary-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {salvando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          Adicionar campo
        </button>
      </div>
    </div>
  );
}
