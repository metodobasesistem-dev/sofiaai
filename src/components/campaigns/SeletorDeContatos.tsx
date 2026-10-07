import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, ChevronLeft, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { standardFetch } from '../../services/supabaseService';
import { etapaPorId, idDaEtapa } from '../../lib/funil';
import {
  FAIXAS,
  contarPorFaixa,
  ehEnviavel,
  estimarDuracao,
  filtrarPorBusca,
  filtrarPorFaixa,
  formatarHa,
  intervaloEntre,
  juntarComConversas,
  juntarComEnvios,
  ocultarRecentes,
  resumirEnvios,
  ordenar,
  paginar,
  paraSelecionado,
  primeirosEnviaveis,
  rotuloDaFaixa,
  type BaseDoBloco,
  type ContatoDoBanco,
  type ContatoSelecionado,
  type ConversaDoBanco,
  type IdDaFaixa,
  type LinhaDeContato,
  type LogDeEnvio,
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
 *
 * Três jeitos de marcar em massa, do mais largo ao mais fino: um bloco por
 * data (e "selecionar este bloco"), o intervalo entre dois cliques (Shift) e
 * os N primeiros da lista.
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

async function carregarLinhas(): Promise<{ linhas: LinhaDeContato[]; enviosIndisponiveis: boolean }> {
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

  const linhas = juntarComConversas(contatos, conversas);

  // O histórico de envios é um complemento: se falhar, a lista continua útil.
  try {
    const res = await standardFetch('/api/v2/campaigns/envios');
    const corpo = await res.json();
    if (!res.ok || !corpo?.success) throw new Error(corpo?.error || `HTTP ${res.status}`);
    const { logs, campanhas } = corpo.data as { logs: LogDeEnvio[]; campanhas: Record<string, string> };
    return { linhas: juntarComEnvios(linhas, resumirEnvios(logs, campanhas)), enviosIndisponiveis: false };
  } catch (err) {
    console.warn('[SeletorDeContatos] Histórico de envios indisponível:', err);
    return { linhas, enviosIndisponiveis: true };
  }
}

/**
 * Cache de um minuto. Voltar do passo 2 para o 1 remonta a lista, e rebuscar
 * milhares de contatos a cada ida e volta seria lento à toa.
 */
let cache: { em: number; linhas: LinhaDeContato[]; enviosIndisponiveis: boolean } | null = null;

const ROTULO_DA_ORDEM: Record<OrdemDaLista, string> = {
  conversa_antiga: 'Última conversa: mais antigas primeiro',
  conversa_recente: 'Última conversa: mais recentes primeiro',
  nome: 'Nome (A a Z)',
};

const ROTULO_DA_BASE: Record<BaseDoBloco, string> = {
  conversa: 'Última conversa',
  resposta: 'Última resposta',
};

/**
 * O que a escolha da base de datas significa para quem vai enviar em dias
 * seguidos. As duas bases se comportam de modo OPOSTO depois de um envio, e é
 * a diferença que mais engana:
 *
 * - conversa: o envio da campanha atualiza a última conversa, então quem
 *   recebeu sai do bloco sozinho — dá para repetir "os 50 primeiros" amanhã
 *   sem mandar para a mesma pessoa.
 * - resposta: o envio não mexe nela, então quem recebeu continua no bloco até
 *   responder — repetir "os 50 primeiros" mandaria para as mesmas pessoas.
 */
const AJUDA_DA_BASE: Record<BaseDoBloco, string> = {
  conversa:
    'Quem recebe uma campanha passa a ter conversa recente e sai do bloco: dá para enviar o mesmo bloco em dias seguidos sem repetir ninguém.',
  resposta:
    'Enviar uma campanha não muda a data da resposta: quem já recebeu continua neste bloco até responder. Para não repetir, desmarque quem já recebeu.',
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

const formatarNumero = (n: number) => n.toLocaleString('pt-BR');

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
  const [base, setBase] = useState<BaseDoBloco>('conversa');
  const [faixa, setFaixa] = useState<IdDaFaixa | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [enviosIndisponiveis, setEnviosIndisponiveis] = useState(false);
  const [ocultar, setOcultar] = useState(false);
  const [diasOcultar, setDiasOcultar] = useState('7');
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set(selecionadosIniciais.map(c => c.id))
  );

  /** O último contato clicado: âncora do Shift + clique. */
  const ancora = useRef<string | null>(null);

  const carregar = useCallback(async (forcar = false) => {
    setErro(null);

    if (!forcar && cache && Date.now() - cache.em < VALIDADE_DO_CACHE_MS) {
      setLinhas(cache.linhas);
      setEnviosIndisponiveis(cache.enviosIndisponiveis);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    try {
      const novas = await carregarLinhas();
      cache = { em: Date.now(), ...novas };
      setLinhas(novas.linhas);
      setEnviosIndisponiveis(novas.enviosIndisponiveis);
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

  const aplicar = (novo: Set<string>) => {
    setSelecionados(novo);
    const lista: ContatoSelecionado[] = [];
    novo.forEach(id => {
      const l = linhasPorId.get(id);
      if (l) lista.push(paraSelecionado(l));
    });
    onChange(lista);
  };

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

  // A busca vale para os números dos blocos também: um bloco com "4" ao lado,
  // que some ao clicar porque a busca o esvaziou, seria uma promessa falsa.
  const dias = Math.floor(Number(diasOcultar));
  const diasValidos = Number.isFinite(dias) && dias >= 1;
  const ocultando = ocultar && diasValidos && !enviosIndisponiveis;
  const visiveis = useMemo(
    () => (ocultando ? ocultarRecentes(linhas, dias, agora) : linhas),
    [linhas, ocultando, dias, agora]
  );
  const ocultosCount = linhas.length - visiveis.length;

  // Ocultar quem recebeu há pouco também desmarca essas pessoas: deixar marcado
  // quem não aparece na lista mandaria para o contato que se quis poupar.
  useEffect(() => {
    if (!ocultando || selecionados.size === 0) return;
    const visiveisIds = new Set(visiveis.map(l => l.id));
    const restantes = new Set([...selecionados].filter(id => visiveisIds.has(id)));
    if (restantes.size !== selecionados.size) aplicar(restantes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocultando, visiveis]);
  const buscadas = useMemo(() => filtrarPorBusca(visiveis, busca), [visiveis, busca]);
  const contagem = useMemo(() => contarPorFaixa(buscadas, base, agora), [buscadas, base, agora]);
  const marcadosPorFaixa = useMemo(
    () => contarPorFaixa(buscadas.filter(l => selecionados.has(l.id)), base, agora),
    [buscadas, selecionados, base, agora]
  );

  const filtradas = useMemo(
    () => ordenar(filtrarPorFaixa(buscadas, faixa, base, agora), ordem),
    [buscadas, faixa, base, agora, ordem]
  );
  const idsDaLista = useMemo(() => filtradas.map(l => l.id), [filtradas]);
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

  /**
   * Clique numa linha. Com Shift, aplica a mesma ação ao intervalo entre este
   * contato e o último clicado — marca o intervalo se este clique marcou,
   * desmarca se desmarcou, como em qualquer lista de e-mail.
   *
   * O intervalo é sobre a lista INTEIRA já filtrada e ordenada (não só as 50
   * linhas à vista), então funciona através das páginas.
   */
  const clicarLinha = (l: LinhaDeContato, comShift: boolean) => {
    if (!ehEnviavel(l)) return;

    const novo = new Set(selecionados);
    const vaiMarcar = !novo.has(l.id);

    let alvo: string[] = [l.id];
    if (comShift && ancora.current && ancora.current !== l.id) {
      const intervalo = intervaloEntre(idsDaLista, ancora.current, l.id);
      // Âncora fora da lista (a busca mudou entre os cliques): não adivinha
      // intervalo, trata como clique simples.
      if (intervalo.length > 0) alvo = intervalo;
    }

    for (const id of alvo) {
      const x = linhasPorId.get(id);
      if (!x || !ehEnviavel(x)) continue; // sem telefone fica de fora do intervalo
      if (vaiMarcar) novo.add(id); else novo.delete(id);
    }

    ancora.current = l.id;
    aplicar(novo);
  };

  const selecionarFiltrados = () => {
    const novo = new Set(selecionados);
    enviaveisFiltradas.forEach(l => novo.add(l.id));
    aplicar(novo);
  };

  const n = Math.floor(Number(quantidade));
  const quantidadeValida = Number.isFinite(n) && n >= 1;
  const marcarPrimeiros = () => {
    if (!quantidadeValida) return;
    const novo = new Set(selecionados);
    primeirosEnviaveis(filtradas, n).forEach(l => novo.add(l.id));
    aplicar(novo);
  };

  const escolherFaixa = (id: IdDaFaixa | null) => {
    setFaixa(id);
    setPagina(1);
  };

  const duracao = estimarDuracao(selecionados.size);
  const duracaoDosPrimeiros = estimarDuracao(Math.min(quantidadeValida ? n : 0, enviaveisFiltradas.length));
  const buscando = busca.trim().length > 0;

  const rotuloDeSelecionar = (() => {
    const q = enviaveisFiltradas.length;
    if (faixa && buscando) return `Selecionar os ${formatarNumero(q)} filtrados`;
    if (faixa) return `Selecionar este bloco (${formatarNumero(q)})`;
    if (buscando) return `Selecionar os ${formatarNumero(q)} da busca`;
    return `Selecionar todos (${formatarNumero(q)})`;
  })();

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

  const chip = (id: IdDaFaixa | null, rotulo: string, total: number, marcados: number) => {
    const ativo = faixa === id;
    const vazio = total === 0 && !ativo;
    return (
      <button
        key={id ?? 'todos'}
        type="button"
        onClick={() => escolherFaixa(ativo ? null : id)}
        disabled={vazio}
        aria-pressed={ativo}
        className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all flex items-center gap-1.5
          ${ativo
            ? 'bg-primary-600 border-primary-600 text-white'
            : vazio
              ? 'bg-white border-slate-100 text-slate-300 cursor-not-allowed'
              : 'bg-white border-slate-200 text-slate-600 hover:border-primary-300 hover:text-primary-700'}`}
      >
        {rotulo}
        <span className={ativo ? 'text-white/80' : 'text-slate-400'}>{formatarNumero(total)}</span>
        {marcados > 0 && (
          <span
            className={`px-1.5 py-0.5 rounded-md text-[9px] font-black leading-none
              ${ativo ? 'bg-white/20 text-white' : 'bg-primary-50 text-primary-700'}`}
            title={`${marcados} marcado${marcados === 1 ? '' : 's'} neste bloco`}
          >
            {formatarNumero(marcados)} ✓
          </span>
        )}
      </button>
    );
  };

  const totalBuscadas = buscadas.length;
  const totalMarcadasBuscadas = buscadas.filter(l => selecionados.has(l.id)).length;

  return (
    <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Escolha quem recebe</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Nenhum contato vem marcado. Marque um a um, por bloco de data, ou use "Selecionar".
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

      {/* Blocos por data */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Blocos por data</p>
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5" role="group" aria-label="Data usada nos blocos">
            {(['conversa', 'resposta'] as BaseDoBloco[]).map(b => (
              <button
                key={b}
                type="button"
                onClick={() => { setBase(b); setPagina(1); }}
                aria-pressed={base === b}
                className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-colors
                  ${base === b ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {ROTULO_DA_BASE[b]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {chip(null, 'Todos', totalBuscadas, totalMarcadasBuscadas)}
          {FAIXAS.map(f => chip(f.id, rotuloDaFaixa(f.id, base), contagem[f.id], marcadosPorFaixa[f.id]))}
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed">{AJUDA_DA_BASE[base]}</p>

        {/* Quem já recebeu campanha há pouco. Protege sobretudo a base "resposta",
            em que o envio não tira ninguém do bloco. */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <label className={`flex items-center gap-2 text-[11px] font-bold ${enviosIndisponiveis ? 'text-slate-300' : 'text-slate-600 cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={ocultar}
              disabled={enviosIndisponiveis}
              onChange={e => setOcultar(e.target.checked)}
              className="w-4 h-4 accent-primary-600"
            />
            Ocultar quem recebeu campanha nos últimos
          </label>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={diasOcultar}
            onChange={e => { setDiasOcultar(e.target.value); setPagina(1); }}
            disabled={enviosIndisponiveis}
            className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center outline-none focus:border-primary-500 disabled:opacity-40"
            aria-label="Quantos dias"
          />
          <span className="text-[11px] font-bold text-slate-600">dias</span>
          {ocultando && (
            <span className="text-[10px] text-slate-400 font-medium">
              {formatarNumero(ocultosCount)} oculto{ocultosCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {enviosIndisponiveis && (
          <p className="text-[10px] text-amber-600 font-medium">
            Não foi possível carregar o histórico de envios; a coluna e o filtro de "já recebeu" estão indisponíveis.
          </p>
        )}
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
          <span className="w-24 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Recebeu campanha</span>
        </div>

        <div className="max-h-[320px] overflow-y-auto custom-scrollbar divide-y divide-slate-50">
          {pag.itens.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-400 font-medium">
              {buscando ? `Nenhum contato com "${busca}"${faixa ? ' neste bloco' : ''}.` : 'Nenhum contato neste bloco.'}
            </p>
          ) : (
            pag.itens.map(l => {
              const marcado = selecionados.has(l.id);
              const enviavel = ehEnviavel(l);
              const etapa = l.isClient ? 'Cliente' : etapaPorId(idDaEtapa(l.statusFunil)).label;

              return (
                // A linha inteira é o alvo do clique, e não um <label>: o
                // Shift + clique precisa do evento de clique com o modificador,
                // e a seleção de texto do navegador (select-none) atrapalharia
                // o intervalo.
                <div
                  key={l.id}
                  onClick={e => clicarLinha(l, e.shiftKey)}
                  className={`flex items-center gap-3 px-3 py-2.5 transition-colors select-none
                    ${enviavel ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
                    ${marcado ? 'bg-primary-50/50' : enviavel ? 'hover:bg-slate-50' : ''}`}
                  title={enviavel ? 'Shift + clique marca o intervalo até o último clicado' : 'Sem telefone válido — não dá para enviar'}
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={!enviavel}
                    onChange={() => { /* o clique é tratado na linha */ }}
                    aria-label={`Marcar ${l.nome}`}
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
                  <span
                    className="w-24 text-right"
                    title={l.ultimoEnvio ? `${l.campanhaDoEnvio} · ${l.enviosTotal} envio${l.enviosTotal === 1 ? '' : 's'} no total` : undefined}
                  >
                    <Data iso={l.ultimoEnvio} agora={agora} />
                  </span>
                </div>
              );
            })
          )}
        </div>

        {pag.totalPaginas > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50/50">
            <span className="text-[10px] font-bold text-slate-400">
              {formatarNumero(filtradas.length)} contatos · página {pag.pagina} de {pag.totalPaginas}
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

      {/* Os N primeiros da lista, na ordem em que ela está. Com um bloco e a
          ordem "mais antigas primeiro", é o jeito de fatiar um bloco em dias. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Marcar os primeiros</span>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={quantidade}
          onChange={e => setQuantidade(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') marcarPrimeiros(); }}
          placeholder="50"
          className="w-20 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-center outline-none focus:border-primary-500 transition-all"
          aria-label="Quantos contatos marcar"
        />
        <button
          type="button"
          onClick={marcarPrimeiros}
          disabled={!quantidadeValida || enviaveisFiltradas.length === 0}
          className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-primary-300 hover:text-primary-700 transition-colors disabled:opacity-40"
        >
          Marcar
        </button>
        {quantidadeValida && enviaveisFiltradas.length > 0 && (
          <span className="text-[10px] text-slate-400 font-medium" title={`Intervalo sorteado entre mensagens: ${duracaoDosPrimeiros.faixa}`}>
            {formatarNumero(Math.min(n, enviaveisFiltradas.length))} contatos levam {duracaoDosPrimeiros.texto}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black text-slate-800">
            {formatarNumero(selecionados.size)} selecionado{selecionados.size === 1 ? '' : 's'}
            <span className="text-slate-400 font-bold"> de {formatarNumero(linhas.length)}</span>
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
            {rotuloDeSelecionar}
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
