import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Save, 
  Loader2, 
  Zap, 
  ShieldAlert, 
  Brain,
  History,
  Sparkles,
  Info,
  ShieldCheck,
  Layout
} from 'lucide-react';
import { motion } from 'motion/react';
import { getUserProfile, updateUserProfile, UserProfile } from '../../services/supabaseService';
import { toast } from 'sonner';

export default function SofiaConfig() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [prompt, setPrompt] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await getUserProfile();
        if (data) {
          setProfile(data);
          setPrompt(data.sofia_prompt || '');
          setActive(data.sofia_active ?? true);
        }
      } catch (err) {
        toast.error('Erro ao carregar configurações da Sofia');
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateUserProfile({
        sofia_prompt: prompt,
        sofia_active: active
      });
      toast.success('Configurações da Sofia atualizadas com sucesso!');
    } catch (err) {
      toast.error('Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreDefault = () => {
    if (confirm('Deseja restaurar o prompt padrão da Sofia?')) {
      setPrompt(`Persona: Você é a Sofia, a assistente virtual inteligente...`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="animate-spin text-primary-600" size={40} />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Acessando Cérebro Zyreo Sofia...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      {/* Header Premium */}
      <div className="relative overflow-hidden bg-gradient-to-r from-primary-600 to-primary-800 rounded-[2.5rem] p-10 text-white shadow-2xl shadow-primary-200">
        <div className="absolute top-0 right-0 p-10 opacity-10">
          <Bot size={200} />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <div className="w-24 h-24 bg-white/20 backdrop-blur-xl rounded-3xl flex items-center justify-center shadow-inner overflow-hidden border border-white/30">
            <img src="/sofiamini.png" alt="Sofia" className="w-full h-full object-cover" />
          </div>
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
              <h1 className="text-4xl font-black tracking-tight">Cérebro Zyreo <span className="text-primary-200">Sofia</span></h1>
              <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/20">Master Admin</span>
            </div>
            <p className="text-primary-100 text-lg font-medium max-w-2xl">
              Gerencie a inteligência central do ecossistema. As alterações feitas aqui definem a personalidade, o tom de voz e o comportamento da Sofia.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Coluna de Configurações */}
        <div className="lg:col-span-2 space-y-8">
          {/* Editor de Prompt */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                  <Brain size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">System Prompt (Cérebro)</h3>
                  <p className="text-sm text-slate-500">Defina as instruções mestras da IA.</p>
                </div>
              </div>
              <button 
                onClick={handleRestoreDefault}
                className="flex items-center gap-2 text-xs font-bold text-primary-600 hover:bg-primary-50 px-4 py-2 rounded-lg transition-all"
              >
                <RotateCcw size={14} />
                Restaurar Padrão
              </button>
            </div>
            
            <div className="p-8">
              <div className="relative group">
                <textarea 
                  rows={20}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full px-8 py-6 rounded-[2rem] border-2 border-slate-100 focus:border-primary-500 focus:ring-8 focus:ring-primary-500/5 outline-none text-sm transition-all bg-slate-50/50 focus:bg-white resize-none custom-scrollbar leading-relaxed font-medium text-slate-700"
                  placeholder="Escreva aqui as diretrizes da Sofia..."
                />
                <div className="absolute top-4 right-4 flex gap-2">
                  <span className="bg-white/80 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black text-slate-400 border border-slate-100 shadow-sm">
                    {prompt.length} CARACTERES
                  </span>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between">
                <div className="flex items-center gap-4 text-slate-400">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-primary-500" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Suporta GPT-4o e Gemini 1.5 Pro</span>
                  </div>
                </div>
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-3 px-10 py-4 bg-primary-600 text-white rounded-2xl font-black text-sm hover:bg-primary-700 transition-all shadow-xl shadow-primary-200 disabled:opacity-50 active:scale-95"
                >
                  {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                  Publicar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna Lateral de Status e Dicas */}
        <div className="space-y-8">
          {/* Card de Status */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                  <Bot size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Visibilidade</h4>
                  <p className="text-xs text-slate-500">Controle do Widget</p>
                </div>
              </div>
              <button 
                onClick={() => setActive(!active)}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none ${active ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${active ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="space-y-4">
              <div className={`p-4 rounded-2xl border flex gap-3 ${active ? 'bg-emerald-50/50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                <Info size={16} className={active ? 'text-emerald-500' : 'text-slate-400'} />
                <p className="text-[11px] leading-relaxed text-slate-600">
                  {active 
                    ? 'A Sofia está ATIVA e visível para os usuários configurados.' 
                    : 'A Sofia está OCULTA para todos os usuários do sistema.'}
                </p>
              </div>
            </div>
          </div>

          {/* Dicas de Engenharia de Prompt */}
          <div className="bg-slate-900 rounded-[2rem] p-8 text-white shadow-xl shadow-slate-200 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 opacity-20">
              <Zap size={120} />
            </div>
            <h4 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Sparkles size={20} className="text-amber-400" />
              Pro-Tips de Admin
            </h4>
            <ul className="space-y-6">
              <li className="flex gap-4">
                <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-amber-400 text-xs font-bold">1</div>
                <p className="text-xs text-slate-300 leading-relaxed">Use <strong>instruções negativas</strong> para evitar que a Sofia fale sobre concorrentes ou assuntos políticos.</p>
              </li>
              <li className="flex gap-4">
                <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-amber-400 text-xs font-bold">2</div>
                <p className="text-xs text-slate-300 leading-relaxed">Defina um <strong>limite de emojis</strong> (ex: máximo 2 por mensagem) para manter o tom premium.</p>
              </li>
              <li className="flex gap-4">
                <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-amber-400 text-xs font-bold">3</div>
                <p className="text-xs text-slate-300 leading-relaxed">Sempre inclua uma instrução de <strong>transferência humana</strong> caso o cliente peça para falar com um atendente.</p>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

const RotateCcw = ({ size, className }: { size: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
