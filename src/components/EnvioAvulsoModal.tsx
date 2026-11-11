import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  Layout,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Send,
  MessageSquare,
  Users,
  Search,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

interface ContatoFila {
  nome: string;
  telefone: string;
  temWhatsapp?: boolean | null;
  jaNaBase?: boolean;
  naoVerificado?: boolean;
}

interface EnvioAvulsoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function EnvioAvulsoModal({ isOpen, onClose, onSuccess }: EnvioAvulsoModalProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Passo 1: Contatos
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [fila, setFila] = useState<ContatoFila[]>([]);
  const [validando, setValidando] = useState(false);
  const [validacaoResultado, setValidacaoResultado] = useState<{
    temWhatsapp: boolean | null;
    jaNaBase: boolean;
    nomeNaBase?: string;
  } | null>(null);

  // Passo 2: Mensagem
  const [messageType, setMessageType] = useState<'custom' | 'template'>('custom');
  const [customText, setCustomText] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  // Passo 3: Envio
  const [enviando, setEnviando] = useState(false);

  // Carrega templates cadastrados
  useEffect(() => {
    if (isOpen) {
      const loadTemplates = async () => {
        setLoadingTemplates(true);
        try {
          const { data, error } = await supabase
            .from('message_templates')
            .select('*')
            .order('is_default', { ascending: false })
            .order('name');
          if (error) throw error;
          setTemplates(data || []);

          // Se houver padrão e texto estiver vazio
          const padrao = (data || []).find((t: any) => t.is_default);
          if (padrao && !customText) {
            setSelectedTemplateId(padrao.id);
            setSelectedTemplate(padrao);
            setMessageType('template');
          }
        } catch (err: any) {
          console.warn('[EnvioAvulso] Falha ao carregar modelos:', err.message);
        } finally {
          setLoadingTemplates(false);
        }
      };
      loadTemplates();
    }
  }, [isOpen]);

  // Tecla Esc fecha modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !enviando) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, enviando]);

  if (!isOpen) return null;

  const digitos = (v: string) => String(v || '').replace(/\D/g, '');

  const formatPhone = (val: string) => {
    const d = digitos(val);
    if (d.length <= 11) {
      if (d.length > 2 && d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
      if (d.length > 6 && d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      if (d.length > 10) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
      return d;
    }
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  };

  const handleTelefoneChange = (v: string) => {
    setTelefone(formatPhone(v));
    setValidacaoResultado(null);
  };

  const handleValidarContato = async () => {
    const clean = digitos(telefone);
    if (clean.length < 10) {
      toast.error('Informe um número válido com DDD.');
      return;
    }

    setValidando(true);
    setValidacaoResultado(null);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch('/api/whatsapp/check-number', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ phone: clean }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao verificar número');
      }

      setValidacaoResultado({
        temWhatsapp: data.whatsappExists,
        jaNaBase: !!data.history?.hasHistory,
        nomeNaBase: data.history?.contactName || undefined,
      });

      if (data.whatsappExists === false) {
        toast.error('Número não possui conta no WhatsApp.');
      } else if (data.history?.hasHistory) {
        toast.warning('Contato já possui histórico de mensagens na base.');
      } else {
        toast.success('Número válido e sem mensagens anteriores!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao validar contato');
    } finally {
      setValidando(false);
    }
  };

  const handleAdicionarFila = () => {
    const clean = digitos(telefone);
    if (clean.length < 8) {
      toast.error('Informe o telefone do contato antes de adicionar à fila.');
      return;
    }

    // Se já estiver na fila
    if (fila.some((c) => digitos(c.telefone) === clean)) {
      toast.info('Este número já está na fila.');
      return;
    }

    const novoContato: ContatoFila = {
      nome: nome.trim() || validacaoResultado?.nomeNaBase || 'Contato Avulso',
      telefone: clean,
      temWhatsapp: validacaoResultado ? validacaoResultado.temWhatsapp : null,
      jaNaBase: validacaoResultado ? validacaoResultado.jaNaBase : false,
      naoVerificado: !validacaoResultado,
    };

    setFila((prev) => [...prev, novoContato]);
    setNome('');
    setTelefone('');
    setValidacaoResultado(null);
  };

  const handleRemoverDaFila = (tel: string) => {
    setFila((prev) => prev.filter((c) => digitos(c.telefone) !== digitos(tel)));
  };

  // Garante que o contato preenchido nos inputs também entre na fila ao avançar
  const obterFilaCompleta = (): ContatoFila[] => {
    const clean = digitos(telefone);
    if (clean.length >= 8 && !fila.some((c) => digitos(c.telefone) === clean)) {
      return [
        ...fila,
        {
          nome: nome.trim() || validacaoResultado?.nomeNaBase || 'Contato Avulso',
          telefone: clean,
          temWhatsapp: validacaoResultado ? validacaoResultado.temWhatsapp : null,
          jaNaBase: validacaoResultado ? validacaoResultado.jaNaBase : false,
          naoVerificado: !validacaoResultado,
        },
      ];
    }
    return fila;
  };

  const handleAvancarParaMensagem = () => {
    const lista = obterFilaCompleta();
    if (lista.length === 0) {
      toast.error('Adicione ao menos um contato para envio.');
      return;
    }
    setFila(lista);
    setNome('');
    setTelefone('');
    setValidacaoResultado(null);
    setCurrentStep(2);
  };

  const handleAvancarParaRevisao = () => {
    if (messageType === 'custom' && !customText.trim()) {
      toast.error('Digite a mensagem a ser enviada.');
      return;
    }
    if (messageType === 'template' && !selectedTemplate) {
      toast.error('Selecione um modelo de mensagem.');
      return;
    }
    setCurrentStep(3);
  };

  const obterMensagemFinal = (nomeExemplo: string) => {
    let txt = messageType === 'custom' ? customText : selectedTemplate?.body || '';
    txt = txt.replace(/\{nome\}/gi, nomeExemplo);
    txt = txt.replace(/\{primeiro_nome\}/gi, nomeExemplo.split(' ')[0] || nomeExemplo);
    return txt;
  };

  const handleDisparar = async () => {
    const lista = fila;
    if (lista.length === 0) return;

    setEnviando(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const headers = {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const textoMensagem = messageType === 'custom' ? customText : selectedTemplate?.body || '';

      // CASO A: Apenas 1 contato -> Envio direto imediato
      if (lista.length === 1) {
        const unico = lista[0];
        const res = await fetch('/api/v2/campaigns/send-single', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            linkedCampaignId: null,
            newCampaignData: {
              name: `Envio Avulso - ${unico.nome}`,
              messageType: messageType === 'custom' ? 'custom' : 'template',
              templateId: selectedTemplate?.id || null,
              templateName: selectedTemplate?.name || 'Mensagem Avulsa',
              customText: textoMensagem,
              variables: {},
            },
            contact: {
              nome: unico.nome,
              telefone: unico.telefone,
            },
          }),
        });

        const result = await res.json();
        if (!res.ok || !result.success) {
          throw new Error(result.error || 'Falha ao enviar mensagem');
        }

        toast.success(`Mensagem enviada com sucesso para ${unico.nome}!`);
        onClose();
        if (onSuccess) onSuccess();
        return;
      }

      // CASO B: 2 ou mais contatos -> Envio em lote com intervalo seguro anti-ban
      const resContatos = await fetch('/api/v2/campaigns/ensure-contacts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contacts: lista.map((c) => ({ nome: c.nome, telefone: c.telefone })),
        }),
      });

      const dadosContatos = await resContatos.json();
      if (!dadosContatos.success) throw new Error(dadosContatos.error || 'Falha ao registrar contatos');

      const registrados = dadosContatos.data as any[];
      const falhas = (dadosContatos.falhas || []) as any[];

      const agora = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const nomeDoLote = `Disparo Avulso (${lista.length} contatos) - ${agora}`;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: novaCamp, error: erroCamp } = await supabase
        .from('campaigns')
        .insert({
          tenant_id: user.id,
          name: nomeDoLote,
          template_name: messageType === 'custom' ? 'Mensagem Personalizada' : selectedTemplate?.name,
          template_id: selectedTemplate?.id || null,
          message_type: messageType,
          custom_text: messageType === 'custom' ? textoMensagem : null,
          target_type: 'upload',
          uploaded_contacts: registrados.map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone })),
          variables: {},
          status: 'pending',
          total_contacts: registrados.length,
          sent_count: 0,
          error_count: 0,
        })
        .select()
        .single();

      if (erroCamp) throw erroCamp;

      // Inicia a execução em background da campanha
      const resStart = await fetch(`/api/v2/campaigns/${novaCamp.id}/start`, {
        method: 'POST',
        headers,
      });
      const dataStart = await resStart.json();
      if (!dataStart.success) {
        throw new Error(dataStart.error || 'Falha ao iniciar envio');
      }

      if (falhas.length) {
        toast.warning(`${falhas.length} número(s) inválidos foram ignorados.`);
      }
      toast.success(`Disparo em lote iniciado com ${registrados.length} contatos! As mensagens serão entregues com intervalo seguro.`);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('[EnvioAvulso] Erro ao disparar:', err);
      toast.error(err.message || 'Erro ao processar envio');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white w-full max-w-xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-100"
      >
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-slate-100 bg-slate-50/60 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-200 shadow-sm">
                <Zap size={20} className="fill-amber-500 text-amber-500" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 leading-tight">Envio Avulso</h2>
                <p className="text-[12px] text-slate-400">Envie mensagens diretamente pelo Chat sem criar campanhas complexas</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={enviando}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            >
              <X size={18} />
            </button>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-3">
            {[
              { s: 1, label: 'Destinatários' },
              { s: 2, label: 'Mensagem' },
              { s: 3, label: 'Revisão e Envio' },
            ].map(({ s, label }, idx) => (
              <React.Fragment key={s}>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                      currentStep >= s ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-200 text-slate-400'
                    }`}
                  >
                    {s}
                  </div>
                  <span
                    className={`text-[11px] font-black uppercase tracking-wider ${
                      currentStep >= s ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {idx < 2 && <div className="flex-1 h-[2px] bg-slate-200" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-5 md:p-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {/* PASSO 1: DESTINATÁRIOS AVULSOS */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Adicionar Contato Avulso
                  </span>
                  <span className="text-[11px] text-slate-400">
                    A partir de 2 contatos o envio é escalonado em lote
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 mb-1 block">Nome do contato (opcional)</label>
                    <input
                      type="text"
                      placeholder="Ex: João da Silva"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 mb-1 block">Telefone com DDD</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="(DDD) 99999-9999"
                        value={telefone}
                        onChange={(e) => handleTelefoneChange(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleValidarContato}
                        disabled={validando || digitos(telefone).length < 10}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-40 shrink-0"
                      >
                        {validando ? <Loader2 size={14} className="animate-spin" /> : 'Validar'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Feedback de Validação */}
                {validacaoResultado && (
                  <div
                    className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                      validacaoResultado.temWhatsapp === false
                        ? 'bg-red-50 text-red-800 border border-red-200'
                        : validacaoResultado.jaNaBase
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {validacaoResultado.temWhatsapp === false ? (
                      <>
                        <AlertCircle size={16} className="shrink-0 text-red-600" />
                        <span>Número sem conta ativa no WhatsApp.</span>
                      </>
                    ) : validacaoResultado.jaNaBase ? (
                      <>
                        <AlertCircle size={16} className="shrink-0 text-amber-600" />
                        <span>
                          Contato já na base
                          {validacaoResultado.nomeNaBase ? ` (${validacaoResultado.nomeNaBase})` : ''} — pode gerar mensagem repetida.
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                        <span>WhatsApp ativo e contato inédito!</span>
                      </>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleAdicionarFila}
                  disabled={digitos(telefone).length < 8}
                  className="w-full py-2.5 bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus size={15} />
                  <span>Adicionar à fila e limpar</span>
                </button>
              </div>

              {/* Fila de Contatos Adicionados */}
              {fila.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Users size={14} className="text-emerald-600" />
                      Fila de envio ({fila.length} contato{fila.length > 1 ? 's' : ''})
                    </span>
                    <button
                      type="button"
                      onClick={() => setFila([])}
                      className="text-[10px] font-bold text-slate-400 hover:text-red-600 uppercase tracking-wider transition-all"
                    >
                      Limpar fila
                    </button>
                  </div>

                  <div className="max-h-52 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {fila.map((c, idx) => (
                      <div
                        key={c.telefone + idx}
                        className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-5 h-5 rounded-md bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-400 text-[10px]">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 truncate">{c.nome}</p>
                            <p className="text-slate-400 font-mono text-[11px]">{c.telefone}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              c.temWhatsapp === false
                                ? 'bg-red-100 text-red-700'
                                : c.jaNaBase
                                ? 'bg-amber-100 text-amber-800'
                                : c.temWhatsapp === true
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {c.temWhatsapp === false
                              ? 'Sem WhatsApp'
                              : c.jaNaBase
                              ? 'Já na base'
                              : c.temWhatsapp === true
                              ? 'Verificado'
                              : 'Avulso'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoverDaFila(c.telefone)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {fila.some((c) => c.temWhatsapp === false) && (
                    <p className="text-[11px] font-bold text-red-600">
                      ⚠️ Há número(s) sem WhatsApp na fila que podem falhar no envio.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PASSO 2: ESCOLHER MENSAGEM */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex p-1 bg-slate-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setMessageType('custom')}
                  className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 ${
                    messageType === 'custom' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Sparkles size={14} className={messageType === 'custom' ? 'text-emerald-600' : ''} />
                  Mensagem Personalizada
                </button>
                <button
                  type="button"
                  onClick={() => setMessageType('template')}
                  className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 ${
                    messageType === 'template' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Layout size={14} className={messageType === 'template' ? 'text-emerald-600' : ''} />
                  Usar Modelo Registrado
                </button>
              </div>

              {messageType === 'custom' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Texto da Mensagem
                    </label>
                    <span className="text-[10px] font-bold text-slate-400">
                      {customText.length} caracteres
                    </span>
                  </div>

                  <textarea
                    rows={5}
                    placeholder="Olá {nome}! Tudo bem? Gostaria de falar sobre..."
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all resize-none"
                  />

                  {/* Variáveis rápidas */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">Inserir:</span>
                    <button
                      type="button"
                      onClick={() => setCustomText((prev) => prev + ' {nome}')}
                      className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-xs font-bold transition-all"
                    >
                      {'{nome}'}
                    </button>
                    {['👋', '😊', '✅', '📌', '🚀'].map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setCustomText((prev) => prev + ' ' + em)}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-xs transition-all"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Selecione um Modelo Cadastrado
                  </label>

                  {loadingTemplates ? (
                    <div className="flex items-center justify-center py-8 text-slate-400">
                      <Loader2 size={24} className="animate-spin mr-2 text-emerald-600" />
                      <span className="text-xs">Carregando modelos...</span>
                    </div>
                  ) : templates.length === 0 ? (
                    <div className="p-6 bg-slate-50 rounded-2xl text-center border border-dashed border-slate-200">
                      <p className="text-xs font-bold text-slate-600">Nenhum modelo cadastrado.</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Use a opção "Mensagem Personalizada" para digitar o texto livremente.
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {templates.map((tmpl) => (
                        <div
                          key={tmpl.id}
                          onClick={() => {
                            setSelectedTemplateId(tmpl.id);
                            setSelectedTemplate(tmpl);
                          }}
                          className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                            selectedTemplateId === tmpl.id
                              ? 'border-emerald-500 bg-emerald-50/30'
                              : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-xs text-slate-900">{tmpl.name}</span>
                            {tmpl.is_default && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black rounded uppercase">
                                Padrão
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2">{tmpl.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PASSO 3: REVISÃO E DISPARO */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Resumo do Envio
                </span>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Destinatários:</span>
                  <span className="font-bold text-slate-900">
                    {fila.length} contato{fila.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Modo de disparo:</span>
                  <span className="font-bold text-emerald-700">
                    {fila.length === 1 ? '⚡ Envio Direto Imediato' : '🛡️ Disparo em lote com intervalo seguro'}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200/80">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                    Prévia da Mensagem (exemplo: {fila[0]?.nome || 'Contato'})
                  </span>
                  <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-medium whitespace-pre-wrap">
                    {obterMensagemFinal(fila[0]?.nome || 'Contato')}
                  </div>
                </div>
              </div>

              {fila.length > 1 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    O envio será feito com pausas graduais automáticas entre cada mensagem para proteger o seu WhatsApp contra bloqueios.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 md:p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          {currentStep > 1 ? (
            <button
              type="button"
              disabled={enviando}
              onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all flex items-center gap-1.5"
            >
              <ArrowLeft size={14} />
              <span>Voltar</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={enviando}
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            >
              Cancelar
            </button>
          )}

          {currentStep === 1 && (
            <button
              type="button"
              onClick={handleAvancarParaMensagem}
              disabled={obterFilaCompleta().length === 0}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm disabled:opacity-40"
            >
              <span>Escolher Mensagem</span>
              <ArrowRight size={14} />
            </button>
          )}

          {currentStep === 2 && (
            <button
              type="button"
              onClick={handleAvancarParaRevisao}
              disabled={messageType === 'custom' ? !customText.trim() : !selectedTemplate}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm disabled:opacity-40"
            >
              <span>Revisão do Envio</span>
              <ArrowRight size={14} />
            </button>
          )}

          {currentStep === 3 && (
            <button
              type="button"
              onClick={handleDisparar}
              disabled={enviando}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-md shadow-emerald-200 active:scale-95 disabled:opacity-50"
            >
              {enviando ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>{fila.length === 1 ? 'Enviar Mensagem Agora' : `Disparar para ${fila.length} Contatos`}</span>
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
