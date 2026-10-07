import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Loader2, ChevronLeft, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { etapaPorId, idDaEtapa } from '../../lib/funil';
import {
  estimarDuracao,
  formatarHa,
  ehEnviavel,
  filtrarPorBusca,
  juntarComConversas,
  ordenar,
  paginar,
  paraSelecionado,
  type ContatoDoBanco,
  type ContatoSelecionado,
  type ConversaDoBanco,
  type LinhaDeContato,
  type OrdemDaLista,
} from '../../lib/selecaoDeContatos';

/**
 * Lista de contatos da campanha, com data da última conversa e seleção.
 *
 * Abre com NINGUÉM marcado. "Todos" era um clique que mandava para a base
 * inteira, e a base inteira são horas de envio (ver o tempo estimado no rodapé):
 * quem quer todos marca todos, mas por ação explícita.
 *
 * O que sai daqui é uma lista de contatos com id, que o servidor já sabe
 * enviar (é o mesmo formato do tipo "upload"). Nada de novo no backend.
 */

const TAMANHO_PAGINA = 50;
const TAMANHO_LOTE = 1000;
const VALIDADE_DO_CACHE_MS = 60_000;

/**
 * Busca TODAS as linhas de uma consulta, lote a lote.
 *
 * O Supabase corta cada consulta em 1.000 linhas por padrão, em silêncio: uma
 * base de 1.300 contatos apareceria com 1.000 e ninguém saberia que faltam
 * 300. A consulta precisa de `order` estável para a paginação não repetir nem
 * pular linhas.
 */
async function buscarTudo<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const todos: T[] = [];
  for (let de = 0; ; de += TAMANHO_LOTE) {
    const { data, error } = await consulta(de, de + TAMANHO_LOTE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    todos.push(...data);
    if (data.length < TAMANHO_LOTE) break;
  }
  return todos;
}

/**
 * As conversas, com a data da última resposta quando a coluna existe.
 *
 * `last_inbound_at` veio de uma migração posterior. Se ela ainda não rodou
 * neste banco, a lista continua funcionando — só sem a coluna "Última
 * resposta" — em vez de quebrar a tela inteira.
 */
async function buscarConversas(userId: string): Promise<ConversaDoBanco[]> {
  try {
    return await buscarTudo<ConversaDoBanco>((de, ate) =>
      supabase
        .from('threads')
        .select('id, last_message_time, last_inbound_at')
        .eq('user_id', userId)
        .order('id')
        .range(de, ate)
    );
  } catch (err: any) {
    if (err?.code === '42703' || String(err?.message || '').includes('last_inbound_at')) {
      const parciais = await buscarTudo<{ id: string; last_message_time: string | null }>((de, ate) =>
        supabase
          .from('threads')
          .select('id, last_message_time')
          .eq('user_id', userId)
          .order('id')
          .range(de, ate)
      );
      return parciais.map(t => ({ ...t, last_inbound_at: null }));
    }
    throw err;
  }
}

async function carregarLinhas(): Promise<LinhaDeContato[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado');

  const [contatos, conversas] = await Promise.all([
    buscarTudo<ContatoDoBanco>((de, ate) =>
      supabase
        .from('contacts')
        .select('id, nome, telefone, status_funil, is_client')
        .eq('user_id', user.id)
        .order('id')
        .range(de, ate)
    ),
    buscarConversas(user.id),
  ]);

  return juntarComConversas(contatos, conversas);
}

/**
 * Cache de um minuto. Voltar do passo 2 para o 1 remonta a lista, e rebuscar
 * milhares de contatos a cada ida e volta seria lento à toa.
 */
let cache: { em: number; linhas: LinhaDeContato[] } | null = null;

const ROTULO_DA_ORDEM: Record<OrdemDaLista, string> = {
  conversa_antiga: 'Última conversa: mais antigas primeiro',
  conversa_recente: 'Última conversa: mais recentes primeiro',
  nome: 'Nome (A a Z)',
};

function Data({ iso, agora }: { iso: string | null; agora: Date }) {
  if (!iso) {
    return <span className="text-[11px] text-slate-300 italic">nunca</span>;
  }
  return (
    <span
      className="text-[11px] font-semibold text-slate-600 whitespace-nowrap"
      title={new Date(iso).toLocaleString('pt-BR')}
    >
      {formatarHa(iso, agora)}
    </span>
  );
}

