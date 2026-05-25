import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Sparkles, Send, Loader2, ChevronLeft,
  CheckCircle2, AlertTriangle, RefreshCw, FileText, Library,
  Image, Plus, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { generateMetaTemplate, submitMetaTemplate } from '../services/supabaseService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
  /** Pre-fill form and optionally jump to preview (for clone / library quick-start) */
  initialData?: {
    name?: string;
    category?: string;
    language?: string;
    bodyText?: string;
    description?: string;
    skipToPreview?: boolean;
  };
}

const LIBRARY = [
  {
    slug: 'confirmacao_pedido', category: 'UTILITY', language: 'pt_BR',
    label: 'Confirmação de pedido',
    body: 'Olá {{1}}! Seu pedido #{{2}} foi confirmado. Valor: R$ {{3}}. Prazo de entrega: {{4}}. Qualquer dúvida, estamos aqui!',
    examples: ['João', '12345', '129,90', '3 dias úteis'],
  },
  {
    slug: 'lembrete_agendamento', category: 'UTILITY', language: 'pt_BR',
    label: 'Lembrete de agendamento',
    body: 'Olá {{1}}, passando para lembrar do seu agendamento amanhã às {{2}}. Para confirmar responda *SIM*, para reagendar responda *REAGENDAR*.',
    examples: ['Maria', '14h'],
  },
  {
    slug: 'boas_vindas', category: 'UTILITY', language: 'pt_BR',
    label: 'Boas-vindas ao cliente',
    body: 'Olá {{1}}, seja muito bem-vindo(a) à {{2}}! Estou aqui para te ajudar com o que precisar. Como posso te ajudar hoje?',
    examples: ['Carlos', 'Zyreo'],
  },
  {
    slug: 'codigo_verificacao', category: 'AUTHENTICATION', language: 'pt_BR',
    label: 'Código de verificação',
    body: 'Seu código de verificação é: *{{1}}*. Válido por {{2}} minutos. Nunca compartilhe este código.',
    examples: ['482910', '10'],
  },
  {
    slug: 'atualizacao_entrega', category: 'UTILITY', language: 'pt_BR',
    label: 'Atualização de entrega',
    body: 'Olá {{1}}! Seu pedido #{{2}} está a caminho. Previsão: {{3}}. Rastreio: {{4}}. Bom recebimento!',
    examples: ['Ana', '67890', 'amanhã até 18h', 'BR12345'],
  },
  {
    slug: 'lembrete_pagamento', category: 'UTILITY', language: 'pt_BR',
    label: 'Lembrete de vencimento',
    body: 'Olá {{1}}, sua fatura de R$ {{2}} vence em {{3}}. Evite juros e pague em dia. Em caso de dúvidas, responda esta mensagem.',
    examples: ['Pedro', '350,00', '30/05'],
  },
  {
    slug: 'pesquisa_satisfacao', category: 'UTILITY', language: 'pt_BR',
    label: 'Pesquisa de satisfação',
    body: 'Olá {{1}}, gostaríamos de saber sua opinião sobre o atendimento de {{2}}. De 0 a 10, qual nota você daria? Sua resposta é muito importante para nós!',
    examples: ['Juliana', 'ontem'],
  },
  {
    slug: 'cancelamento_confirmado', category: 'UTILITY', language: 'pt_BR',
    label: 'Cancelamento confirmado',
    body: 'Olá {{1}}, confirmamos o cancelamento do pedido #{{2}}. O estorno de R$ {{3}} será realizado em até {{4}} dias úteis.',
    examples: ['Lucas', '99001', '89,90', '5'],
  },
  {
    slug: 'produto_disponivel', category: 'MARKETING', language: 'pt_BR',
    label: 'Produto disponível',
    body: 'Olá {{1}}! O produto {{2}} que você se interessou está disponível novamente. Aproveite enquanto há estoque!',
    examples: ['Sara', 'Tênis Nike Air Max'],
  },
  {
    slug: 'reativacao_cliente', category: 'MARKETING', language: 'pt_BR',
    label: 'Reativação de cliente',
    body: 'Olá {{1}}, sentimos sua falta! Você não nos visita há {{2}} dias. Temos novidades e ofertas esperando por você. Que tal dar uma olhada?',
    examples: ['Marcos', '30'],
  },
] as const;

