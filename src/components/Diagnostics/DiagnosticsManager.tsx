import React, { useState, useEffect } from 'react';
import { 
  Rocket, 
  Search, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  ArrowLeft, 
  Check, 
  FileText, 
  ExternalLink, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Copy, 
  Download, 
  Loader2, 
  Sparkles, 
  Upload, 
  Image as ImageIcon,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

// Type definitions matching database schema
interface SemaphoreDetail {
  status: 'VERDE' | 'AMARELO' | 'VERMELHO';
  justification: string;
}

interface ScenarioCurrent {
  first_impression?: SemaphoreDetail;
  contact_friction?: SemaphoreDetail;
  objections_handling?: SemaphoreDetail;
  [key: string]: any;
}

interface ActionItem {
  task: string;
  impact: 'Alto' | 'Médio' | 'Baixo';
  difficulty: 'Alta' | 'Média' | 'Baixa';
}

interface ActionPlan {
  short_term?: ActionItem[];
  medium_term?: ActionItem[];
}

interface ContentScript {
  title: string;
  hook: string;
  body: string;
  cta: string;
}

interface ContentStrategy {
  authority: string;
  connection: string;
  objections: string;
}

interface ExecutionGuide {
  content_scripts?: ContentScript[];
  content_strategy?: ContentStrategy;
  next_steps_traffic?: string;
  strategic_directions?: string[];
}

interface Diagnostic {
  id: string;
  client_name: string;
  niche: string;
  main_product?: string;
  main_objections?: string;
  instagram_link?: string;
  website_link?: string;
  gmb_link?: string;
  additional_info?: string;
  screenshot_urls?: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  scenario_current?: ScenarioCurrent;
  action_plan?: ActionPlan;
  execution_guide?: ExecutionGuide;
  created_at: string;
}

export default function DiagnosticsManager() {
  const [view, setView] = useState<'list' | 'create' | 'report'>('list');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [clientName, setClientName] = useState('');
  const [niche, setNiche] = useState('');
  const [mainProduct, setMainProduct] = useState('');
  const [mainObjections, setMainObjections] = useState('');
  const [instagramLink, setInstagramLink] = useState('');
  const [websiteLink, setWebsiteLink] = useState('');
  const [gmbLink, setGmbLink] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  
  // Processing State
  const [creationStatus, setCreationStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [creationProgressText, setCreationProgressText] = useState('');

  // Loaded Diagnostic for view/edit
  const [activeDiagnostic, setActiveDiagnostic] = useState<Diagnostic | null>(null);
  const [editScenario, setEditScenario] = useState<ScenarioCurrent>({});
  const [editActionPlan, setEditActionPlan] = useState<ActionPlan>({});
  const [editExecutionGuide, setEditExecutionGuide] = useState<ExecutionGuide>({});

  // 1. Fetch Diagnostics List
  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/v2/admin/diagnostics', {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      const result = await response.json();

      if (!response.ok) {
        if (result.code === 'MIGRATION_PENDING') {
          toast.error('Erro de Migração', {
            description: result.error,
            duration: 10000
          });
        } else {
          throw new Error(result.error || 'Erro ao carregar diagnósticos.');
        }
        return;
      }

      setDiagnostics(result.data || []);
    } catch (err: any) {
      console.error(err);
      toast.error('Falha ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  // Listen for paste events to capture screenshots directly from clipboard
  useEffect(() => {
    if (view !== 'create') return;

    const handlePaste = (e: ClipboardEvent) => {
      // Ignore if user is typing in a text field, but only if they are not pasting in a non-text area
      // Actually, we want to allow paste globally in the form, as they might have just snapped a screenshot
      const items = e.clipboardData?.items;
      if (!items) return;

      const newFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            const ext = file.type.split('/')[1] || 'png';
            const pastedFile = new File([file], `screenshot_pasted_${Date.now()}_${i}.${ext}`, { type: file.type });
            
            if (pastedFile.size <= 10 * 1024 * 1024) {
              newFiles.push(pastedFile);
            } else {
              toast.error(`A imagem colada excede o limite de 10MB.`);
            }
          }
        }
      }

      if (newFiles.length > 0) {
        setSelectedFiles(prev => {
          const combined = [...prev, ...newFiles].slice(0, 5);
          setFilePreviews(combined.map(f => URL.createObjectURL(f)));
          return combined;
        });
        toast.success(`${newFiles.length} imagem(ns) colada(s) da área de transferência!`);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [view]);

  // Poll processing diagnostics until they complete
  useEffect(() => {
    const processingItems = diagnostics.filter(d => d.status === 'processing');
    if (processingItems.length === 0) return;

    const interval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      let updatedSome = false;
      const updatedList = await Promise.all(diagnostics.map(async (d) => {
        if (d.status === 'processing') {
          try {
            const res = await fetch(`/api/v2/admin/diagnostics/${d.id}`, {
              headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
            });
            const resJson = await res.json();
            if (resJson.success && resJson.data.status !== 'processing') {
              updatedSome = true;
              return resJson.data;
            }
          } catch (e) {
            console.error(e);
          }
        }
        return d;
      }));

      if (updatedSome) {
        setDiagnostics(updatedList);
        // If active diagnostic is processing, update it too
        if (activeDiagnostic && activeDiagnostic.status === 'processing') {
          const activeUpdated = updatedList.find(d => d.id === activeDiagnostic.id);
          if (activeUpdated && activeUpdated.status !== 'processing') {
            setActiveDiagnostic(activeUpdated);
            loadDiagnosticForEditing(activeUpdated);
            toast.success(`Diagnóstico de ${activeUpdated.client_name} foi processado!`);
          }
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [diagnostics, activeDiagnostic]);

  const loadDiagnosticForEditing = (diag: Diagnostic) => {
    setEditScenario(diag.scenario_current || {});
    setEditActionPlan(diag.action_plan || { short_term: [], medium_term: [] });
    setEditExecutionGuide(diag.execution_guide || {
      content_scripts: [],
      content_strategy: { authority: '', connection: '', objections: '' },
      next_steps_traffic: ''
    });
  };

  const handleOpenDiagnostic = (diag: Diagnostic) => {
    setActiveDiagnostic(diag);
    loadDiagnosticForEditing(diag);
    setView('report');
    setIsEditing(false);
  };

  // 2. File Upload Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    
    // Validate size (10MB max) and type
    const validFiles = files.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isValidSize = file.size <= 10 * 1024 * 1024;
      if (!isImage) toast.error(`O arquivo ${file.name} não é uma imagem válida.`);
      if (!isValidSize) toast.error(`O arquivo ${file.name} excede o limite de 10MB.`);
      return isImage && isValidSize;
    });

    const newFiles = [...selectedFiles, ...validFiles].slice(0, 5); // Limit max 5 images
    setSelectedFiles(newFiles);

    const previews = newFiles.map(file => URL.createObjectURL(file));
    setFilePreviews(previews);
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    
    const newPreviews = filePreviews.filter((_, i) => i !== index);
    setFilePreviews(newPreviews);
  };

  // 3. Create Diagnostic Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !niche.trim()) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }

    setCreationStatus('uploading');
    setCreationProgressText('Fazendo upload de prints...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append('clientName', clientName);
      formData.append('niche', niche);
      formData.append('mainProduct', mainProduct);
      formData.append('mainObjections', mainObjections);
      formData.append('instagramLink', instagramLink);
      formData.append('websiteLink', websiteLink);
      formData.append('gmbLink', gmbLink);
      formData.append('additionalInfo', additionalInfo);
      
      selectedFiles.forEach(file => {
        formData.append('screenshots', file);
      });

      const response = await fetch('/api/v2/admin/diagnostics', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: formData // Let the browser set Content-Type header with boundaries
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao iniciar diagnóstico.');
      }

      setCreationStatus('processing');
      setCreationProgressText('A IA Vision está avaliando a presença digital do cliente...');
      
      toast.info('Análise iniciada em segundo plano!', {
        description: 'Você pode acompanhar o status na lista principal ou aguardar na tela.'
      });

      // Navigate to the loading/processing view of the newly created diagnostic
      const newDiag = result.data;
      setDiagnostics([newDiag, ...diagnostics]);
      setActiveDiagnostic(newDiag);
      setView('report');
      
      // Reset form fields
      setClientName('');
      setNiche('');
      setMainProduct('');
      setMainObjections('');
      setInstagramLink('');
      setWebsiteLink('');
      setGmbLink('');
      setAdditionalInfo('');
      setSelectedFiles([]);
      setFilePreviews([]);
      setCreationStatus('idle');

    } catch (err: any) {
      console.error(err);
      setCreationStatus('error');
      setCreationProgressText(err.message || 'Falha ao iniciar processo.');
      toast.error('Falha ao gerar relatório.');
    }
  };

  // 4. Save Changes (Edit Mode)
  const handleSaveReport = async () => {
    if (!activeDiagnostic) return;
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/v2/admin/diagnostics/${activeDiagnostic.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clientName: activeDiagnostic.client_name,
          niche: activeDiagnostic.niche,
          mainProduct: activeDiagnostic.main_product,
          mainObjections: activeDiagnostic.main_objections,
          instagramLink: activeDiagnostic.instagram_link,
          websiteLink: activeDiagnostic.website_link,
          gmbLink: activeDiagnostic.gmb_link,
          additionalInfo: activeDiagnostic.additional_info,
          scenario_current: editScenario,
          action_plan: editActionPlan,
          execution_guide: editExecutionGuide
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao salvar alterações.');

      setActiveDiagnostic(result.data);
      setDiagnostics(diagnostics.map(d => d.id === result.data.id ? result.data : d));
      setIsEditing(false);
      toast.success('Alterações salvas com sucesso!');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Falha ao salvar alterações.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Delete Diagnostic
  const handleDeleteDiagnostic = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Tem certeza de que deseja excluir este diagnóstico?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/v2/admin/diagnostics/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
      });

      if (!response.ok) throw new Error('Erro ao deletar registro.');

      setDiagnostics(diagnostics.filter(d => d.id !== id));
      toast.success('Diagnóstico excluído com sucesso.');
      if (activeDiagnostic?.id === id) setView('list');
    } catch (err: any) {
      console.error(err);
      toast.error('Falha ao excluir o diagnóstico.');
    }
  };

  // Print PDF Trigger
  const handlePrint = () => {
    window.print();
  };

  // Copy Content Script Copywriting helper
  const handleCopyScript = (scriptText: string) => {
    navigator.clipboard.writeText(scriptText);
    toast.success('Roteiro copiado para a área de transferência!');
  };

  // Filtered List
  const filteredDiagnostics = diagnostics.filter(d => {
    const query = searchQuery.toLowerCase();
    return d.client_name.toLowerCase().includes(query) || d.niche.toLowerCase().includes(query);
  });

  // Helpers to render Semaphore Badges
  const renderSemaphoreBadge = (status?: string) => {
    switch (status) {
      case 'VERDE':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">VERDE</span>;
      case 'AMARELO':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">AMARELO</span>;
      case 'VERMELHO':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">VERMELHO</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-50 text-slate-500 border border-slate-200">N/A</span>;
    }
  };

  return (
    <div className="w-full h-full min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8 font-sans overflow-x-hidden">
      
      {/* Estilos para impressão que resetam o layout do app do Sofia e garantem paginação sem cortes */}
      <style>{`
        @media print {
          /* Esconder menus laterais, cabeçalhos, botões de ação e modais do app */
          aside,
          header,
          nav,
          button,
          .print-hidden,
          .print\\:hidden,
          .print-exclude {
            display: none !important;
          }

          /* Resetar overflows escondidos e alturas fixas de todo o app para permitir quebra de página */
          body, html, #root, #root > div, main, .w-full, .h-full, .flex {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }

          /* Garantir que o container do relatório ocupe toda a página naturalmente */
          .printable-report {
            display: block !important;
            position: relative !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            overflow: visible !important;
          }

          /* Quebras de linha e pre-wrap legíveis */
          pre, code {
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
          }

          /* Evitar quebras de página no meio de critérios do semáforo */
          section, .border {
            page-break-inside: avoid !important;
          }

          /* Quebra de página explícita antes das seções */
          .page-break-before {
            page-break-before: always !important;
          }
        }
      `}</style>
      
      {/* ─── HEADER ─── */}
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Rocket className="text-emerald-500 w-7 h-7" /> Motor de Diagnóstico e Onboarding
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Auditoria estratégica de presença digital e roteiros de CRO com IA Vision para novos clientes.
          </p>
        </div>
        
        {view === 'list' && (
          <button
            onClick={() => setView('create')}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-500/10 cursor-pointer"
          >
            <Plus size={18} /> Novo Diagnóstico
          </button>
        )}
      </header>

      {/* ─── MAIN CONTAINER ─── */}
      <main className="max-w-7xl mx-auto">
        
        {/* ── VIEW: LIST ── */}
        {view === 'list' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar cliente ou nicho..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                />
              </div>
              <button 
                onClick={fetchDiagnostics} 
                className="w-full sm:w-auto text-slate-500 hover:text-slate-900 border border-slate-200 hover:bg-white text-xs font-semibold px-3 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Atualizar Lista
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="animate-spin text-emerald-500 w-10 h-10 mb-4" />
                <p className="text-sm font-medium">Buscando diagnósticos no banco...</p>
              </div>
            ) : filteredDiagnostics.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-center px-4">
                <FileText size={48} className="text-slate-300 mb-4" />
                <h3 className="font-bold text-slate-700 text-lg mb-1">Nenhum diagnóstico encontrado</h3>
                <p className="text-sm max-w-sm mb-6">Crie um diagnóstico inserindo os dados do novo cliente e fazendo upload dos prints da estrutura dele.</p>
                <button
                  onClick={() => setView('create')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-2 rounded-xl transition-all cursor-pointer"
                >
                  Criar Primeiro Diagnóstico
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-semibold text-xs tracking-wider uppercase bg-slate-50/50">
                      <th className="p-4 md:px-6 py-4">Cliente</th>
                      <th className="p-4 md:px-6 py-4">Nicho</th>
                      <th className="p-4 md:px-6 py-4">Status</th>
                      <th className="p-4 md:px-6 py-4">Conversão Geral</th>
                      <th className="p-4 md:px-6 py-4">Criado em</th>
                      <th className="p-4 md:px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredDiagnostics.map((d) => (
                      <tr 
                        key={d.id} 
                        onClick={() => handleOpenDiagnostic(d)}
                        className="hover:bg-slate-50/70 transition-all cursor-pointer group"
                      >
                        <td className="p-4 md:px-6 py-4 font-bold text-slate-900">{d.client_name}</td>
                        <td className="p-4 md:px-6 py-4 text-slate-600">{d.niche}</td>
                        <td className="p-4 md:px-6 py-4">
                          {d.status === 'completed' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">Pronto</span>
                          )}
                          {d.status === 'processing' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              <Loader2 className="animate-spin w-3 h-3 text-blue-500" /> Analisando
                            </span>
                          )}
                          {d.status === 'failed' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200" title={d.error_message}>Falhou</span>
                          )}
                          {d.status === 'pending' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Aguardando</span>
                          )}
                        </td>
                        <td className="p-4 md:px-6 py-4">
                          {d.status === 'completed' 
                            ? renderSemaphoreBadge(d.scenario_current?.overall_conversion?.status) 
                            : <span className="text-slate-400">—</span>
                          }
                        </td>
                        <td className="p-4 md:px-6 py-4 text-slate-500">
                          {new Date(d.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="p-4 md:px-6 py-4 text-right print:hidden">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleOpenDiagnostic(d)}
                              className="text-slate-400 hover:text-slate-900 p-1.5 rounded-lg hover:bg-slate-100 transition-all"
                              title="Visualizar Relatório"
                            >
                              <FileText size={16} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteDiagnostic(d.id, e)}
                              className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-all"
                              title="Deletar"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── VIEW: CREATE ── */}
        {view === 'create' && (
          <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
            
            <div className="flex items-center gap-3 border-b border-slate-100 pb-6 mb-6">
              <button
                onClick={() => setView('list')}
                className="text-slate-400 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 p-2 rounded-xl transition-all cursor-pointer"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Novo Diagnóstico Digital</h2>
                <p className="text-xs text-slate-500">Preencha as informações do cliente e anexe imagens estruturais para a IA Vision auditar.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Nome do Cliente *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Estúdio Alpha"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Nicho de Mercado *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Arquitetura / Consultoria"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Produto Principal</label>
                  <input
                    type="text"
                    placeholder="Ex: Implante Dentário / Facetas"
                    value={mainProduct}
                    onChange={(e) => setMainProduct(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Principais Objeções dos Clientes</label>
                  <input
                    type="text"
                    placeholder="Ex: 'Preço alto', 'medo de dor'"
                    value={mainObjections}
                    onChange={(e) => setMainObjections(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Links de Presença Digital</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Link do Instagram</label>
                    <input
                      type="url"
                      placeholder="https://instagram.com/..."
                      value={instagramLink}
                      onChange={(e) => setInstagramLink(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Site / Landing Page</label>
                    <input
                      type="url"
                      placeholder="https://meusite.com.br"
                      value={websiteLink}
                      onChange={(e) => setWebsiteLink(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Google Meu Negócio</label>
                    <input
                      type="url"
                      placeholder="Link do Google Maps"
                      value={gmbLink}
                      onChange={(e) => setGmbLink(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Additional Information Container */}
              <div className="border-t border-slate-100 pt-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-900">Informações Adicionais</h3>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-slate-500 font-medium leading-relaxed">
                    Detalhes extras sobre o cliente, particularidades do negócio ou observações específicas que deseja destacar para orientar a análise da IA.
                  </label>
                  <textarea
                    placeholder="Ex: Cliente quer focar em atrair leads corporativos de alto padrão. O site principal está lento e instável..."
                    value={additionalInfo}
                    onChange={(e) => setAdditionalInfo(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs transition-all font-sans"
                    rows={3}
                  />
                </div>
              </div>

              {/* Screenshot Upload Container */}
              <div className="border-t border-slate-100 pt-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-900">Prints da Estrutura Digital</h3>
                  <span className="text-xs text-slate-400">{selectedFiles.length}/5 imagens</span>
                </div>
                
                <div className="border-2 border-dashed border-slate-200 rounded-2xl hover:border-emerald-500 hover:bg-slate-50/50 transition-all relative flex flex-col items-center justify-center p-6 text-center">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={selectedFiles.length >= 5}
                  />
                  <Upload className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">Arraste, clique ou cole (Ctrl + V) os prints</p>
                  <p className="text-xs text-slate-400 mt-1">Anexe imagens da bio, páginas ou anúncios (máx. 5 imagens, até 10MB cada)</p>
                </div>

                {filePreviews.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-2">
                    {filePreviews.map((preview, i) => (
                      <div key={i} className="relative group rounded-xl border border-slate-100 overflow-hidden bg-slate-100 aspect-square">
                        <img src={preview} alt={`Preview ${i}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(i)}
                          className="absolute top-1 right-1 bg-rose-600/90 text-white rounded-lg p-1 opacity-90 group-hover:opacity-100 transition-all"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Form Buttons */}
              <div className="border-t border-slate-100 pt-6 flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 font-semibold text-slate-700 text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creationStatus !== 'idle'}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-sm shadow-md shadow-emerald-500/10 cursor-pointer"
                >
                  {creationStatus !== 'idle' ? (
                    <>
                      <Loader2 className="animate-spin w-4 h-4" /> Gerando Relatório...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} /> Gerar Diagnóstico com IA Vision
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── VIEW: REPORT ── */}
        {view === 'report' && activeDiagnostic && (
          <div className="space-y-6">
            
            {/* Action Bar (Top buttons) */}
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 print:hidden">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setView('list')}
                  className="text-slate-400 hover:text-slate-900 border border-slate-200 hover:bg-white p-2 rounded-xl transition-all cursor-pointer"
                >
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    {activeDiagnostic.niche}
                  </span>
                  <h2 className="text-xl font-bold text-slate-900 mt-1">{activeDiagnostic.client_name}</h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeDiagnostic.status === 'completed' && (
                  <>
                    {isEditing ? (
                      <button
                        onClick={handleSaveReport}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-1.5 shadow-md shadow-emerald-500/10 cursor-pointer"
                      >
                        <Save size={16} /> Salvar Alterações
                      </button>
                    ) : (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="text-slate-600 hover:text-slate-900 border border-slate-200 bg-white px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 size={16} /> Editar Relatório
                      </button>
                    )}
                    <button
                      onClick={handlePrint}
                      className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download size={16} /> Exportar PDF
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* If Processing (Loading visual) */}
            {activeDiagnostic.status === 'processing' && (
              <div className="max-w-2xl mx-auto text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
                <div className="relative w-20 h-20 mx-auto">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-100 border-t-emerald-500 animate-spin"></div>
                  <div className="absolute inset-4 rounded-full bg-emerald-50 flex items-center justify-center">
                    <Sparkles className="text-emerald-500 w-6 h-6 animate-pulse" />
                  </div>
                </div>
                
                <div>
                  <h3 className="font-bold text-lg text-slate-900">Análise Vision Ativa</h3>
                  <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
                    A OpenAI Vision está lendo e qualificando os prints enviados sob a ótica de conversão em Growth e Tráfego Pago. Isso pode levar até 20 segundos...
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 max-w-sm mx-auto text-xs text-slate-400 flex items-center gap-2 justify-center">
                  <Loader2 className="animate-spin w-3.5 h-3.5 text-slate-400" />
                  <span>Status: {creationProgressText || 'Processando prints com IA Vision...'}</span>
                </div>
              </div>
            )}

            {/* If Failed */}
            {activeDiagnostic.status === 'failed' && (
              <div className="max-w-2xl mx-auto text-center py-16 bg-white rounded-2xl border border-rose-100 p-8 space-y-4 shadow-sm shadow-rose-100/50">
                <AlertCircle className="text-rose-500 w-12 h-12 mx-auto" />
                <h3 className="font-bold text-lg text-slate-950">Falha ao processar diagnóstico</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Ocorreu um erro no processamento das imagens com a OpenAI. Certifique-se de que a API Key da OpenAI está corretamente configurada nas configurações da Sofia.
                </p>
                {activeDiagnostic.error_message && (
                  <div className="bg-rose-50 border border-rose-100 text-rose-800 text-left p-3 rounded-lg text-xs font-mono max-w-md mx-auto">
                    Erro detalhado: {activeDiagnostic.error_message}
                  </div>
                )}
                <button
                  onClick={() => setView('list')}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer"
                >
                  Voltar para Lista
                </button>
              </div>
            )}

            {/* Printable Report View (completed state) */}
            {activeDiagnostic.status === 'completed' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Side: Client profile data & Uploaded screenshots */}
                <div className="space-y-6 print:hidden">
                  
                  {/* Digital profile card */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-slate-900">Perfil Digital do Cliente</h3>
                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="text-slate-400 block mb-0.5">Nicho</span>
                        <span className="font-semibold text-slate-800">{activeDiagnostic.niche}</span>
                      </div>
                      {activeDiagnostic.main_product && (
                        <div>
                          <span className="text-slate-400 block mb-0.5">Produto Principal</span>
                          <span className="font-semibold text-slate-800">{activeDiagnostic.main_product}</span>
                        </div>
                      )}
                      {activeDiagnostic.main_objections && (
                        <div>
                          <span className="text-slate-400 block mb-0.5">Principais Objeções</span>
                          <span className="font-semibold text-slate-800">{activeDiagnostic.main_objections}</span>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-100 pt-4 space-y-2">
                      {activeDiagnostic.instagram_link && (
                        <a 
                          href={activeDiagnostic.instagram_link} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="flex items-center justify-between text-xs text-slate-600 hover:text-emerald-600 border border-slate-150 p-2 rounded-lg hover:bg-slate-50 transition-all"
                        >
                          <span className="font-semibold">Instagram</span>
                          <ExternalLink size={12} />
                        </a>
                      )}
                      {activeDiagnostic.website_link && (
                        <a 
                          href={activeDiagnostic.website_link} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="flex items-center justify-between text-xs text-slate-600 hover:text-emerald-600 border border-slate-150 p-2 rounded-lg hover:bg-slate-50 transition-all"
                        >
                          <span className="font-semibold">Site / Landing Page</span>
                          <ExternalLink size={12} />
                        </a>
                      )}
                      {activeDiagnostic.gmb_link && (
                        <a 
                          href={activeDiagnostic.gmb_link} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="flex items-center justify-between text-xs text-slate-600 hover:text-emerald-600 border border-slate-150 p-2 rounded-lg hover:bg-slate-50 transition-all"
                        >
                          <span className="font-semibold">Google Meu Negócio</span>
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Screenshots gallery */}
                  {activeDiagnostic.screenshot_urls && activeDiagnostic.screenshot_urls.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <h3 className="text-sm font-bold text-slate-900">Imagens Auditadas ({activeDiagnostic.screenshot_urls.length})</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {activeDiagnostic.screenshot_urls.map((url, index) => (
                          <a 
                            key={index} 
                            href={url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="relative block rounded-lg overflow-hidden border border-slate-100 bg-slate-50 aspect-video hover:opacity-90 transition-all"
                          >
                            <img src={url} alt={`Screenshot ${index}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-slate-900/10 hover:bg-transparent transition-all flex items-end p-1">
                              <span className="text-[9px] bg-slate-950/80 text-white font-bold px-1.5 py-0.5 rounded-md">Visualizar</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Side: Main audit sections (Scenario, Action Plan, Execution Scripts) */}
                <div className="lg:col-span-2 space-y-6 bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm printable-report">
                  
                  {/* PRINT HEADER ONLY (hidden in regular UI, displays on printing) */}
                  <div className="hidden print:flex flex-col border-b-2 border-slate-900 pb-6 mb-8">
                    <div className="flex justify-between items-center">
                      <h1 className="text-2xl font-bold tracking-tight text-slate-950 uppercase">Relatório de Auditoria e Onboarding</h1>
                      <div className="text-right">
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full uppercase tracking-wider">{activeDiagnostic.niche}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-6 text-xs text-slate-600">
                      <div>
                        <p><span className="font-bold text-slate-800">Cliente:</span> {activeDiagnostic.client_name}</p>
                        {activeDiagnostic.main_product && <p><span className="font-bold text-slate-800">Produto:</span> {activeDiagnostic.main_product}</p>}
                        {activeDiagnostic.main_objections && <p><span className="font-bold text-slate-800">Objeções:</span> {activeDiagnostic.main_objections}</p>}
                      </div>
                      <div className="text-right">
                        <p><span className="font-bold text-slate-800">Data de Geração:</span> {new Date(activeDiagnostic.created_at).toLocaleDateString('pt-BR')}</p>
                        <p><span className="font-bold text-slate-800">Plataforma Sofia:</span> www.sofiaai.com.br</p>
                      </div>
                    </div>
                  </div>

                  {/* ─────────────────────── */}
                  {/* SECTION 1: Current Scenario */}
                  {/* ─────────────────────── */}
                  <section className="space-y-4">
                    <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500 text-white text-xs font-bold">1</span>
                      Cenário Atual (Análise CRO)
                    </h3>
                    
                    <div className="space-y-4">
                      {Object.entries({
                        first_impression: 'Primeira Impressão e Autoridade',
                        contact_friction: 'Fricção de Contato',
                        objections_handling: 'Quebra de Objeções'
                      }).map(([key, label]) => {
                        const semaphore = editScenario[key as keyof ScenarioCurrent];
                        if (!semaphore) return null;

                        return (
                          <div key={key} className="border border-slate-100 rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-between items-start bg-slate-50/20 shadow-sm">
                            <div className="flex-1 space-y-1.5">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-bold text-slate-900 text-sm">{label}</span>
                                
                                {isEditing ? (
                                  <select
                                    value={semaphore.status}
                                    onChange={(e) => {
                                      setEditScenario({
                                        ...editScenario,
                                        [key]: {
                                          ...semaphore,
                                          status: e.target.value as 'VERDE' | 'AMARELO' | 'VERMELHO'
                                        }
                                      });
                                    }}
                                    className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  >
                                    <option value="VERDE">VERDE</option>
                                    <option value="AMARELO">AMARELO</option>
                                    <option value="VERMELHO">VERMELHO</option>
                                  </select>
                                ) : (
                                  renderSemaphoreBadge(semaphore.status)
                                )}
                              </div>
                              
                              {isEditing ? (
                                <textarea
                                  value={semaphore.justification}
                                  onChange={(e) => {
                                    setEditScenario({
                                      ...editScenario,
                                      [key]: {
                                        ...semaphore,
                                        justification: e.target.value
                                      }
                                    });
                                  }}
                                  className="w-full mt-2 px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs"
                                  rows={2}
                                />
                              ) : (
                                <p className="text-xs text-slate-600 leading-relaxed">{semaphore.justification}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* Page break element for print */}
                  <div className="hidden print:block print:page-break-before"></div>

                  {/* ─────────────────────── */}
                  {/* SECTION 2: Action Plan */}
                  {/* ─────────────────────── */}
                  <section className="space-y-4">
                    <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500 text-white text-xs font-bold">2</span>
                      Plano de Ação de Growth
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Short Term */}
                      <div className="border border-slate-150 rounded-2xl p-4 bg-slate-50/20">
                        <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500" /> Curto Prazo (Ações Rápidas)
                        </h4>
                        
                        <div className="space-y-3">
                          {editActionPlan.short_term?.map((item, idx) => (
                            <div key={idx} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm text-xs space-y-1.5">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={item.task}
                                  onChange={(e) => {
                                    const shortTerm = [...(editActionPlan.short_term || [])];
                                    shortTerm[idx] = { ...item, task: e.target.value };
                                    setEditActionPlan({ ...editActionPlan, short_term: shortTerm });
                                  }}
                                  className="w-full px-2.5 py-1 border border-slate-200 rounded-lg text-xs"
                                />
                              ) : (
                                <p className="font-semibold text-slate-900">{item.task}</p>
                              )}

                              <div className="flex items-center gap-3 text-[10px]">
                                <span className="text-slate-400">
                                  Impacto:{' '}
                                  {isEditing ? (
                                    <select
                                      value={item.impact}
                                      onChange={(e) => {
                                        const shortTerm = [...(editActionPlan.short_term || [])];
                                        shortTerm[idx] = { ...item, impact: e.target.value as any };
                                        setEditActionPlan({ ...editActionPlan, short_term: shortTerm });
                                      }}
                                      className="border border-slate-200 rounded px-1 py-0.5"
                                    >
                                      <option value="Alto">Alto</option>
                                      <option value="Médio">Médio</option>
                                      <option value="Baixo">Baixo</option>
                                    </select>
                                  ) : (
                                    <span className="font-bold text-slate-700">{item.impact}</span>
                                  )}
                                </span>

                                <span className="text-slate-400">
                                  Dificuldade:{' '}
                                  {isEditing ? (
                                    <select
                                      value={item.difficulty}
                                      onChange={(e) => {
                                        const shortTerm = [...(editActionPlan.short_term || [])];
                                        shortTerm[idx] = { ...item, difficulty: e.target.value as any };
                                        setEditActionPlan({ ...editActionPlan, short_term: shortTerm });
                                      }}
                                      className="border border-slate-200 rounded px-1 py-0.5"
                                    >
                                      <option value="Alta">Alta</option>
                                      <option value="Média">Média</option>
                                      <option value="Baixa">Baixa</option>
                                    </select>
                                  ) : (
                                    <span className="font-bold text-slate-700">{item.difficulty}</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Medium Term */}
                      <div className="border border-slate-150 rounded-2xl p-4 bg-slate-50/20">
                        <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" /> Médio Prazo (Ações Estruturais)
                        </h4>
                        
                        <div className="space-y-3">
                          {editActionPlan.medium_term?.map((item, idx) => (
                            <div key={idx} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm text-xs space-y-1.5">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={item.task}
                                  onChange={(e) => {
                                    const mediumTerm = [...(editActionPlan.medium_term || [])];
                                    mediumTerm[idx] = { ...item, task: e.target.value };
                                    setEditActionPlan({ ...editActionPlan, medium_term: mediumTerm });
                                  }}
                                  className="w-full px-2.5 py-1 border border-slate-200 rounded-lg text-xs"
                                />
                              ) : (
                                <p className="font-semibold text-slate-900">{item.task}</p>
                              )}

                              <div className="flex items-center gap-3 text-[10px]">
                                <span className="text-slate-400">
                                  Impacto:{' '}
                                  {isEditing ? (
                                    <select
                                      value={item.impact}
                                      onChange={(e) => {
                                        const mediumTerm = [...(editActionPlan.medium_term || [])];
                                        mediumTerm[idx] = { ...item, impact: e.target.value as any };
                                        setEditActionPlan({ ...editActionPlan, medium_term: mediumTerm });
                                      }}
                                      className="border border-slate-200 rounded px-1 py-0.5"
                                    >
                                      <option value="Alto">Alto</option>
                                      <option value="Médio">Médio</option>
                                      <option value="Baixo">Baixo</option>
                                    </select>
                                  ) : (
                                    <span className="font-bold text-slate-700">{item.impact}</span>
                                  )}
                                </span>

                                <span className="text-slate-400">
                                  Dificuldade:{' '}
                                  {isEditing ? (
                                    <select
                                      value={item.difficulty}
                                      onChange={(e) => {
                                        const mediumTerm = [...(editActionPlan.medium_term || [])];
                                        mediumTerm[idx] = { ...item, difficulty: e.target.value as any };
                                        setEditActionPlan({ ...editActionPlan, medium_term: mediumTerm });
                                      }}
                                      className="border border-slate-200 rounded px-1 py-0.5"
                                    >
                                      <option value="Alta">Alta</option>
                                      <option value="Média">Média</option>
                                      <option value="Baixa">Baixa</option>
                                    </select>
                                  ) : (
                                    <span className="font-bold text-slate-700">{item.difficulty}</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Page break element for print */}
                  <div className="hidden print:block print:page-break-before"></div>

                  {/* ─────────────────────── */}
                  {/* SECTION 3: Content Strategy */}
                  {/* ─────────────────────── */}
                  <section className="space-y-4">
                    <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500 text-white text-xs font-bold">3</span>
                      Estratégia de Conteúdo (Pilares de Atração)
                    </h3>
                    
                    <div className="space-y-4 text-xs">
                      {/* Pilar de Autoridade */}
                      <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/20 shadow-sm space-y-1.5">
                        <span className="font-bold text-slate-900 text-sm block">Pilar de Autoridade (Especialista)</span>
                        {isEditing ? (
                          <textarea
                            value={editExecutionGuide.content_strategy?.authority || ''}
                            onChange={(e) => {
                              const strategy = { ...(editExecutionGuide.content_strategy || { authority: '', connection: '', objections: '' }) };
                              strategy.authority = e.target.value;
                              setEditExecutionGuide({ ...editExecutionGuide, content_strategy: strategy });
                            }}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs"
                            rows={3}
                          />
                        ) : (
                          <p className="text-slate-600 leading-relaxed">{editExecutionGuide.content_strategy?.authority || 'Sem estratégia de autoridade definida.'}</p>
                        )}
                      </div>

                      {/* Pilar de Conexão */}
                      <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/20 shadow-sm space-y-1.5">
                        <span className="font-bold text-slate-900 text-sm block">Pilar de Conexão (Bastidores & Confiança)</span>
                        {isEditing ? (
                          <textarea
                            value={editExecutionGuide.content_strategy?.connection || ''}
                            onChange={(e) => {
                              const strategy = { ...(editExecutionGuide.content_strategy || { authority: '', connection: '', objections: '' }) };
                              strategy.connection = e.target.value;
                              setEditExecutionGuide({ ...editExecutionGuide, content_strategy: strategy });
                            }}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs"
                            rows={3}
                          />
                        ) : (
                          <p className="text-slate-600 leading-relaxed">{editExecutionGuide.content_strategy?.connection || 'Sem estratégia de conexão definida.'}</p>
                        )}
                      </div>

                      {/* Pilar de Quebra de Objeções */}
                      <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/20 shadow-sm space-y-1.5">
                        <span className="font-bold text-slate-900 text-sm block">Pilar de Quebra de Objeções (Educação)</span>
                        {isEditing ? (
                          <textarea
                            value={editExecutionGuide.content_strategy?.objections || ''}
                            onChange={(e) => {
                              const strategy = { ...(editExecutionGuide.content_strategy || { authority: '', connection: '', objections: '' }) };
                              strategy.objections = e.target.value;
                              setEditExecutionGuide({ ...editExecutionGuide, content_strategy: strategy });
                            }}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs"
                            rows={3}
                          />
                        ) : (
                          <p className="text-slate-600 leading-relaxed">{editExecutionGuide.content_strategy?.objections || 'Sem estratégia de quebra de objeções definida.'}</p>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Page break element for print */}
                  <div className="hidden print:block print:page-break-before"></div>

                  {/* ─────────────────────── */}
                  {/* SECTION 4: Traffic Payoff */}
                  {/* ─────────────────────── */}
                  <section className="space-y-4">
                    <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500 text-white text-xs font-bold">4</span>
                      O Próximo Passo: Tráfego Pago
                    </h3>
                    
                    <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/20 shadow-sm text-xs">
                      {isEditing ? (
                        <textarea
                          value={editExecutionGuide.next_steps_traffic || ''}
                          onChange={(e) => {
                            setEditExecutionGuide({ ...editExecutionGuide, next_steps_traffic: e.target.value });
                          }}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs"
                          rows={4}
                        />
                      ) : (
                        <p className="text-slate-600 leading-relaxed font-medium bg-emerald-55/30 p-3 rounded-lg border border-emerald-100/50">
                          {editExecutionGuide.next_steps_traffic || 'Nenhum direcionamento de tráfego pago gerado.'}
                        </p>
                      )}
                    </div>
                  </section>

                  {/* Page break element for print */}
                  <div className="hidden print:block print:page-break-before"></div>

                  {/* ─────────────────────── */}
                  {/* SECTION 5: High Retention Video Scripts */}
                  {/* ─────────────────────── */}
                  <section className="space-y-4">
                    <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500 text-white text-xs font-bold">5</span>
                      Guia de Execução (Roteiros de Vídeos Curtos)
                    </h3>

                    <div className="space-y-6">
                      {editExecutionGuide.content_scripts?.map((item, idx) => (
                        <div key={idx} className="border border-slate-150 rounded-2xl p-4 shadow-sm bg-slate-50/10 space-y-3">
                          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2 flex-wrap text-xs">
                            <span className="font-bold text-slate-900 text-sm">
                              {isEditing ? (
                                <input
                                  type="text"
                                  placeholder="Título do vídeo"
                                  value={item.title}
                                  onChange={(e) => {
                                    const scripts = [...(editExecutionGuide.content_scripts || [])];
                                    scripts[idx] = { ...item, title: e.target.value };
                                    setEditExecutionGuide({ ...editExecutionGuide, content_scripts: scripts });
                                  }}
                                  className="border border-slate-200 rounded px-2.5 py-0.5 w-64"
                                />
                              ) : (
                                <span>Roteiro {idx + 1}: <span className="text-emerald-700 font-extrabold">{item.title || 'Sem título'}</span></span>
                              )}
                            </span>
                            {!isEditing && (
                              <button
                                onClick={() => handleCopyScript(`*Roteiro: ${item.title}*\n\n1. GANCHO (3s):\n${item.hook}\n\n2. DESENVOLVIMENTO:\n${item.body}\n\n3. CHAMADA DE AÇÃO (CTA):\n${item.cta}`)}
                                className="text-slate-400 hover:text-slate-900 flex items-center gap-1 hover:bg-slate-100 px-2 py-1 rounded transition-all cursor-pointer"
                                title="Copiar roteiro formatado"
                              >
                                <Copy size={12} /> Copiar
                              </button>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="space-y-3 text-xs">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-1">Gancho Forte (Dor/Desejo - primeiros 3s) *</label>
                                <textarea
                                  value={item.hook}
                                  onChange={(e) => {
                                    const scripts = [...(editExecutionGuide.content_scripts || [])];
                                    scripts[idx] = { ...item, hook: e.target.value };
                                    setEditExecutionGuide({ ...editExecutionGuide, content_scripts: scripts });
                                  }}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                                  rows={2}
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-1">Desenvolvimento Rápido *</label>
                                <textarea
                                  value={item.body}
                                  onChange={(e) => {
                                    const scripts = [...(editExecutionGuide.content_scripts || [])];
                                    scripts[idx] = { ...item, body: e.target.value };
                                    setEditExecutionGuide({ ...editExecutionGuide, content_scripts: scripts });
                                  }}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                                  rows={3}
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-1">Chamada para Ação (CTA WhatsApp) *</label>
                                <textarea
                                  value={item.cta}
                                  onChange={(e) => {
                                    const scripts = [...(editExecutionGuide.content_scripts || [])];
                                    scripts[idx] = { ...item, cta: e.target.value };
                                    setEditExecutionGuide({ ...editExecutionGuide, content_scripts: scripts });
                                  }}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                                  rows={1}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-3 text-xs leading-relaxed">
                              <div className="bg-white border border-slate-100 p-3 rounded-xl shadow-sm">
                                <span className="block text-[9px] font-bold uppercase tracking-wider text-rose-500 mb-1">Gancho (Dor/Desejo - primeiros 3s)</span>
                                <p className="text-slate-800 font-semibold">{item.hook}</p>
                              </div>
                              <div className="bg-white border border-slate-100 p-3 rounded-xl shadow-sm">
                                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Desenvolvimento (Direto ao ponto)</span>
                                <p className="text-slate-700">{item.body}</p>
                              </div>
                              <div className="bg-white border border-slate-100 p-3 rounded-xl shadow-sm border-l-emerald-400 border-l-2">
                                <span className="block text-[9px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Chamada para Ação (WhatsApp)</span>
                                <p className="text-slate-800 font-medium">{item.cta}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Strategic directions bullet list */}
                  {editExecutionGuide.strategic_directions && editExecutionGuide.strategic_directions.length > 0 && (
                      <div className="border-t border-slate-100 pt-4 space-y-2">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Direcionamentos Estratégicos</h4>
                        <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1.5 leading-relaxed">
                          {editExecutionGuide.strategic_directions.map((direction, idx) => (
                            <li key={idx}>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={direction}
                                  onChange={(e) => {
                                    const dirs = [...(editExecutionGuide.strategic_directions || [])];
                                    dirs[idx] = e.target.value;
                                    setEditExecutionGuide({ ...editExecutionGuide, strategic_directions: dirs });
                                  }}
                                  className="w-full px-2 py-0.5 border border-slate-200 rounded-lg text-xs"
                                />
                              ) : (
                                direction
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
