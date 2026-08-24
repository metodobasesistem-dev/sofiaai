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
  const [isSaving, setIsSaving] = useState(false);
  const [gerandoMensalidades, setGerandoMensalidades] = useState(false);
  
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

  const fetchInitialData = async () => {
    setLoading(true);
    await Promise.all([
      fetchTransactions(),
      fetchCategories(),
      fetchContacts()
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
    } catch (e: any) {
      toast.error('Erro ao gerar mensalidades: ' + e.message);
    } finally {
      setGerandoMensalidades(false);
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary-500/20">
              <DollarSign size={22} />
            </div>
            Gestão Financeira
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-1">Acompanhe a saúde do seu negócio em tempo real.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={gerarMensalidades}
            disabled={gerandoMensalidades}
            title="Cria os lançamentos pendentes do mês a partir dos clientes ativos"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
          >
            {gerandoMensalidades ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Gerar mensalidades
          </button>
          <button onClick={() => setShowCategoryModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
            <Tag size={16} /> Categorias
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
            <Download size={16} /> Exportar
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-xl text-xs font-black shadow-lg shadow-primary-500/30 hover:bg-primary-700 transition-all active:scale-95"
          >
            <Plus size={18} /> Novo Lançamento
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
            <TrendingUp size={80} className="text-emerald-500" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <TrendingUp size={20} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Receita Total</span>
          </div>
          <h3 className="text-3xl font-black text-slate-900">{formatCurrency(totalReceita)}</h3>
          {varReceita && (
            <div className={`mt-4 flex items-center gap-2 text-[10px] font-bold ${varReceita.positivo ? 'text-emerald-600' : 'text-red-600'}`}>
              <span className={`px-2 py-0.5 rounded-full ${varReceita.positivo ? 'bg-emerald-50' : 'bg-red-50'}`}>{varReceita.texto}</span>
            </div>
          )}
          {previstoMes > 0 && (
            <div className="mt-2 text-[10px] font-bold text-amber-600">
              <span className="px-2 py-0.5 bg-amber-50 rounded-full">{formatCurrency(previstoMes)} a receber este mês</span>
            </div>
          )}
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
            <TrendingDown size={80} className="text-red-500" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center">
              <TrendingDown size={20} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Despesas Totais</span>
          </div>
          <h3 className="text-3xl font-black text-slate-900">{formatCurrency(totalDespesa)}</h3>
          {varDespesa && (
            <div className={`mt-4 flex items-center gap-2 text-[10px] font-bold ${varDespesa.positivo ? 'text-red-600' : 'text-emerald-600'}`}>
              <span className={`px-2 py-0.5 rounded-full ${varDespesa.positivo ? 'bg-red-50' : 'bg-emerald-50'}`}>{varDespesa.texto}</span>
            </div>
          )}
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-900 p-6 rounded-[32px] shadow-2xl shadow-primary-500/10 relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary-600/20 to-transparent opacity-50" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white/10 text-white rounded-xl flex items-center justify-center backdrop-blur-md">
                <Wallet size={20} />
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Disponível</span>
            </div>
            <h3 className="text-3xl font-black text-white">{formatCurrency(saldo)}</h3>
            <div className="mt-4 flex items-center gap-2 text-primary-400 text-[10px] font-bold">
              <span className="px-2 py-0.5 bg-white/10 rounded-full">Atualizado agora</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
        {/* Filters Bar */}
        <div className="px-8 py-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30">
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
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-8 py-5"></th>
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
                    <td className="px-8 py-6">
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
                    <td className="px-8 py-6">
                      <span className={`text-[15px] font-black ${transaction.tipo === 'entrada' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {transaction.tipo === 'entrada' ? '+' : '-'} {formatCurrency(transaction.valor)}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary-400" />
                        <span className="text-xs font-bold text-slate-600">{transaction.categoria_nome || 'Sem categoria'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">{/* T12:00 evita o pulo de um dia: new Date('2026-08-01') é meia-noite
                              UTC, que no nosso fuso volta para 31/07. */}
                        {format(new Date(`${transaction.data_pagamento}T12:00:00`), "dd 'de' MMM", { locale: ptBR })}</span>
                        <span className="text-[10px] text-slate-400 font-medium uppercase">{format(new Date(transaction.data_pagamento), "yyyy")}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest
                        ${transaction.status === 'pago' ? 'bg-emerald-100 text-emerald-700' : 
                          transaction.status === 'pendente' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {transaction.status}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right relative">
                      <button 
                        onClick={() => setOpenMenuId(openMenuId === transaction.id ? null : transaction.id)}
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
                              className="absolute right-8 top-16 w-36 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-[160] overflow-hidden"
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