const CATEGORIES = [
  { value: 'UTILITY', label: 'Utilitário', desc: 'Confirmações, lembretes, atualizações de pedido' },
  { value: 'MARKETING', label: 'Marketing', desc: 'Promoções, ofertas, novidades' },
  { value: 'AUTHENTICATION', label: 'Autenticação', desc: 'Códigos OTP, verificação de conta' },
];

const LANGUAGES = [
  { value: 'pt_BR', label: 'Português (BR)' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'es', label: 'Español' },
];

type Step = 'intent' | 'preview' | 'done';
type ButtonItem = { id: number; type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url: string; phone: string };

function toSnakeCase(s: string) {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function countVars(text: string) {
  return text.match(/\{\{\d+\}\}/g)?.length || 0;
}

/** Pre-flight checklist item */
function Check({ ok, warn, label }: { ok?: boolean; warn?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      {ok === false || warn ? (
        <AlertTriangle size={12} className={warn ? 'text-amber-500' : 'text-red-500'} />
      ) : (
        <CheckCircle2 size={12} className="text-emerald-500" />
      )}
      <span className={ok === false ? 'text-red-700' : warn ? 'text-amber-700' : 'text-slate-600'}>{label}</span>
    </div>
  );
}

export default function TemplateBuilderModal({ isOpen, onClose, onSubmitted, initialData }: Props) {
  // Step 1 — intent
  const [name, setName] = useState('');
  const [category, setCategory] = useState('UTILITY');
  const [language, setLanguage] = useState('pt_BR');
  const [description, setDescription] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);

  // Step 2 — preview
  const [bodyText, setBodyText] = useState('');
  const [exampleValues, setExampleValues] = useState<string[]>([]);
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [aiNotes, setAiNotes] = useState('');
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);

  // Header media & buttons
  const [headerType, setHeaderType] = useState<'none' | 'text' | 'image'>('none');
  const [headerImageUrl, setHeaderImageUrl] = useState('');
  const [buttons, setButtons] = useState<ButtonItem[]>([]);
  const [nextBtnId, setNextBtnId] = useState(0);

  // State
  const [step, setStep] = useState<Step>('intent');
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [metaId, setMetaId] = useState<string | null>(null);

  // Apply initialData when modal opens (clone / quick-start)
  useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      if (initialData.name) setName(initialData.name);
      if (initialData.category) setCategory(initialData.category);
      if (initialData.language) setLanguage(initialData.language);
      if (initialData.description) setDescription(initialData.description);
      if (initialData.bodyText) {
        setBodyText(initialData.bodyText);
        const n = countVars(initialData.bodyText);
        setExampleValues(Array(n).fill(''));
      }
      if (initialData.skipToPreview && initialData.bodyText) {
        setStep('preview');
      }
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const slug = useMemo(() => toSnakeCase(name), [name]);
  const varCount = useMemo(() => countVars(bodyText), [bodyText]);
  const charCount = bodyText.length;

  // Pre-flight checks for step 2
  const checks = useMemo(() => ({
    nameOk: /^[a-z0-9_]{3,}$/.test(slug),
    charOk: charCount > 0 && charCount <= 1024,
    examplesOk: varCount === 0 || exampleValues.slice(0, varCount).every(v => v.trim().length > 0),
    noShortUrl: !/(bit\.ly|tinyurl)/i.test(bodyText),
    noSpam: !/(ganhe r\$|renda extra|investimento garantido)/i.test(bodyText),
    noCaps: (() => {
      const letters = bodyText.replace(/[^a-zA-ZÀ-ú]/g, '');
      if (letters.length < 10) return true;
      const upper = letters.replace(/[^A-ZÀ-Ú]/g, '');
      return upper.length / letters.length <= 0.7;
    })(),
    btnOk: buttons.every(b =>
      b.text.trim().length > 0 &&
      (b.type !== 'URL' || b.url.trim().length > 0) &&
      (b.type !== 'PHONE_NUMBER' || b.phone.trim().length > 0)
    ),
  }), [slug, charCount, varCount, exampleValues, bodyText, buttons]);

  const canSubmit =
    checks.nameOk && checks.charOk && checks.examplesOk &&
    checks.noShortUrl && checks.noSpam && checks.noCaps && checks.btnOk && !submitting;

  function reset() {
    setStep('intent');
    setShowLibrary(false);
    setName(''); setCategory('UTILITY'); setLanguage('pt_BR'); setDescription('');
    setBodyText(''); setExampleValues([]); setHeaderText(''); setFooterText('');
    setAiNotes(''); setAiWarnings([]); setMetaId(null);
    setHeaderType('none'); setHeaderImageUrl(''); setButtons([]); setNextBtnId(0);
  }

  function applyLibraryItem(item: typeof LIBRARY[number]) {
    setName(item.slug);
    setCategory(item.category);
    setLanguage(item.language);
    setBodyText(item.body);
    setExampleValues([...item.examples]);
    setAiNotes('');
    setAiWarnings([]);
    setShowLibrary(false);
    setStep('preview');
  }

  async function handleGenerate() {
    if (!name.trim() || !description.trim()) {
      toast.error('Preencha o nome e a descrição antes de gerar');
      return;
    }
    setGenerating(true);
    try {
      const res = await generateMetaTemplate({ template_name: slug, category, language, description });
      if (!res.success) {
        toast.error(res.error || 'Falha na geração por IA');
        return;
      }
      setBodyText(res.body_text);
      setExampleValues(res.example_values || Array(res.var_count).fill(''));
      setAiNotes(res.notes || '');
      setAiWarnings(res.warnings || []);
      setStep('preview');
    } catch (e: any) {
      toast.error(e.message || 'Erro na geração');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await submitMetaTemplate({
        template_name: slug,
        category,
        language,
        body_text: bodyText,
        example_values: exampleValues.slice(0, varCount),
        header_text: headerType === 'text' ? (headerText || undefined) : undefined,
        header_image_url: headerType === 'image' ? (headerImageUrl.trim() || undefined) : undefined,
        footer_text: footerText || undefined,
        buttons: buttons.length > 0 ? buttons.map(b => ({
          type: b.type,
          text: b.text,
          ...(b.type === 'URL' && { url: b.url }),
          ...(b.type === 'PHONE_NUMBER' && { phone_number: b.phone }),
        })) : undefined,
      });
      if (!res.success) {
        toast.error(res.error || 'Falha ao enviar para a Meta');
        return;
      }
      setMetaId(res.meta_id || null);
      setStep('done');
      onSubmitted?.();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao submeter template');
    } finally {
      setSubmitting(false);
    }
  }

  function addButton() {
    if (buttons.length >= 3) return;
    setButtons(prev => [...prev, { id: nextBtnId, type: 'QUICK_REPLY', text: '', url: '', phone: '' }]);
    setNextBtnId(n => n + 1);
  }
  function updateButton(id: number, patch: Partial<ButtonItem>) {
    setButtons(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  }
  function removeButton(id: number) {
    setButtons(prev => prev.filter(b => b.id !== id));
  }

  // Sync example values array length when body text changes
  function handleBodyChange(val: string) {
    setBodyText(val);
    const n = countVars(val);
    setExampleValues(prev => {
      if (prev.length === n) return prev;
      const next = [...prev];
      while (next.length < n) next.push('');
      return next.slice(0, n);
    });
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-violet-50 flex items-center justify-center">
                  <Sparkles size={18} className="text-violet-600" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">Criar Novo Template</h2>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {step === 'intent' && 'Descreva o objetivo — a IA gera o texto'}
                    {step === 'preview' && 'Revise, edite e envie para aprovação da Meta'}
                    {step === 'done' && 'Template enviado para revisão'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={onClose} className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            {/* Step indicators */}
            <div className="px-6 pt-4 flex items-center gap-2">
              {(['intent', 'preview', 'done'] as Step[]).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-colors ${
                    step === s ? 'bg-violet-600 text-white' :
                    (['intent', 'preview', 'done'].indexOf(step) > i) ? 'bg-emerald-500 text-white' :
                    'bg-slate-100 text-slate-400'
                  }`}>{i + 1}</div>
                  {i < 2 && <div className={`h-0.5 w-8 rounded ${(['intent', 'preview', 'done'].indexOf(step) > i) ? 'bg-emerald-400' : 'bg-slate-100'}`} />}
                </div>
              ))}
              <span className="ml-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                {step === 'intent' ? 'Intenção' : step === 'preview' ? 'Revisão' : 'Enviado'}
              </span>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">

              {/* ── STEP 1: Intent ── */}
              {step === 'intent' && (
                <>
                  {/* Quick-start library */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowLibrary(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-[11px] font-black text-violet-700 uppercase tracking-widest">
                        <Library size={13} /> Início Rápido — Biblioteca de templates
                      </span>
                      <span className="text-[10px] text-violet-500">{showLibrary ? 'Fechar ▲' : 'Ver modelos ▼'}</span>
                    </button>
                    {showLibrary && (
                      <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                        {LIBRARY.map(item => (
                          <button
                            key={item.slug}
                            type="button"
                            onClick={() => applyLibraryItem(item)}
                            className="text-left p-3 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50 transition-all group"
                          >
                            <p className="text-[11px] font-bold text-slate-900 group-hover:text-violet-700">{item.label}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-widest">{item.category}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nome do template</label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="ex: confirmacao_pedido"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm"
                    />
                    {name && (
                      <p className="text-[10px] text-slate-400">
                        Slug: <span className={`font-mono ${/^[a-z0-9_]{3,}$/.test(slug) ? 'text-emerald-600' : 'text-red-500'}`}>{slug || '—'}</span>
                        {!/^[a-z0-9_]{3,}$/.test(slug) && <span className="ml-1 text-red-500">(apenas letras minúsculas, números e _)</span>}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Categoria</label>
                      <div className="space-y-1.5">
                        {CATEGORIES.map(c => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setCategory(c.value)}
                            className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition-all ${
                              category === c.value
                                ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-300'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="font-bold text-slate-900">{c.label}</div>
                            <div className="text-slate-400 text-[10px] mt-0.5">{c.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Idioma</label>
                      <div className="space-y-1.5">
                        {LANGUAGES.map(l => (
                          <button
                            key={l.value}
                            type="button"
                            onClick={() => setLanguage(l.value)}
                            className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition-all ${
                              language === l.value
                                ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-300'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <span className="font-bold text-slate-900">{l.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Descreva o objetivo</label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={3}
                      placeholder="Ex: Confirmar ao cliente que o pedido foi aprovado e informar o prazo estimado de entrega."
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm resize-none"
                    />
                    <p className="text-[10px] text-slate-400">Quanto mais detalhado, melhor o resultado da IA.</p>
                  </div>
                </>
              )}

              {/* ── STEP 2: Preview & Edit ── */}
              {step === 'preview' && (
                <>
                  {aiWarnings.length > 0 && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                      {aiWarnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700">
                          <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Corpo do template</label>
                      <span className={`text-[10px] font-bold ${charCount > 1024 ? 'text-red-500' : 'text-slate-400'}`}>{charCount}/1024</span>
                    </div>
                    <textarea
                      value={bodyText}
                      onChange={e => handleBodyChange(e.target.value)}
                      rows={6}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm font-mono resize-none"
                    />
                    <p className="text-[10px] text-slate-400">Use {'{{1}}'}, {'{{2}}'}, … para variáveis dinâmicas.</p>
                  </div>

                  {/* Cabeçalho */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cabeçalho <span className="font-normal normal-case">(opcional)</span></label>
                      <div className="flex gap-1">
                        {(['none', 'text', 'image'] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setHeaderType(t)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                              headerType === t
                                ? 'bg-violet-600 text-white border-violet-600'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {t === 'image' && <Image size={10} />}
                            {t === 'none' ? 'Nenhum' : t === 'text' ? 'Texto' : 'Imagem'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {headerType === 'text' && (
                      <input
                        type="text"
                        value={headerText}
                        onChange={e => setHeaderText(e.target.value)}
                        maxLength={60}
                        placeholder="Título curto (máx 60 chars)"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm"
                      />
                    )}
                    {headerType === 'image' && (
                      <input
                        type="url"
                        value={headerImageUrl}
                        onChange={e => setHeaderImageUrl(e.target.value)}
                        placeholder="URL da imagem de exemplo (https://...)"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm"
                      />
                    )}
                  </div>

                  {/* Rodapé */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rodapé <span className="font-normal normal-case">(opcional)</span></label>
                    <input
                      type="text"
                      value={footerText}
                      onChange={e => setFooterText(e.target.value)}
                      maxLength={60}
                      placeholder="Texto pequeno ao fim"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm"
                    />
                  </div>

                  {/* Botões */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Botões <span className="font-normal normal-case">(opcional, máx 3)</span>
                      </label>
                      {buttons.length < 3 && (
                        <button
                          type="button"
                          onClick={addButton}
                          className="flex items-center gap-1 text-[10px] font-black text-violet-600 hover:text-violet-800 transition-colors"
                        >
                          <Plus size={11} /> Adicionar
                        </button>
                      )}
                    </div>
                    {buttons.length === 0 && (
                      <p className="text-[10px] text-slate-400">Nenhum botão adicionado. Botões permitem respostas rápidas ou links de ação.</p>
                    )}
                    {buttons.map(btn => (
                      <div key={btn.id} className="p-3 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <select
                            value={btn.type}
                            onChange={e => updateButton(btn.id, { type: e.target.value as ButtonItem['type'] })}
                            className="px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700 bg-white outline-none"
                          >
                            <option value="QUICK_REPLY">Resposta Rápida</option>
                            <option value="URL">Link (URL)</option>
                            <option value="PHONE_NUMBER">Telefone</option>
                          </select>
                          <input
                            type="text"
                            value={btn.text}
                            onChange={e => updateButton(btn.id, { text: e.target.value })}
                            maxLength={25}
                            placeholder="Texto do botão (máx 25)"
                            className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removeButton(btn.id)}
                            className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {btn.type === 'URL' && (
                          <input
                            type="url"
                            value={btn.url}
                            onChange={e => updateButton(btn.id, { url: e.target.value })}
                            placeholder="https://..."
                            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm"
                          />
                        )}
                        {btn.type === 'PHONE_NUMBER' && (
                          <input
                            type="tel"
                            value={btn.phone}
                            onChange={e => updateButton(btn.id, { phone: e.target.value })}
                            placeholder="+55 11 99999-9999"
                            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {varCount > 0 && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Exemplos de valores ({varCount} variável{varCount !== 1 ? 'is' : ''})
                        <span className="ml-1 font-normal normal-case text-slate-400">— obrigatório para aprovação da Meta</span>
                      </label>
                      {Array.from({ length: varCount }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-400 w-8">{`{{${i+1}}}`}</span>
                          <input
                            type="text"
                            value={exampleValues[i] || ''}
                            onChange={e => {
                              const next = [...exampleValues];
                              next[i] = e.target.value;
                              setExampleValues(next);
                            }}
                            placeholder={`Exemplo para {{${i+1}}}`}
                            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:border-violet-400 outline-none text-sm"
                          />
                        </div>
                      ))}
                      {aiNotes && <p className="text-[10px] text-slate-400 italic">{aiNotes}</p>}
                    </div>
                  )}

                  {/* Pre-flight checklist */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Checklist pré-envio</p>
                    <Check ok={checks.nameOk} label={`Nome válido: ${slug}`} />
                    <Check ok={checks.charOk} label={`Comprimento: ${charCount} / 1024 chars`} />
                    {varCount > 0 && <Check ok={checks.examplesOk} label={`Exemplos preenchidos (${varCount} variável${varCount !== 1 ? 'is' : ''})`} />}
                    <Check ok={checks.noShortUrl} label="Sem URLs encurtadas" />
                    <Check ok={checks.noSpam} warn={!checks.noSpam} label="Sem linguagem financeira/spam" />
                    <Check ok={checks.noCaps} warn={!checks.noCaps} label="Sem excesso de MAIÚSCULAS" />
                    {buttons.length > 0 && <Check ok={checks.btnOk} label={`Botões válidos (${buttons.length})`} />}
                  </div>

                  {/* Live preview */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pré-visualização final</label>
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-100 overflow-hidden">
                      {headerType === 'image' && headerImageUrl && (
                        <img
                          src={headerImageUrl}
                          alt="Header"
                          className="w-full h-32 object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <div className="p-4 space-y-2 text-sm text-slate-800">
                        {headerType === 'text' && headerText && (
                          <p className="font-black text-slate-900">{headerText}</p>
                        )}
                        <div className="whitespace-pre-wrap">
                          {(() => {
                            let t = bodyText;
                            exampleValues.forEach((v, i) => { t = t.replace(`{{${i+1}}}`, v || `{{${i+1}}}`); });
                            return t || <span className="text-slate-400 italic">Escreva o corpo acima…</span>;
                          })()}
                        </div>
                        {footerText && <p className="text-[11px] text-slate-400">{footerText}</p>}
                        {buttons.length > 0 && (
                          <div className="border-t border-emerald-200 pt-2 flex flex-wrap gap-1.5">
                            {buttons.map(btn => (
                              <span
                                key={btn.id}
                                className="px-3 py-1 rounded-full bg-white border border-emerald-200 text-[11px] font-bold text-emerald-700"
                              >
                                {btn.text || '(sem texto)'}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── STEP 3: Done ── */}
              {step === 'done' && (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                    <CheckCircle2 size={36} className="text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Template enviado!</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      A Meta irá revisar <span className="font-bold text-slate-700">{slug}</span> em até 1-3 dias úteis.
                    </p>
                    {metaId && <p className="text-[10px] text-slate-400 mt-2 font-mono">ID Meta: {metaId}</p>}
                  </div>
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 text-left max-w-sm">
                    <p className="font-black uppercase tracking-widest text-[10px] mb-1">Próximos passos</p>
                    <ul className="space-y-1 list-disc list-inside">
                      <li>Aguarde o e-mail de aprovação da Meta</li>
                      <li>O status aparecerá como PENDING na lista de templates</li>
                      <li>Após aprovação (APPROVED), o template estará disponível para envio</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
              <div>
                {step === 'preview' && (
                  <button
                    type="button"
                    onClick={() => setStep('intent')}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <ChevronLeft size={13} /> Voltar
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {step !== 'done' && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-3 rounded-2xl border border-slate-200 bg-white text-slate-600 font-black uppercase tracking-widest text-[10px] hover:bg-slate-100 transition-all"
                  >
                    Cancelar
                  </button>
                )}

                {step === 'intent' && (
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating || !name.trim() || !description.trim()}
                    className="px-6 py-3 rounded-2xl bg-violet-600 text-white font-black uppercase tracking-widest text-[10px] hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                  >
                    {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {generating ? 'Gerando…' : 'Gerar com IA'}
                  </button>
                )}

                {step === 'preview' && (
                  <>
                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={generating}
                      className="px-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-600 font-black uppercase tracking-widest text-[10px] hover:bg-slate-100 disabled:opacity-40 transition-all flex items-center gap-2"
                    >
                      {generating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                      Regenerar
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      className="px-6 py-3 rounded-2xl bg-emerald-600 text-white font-black uppercase tracking-widest text-[10px] hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {submitting ? 'Enviando…' : 'Enviar para Meta'}
                    </button>
                  </>
                )}

                {step === 'done' && (
                  <>
                    <button
                      type="button"
                      onClick={reset}
                      className="px-5 py-3 rounded-2xl border border-slate-200 bg-white text-slate-600 font-black uppercase tracking-widest text-[10px] hover:bg-slate-100 transition-all flex items-center gap-2"
                    >
                      <FileText size={13} /> Criar Outro
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-6 py-3 rounded-2xl bg-primary-600 text-white font-black uppercase tracking-widest text-[10px] hover:bg-primary-700 transition-all"
                    >
                      Fechar
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
