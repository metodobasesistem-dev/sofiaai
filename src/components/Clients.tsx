/**
 * Clientes — a carteira do inquilino.
 *
 * Um contato é LEAD ou CLIENTE, nunca os dois: quem é promovido some da tela
 * de Contatos e aparece aqui, com a ficha comercial. A promoção é manual.
 *
 * Não confundir com a gestão de inquilinos da plataforma (Painel Admin): lá
 * são as empresas que contratam o sistema, aqui são os clientes de cada uma.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, Users, Phone, Mail, Instagram, Globe, Loader2, X, RefreshCw,
  Calendar, MessageSquare, TrendingUp, Save, UserMinus, Download, Wallet,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  listClients, getClient, updateClient, demoteClient,
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

// ── Ficha lateral ─────────────────────────────────────────────────────────

function FichaCliente({
  contactId,
  onClose,
  onChanged,
}: {
  contactId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [cliente, setCliente] = useState<ClientRecord | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    getClient(contactId)
      .then(dados => {
        if (!ativo) return;
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
        });
      })
      .catch(e => toast.error('Erro ao carregar ficha: ' + e.message))
      .finally(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, [contactId]);

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

// ── Tela ──────────────────────────────────────────────────────────────────

export default function Clients() {
  const [clientes, setClientes] = useState<ClientRecord[]>([]);
  const [resumo, setResumo] = useState<ClientsSummary>({ total: 0, ativos: 0, mrr: 0, ticket_medio: 0 });
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState<string | null>(null);

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

  useEffect(() => { carregar(); }, []);

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
    { label: 'Clientes', valor: String(resumo.total), icone: <Users size={16} />, cor: 'text-primary-600' },
    { label: 'Ativos', valor: String(resumo.ativos), icone: <TrendingUp size={16} />, cor: 'text-emerald-600' },
    { label: 'Receita recorrente', valor: formatMoney(resumo.mrr), icone: <Wallet size={16} />, cor: 'text-violet-600' },
    { label: 'Ticket médio', valor: formatMoney(resumo.ticket_medio), icone: <TrendingUp size={16} />, cor: 'text-amber-600' },
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
            onClick={exportar}
            disabled={clientes.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            <Download size={16} className="text-slate-400" /> Exportar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
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
                : 'Promova um lead a cliente em Contatos ou pelo botão “Marcar como cliente” na conversa.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="px-6 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                  <th className="px-6 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest hidden md:table-cell">Contato</th>
                  <th className="px-6 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:table-cell">Mensalidade</th>
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
        {selecionado && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelecionado(null)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
            />
            <FichaCliente
              contactId={selecionado}
              onClose={() => setSelecionado(null)}
              onChanged={carregar}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
