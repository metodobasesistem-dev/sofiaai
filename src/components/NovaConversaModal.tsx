import React, { useState, useEffect } from 'react';
import { X, Search, CheckCircle2, AlertTriangle, XCircle, Loader2, MessageSquare, ArrowRight, User } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

interface CheckResult {
  phone: string;
  jid: string;
  whatsappExists: boolean | null;
  history: {
    hasHistory: boolean;
    threadId: string | null;
    contactName: string | null;
    isClient: boolean;
    totalMessages: number;
    sentMessages: number;
    campaignSends: number;
    lastMessage: string | null;
    lastMessageAt: string | null;
  };
}

interface NovaConversaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenChat: (jid: string, name?: string) => void;
}

export default function NovaConversaModal({ isOpen, onClose, onOpenChat }: NovaConversaModalProps) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  // Fecha no Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Formatação rápida para exibição no input
  const handlePhoneChange = (val: string) => {
    // Mantém só números
    let digits = val.replace(/\D/g, '');
    if (digits.length > 13) digits = digits.slice(0, 13);

    // Se começou com 55 e tiver mais de 10 dígitos, pode formatar
    let formatted = digits;
    if (digits.length <= 11) {
      if (digits.length > 2 && digits.length <= 6) {
        formatted = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
      } else if (digits.length > 6 && digits.length <= 10) {
        formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
      } else if (digits.length > 10) {
        formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
      }
    } else {
      // Formato com DDI: +55 (32) 99999-9999
      const ddi = digits.slice(0, 2);
      const ddd = digits.slice(2, 4);
      const rest = digits.slice(4);
      if (rest.length <= 4) {
        formatted = `+${ddi} (${ddd}) ${rest}`;
      } else if (rest.length <= 8) {
        formatted = `+${ddi} (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
      } else {
        formatted = `+${ddi} (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
      }
    }

    setPhone(formatted);
    // Sempre que o usuário alterar o número, invalida a verificação anterior
    setResult(null);
  };

  const handleVerificar = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanDigits = phone.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      toast.error('Informe um número válido com DDD (mínimo 10 dígitos).');
      return;
    }

    setChecking(true);
    setResult(null);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch('/api/whatsapp/check-number', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ phone: cleanDigits }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao verificar número.');
      }

      setResult(data);
    } catch (err: any) {
      console.error('[NovaConversaModal] Erro ao verificar:', err);
      toast.error(err.message || 'Erro ao conectar ao serviço de verificação.');
    } finally {
      setChecking(false);
    }
  };

  const handleIniciarChat = () => {
    if (!result) return;
    const finalName = name.trim() || result.history.contactName || undefined;
    onOpenChat(result.jid, finalName);
    onClose();
  };

  const formatDataHora = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-200">
              <MessageSquare size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Iniciar Nova Conversa</h3>
              <p className="text-[12px] text-slate-400">Verificação de existência e histórico antes do envio</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleVerificar} className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Número do WhatsApp <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                autoFocus
                placeholder="(DDD) 99999-9999"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
              />
              <button
                type="submit"
                disabled={checking || phone.replace(/\D/g, '').length < 10}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1.5"
              >
                {checking ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Verificando...</span>
                  </>
                ) : (
                  <>
                    <Search size={13} />
                    <span>Verificar</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Informe DDD + telefone. A verificação checa se o número existe e se já foi contatado.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Nome do contato (opcional)
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Ex.: João Silva"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 placeholder-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
              />
            </div>
          </div>

          {/* Resultado da Verificação */}
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 pt-3 border-t border-slate-100"
            >
              {/* CASO 1: NÃO EXISTE NO WHATSAPP */}
              {result.whatsappExists === false ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-red-700">
                    <XCircle size={18} className="shrink-0 text-red-600" />
                    <span>Número não possui WhatsApp</span>
                  </div>
                  <p className="text-xs text-red-700 leading-relaxed">
                    Este número não está registrado no WhatsApp ou não aceita mensagens. Para evitar erros de envio e proteger a qualidade do seu canal, a abertura de conversa está bloqueada.
                  </p>
                </div>
              ) : result.history.hasHistory ? (
                /* CASO 2: JÁ EXISTEM MENSAGENS NO BANCO */
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-amber-800">
                      <AlertTriangle size={18} className="shrink-0 text-amber-600" />
                      <span>Número já possui histórico de mensagens</span>
                    </div>
                    {result.history.isClient && (
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-black rounded uppercase">
                        Cliente
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-amber-800 leading-relaxed">
                    Nós já temos registros de contato com este número para evitar que você mande mensagens duplicadas ou repetidas.
                  </p>

                  <div className="bg-white/70 p-3 rounded-lg border border-amber-200/60 text-xs space-y-1.5">
                    {result.history.contactName && (
                      <p className="text-slate-700">
                        <strong className="text-slate-900">Nome registrado:</strong> {result.history.contactName}
                      </p>
                    )}
                    <p className="text-slate-700">
                      <strong className="text-slate-900">Mensagens enviadas por nós:</strong> {result.history.sentMessages} de {result.history.totalMessages} mensagens totais
                    </p>
                    {result.history.campaignSends > 0 && (
                      <p className="text-slate-700">
                        <strong className="text-slate-900">Disparos de campanha:</strong> {result.history.campaignSends}
                      </p>
                    )}
                    {result.history.lastMessage && (
                      <p className="text-slate-700 truncate" title={result.history.lastMessage}>
                        <strong className="text-slate-900">Última mensagem:</strong> "{result.history.lastMessage}"
                      </p>
                    )}
                    {result.history.lastMessageAt && (
                      <p className="text-[11px] text-slate-500">
                        Última interação em {formatDataHora(result.history.lastMessageAt)}
                      </p>
                    )}
                  </div>

                  <div className="pt-1 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-amber-100 rounded-lg transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleIniciarChat}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <span>Abrir conversa existente</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              ) : (
                /* CASO 3: NÚMERO VÁLIDO E SEM HISTÓRICO */
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                    <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                    <span>Número verificado e disponível</span>
                  </div>
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    {result.whatsappExists
                      ? 'Conta ativa no WhatsApp confirmada e nenhuma mensagem anterior encontrada na sua base. Tudo pronto para iniciar o atendimento!'
                      : 'Nenhuma mensagem anterior encontrada na base. Você pode iniciar o contato com segurança.'}
                  </p>

                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={handleIniciarChat}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-200 active:scale-95"
                    >
                      <span>Iniciar conversa</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Footer buttons when no result or waiting */}
          {!result && (
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={checking || phone.replace(/\D/g, '').length < 10}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-2 shadow-sm"
              >
                {checking ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                <span>Verificar número</span>
              </button>
            </div>
          )}
        </form>
      </motion.div>
    </div>
  );
}
