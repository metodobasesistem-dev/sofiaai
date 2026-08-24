import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  Filter, 
  Search,
  MoreVertical,
  ArrowUpRight,
  ArrowDownLeft,
  Tag,
  Clock,
  ChevronRight,
  Download,
  Edit,
  Trash2,
  User as UserIcon,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { standardFetch } from '../services/supabaseService';

interface Transaction {
  id: string;
  descricao: string;
  valor: number;
  tipo: 'entrada' | 'saida';
  status: 'pago' | 'pendente' | 'cancelado';
  data_pagamento: string;
  categoria_nome?: string;
  contact_id?: string;
  contact_name?: string;
  metodo_pagamento?: string;
}

interface Contact {
  id: string;
  nome: string;
  telefone?: string;
}

interface ResumoFinanceiro {
  competencia: string;
  caixa: { receita_total: number; despesa_total: number; saldo: number };
  mes: {
    recebido: number; a_receber: number; previsto: number; despesas: number;
    recebido_mes_anterior: number; despesas_mes_anterior: number;
  };
  carteira: { ativos: number; mrr: number; ticket_medio: number; ltv_total: number; ltv_medio: number };
}

interface Category {
  id: string;
  nome: string;
  tipo: 'receita' | 'despesa';
}

export default function Finance() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  // Posição do menu de ações na tela. O menu é 'fixed' porque o card da
  // tabela tem overflow-hidden: um dropdown absolute dentro da célula era
  // cortado na última linha, e as opções sumiam.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const ALTURA_MENU = 92;  // dois itens + padding
  const LARGURA_MENU = 144; // w-36

  const abrirMenu = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    if (openMenuId === id) {
      setOpenMenuId(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    // Sem espaço abaixo, abre para cima em vez de sair da janela
    const abreParaCima = r.bottom + ALTURA_MENU + 12 > window.innerHeight;
    setMenuPos({
      top: abreParaCima ? r.top - ALTURA_MENU - 8 : r.bottom + 8,
      left: Math.max(12, r.right - LARGURA_MENU),
    });
    setOpenMenuId(id);
  };
  const [isSaving, setIsSaving] = useState(false);
  const [gerandoMensalidades, setGerandoMensalidades] = useState(false);
  // Caixa + carteira num round trip. MRR, ticket médio e LTV vêm das fichas
  // dos clientes, que esta tela não carrega — e repetir essas contas aqui
  // faria os números divergirem dos da tela de Clientes.
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);
  
  // Filter States
  const [filterType, setFilterType] = useState<'all' | 'entrada' | 'saida'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Form States
  const [formData, setFormData] = useState({
    descricao: '',
    valor: '',
    tipo: 'entrada' as 'entrada' | 'saida',
    status: 'pago' as 'pago' | 'pendente',
    data_pagamento: format(new Date(), 'yyyy-MM-dd'),
    categoria_id: '',
    contact_id: '',
    observacoes: ''
  });

  const [newCatData, setNewCatData] = useState({
    nome: '',
    tipo: 'receita' as 'receita' | 'despesa'
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  // Resumo (Sempre baseado em todos os dados para manter o saldo real)
  const totalReceita = transactions.filter(t => t.tipo === 'entrada' && t.status === 'pago').reduce((acc, t) => acc + Number(t.valor), 0);
  const totalDespesa = transactions.filter(t => t.tipo === 'saida' && t.status === 'pago').reduce((acc, t) => acc + Number(t.valor), 0);
  const saldo = totalReceita - totalDespesa;

  // Comparação com o mês anterior. Antes havia "+12%" e "-5%" escritos no
  // código: apareciam mesmo com a tela zerada, o que é pior do que não ter
  // indicador nenhum.
  const noMes = (t: Transaction, offset: number) => {
    const d = new Date(`${t.data_pagamento}T12:00:00`);
    const ref = new Date();
    ref.setDate(1);
    ref.setMonth(ref.getMonth() - offset);
    return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
  };
  const somaMes = (tipo: 'entrada' | 'saida', offset: number) =>
    transactions
      .filter(t => t.tipo === tipo && t.status === 'pago' && noMes(t, offset))
      .reduce((acc, t) => acc + Number(t.valor), 0);

  const variacao = (tipo: 'entrada' | 'saida') => {
    const atual = somaMes(tipo, 0);
    const anterior = somaMes(tipo, 1);
    if (!anterior) return atual > 0 ? { texto: 'primeiro mês com movimento', positivo: true } : null;
    const pct = Math.round(((atual - anterior) / anterior) * 100);
    return { texto: `${pct >= 0 ? '+' : ''}${pct}% vs. mês anterior`, positivo: pct >= 0 };
  };
  const varReceita = variacao('entrada');
  const varDespesa = variacao('saida');

  // Mensalidades previstas x recebidas no mês corrente
  const previstoMes = transactions
    .filter(t => t.tipo === 'entrada' && t.status === 'pendente' && noMes(t, 0))
    .reduce((acc, t) => acc + Number(t.valor), 0);

  const mesPorExtenso = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR });

  const pctRecebido = (() => {
    const previsto = resumo?.mes.previsto ?? 0;
    if (previsto <= 0) return 0;
    return Math.min(100, Math.round(((resumo?.mes.recebido ?? 0) / previsto) * 100));
  })();

  const indicadores = [
    {
      label: 'Receita recorrente',
      valor: formatCurrency(resumo?.carteira.mrr ?? 0),
      nota: 'por mês, contratos ativos',
      icone: <RefreshCw size={13} />,
    },
    {
      label: 'Ticket médio',
      valor: formatCurrency(resumo?.carteira.ticket_medio ?? 0),
      nota: `${resumo?.carteira.ativos ?? 0} cliente(s) ativo(s)`,
      icone: <TrendingUp size={13} />,
    },
    {
      label: 'LTV acumulado',
      valor: formatCurrency(resumo?.carteira.ltv_total ?? 0),
      nota: 'já pago pela carteira',
      icone: <Wallet size={13} />,
    },
    {
      label: 'LTV médio',
      valor: formatCurrency(resumo?.carteira.ltv_medio ?? 0),
      nota: 'por cliente',
      icone: <UserIcon size={13} />,
    },
    {
      label: 'Recebido no mês',
      valor: formatCurrency(resumo?.mes.recebido ?? 0),
      nota: varReceita?.texto,
      icone: <ArrowUpRight size={13} />,
    },
  ];

  // Lista Filtrada
  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = t.descricao.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         t.contact_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || t.tipo === filterType;
    return matchesSearch && matchesType;
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  // O menu é posicionado em coordenadas de tela; rolar a página o deixaria
  // deslocado da linha, então fecha junto.
  useEffect(() => {
    if (!openMenuId) return;
    const fechar = () => setOpenMenuId(null);
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    return () => {
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
    };
  }, [openMenuId]);

  const fetchInitialData = async () => {
    setLoading(true);
    await Promise.all([
      fetchTransactions(),
      fetchCategories(),
      fetchContacts(),
      fetchResumo()
    ]);
    setLoading(false);
  };

  /**
   * Traz para o Financeiro o que a carteira já sabe: cada cliente ativo com
   * mensalidade vira um lançamento pendente do mês. Repetir o clique não
   * duplica — o backend tem índice único por cliente e competência.
   */
  const gerarMensalidades = async () => {
    try {
      setGerandoMensalidades(true);
      const res = await standardFetch('/api/v2/finance/gerar-mensalidades', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const r = await res.json();
      if (!r.success && r.error) throw new Error(r.error);

      if (r.criados > 0) {
        toast.success(`${r.criados} mensalidade(s) lançada(s)`, {
          description: r.pulados ? `${r.pulados} cliente(s) sem cobrança neste mês ou já lançados.` : undefined,
        });
      } else {
        toast.info('Nada novo a lançar', {
          description: r.mensagem || 'As mensalidades deste mês já foram geradas.',
        });
      }
      fetchTransactions();
      fetchResumo();
    } catch (e: any) {
      toast.error('Erro ao gerar mensalidades: ' + e.message);
    } finally {
      setGerandoMensalidades(false);
    }
  };

  const fetchResumo = async () => {
    try {
      const res = await standardFetch('/api/v2/finance/resumo');
      const r = await res.json();
      if (r.success) setResumo(r);
    } catch (e) {
      // Resumo é complemento: a lista de lançamentos continua de pé sem ele.
      console.warn('[Finance] resumo indisponível', e);
    }
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from('financial_categories').select('*').order('nome');
    if (data) setCategories(data);
  };

  const fetchContacts = async () => {
    const { data } = await supabase.from('contacts').select('id, nome, telefone').order('nome').limit(500);
    if (data) setContacts(data);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatData.nome) return;

    try {
      setIsSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('financial_categories').insert({
        user_id: user.id,
        nome: newCatData.nome,
        tipo: newCatData.tipo
      });

      if (error) throw error;

      toast.success('Categoria criada!');
      setNewCatData({ nome: '', tipo: 'receita' });
      fetchCategories();
      setShowCategoryModal(false);
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditClick = (t: Transaction) => {
    setEditingTransaction(t);
    setFormData({
      descricao: t.descricao,
      valor: String(t.valor),
      tipo: t.tipo,
      status: t.status as any,
      data_pagamento: t.data_pagamento,
      categoria_id: (t as any).categoria_id || '',
      contact_id: t.contact_id || '',
      observacoes: (t as any).observacoes || ''
    });
    setShowAddModal(true);
    setOpenMenuId(null);
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este lançamento?')) return;

    try {
      const { error } = await supabase.from('financial_transactions').delete().eq('id', id);
      if (error) throw error;
      toast.success('Lançamento excluído!');
      fetchTransactions();
      setOpenMenuId(null);
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + err.message);
    }
  };

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('financial_transactions')
        .select(`
          *,
          financial_categories(nome),
          contacts(nome)
        `)
        .order('data_pagamento', { ascending: false });

      if (error) throw error;
      
      const formatted = (data || []).map(t => ({
        ...t,
        categoria_nome: t.financial_categories?.nome,
        contact_name: t.contacts?.nome
      }));
      
      setTransactions(formatted);
    } catch (err: any) {
      console.error('Error fetching transactions:', err.message);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.descricao || !formData.valor) return toast.error('Preencha os campos obrigatórios');

    try {
      setIsSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        user_id: user.id,
        descricao: formData.descricao,
        valor: parseFloat(formData.valor),
        tipo: formData.tipo,
        status: formData.status,
        data_pagamento: formData.data_pagamento,
        categoria_id: formData.categoria_id || null,
        contact_id: formData.contact_id || null,
        observacoes: formData.observacoes
      };

      let error;
      if (editingTransaction) {
        const { error: err } = await supabase.from('financial_transactions').update(payload).eq('id', editingTransaction.id);
        error = err;
      } else {
        const { error: err } = await supabase.from('financial_transactions').insert(payload);
        error = err;
      }

      if (error) throw error;

      toast.success(editingTransaction ? 'Lançamento atualizado!' : 'Lançamento realizado com sucesso!');
      setShowAddModal(false);
      setEditingTransaction(null);
      setFormData({
        descricao: '',
        valor: '',
        tipo: 'entrada',
        status: 'pago',
        data_pagamento: format(new Date(), 'yyyy-MM-dd'),
        categoria_id: '',
        contact_id: '',
        observacoes: ''
      });
      fetchTransactions();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className="flex-1 h-full bg-slate-50/50 overflow-y-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      
      {/* Modal de Nova Categoria */}
      <AnimatePresence>
        {showCategoryModal && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCategoryModal(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 border border-slate-100">
              <h3 className="text-lg font-black text-slate-900 mb-4">Nova Categoria</h3>
              <form onSubmit={handleAddCategory} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Nome da Categoria</label>
                  <input type="text" autoFocus required value={newCatData.nome} onChange={e => setNewCatData({...newCatData, nome: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-500" placeholder="Ex: Tráfego Pago" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Tipo</label>
                  <select value={newCatData.tipo} onChange={e => setNewCatData({...newCatData, tipo: e.target.value as any})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none">
                    <option value="receita">Receita (Entrada)</option>
                    <option value="despesa">Despesa (Saída)</option>
                  </select>
                </div>
                <button disabled={isSaving} className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all">
                  {isSaving ? 'Salvando...' : 'Criar Categoria'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Cadastro */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  {editingTransaction ? 'Editar Lançamento' : 'Novo Lançamento'}
                </h3>
                <button onClick={() => { setShowAddModal(false); setEditingTransaction(null); }} className="p-2 text-slate-400 hover:text-red-500 transition-all">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>

              <form onSubmit={handleAddTransaction} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, tipo: 'entrada'})}
                    className={`py-3 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-2
                      ${formData.tipo === 'entrada' ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200' : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-200'}`}
                  >
                    <ArrowUpRight size={16} /> Receita
                  </button>
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, tipo: 'saida'})}
                    className={`py-3 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-2
                      ${formData.tipo === 'saida' ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-200' : 'bg-white border-slate-200 text-slate-500 hover:border-red-200'}`}
                  >
                    <ArrowDownLeft size={16} /> Despesa
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Descrição</label>
                    <input 
                      type="text"
                      required
                      placeholder="Ex: Venda de Consultoria"
                      value={formData.descricao}
                      onChange={e => setFormData({...formData, descricao: e.target.value})}
                      className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-50 outline-none transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Valor (R$)</label>
                      <input 
                        type="number"
                        step="0.01"
                        required
                        placeholder="0,00"
                        value={formData.valor}
                        onChange={e => setFormData({...formData, valor: e.target.value})}
                        className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-800 focus:border-primary-500 focus:ring-4 focus:ring-primary-50 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Data</label>
                      <input 
                        type="date"
                        required
                        value={formData.data_pagamento}
                        onChange={e => setFormData({...formData, data_pagamento: e.target.value})}
                        className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-50 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Categoria</label>
                        <button type="button" onClick={() => { setShowCategoryModal(true); setNewCatData({...newCatData, tipo: formData.tipo === 'entrada' ? 'receita' : 'despesa'}); }} className="text-[10px] font-black text-primary-600 hover:underline uppercase tracking-widest">+ Nova</button>
                      </div>
                      <select 
                        value={formData.categoria_id}
                        onChange={e => setFormData({...formData, categoria_id: e.target.value})}
                        className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-50 outline-none transition-all"
                      >
                        <option value="">Sem Categoria</option>
                        {categories.filter(c => c.tipo === (formData.tipo === 'entrada' ? 'receita' : 'despesa')).map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Lead / Contato (Opcional)</label>
                      <select 
                        value={formData.contact_id}
                        onChange={e => setFormData({...formData, contact_id: e.target.value})}
                        className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-50 outline-none transition-all"
                      >
                        <option value="">Nenhum</option>
                        {contacts.map(contact => (
                          <option key={contact.id} value={contact.id}>{contact.nome || contact.telefone}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Status</label>
                      <select 
                        value={formData.status}
                        onChange={e => setFormData({...formData, status: e.target.value as any})}
                        className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-50 outline-none transition-all"
                      >
                        <option value="pago">Pago / Recebido</option>
                        <option value="pendente">Pendente</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    disabled={isSaving}
                    className="w-full py-4 bg-primary-600 text-white rounded-2xl text-sm font-black shadow-xl shadow-primary-500/30 hover:bg-primary-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Plus className="animate-spin" /> : editingTransaction ? <Edit size={18} /> : <Plus size={18} />}
                    {isSaving ? 'Salvando...' : editingTransaction ? 'Salvar Alterações' : 'Confirmar Lançamento'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
        <div>
          <div className="flex items-center gap-2.5 text-slate-400 mb-1.5">
            <DollarSign size={15} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Financeiro</span>
          </div>
          <h2 className="text-[26px] leading-tight font-semibold text-slate-900 tracking-tight">Gestão financeira</h2>
          <p className="text-slate-500 text-[13px] mt-1">
            Caixa, carteira e previsão de entrada — {mesPorExtenso}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={gerarMensalidades}
            disabled={gerandoMensalidades}
            title="Cria os lançamentos pendentes do mês a partir dos clientes ativos"
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
          >
            {gerandoMensalidades ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Gerar mensalidades
          </button>
          <button
            onClick={() => setShowCategoryModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <Tag size={15} /> Categorias
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-[13px] font-semibold hover:bg-primary-700 transition-colors"
          >
            <Plus size={16} /> Novo lançamento
          </button>
        </div>
      </div>

      {/* Saldo — o único número em tamanho hero desta tela */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-slate-900 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-2 text-slate-400 mb-3">
            <Wallet size={15} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Saldo disponível</span>
          </div>
          <p className="text-[44px] leading-none font-semibold tracking-tight">{formatCurrency(saldo)}</p>
          <p className="text-[12px] text-slate-400 mt-3">
            {formatCurrency(totalReceita)} recebido · {formatCurrency(totalDespesa)} em despesas
          </p>
        </div>

        {/* Previsão do mês — meter: trilha é um passo mais claro da mesma cor
            do preenchimento, para o estado ser legível na barra inteira. */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/70 p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-1">
                Previsão de entrada
              </p>
              <p className="text-[26px] leading-none font-semibold text-slate-900 tracking-tight">
                {formatCurrency(resumo?.mes.a_receber ?? 0)}
                <span className="text-[13px] font-normal text-slate-400 ml-2">ainda a receber</span>
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[12px] text-slate-500">
                {formatCurrency(resumo?.mes.recebido ?? 0)} de {formatCurrency(resumo?.mes.previsto ?? 0)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{pctRecebido}% do previsto</p>
            </div>
          </div>

          <div className="h-2.5 w-full rounded-full bg-emerald-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
              style={{ width: `${pctRecebido}%` }}
              role="progressbar"
              aria-valuenow={pctRecebido}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Percentual recebido do previsto no mês"
            />
          </div>

          <div className="flex items-center gap-5 mt-4 text-[12px]">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Recebido
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-100 border border-emerald-200" /> A receber
            </span>
            {(resumo?.mes.despesas ?? 0) > 0 && (
              <span className="ml-auto text-slate-500">
                {formatCurrency(resumo?.mes.despesas ?? 0)} em despesas no mês
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Indicadores da carteira */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {indicadores.map(ind => (
          <div key={ind.label} className="bg-white rounded-xl border border-slate-200/70 px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1.5">
              {ind.icone}
              <span className="text-[11px] font-medium">{ind.label}</span>
            </div>
            <p className="text-[19px] font-semibold text-slate-900 tracking-tight">{ind.valor}</p>
            {ind.nota && <p className="text-[11px] text-slate-400 mt-0.5">{ind.nota}</p>}
          </div>
        ))}
      </div>


      {/* Main Content */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
        {/* Filters Bar */}
        <div className="px-6 py-4 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Pesquisar por descrição..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-50 transition-all outline-none"
              />
            </div>
            <button className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-primary-600 transition-all">
              <Filter size={20} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setFilterType('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterType === 'all' ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
            >
              Tudo
            </button>
            <button 
              onClick={() => setFilterType('entrada')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterType === 'entrada' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
            >
              Entradas
            </button>
            <button 
              onClick={() => setFilterType('saida')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterType === 'saida' ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
            >
              Saídas
            </button>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-3 text-[11px] font-medium text-slate-400">Descrição</th>
                <th className="px-6 py-3 text-[11px] font-medium text-slate-400">Valor</th>
                <th className="px-6 py-3 text-[11px] font-medium text-slate-400">Categoria</th>
                <th className="px-6 py-3 text-[11px] font-medium text-slate-400">Data</th>
                <th className="px-6 py-3 text-[11px] font-medium text-slate-400">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin" />
                      <span className="text-sm font-bold text-slate-400">Carregando transações...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="max-w-xs mx-auto">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Wallet size={32} className="text-slate-300" />
                      </div>
                      <h4 className="text-lg font-bold text-slate-800">Nenhum resultado</h4>
                      <p className="text-sm text-slate-500 mt-2">Não encontramos nada para "{searchTerm || filterType}".</p>
                      {searchTerm && <button onClick={() => setSearchTerm('')} className="mt-4 text-primary-600 font-bold hover:underline">Limpar busca</button>}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((transaction, idx) => (
                  <motion.tr 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    key={transaction.id} 
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                          ${transaction.tipo === 'entrada' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                          {transaction.tipo === 'entrada' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 leading-tight">{transaction.descricao}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] text-slate-400 font-medium">ID: #{transaction.id.substring(0, 8)}</p>
                            {transaction.contact_name && (
                              <>
                                <span className="text-[10px] text-slate-300">•</span>
                                <div className="flex items-center gap-1 text-[10px] text-primary-600 font-bold">
                                  <UserIcon size={10} />
                                  {transaction.contact_name}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[14px] font-semibold tabular-nums ${transaction.tipo === 'entrada' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {transaction.tipo === 'entrada' ? '+' : '-'} {formatCurrency(transaction.valor)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary-400" />
                        <span className="text-xs font-bold text-slate-600">{transaction.categoria_nome || 'Sem categoria'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">{/* T12:00 evita o pulo de um dia: new Date('2026-08-01') é meia-noite
                              UTC, que no nosso fuso volta para 31/07. */}
                        {format(new Date(`${transaction.data_pagamento}T12:00:00`), "dd 'de' MMM", { locale: ptBR })}</span>
                        <span className="text-[10px] text-slate-400 font-medium uppercase">{format(new Date(transaction.data_pagamento), "yyyy")}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize
                        ${transaction.status === 'pago' ? 'bg-emerald-100 text-emerald-700' : 
                          transaction.status === 'pendente' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {transaction.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right relative">
                      <button 
                        onClick={(e) => abrirMenu(e, transaction.id)}
                        className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical size={16} />
                      </button>

                      <AnimatePresence>
                        {openMenuId === transaction.id && (
                          <>
                            <div className="fixed inset-0 z-[150]" onClick={() => setOpenMenuId(null)} />
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.95, y: -10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -10 }}
                              style={{ position: 'fixed', top: menuPos?.top ?? 0, left: menuPos?.left ?? 0 }}
                              className="w-36 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-[160] overflow-hidden"
                            >
                              <button 
                                onClick={() => handleEditClick(transaction)}
                                className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                              >
                                <Edit size={14} /> Editar
                              </button>
                              <button 
                                onClick={() => handleDeleteTransaction(transaction.id)}
                                className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={14} /> Excluir
                              </button>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
