/**
 * Clientes — a carteira do inquilino.
 *
 * Um contato é LEAD ou CLIENTE, nunca os dois: quem é promovido some da tela
 * de Contatos e aparece aqui, com a ficha comercial. A promoção é manual.
 *
 * Não confundir com a gestão de inquilinos da plataforma (Painel Admin): lá
 * são as empresas que contratam o sistema, aqui são os clientes de cada uma.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Users, Phone, Mail, Instagram, Globe, Loader2, X, RefreshCw,
  Calendar, MessageSquare, TrendingUp, Save, UserMinus, Download, Wallet, Plus, Trophy, Trash2, SlidersHorizontal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  listClients, getClient, updateClient, demoteClient, createClient,
  listClientFields, createClientField, deleteClientField,
  applyRateChange, deleteContractPeriod, type VigenciaContrato,
  type CampoCliente, type TipoCampoCliente,
  type ClientRecord, type ClientProfile, type ClientsSummary,
} from '../services/supabaseService';
import { toast } from 'sonner';

// ── Helpers ───────────────────────────────────────────────────────────────

const formatPhone = (phone?: string | null) => {
  if (!phone) return '—';
  const p = phone.replace(/\D/g, '');
  if (p.length === 13) return `+${p.slice(0, 2)} (${p.slice(2, 4)}) ${p.slice(4, 9)}-${p.slice(9)}`;
  if (p.length === 12) return `+${p.slice(0, 2)} (${p.slice(2, 4)}) ${p.slice(4, 8)}-${p.slice(8)}`;
  if (p.length === 11) return `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}`;
  return phone;
};

const formatDate = (date?: any) => {
  if (!date) return '—';
  const d = new Date(date);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

const formatMoney = (valor?: number | null, moeda = 'BRL') => {
  if (valor === null || valor === undefined || valor === '' as any) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(Number(valor));
};

const TIPOS_LABEL: Record<TipoCampoCliente, string> = {
  texto: 'Texto',
  numero: 'Número',
  data: 'Data',
  selecao: 'Escolha única',
  multi_selecao: 'Escolha múltipla',
  booleano: 'Sim / Não',
};

const CICLOS: Array<{ id: NonNullable<ClientProfile['ciclo']>; label: string }> = [
  { id: 'mensal', label: 'Mensal' },
  { id: 'anual', label: 'Anual' },
  { id: 'unico', label: 'Pagamento único' },
];

const STATUS: Array<{ id: NonNullable<ClientProfile['status_contrato']>; label: string; cor: string }> = [
  { id: 'ativo', label: 'Ativo', cor: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  { id: 'pausado', label: 'Pausado', cor: 'bg-amber-50 text-amber-600 border-amber-100' },
  { id: 'cancelado', label: 'Cancelado', cor: 'bg-slate-100 text-slate-500 border-slate-200' },
];

const getAvatarColor = (seed: string) => {
  const cores = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#16a34a', '#0891b2', '#4f46e5'];
  const i = seed.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return cores[i % cores.length];
};

const iniciais = (nome: string) => {
  const partes = (nome || '?').trim().split(/\s+/);
  return (partes.length >= 2 ? partes[0][0] + partes[1][0] : (nome || '?').slice(0, 2)).toUpperCase();
};

// ── Campos personalizados ─────────────────────────────────────────────────

/** Um campo da ficha, renderizado conforme o tipo que o usuário escolheu. */
function CampoPersonalizado({
  campo,
  valor,
  onChange,
}: {
  campo: CampoCliente;
  valor: any;
  onChange: (v: any) => void;
}) {
  const classeInput =
    'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all';

  if (campo.tipo === 'multi_selecao') {
    const marcados: string[] = Array.isArray(valor) ? valor : [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {campo.opcoes.map(opcao => {
          const ativo = marcados.includes(opcao);
          return (
            <button
              key={opcao}
              type="button"
              onClick={() => onChange(ativo ? marcados.filter(o => o !== opcao) : [...marcados, opcao])}
              className={`px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition-all ${
                ativo
                  ? 'bg-primary-50 border-primary-200 text-primary-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              {opcao}
            </button>
          );
        })}
      </div>
    );
  }

  if (campo.tipo === 'selecao') {
    return (
      <select value={valor ?? ''} onChange={e => onChange(e.target.value)} className={classeInput}>
        <option value="">Não informado</option>
        {campo.opcoes.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  if (campo.tipo === 'booleano') {
    return (
      <button
        type="button"
        onClick={() => onChange(!valor)}
        className={`px-3.5 py-2 rounded-xl border text-[12px] font-bold transition-all ${
          valor
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-white border-slate-200 text-slate-400'
        }`}
      >
        {valor ? 'Sim' : 'Não'}
      </button>
    );
  }

  return (
    <input
      type={campo.tipo === 'numero' ? 'number' : campo.tipo === 'data' ? 'date' : 'text'}
      value={valor ?? ''}
      onChange={e => onChange(campo.tipo === 'numero' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
      className={classeInput}
    />
  );
}

/** Criação e remoção dos campos do ramo do usuário. */
function GerenciarCamposModal({
  campos,
  onClose,
  onMudou,
}: {
  campos: CampoCliente[];
  onClose: () => void;
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

  const remover = async (campo: CampoCliente) => {
    if (!window.confirm(`Remover o campo "${campo.label}" da ficha? O que já foi preenchido nos clientes continua guardado.`)) return;
    try {
      await deleteClientField(campo.id);
      toast.success('Campo removido');
      onMudou();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Campos da ficha</h2>
            <p className="text-[12px] text-slate-500">
              Crie os campos que fazem sentido no seu ramo. Eles aparecem na ficha de todos os clientes.
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {campos.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Campos atuais</p>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 pt-4">Novo campo</p>

            <div>
              <label className="text-[11px] font-medium text-slate-500 mb-1.5 block">Nome</label>
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Ex: Plataformas de anúncio"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:border-primary-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 mb-1.5 block">Tipo</label>
              <select
                value={tipo}
                onChange={e => setTipo(e.target.value as TipoCampoCliente)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:border-primary-500 outline-none transition-all"
              >
                {Object.entries(TIPOS_LABEL).map(([id, nome]) => (
                  <option key={id} value={id}>{nome}</option>
                ))}
              </select>
            </div>

            {precisaOpcoes && (
              <div>
                <label className="text-[11px] font-medium text-slate-500 mb-1.5 block">
                  Opções — uma por linha
                </label>
                <textarea
                  rows={3}
                  value={opcoesTexto}
                  onChange={e => setOpcoesTexto(e.target.value)}
                  placeholder={'Meta\nGoogle'}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:border-primary-500 outline-none transition-all resize-none"
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
      </motion.div>
    </div>
  );
}


/**
 * Reajuste e histórico de valores do contrato.
 *
 * O valor não é editado no lugar: cada mudança abre uma faixa nova com data
 * de início. É isso que mantém o LTV do passado no preço da época — e permite
 * agendar o aumento para o mês que vem sem mexer em nada hoje.
 */
function ValorDoContrato({
  contactId,
  vigencias,
  fallback,
  onMudou,
}: {
  contactId: string;
  vigencias: VigenciaContrato[];
  /** Ficha, para quando ainda não há vigência registrada. */
  fallback: { mensalidade?: number | null; ciclo?: string | null; moeda?: string | null; cliente_desde?: string | null } | null;
  onMudou: () => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [valor, setValor] = useState('');
  const [inicio, setInicio] = useState(() => {
    // Padrão: primeiro dia do mês que vem, que é quando reajuste costuma valer
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 1, 12).toISOString().slice(0, 10);
  });
  const [ciclo, setCiclo] = useState('mensal');
  const [salvando, setSalvando] = useState(false);

  const hoje = new Date().toISOString().slice(0, 10);
  // Só o essencial para exibir: o fallback da ficha não é uma vigência de
  // verdade (não tem id nem faixa), mas mostra o mesmo valor na tela.
  const vigente: { valor: number; ciclo?: string | null; moeda?: string | null; inicio: string } | null =
    vigencias.find(v => !v.fim && v.inicio <= hoje) ||
    (fallback?.mensalidade
      ? {
          valor: Number(fallback.mensalidade),
          ciclo: fallback.ciclo || 'mensal',
          moeda: fallback.moeda,
          inicio: fallback.cliente_desde || '',
        }
      : null);
  const agendadas = vigencias.filter(v => v.inicio > hoje);
  const passadas = vigencias.filter(v => v.fim && v.fim < hoje);

  const registrar = async () => {
    const n = Number(valor);
    if (!n || n <= 0) {
      toast.error('Informe o novo valor');
      return;
    }
    try {
      setSalvando(true);
      const { aplicado } = await applyRateChange(contactId, {
        valor: n,
        ciclo,
        inicio,
      });
      toast.success(
        aplicado ? 'Novo valor em vigor' : 'Reajuste agendado',
        { description: aplicado ? undefined : `Passa a valer em ${formatDate(inicio)}.` }
      );
      setValor('');
      setAbrindo(false);
      onMudou();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (v: VigenciaContrato) => {
    if (!window.confirm(`Cancelar o reajuste para ${formatMoney(v.valor)} previsto para ${formatDate(v.inicio)}?`)) return;
    try {
      await deleteContractPeriod(contactId, v.id);
      toast.success('Reajuste cancelado');
      onMudou();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Valor vigente</p>
          <p className="text-xl font-semibold text-slate-900 tracking-tight">
            {vigente ? formatMoney(vigente.valor, vigente.moeda) : '—'}
            {vigente && (
              <span className="text-[12px] font-normal text-slate-400 ml-2">
                {CICLOS.find(c => c.id === vigente.ciclo)?.label.toLowerCase()}
                {vigente.inicio ? ` · desde ${formatDate(vigente.inicio)}` : ''}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => {
            // Reajuste raramente muda o ciclo: parte do que já está valendo.
            if (!abrindo) setCiclo(vigente?.ciclo || 'mensal');
            setAbrindo(v => !v);
          }}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
        >
          {abrindo ? 'Cancelar' : vigente ? 'Reajustar' : 'Definir valor'}
        </button>
      </div>

      {abrindo && (
        <div className="p-3 bg-slate-50 rounded-xl space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Novo valor</label>
              <input
                type="number"
                value={valor}
                onChange={e => setValor(e.target.value)}
                placeholder="0,00"
                autoFocus
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:border-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">A partir de</label>
              <input
                type="date"
                value={inicio}
                onChange={e => setInicio(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:border-primary-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Ciclo</label>
            <select
              value={ciclo}
              onChange={e => setCiclo(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:border-primary-500 outline-none"
            >
              {CICLOS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-slate-500">
            O que já passou continua valendo {vigente ? formatMoney(vigente.valor, vigente.moeda) : 'o valor anterior'} — o LTV do histórico não muda.
          </p>
          <button
            onClick={registrar}
            disabled={salvando}
            className="w-full py-2 bg-slate-900 text-white rounded-lg text-[12px] font-semibold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Registrar reajuste
          </button>
        </div>
      )}

      {agendadas.length > 0 && (
        <div className="space-y-1.5">
          {agendadas.map(v => (
            <div key={v.id} className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
              <Calendar size={13} className="text-amber-600 shrink-0" />
              <p className="text-[12px] text-amber-800 flex-1">
                <span className="font-semibold">{formatMoney(v.valor, v.moeda)}</span> a partir de {formatDate(v.inicio)}
              </p>
              <button
                onClick={() => remover(v)}
                className="text-amber-600 hover:text-red-600 transition-colors shrink-0"
                title="Cancelar este reajuste"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {passadas.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Valores anteriores</p>
          <div className="space-y-1">
            {passadas.map(v => (
              <p key={v.id} className="text-[11px] text-slate-500">
                {formatMoney(v.valor, v.moeda)} — {formatDate(v.inicio)} a {formatDate(v.fim)}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Ficha lateral ─────────────────────────────────────────────────────────

function FichaCliente({
  contactId,
  campos,
  onClose,
  onChanged,
}: {
  contactId: string;
  campos: CampoCliente[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [cliente, setCliente] = useState<ClientRecord | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Recarregar precisa ser chamável de fora do efeito: depois de um reajuste
  // a ficha inteira muda (valor vigente, LTV, histórico) e o form em memória
  // ficaria com o valor velho, que o próximo "Salvar" gravaria de volta.
  const carregar = useCallback(() => {
    setCarregando(true);
    return getClient(contactId)
      .then(dados => {
        setCliente(dados);
        setForm({
          nome: dados.nome || '',
          telefone: dados.telefone || '',
          email: dados.email || '',
          instagram: dados.instagram || '',
          website: dados.website || '',
          mensalidade: dados.profile?.mensalidade ?? '',
          ciclo: dados.profile?.ciclo || 'mensal',
          status_contrato: dados.profile?.status_contrato || 'ativo',
          cliente_desde: dados.profile?.cliente_desde || '',
          observacoes: dados.profile?.observacoes || '',
          custom_fields: dados.profile?.custom_fields || {},
        });
      })
      .catch(e => toast.error('Erro ao carregar ficha: ' + e.message))
      .finally(() => setCarregando(false));
  }, [contactId]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async () => {
    try {
      setSalvando(true);
      await updateClient(contactId, {
        ...form,
        // input vazio vira null, não 0 — "sem valor definido" é diferente de
        // "cobra zero", e o card de receita conta os dois de forma diferente.
        mensalidade: form.mensalidade === '' ? null : Number(form.mensalidade),
        cliente_desde: form.cliente_desde || undefined,
      } as any);
      toast.success('Ficha salva');
      onChanged();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const removerDaCarteira = async () => {
    if (!window.confirm(`Devolver ${cliente?.nome} para a lista de leads? A ficha é preservada.`)) return;
    try {
      await demoteClient(contactId);
      toast.success('Cliente devolvido para os leads');
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
  };

  const campo = (label: string, chave: string, icone: React.ReactNode, tipo = 'text', placeholder = '') => (
    <div>
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-1.5">
        {icone} {label}
      </label>
      <input
        type={tipo}
        value={form[chave] ?? ''}
        placeholder={placeholder}
        onChange={e => setForm(f => ({ ...f, [chave]: e.target.value }))}
        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all"
      />
    </div>
  );

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200"
    >
      <div className="p-6 border-b border-slate-100 flex items-start justify-between shrink-0">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">Ficha do cliente</h2>
          <p className="text-[12px] text-slate-500 font-medium">
            {cliente ? `Cliente desde ${formatDate(cliente.profile?.cliente_desde || cliente.data_criacao)}` : 'Carregando…'}
          </p>
        </div>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
          <X size={20} />
        </button>
      </div>

      {carregando ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <Loader2 size={32} className="animate-spin" />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* LTV contratado — o que este cliente vale somando cada faixa de
                preço pelo tempo em que ela valeu. Reajuste não reescreve o
                passado, então o número aqui é histórico, não projeção. */}
            <div className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-5 text-white shadow-lg shadow-primary-200">
              <div className="flex items-center gap-2 mb-1 opacity-90">
                <Trophy size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">LTV contratado</span>
              </div>
              <p className="text-3xl font-black tracking-tight">{formatMoney(cliente?.ltv || 0)}</p>
              <p className="text-[11px] font-medium opacity-80 mt-1">
                {cliente?.meses
                  ? `${cliente.meses} ${cliente.meses === 1 ? 'mês' : 'meses'} de casa`
                  : 'Ainda no primeiro mês'}
                {cliente?.profile?.encerrado_em ? ` · encerrado em ${formatDate(cliente.profile.encerrado_em)}` : ''}
              </p>

              {/* O que de fato entrou em caixa. Só conta o que está lançado no
                  financeiro, então costuma ser menor que o contratado — é essa
                  diferença que mostra atraso ou lançamento faltando. */}
              {typeof cliente?.ltv_recebido === 'number' && cliente.ltv_recebido > 0 && (
                <div className="mt-4 pt-3 border-t border-white/20 flex items-baseline justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Recebido</span>
                  <span className="text-lg font-bold tabular-nums">{formatMoney(cliente.ltv_recebido)}</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contato</p>
              {campo('Nome', 'nome', <Users size={11} />)}
              {campo('WhatsApp', 'telefone', <Phone size={11} />, 'text', '5532999999999')}
              {campo('E-mail', 'email', <Mail size={11} />, 'email', 'cliente@email.com')}
              {campo('Instagram', 'instagram', <Instagram size={11} />, 'text', '@perfil')}
              {campo('Site', 'website', <Globe size={11} />, 'text', 'https://')}
            </div>

            <div className="space-y-4 pt-2 border-t border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 pt-4">Comercial</p>
              <ValorDoContrato
                contactId={contactId}
                vigencias={cliente?.vigencias || []}
                fallback={cliente?.profile || null}
                onMudou={() => { carregar(); onChanged(); }}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Situação</label>
                  <select
                    value={form.status_contrato}
                    onChange={e => setForm(f => ({ ...f, status_contrato: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:border-primary-500 outline-none transition-all"
                  >
                    {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                {campo('Cliente desde', 'cliente_desde', <Calendar size={11} />, 'date')}
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Observações</label>
                <textarea
                  rows={4}
                  value={form.observacoes ?? ''}
                  onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:border-primary-500 outline-none transition-all resize-none"
                />
              </div>
            </div>

            {campos.length > 0 && (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 pt-4">
                  Informações do seu ramo
                </p>
                {campos.map(campo => (
                  <div key={campo.id}>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                      {campo.label}
                    </label>
                    <CampoPersonalizado
                      campo={campo}
                      valor={(form.custom_fields || {})[campo.chave]}
                      onChange={v =>
                        setForm(f => ({
                          ...f,
                          custom_fields: { ...(f.custom_fields || {}), [campo.chave]: v },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {cliente?.appointments && cliente.appointments.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 pt-4 mb-3">
                  Histórico de agendamentos
                </p>
                <div className="space-y-2">
                  {cliente.appointments.slice(0, 8).map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                      <Calendar size={14} className="text-slate-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-bold text-slate-700">
                          {formatDate(a.data)} {a.time ? `às ${a.time}` : ''}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {a.summary || a.modalidade || 'Sem descrição'}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">{a.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={removerDaCarteira}
              className="w-full py-3 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all flex items-center justify-center gap-2 border border-slate-200"
            >
              <UserMinus size={14} /> Devolver para leads
            </button>
          </div>

          <div className="p-6 border-t border-slate-100 shrink-0">
            <button
              onClick={salvar}
              disabled={salvando}
              className="w-full py-3.5 bg-primary-600 text-white rounded-xl font-black uppercase tracking-widest text-[11px] hover:bg-primary-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Salvar ficha
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}

// ── Cadastro manual ───────────────────────────────────────────────────────

function NovoClienteModal({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const [form, setForm] = useState<Record<string, any>>({
    nome: '', telefone: '', email: '', instagram: '', website: '',
    mensalidade: '', ciclo: 'mensal', status_contrato: 'ativo', observacoes: '',
  });
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!form.nome.trim()) {
      toast.error('Informe o nome do cliente');
      return;
    }
    try {
      setSalvando(true);
      await createClient({
        ...form,
        nome: form.nome.trim(),
        // vazio vira null: "sem valor definido" é diferente de "cobra zero"
        mensalidade: form.mensalidade === '' ? null : Number(form.mensalidade),
      } as any);
      toast.success(`${form.nome} adicionado à carteira`);
      onCriado();
      onClose();
    } catch (e: any) {
      toast.error('Erro ao cadastrar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const campo = (label: string, chave: string, icone: React.ReactNode, tipo = 'text', placeholder = '') => (
    <div>
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-1.5">
        {icone} {label}
      </label>
      <input
        type={tipo}
        value={form[chave] ?? ''}
        placeholder={placeholder}
        onChange={e => setForm(f => ({ ...f, [chave]: e.target.value }))}
        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !salvando && onClose()} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">Novo cliente</h2>
            <p className="text-[12px] text-slate-500 font-medium">
              Entra direto na carteira, sem passar pelos leads.
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="space-y-4">
            {campo('Nome *', 'nome', <Users size={11} />, 'text', 'Nome do cliente ou empresa')}
            {campo('WhatsApp', 'telefone', <Phone size={11} />, 'text', '32999999999')}
            <p className="text-[11px] text-slate-400 -mt-2">
              Com o WhatsApp preenchido, o cadastro se junta à conversa já existente desse número.
            </p>
            {campo('E-mail', 'email', <Mail size={11} />, 'email', 'cliente@email.com')}
            <div className="grid grid-cols-2 gap-3">
              {campo('Instagram', 'instagram', <Instagram size={11} />, 'text', '@perfil')}
              {campo('Site', 'website', <Globe size={11} />, 'text', 'https://')}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="grid grid-cols-2 gap-3">
              {campo('Mensalidade', 'mensalidade', <Wallet size={11} />, 'number', '0,00')}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Ciclo</label>
                <select
                  value={form.ciclo}
                  onChange={e => setForm(f => ({ ...f, ciclo: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:border-primary-500 outline-none transition-all"
                >
                  {CICLOS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Observações</label>
              <textarea
                rows={3}
                value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:bg-white focus:border-primary-500 outline-none transition-all resize-none"
              />
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={salvando}
            className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-500 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-100 transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !form.nome.trim()}
            className="flex-1 py-3.5 bg-primary-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-primary-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400"
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Adicionar
          </button>
        </div>
      </motion.div>
    </div>
  );
}


// ── Tela ──────────────────────────────────────────────────────────────────

export default function Clients() {
  const [clientes, setClientes] = useState<ClientRecord[]>([]);
  const [resumo, setResumo] = useState<ClientsSummary>({ total: 0, ativos: 0, mrr: 0, ticket_medio: 0, ltv_total: 0, ltv_medio: 0 });
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [campos, setCampos] = useState<CampoCliente[]>([]);
  const [camposAberto, setCamposAberto] = useState(false);

  const carregar = async () => {
    try {
      setCarregando(true);
      const { data, summary } = await listClients();
      setClientes(data);
      setResumo(summary);
    } catch (e: any) {
      toast.error('Erro ao carregar clientes: ' + e.message);
    } finally {
      setCarregando(false);
    }
  };

  const carregarCampos = async () => {
    try {
      setCampos(await listClientFields());
    } catch (e: any) {
      // Campos personalizados são complemento: a carteira abre sem eles.
      console.warn('[Clientes] campos personalizados indisponíveis', e?.message);
    }
  };

  useEffect(() => { carregar(); carregarCampos(); }, []);

  const filtrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    if (!termo) return clientes;
    return clientes.filter(c =>
      (c.nome || '').toLowerCase().includes(termo) ||
      (c.telefone || '').includes(termo) ||
      (c.email || '').toLowerCase().includes(termo)
    );
  }, [clientes, busca]);

  const exportar = () => {
    const linhas = [
      ['Nome', 'WhatsApp', 'E-mail', 'Instagram', 'Site', 'Mensalidade', 'Ciclo', 'Situação', 'Cliente desde'],
      ...clientes.map(c => [
        c.nome || '', c.telefone || '', c.email || '', c.instagram || '', c.website || '',
        c.profile?.mensalidade ?? '', c.profile?.ciclo ?? '', c.profile?.status_contrato ?? '',
        c.profile?.cliente_desde ?? '',
      ]),
    ];
    const csv = linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards = [
    { label: 'Clientes', valor: String(resumo.total), icone: <Users size={16} />, cor: 'text-primary-600', dica: 'Total na carteira' },
    { label: 'Ativos', valor: String(resumo.ativos), icone: <TrendingUp size={16} />, cor: 'text-emerald-600', dica: 'Com contrato ativo' },
    { label: 'Receita recorrente', valor: formatMoney(resumo.mrr), icone: <Wallet size={16} />, cor: 'text-violet-600', dica: 'Por mês, somando só contratos ativos' },
    { label: 'Ticket médio', valor: formatMoney(resumo.ticket_medio), icone: <TrendingUp size={16} />, cor: 'text-amber-600', dica: 'Receita recorrente dividida pelos ativos' },
    { label: 'LTV acumulado', valor: formatMoney(resumo.ltv_total), icone: <Trophy size={16} />, cor: 'text-blue-600', dica: 'Quanto a carteira inteira já pagou desde que entrou' },
    { label: 'LTV médio', valor: formatMoney(resumo.ltv_medio), icone: <Trophy size={16} />, cor: 'text-slate-600', dica: 'Média por cliente que já gerou receita' },
  ];

  return (
    <div className="relative min-h-[600px] space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-primary-200">
            <Users size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Clientes</h1>
            <p className="text-slate-500 text-sm">Sua carteira — leads promovidos, com ficha e histórico.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregar} className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all" title="Atualizar">
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => setCamposAberto(true)}
            title="Criar campos próprios do seu ramo na ficha do cliente"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
          >
            <SlidersHorizontal size={16} className="text-slate-400" /> Campos da ficha
          </button>
          <button
            onClick={() => setNovoAberto(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-all active:scale-95 shadow-lg shadow-primary-200"
          >
            <Plus size={16} /> Novo cliente
          </button>
          <button
            onClick={exportar}
            disabled={clientes.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            <Download size={16} className="text-slate-400" /> Exportar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map(c => (
          <div key={c.label} title={c.dica} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className={`flex items-center gap-2 mb-2 ${c.cor}`}>
              {c.icone}
              <span className="text-[10px] font-black uppercase tracking-widest">{c.label}</span>
            </div>
            <p className="text-2xl font-black text-slate-900">{c.valor}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-50 bg-slate-50/40">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, WhatsApp ou e-mail…"
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all"
            />
          </div>
        </div>

        {carregando ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <Loader2 size={36} className="animate-spin mb-3 text-primary-500" />
            <p className="font-medium text-sm">Carregando carteira…</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 px-6 text-center">
            <Users size={40} className="mb-4 opacity-40" />
            <p className="font-bold text-slate-600">
              {busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente na carteira ainda'}
            </p>
            <p className="text-sm mt-1 max-w-sm">
              {busca
                ? 'Tente outro termo de busca.'
                : 'Promova um lead a cliente em Leads, pelo botão “Marcar como cliente” na conversa, ou cadastre um agora.'}
            </p>
            {!busca && (
              <button
                onClick={() => setNovoAberto(true)}
                className="mt-5 flex items-center gap-2 px-5 py-3 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-all active:scale-95"
              >
                <Plus size={16} /> Adicionar cliente
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="px-6 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                  <th className="px-6 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest hidden md:table-cell">Contato</th>
                  <th className="px-6 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:table-cell">Mensalidade</th>
                  <th className="px-6 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest hidden lg:table-cell">LTV</th>
                  <th className="px-6 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtrados.map(c => {
                  const status = STATUS.find(s => s.id === (c.profile?.status_contrato || 'ativo'))!;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelecionado(c.id)}
                      className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-black shrink-0 overflow-hidden"
                            style={{ backgroundColor: getAvatarColor(c.id || c.nome || 'x') }}
                          >
                            {c.profile_picture_url
                              ? <img src={c.profile_picture_url} alt={c.nome} className="w-full h-full object-cover" />
                              : iniciais(c.nome)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 text-sm truncate">{c.nome || 'Sem nome'}</p>
                            <p className="text-[11px] text-slate-400">
                              Desde {formatDate(c.profile?.cliente_desde || c.data_criacao)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <p className="text-[13px] text-slate-600 font-medium">{formatPhone(c.telefone)}</p>
                        {c.email && <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{c.email}</p>}
                      </td>
                      <td className="px-6 py-4 hidden sm:table-cell">
                        <p className="text-[13px] font-bold text-slate-700">
                          {formatMoney(c.profile?.mensalidade, c.profile?.moeda)}
                        </p>
                        {c.profile?.ciclo && (
                          <p className="text-[11px] text-slate-400">
                            {CICLOS.find(x => x.id === c.profile?.ciclo)?.label}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell">
                        <p className="text-[13px] font-bold text-slate-700">{formatMoney(c.ltv)}</p>
                        <p className="text-[11px] text-slate-400">
                          {c.meses ? `${c.meses} ${c.meses === 1 ? 'mês' : 'meses'} de casa` : 'primeiro mês'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${status.cor}`}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {camposAberto && (
          <GerenciarCamposModal
            campos={campos}
            onClose={() => setCamposAberto(false)}
            onMudou={carregarCampos}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {novoAberto && (
          <NovoClienteModal onClose={() => setNovoAberto(false)} onCriado={carregar} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selecionado && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelecionado(null)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
            />
            <FichaCliente
              contactId={selecionado}
              campos={campos}
              onClose={() => setSelecionado(null)}
              onChanged={carregar}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
