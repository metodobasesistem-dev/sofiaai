import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, Pencil, Search, GripVertical, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  listFollowUpTemplates,
  createFollowUpTemplate,
  updateFollowUpTemplate,
  reorderFollowUpTemplates,
  deleteFollowUpTemplate,
  type ModeloDeFollowUp,
} from '../../services/supabaseService';
import { VARIAVEIS_DO_MODELO, renderizarModelo } from '../../lib/mensagemModelo';

/**
 * Modelos de follow-up.
 *
 * Mensagens prontas para o sistema enviar sozinho — lembrete, retorno,
 * reativar quem ficou em silêncio. O que a tela precisa deixar claro é o que
 * as variáveis fazem: o texto vale para todo paciente, e o dado entra na hora
 * do envio.
 */

const campoClasse =
  'w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';
const rotuloClasse = 'block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2';

/** Modal de criar e editar — os dois usam o mesmo formulário. */
function ModeloModal({
  modelo,
  onFechar,
  onSalvo,
}: {
  /** Ausente = criando. */
  modelo?: ModeloDeFollowUp;
  onFechar: () => void;
  onSalvo: (m: ModeloDeFollowUp) => void;
}) {
  const [nome, setNome] = useState(modelo?.nome || '');
  const [conteudo, setConteudo] = useState(modelo?.conteudo || '');
  const [salvando, setSalvando] = useState(false);

  // A prévia usa valores de exemplo para mostrar a regra em ação: o que não
  // tiver dado some, e a pontuação em volta se fecha.
  const previa = useMemo(
    () => renderizarModelo(conteudo, {
      nome: 'Ana',
      nome_completo: 'Ana Souza',
      data: '12/10',
      hora: '14h',
      profissional: 'Dra. Adriana',
    }),
    [conteudo]
  );

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) { toast.error('Dê um nome ao modelo.'); return; }
    if (!conteudo.trim()) { toast.error('Escreva a mensagem.'); return; }

    setSalvando(true);
    try {
      if (modelo) {
        await updateFollowUpTemplate(modelo.id, { nome: nome.trim(), conteudo: conteudo.trim() });
        onSalvo({ ...modelo, nome: nome.trim(), conteudo: conteudo.trim() });
        toast.success('Modelo salvo.');
      } else {
        const novo = await createFollowUpTemplate({ nome: nome.trim(), conteudo: conteudo.trim() });
        onSalvo(novo);
        toast.success('Modelo criado.');
      }
      onFechar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar o modelo');
    } finally {
      setSalvando(false);
    }
  };

  const inserirVariavel = (chave: string) => setConteudo(c => `${c}{${chave}}`);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-start justify-between shrink-0">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{modelo ? 'Editar modelo' : 'Novo modelo'}</h3>
            <p className="text-[12px] text-gray-500">
              O texto vale para todo paciente; as variáveis entram na hora do envio.
            </p>
          </div>
          <button onClick={onFechar} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={enviar} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className={rotuloClasse}>Nome do modelo</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Lembrete Consulta"
              className={campoClasse}
            />
          </div>

          <div>
            <label className={rotuloClasse}>Mensagem</label>
            <textarea
              rows={5}
              value={conteudo}
              onChange={e => setConteudo(e.target.value)}
              placeholder="Olá {nome}. Passando pra lembrar da sua consulta hoje às {hora}."
              className={`${campoClasse} resize-none`}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {VARIAVEIS_DO_MODELO.map(v => (
                <button
                  key={v.chave}
                  type="button"
                  onClick={() => inserirVariavel(v.chave)}
                  title={v.descricao}
                  className="px-2 py-1 rounded-md bg-gray-50 border border-gray-200 text-[11px] font-mono text-gray-600 hover:border-primary-300 hover:text-primary-700 transition-colors"
                >
                  {`{${v.chave}}`}
                </button>
              ))}
            </div>
          </div>

          {conteudo.trim() && (
            <div>
              <label className={rotuloClasse}>Prévia</label>
              <div className="px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-700 whitespace-pre-wrap">
                {previa}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={salvando}
            className="w-full py-2.5 bg-primary-600 text-white rounded-xl text-[13px] font-semibold hover:bg-primary-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {modelo ? 'Salvar alterações' : 'Adicionar modelo'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ModelosFollowUpSection() {
  const [modelos, setModelos] = useState<ModeloDeFollowUp[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<ModeloDeFollowUp | null>(null);
  const [criando, setCriando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  /** Índice sendo arrastado. Só a lista completa pode ser reordenada. */
  const arrastando = useRef<number | null>(null);

  const carregar = async () => {
    try {
      setModelos(await listFollowUpTemplates());
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar os modelos');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const filtrados = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    if (!alvo) return modelos;
    return modelos.filter(
      m => m.nome.toLowerCase().includes(alvo) || m.conteudo.toLowerCase().includes(alvo)
    );
  }, [modelos, busca]);

  const alternarAtivo = async (m: ModeloDeFollowUp) => {
    const valor = !m.ativo;
    // Otimista: é um toggle, responde na hora e volta atrás se falhar.
    setModelos(prev => prev.map(x => (x.id === m.id ? { ...x, ativo: valor } : x)));
    try {
      await updateFollowUpTemplate(m.id, { ativo: valor });
    } catch (err: any) {
      setModelos(prev => prev.map(x => (x.id === m.id ? { ...x, ativo: !valor } : x)));
      toast.error(err.message || 'Erro ao alterar o modelo');
    }
  };

  const remover = async (m: ModeloDeFollowUp) => {
    if (!window.confirm(`Remover o modelo "${m.nome}"?`)) return;
    setRemovendo(m.id);
    try {
      await deleteFollowUpTemplate(m.id);
      setModelos(prev => prev.filter(x => x.id !== m.id));
      toast.success('Modelo removido.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover o modelo');
    } finally {
      setRemovendo(null);
    }
  };

  const soltar = async (destino: number) => {
    const origem = arrastando.current;
    arrastando.current = null;
    if (origem === null || origem === destino) return;

    const nova = [...modelos];
    const [movido] = nova.splice(origem, 1);
    nova.splice(destino, 0, movido);
    setModelos(nova);

    try {
      await reorderFollowUpTemplates(nova.map(m => m.id));
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar a ordem');
      carregar();
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Variáveis disponíveis */}
      <div className="p-5 rounded-2xl bg-primary-50/50 border border-primary-100">
        <h4 className="text-sm font-bold text-gray-900">Variáveis disponíveis</h4>
        <p className="text-[12px] text-gray-600 mt-1 leading-relaxed">
          Escreva no texto e o sistema troca na hora do envio. Se o dado não existir, a variável
          some sem deixar pontuação solta.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {VARIAVEIS_DO_MODELO.map(v => (
            <span
              key={v.chave}
              title={v.descricao}
              className="px-2.5 py-1 rounded-md bg-white border border-primary-100 text-[11px] font-mono text-primary-700"
            >
              {`{${v.chave}}`}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-gray-600 leading-relaxed max-w-2xl">
          Mensagens prontas para <strong>programar envio</strong> — lembrete, retorno, reativar quem
          ficou em silêncio. Um modelo desligado continua cadastrado, mas não é usado em envio nenhum.
        </p>
        <button
          onClick={() => setCriando(true)}
          className="shrink-0 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-[12px] font-black uppercase tracking-wider hover:bg-primary-700 transition-colors flex items-center gap-2"
        >
          <Plus size={16} /> Novo modelo
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Pesquisar nome ou conteúdo..."
          className={`${campoClasse} pl-11`}
        />
      </div>

      {modelos.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">
          Nenhum modelo cadastrado ainda.
        </p>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">
          Nenhum modelo com "{busca}".
        </p>
      ) : (
        <div className="space-y-3">
          {filtrados.map(m => {
            const indice = modelos.indexOf(m);
            // Arrastar reordena a lista inteira. Com a busca ativa, o que está
            // na tela é um recorte: mover ali gravaria uma ordem que o usuário
            // não viu.
            const podeArrastar = !busca.trim();

            return (
              <div
                key={m.id}
                draggable={podeArrastar}
                onDragStart={() => { arrastando.current = indice; }}
                onDragOver={e => { if (podeArrastar) e.preventDefault(); }}
                onDrop={() => podeArrastar && soltar(indice)}
                className={`flex items-start gap-3 p-4 border rounded-2xl transition-all
                  ${m.ativo ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/60'}`}
              >
                <span
                  className={`mt-1 shrink-0 ${podeArrastar ? 'cursor-grab text-gray-300' : 'text-gray-200 cursor-not-allowed'}`}
                  title={podeArrastar ? 'Arraste para reordenar' : 'Limpe a busca para reordenar'}
                >
                  <GripVertical size={16} />
                </span>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-1 rounded-md bg-primary-50 text-primary-700 text-[11px] font-bold">
                      {m.nome}
                    </span>
                    <button
                      onClick={() => alternarAtivo(m)}
                      role="switch"
                      aria-checked={m.ativo}
                      aria-label={`${m.ativo ? 'Desligar' : 'Ligar'} o modelo ${m.nome}`}
                      className={`relative w-10 h-5 rounded-full transition-colors ${m.ativo ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${m.ativo ? 'left-[22px]' : 'left-0.5'}`}
                      />
                    </button>
                  </div>

                  <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${m.ativo ? 'text-gray-700' : 'text-gray-400'}`}>
                    {m.conteudo}
                  </p>
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => setEditando(m)}
                    className="p-2 text-gray-300 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    aria-label={`Editar o modelo ${m.nome}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => remover(m)}
                    disabled={removendo === m.id}
                    className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    aria-label={`Remover o modelo ${m.nome}`}
                  >
                    {removendo === m.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(criando || editando) && (
        <ModeloModal
          modelo={editando || undefined}
          onFechar={() => { setCriando(false); setEditando(null); }}
          onSalvo={m =>
            setModelos(prev => (prev.some(x => x.id === m.id) ? prev.map(x => (x.id === m.id ? m : x)) : [...prev, m]))
          }
        />
      )}
    </div>
  );
}