export default function SeletorDeContatos({
  selecionadosIniciais,
  onChange,
}: {
  selecionadosIniciais: ContatoSelecionado[];
  onChange: (lista: ContatoSelecionado[]) => void;
}) {
  const [linhas, setLinhas] = useState<LinhaDeContato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<OrdemDaLista>('conversa_antiga');
  const [pagina, setPagina] = useState(1);
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set(selecionadosIniciais.map(c => c.id))
  );

  const carregar = useCallback(async (forcar = false) => {
    setErro(null);

    if (!forcar && cache && Date.now() - cache.em < VALIDADE_DO_CACHE_MS) {
      setLinhas(cache.linhas);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    try {
      const novas = await carregarLinhas();
      cache = { em: Date.now(), linhas: novas };
      setLinhas(novas);
    } catch (err: any) {
      console.error('[SeletorDeContatos] Falha ao carregar contatos:', err);
      setErro(err?.message || 'Não foi possível carregar os contatos.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const linhasPorId = useMemo(() => new Map(linhas.map(l => [l.id, l])), [linhas]);
  const agora = useMemo(() => new Date(), [linhas]);

  /**
   * Depois de carregar, descarta da seleção quem não existe mais na base
   * (contato apagado desde que a campanha foi montada) ou perdeu o telefone.
   * Sem isso a campanha levaria um id que o envio não acha.
   */
  useEffect(() => {
    if (linhas.length === 0 || selecionados.size === 0) return;
    const validos = new Set([...selecionados].filter(id => {
      const l = linhasPorId.get(id);
      return l && ehEnviavel(l);
    }));
    if (validos.size !== selecionados.size) aplicar(validos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhasPorId]);

  const aplicar = (novo: Set<string>) => {
    setSelecionados(novo);
    const lista: ContatoSelecionado[] = [];
    novo.forEach(id => {
      const l = linhasPorId.get(id);
      if (l) lista.push(paraSelecionado(l));
    });
    onChange(lista);
  };

  const alternar = (l: LinhaDeContato) => {
    if (!ehEnviavel(l)) return;
    const novo = new Set(selecionados);
    if (novo.has(l.id)) novo.delete(l.id); else novo.add(l.id);
    aplicar(novo);
  };

  const filtradas = useMemo(
    () => ordenar(filtrarPorBusca(linhas, busca), ordem),
    [linhas, busca, ordem]
  );
  const pag = useMemo(() => paginar(filtradas, pagina, TAMANHO_PAGINA), [filtradas, pagina]);

  const enviaveisFiltradas = useMemo(() => filtradas.filter(ehEnviavel), [filtradas]);
  const semTelefone = useMemo(() => linhas.filter(l => !ehEnviavel(l)).length, [linhas]);

  const daPagina = pag.itens.filter(ehEnviavel);
  const todosDaPagina = daPagina.length > 0 && daPagina.every(l => selecionados.has(l.id));
  const algunsDaPagina = daPagina.some(l => selecionados.has(l.id));

  const alternarPagina = () => {
    const novo = new Set(selecionados);
    if (todosDaPagina) daPagina.forEach(l => novo.delete(l.id));
    else daPagina.forEach(l => novo.add(l.id));
    aplicar(novo);
  };

  const selecionarFiltrados = () => {
    const novo = new Set(selecionados);
    enviaveisFiltradas.forEach(l => novo.add(l.id));
    aplicar(novo);
  };

  const duracao = estimarDuracao(selecionados.size);
  const buscando = busca.trim().length > 0;

  if (carregando) {
    return (
      <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-center gap-3 text-slate-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-xs font-bold">Carregando seus contatos…</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="p-5 bg-red-50 border border-red-100 rounded-3xl space-y-3">
        <p className="text-xs font-bold text-red-700 flex items-center gap-2">
          <AlertCircle size={15} /> Não foi possível carregar os contatos.
        </p>
        <p className="text-[11px] text-red-600/80">{erro}</p>
        <button
          type="button"
          onClick={() => carregar(true)}
          className="px-3 py-1.5 bg-white border border-red-200 text-red-700 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-red-50 transition-colors"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (linhas.length === 0) {
    return (
      <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-center">
        <p className="text-xs font-bold text-slate-500">Você ainda não tem contatos.</p>
        <p className="text-[11px] text-slate-400 mt-1">
          Eles aparecem aqui conforme as conversas chegam. Para enviar a números novos, use Manual ou Planilha.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Escolha quem recebe</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Nenhum contato vem marcado. Marque um a um, ou use "Selecionar".
          </p>
        </div>
        <button
          type="button"
          onClick={() => carregar(true)}
          className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-white rounded-lg transition-colors shrink-0"
          title="Atualizar a lista"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={e => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Buscar por nome ou telefone"
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-primary-500 transition-all"
          />
        </div>
        <select
          value={ordem}
          onChange={e => { setOrdem(e.target.value as OrdemDaLista); setPagina(1); }}
          className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 outline-none focus:border-primary-500 transition-all"
          aria-label="Ordenar a lista"
        >
          {(Object.keys(ROTULO_DA_ORDEM) as OrdemDaLista[]).map(o => (
            <option key={o} value={o}>{ROTULO_DA_ORDEM[o]}</option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-3 py-2 bg-slate-50/70 border-b border-slate-100">
          <input
            type="checkbox"
            checked={todosDaPagina}
            ref={el => { if (el) el.indeterminate = !todosDaPagina && algunsDaPagina; }}
            onChange={alternarPagina}
            disabled={daPagina.length === 0}
            className="w-4 h-4 accent-primary-600 cursor-pointer shrink-0"
            aria-label="Marcar todos desta página"
          />
          <span className="flex-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Contato</span>
          <span className="w-20 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Última conversa</span>
          <span className="w-20 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Última resposta</span>
        </div>

        <div className="max-h-[320px] overflow-y-auto custom-scrollbar divide-y divide-slate-50">
          {pag.itens.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-400 font-medium">
              Nenhum contato com "{busca}".
            </p>
          ) : (
            pag.itens.map(l => {
              const marcado = selecionados.has(l.id);
              const enviavel = ehEnviavel(l);
              const etapa = l.isClient ? 'Cliente' : etapaPorId(idDaEtapa(l.statusFunil)).label;

              return (
                <label
                  key={l.id}
                  className={`flex items-center gap-3 px-3 py-2.5 transition-colors
                    ${enviavel ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
                    ${marcado ? 'bg-primary-50/50' : enviavel ? 'hover:bg-slate-50' : ''}`}
                  title={enviavel ? undefined : 'Sem telefone válido — não dá para enviar'}
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={!enviavel}
                    onChange={() => alternar(l)}
                    className="w-4 h-4 accent-primary-600 cursor-pointer shrink-0 disabled:cursor-not-allowed"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-800 truncate">{l.nome}</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      {l.telefone || 'sem telefone'} · {etapa}
                    </p>
                  </div>
                  <span className="w-20 text-right"><Data iso={l.ultimaConversa} agora={agora} /></span>
                  <span className="w-20 text-right"><Data iso={l.ultimaResposta} agora={agora} /></span>
                </label>
              );
            })
          )}
        </div>

        {pag.totalPaginas > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50/50">
            <span className="text-[10px] font-bold text-slate-400">
              {filtradas.length} contatos · página {pag.pagina} de {pag.totalPaginas}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPagina(pag.pagina - 1)}
                disabled={pag.pagina <= 1}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                aria-label="Página anterior"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPagina(pag.pagina + 1)}
                disabled={pag.pagina >= pag.totalPaginas}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                aria-label="Próxima página"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black text-slate-800">
            {selecionados.size} selecionado{selecionados.size === 1 ? '' : 's'}
            <span className="text-slate-400 font-bold"> de {linhas.length}</span>
          </p>
          {selecionados.size > 0 && (
            <p className="text-[10px] text-slate-500 font-medium" title={`Intervalo sorteado entre mensagens: ${duracao.faixa}`}>
              Tempo de envio {duracao.texto}, com intervalo entre as mensagens para proteger seu número.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={selecionarFiltrados}
            disabled={enviaveisFiltradas.length === 0}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-primary-300 hover:text-primary-700 transition-colors disabled:opacity-40"
          >
            {buscando ? `Selecionar os ${enviaveisFiltradas.length} da busca` : `Selecionar todos (${enviaveisFiltradas.length})`}
          </button>
          <button
            type="button"
            onClick={() => aplicar(new Set())}
            disabled={selecionados.size === 0}
            className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40"
          >
            Limpar
          </button>
        </div>
      </div>

      {semTelefone > 0 && (
        <p className="text-[10px] text-slate-400 font-medium">
          {semTelefone} contato{semTelefone === 1 ? ' está' : 's estão'} sem telefone válido e não pode{semTelefone === 1 ? '' : 'm'} ser marcado{semTelefone === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  );
}
