import React, { useState } from 'react';
import {
  Bot,
  LogIn,
  Loader2,
  Mail,
  Lock,
  UserPlus,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  User,
  Smartphone,
  Building2,
  Target,
  ArrowLeft,
  Eye,
  EyeOff
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

type AuthMode = 'login' | 'register';

export default function Login() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);

  // New Registration Fields
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [nicho, setNicho] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [allowSignups, setAllowSignups] = useState(true);
  const [supportWhatsapp, setSupportWhatsapp] = useState('');

  React.useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/v2/public-settings');
        const result = await res.json();
        if (result.success) {
          setAllowSignups(result.data.allow_signups !== false);
          if (result.data.support_whatsapp) {
            setSupportWhatsapp(result.data.support_whatsapp);
          }
        }
      } catch (e) {}
    };
    fetchSettings();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error('Erro ao entrar com Google: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error('Digite seu e-mail para recuperar a senha.');
      return;
    }
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Erro ao enviar e-mail.');
      toast.success('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar e-mail de recuperação.');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (mode === 'register' && step === 1) {
      if (!email || !password) {
        toast.error('Preencha e-mail e senha.');
        return;
      }
      if (password.length < 6) {
        toast.error('A senha deve ter pelo menos 6 caracteres.');
        return;
      }
      setStep(2);
      return;
    }

    if (!email || !password) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    try {
      setIsLoading(true);

      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Bem-vindo de volta!');
      } else {
        // Register step 2
        if (!nomeCompleto || !whatsapp || !nomeEmpresa || !nicho) {
          toast.error('Por favor, preencha todos os dados da empresa.');
          setIsLoading(false);
          return;
        }

        let trialDays = 10;
        try {
          const { getPublicSettings } = await import('../services/supabaseService');
          const settings = await getPublicSettings();
          trialDays = settings.trial_days || 10;
        } catch (e) {
          console.warn('[Login] Failed to fetch trial days, using default 10.');
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              nome_completo: nomeCompleto,
              whatsapp_organizacao: whatsapp,
              nome_empresa: nomeEmpresa,
              nicho: nicho,
              role: 'client',
              plano: 'Trial',
              trial_ends_at: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString()
            }
          }
        });

        if (error) throw error;

        if (data.user && !data.session) {
          setRegistrationSuccess(true);
          toast.info('Conta criada! Verifique seu e-mail para acessar o sistema.', { duration: 10000 });
        } else if (data.session) {
          toast.success('Conta criada com sucesso! Aproveite seus 10 dias de teste.');
        }
      }
    } catch (error: any) {
      const msg = error.message || 'Erro inesperado';
      let displayMsg = 'Erro: ' + msg;
      setFormError(displayMsg);

      if (msg.includes('Email not confirmed') || msg.includes('identity_not_confirmed')) {
        setRegistrationSuccess(true);
        toast.info('Sua conta ainda não foi confirmada. Verifique seu e-mail!');
      } else {
        toast.error(displayMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between relative overflow-hidden font-sans antialiased text-slate-800">
      {/* Soft Light Pastel Glow Blobs */}
      <div className="absolute top-[-20%] left-[-20%] w-[600px] h-[600px] bg-primary-100/30 blur-[150px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[600px] h-[600px] bg-emerald-500/10 blur-[150px] rounded-full pointer-events-none"></div>
      <div className="absolute top-[40%] left-[30%] w-[500px] h-[500px] bg-indigo-500/5 blur-[130px] rounded-full pointer-events-none"></div>

      {/* Main Container */}
      <div className="max-w-7xl w-full mx-auto px-6 py-6 sm:py-10 flex flex-col justify-between min-h-screen relative z-10">
        
        {/* Header */}
        <header className="flex items-center justify-between pb-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center overflow-hidden border border-slate-200 shadow-sm">
              <img
                src="/sofiamini.png"
                alt="Sofia Med Logo"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <span className="text-2xl font-black text-slate-950 tracking-tight font-heading">
              Sofia <span className="text-primary-600">Med</span>
            </span>
          </div>

          <div>
            {!isFormVisible ? (
              <button
                onClick={() => {
                  setMode('login');
                  setIsFormVisible(true);
                }}
                className="px-5 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                Acessar Plataforma
              </button>
            ) : (
              <button
                onClick={() => setIsFormVisible(false)}
                className="px-5 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                Ver Apresentação
              </button>
            )}
          </div>
        </header>

        {/* Content Section */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center my-auto py-8 sm:py-12">
          
          {/* Left Column (Institutional details) */}
          <div className={`lg:col-span-7 transition-all duration-300 ${isFormVisible ? 'hidden lg:block' : 'block'}`}>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-50/80 text-primary-700 rounded-full text-[10px] font-black uppercase tracking-wider mb-6 border border-primary-100/50 w-fit">
              <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-ping"></span>
              Admissão Exclusiva & Limitada
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-950 leading-[1.1] tracking-tight mb-6 font-heading">
              O Ecossistema de <br/> Atendimento{" "}
              <span className="bg-gradient-to-r from-primary-600 via-indigo-600 to-teal-600 bg-clip-text text-transparent">
                Inteligente para Médicos
              </span>
            </h1>

            <p className="text-slate-600 text-base sm:text-lg leading-relaxed mb-8 max-w-xl">
              A Sofia Med não é apenas um assistente básico de chat. É uma inteligência artificial médica proativa, integrada de ponta a ponta na rotina do seu consultório de alta performance.
            </p>

            {/* Checklist */}
            <ul className="space-y-4 mb-10 max-w-xl">
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Atendimento humanizado por IA 24h por dia</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Triagem inteligente para otimizar o tempo e pré-qualificar os pacientes.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Follow-ups automáticos e proativos</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Reengajamento de contatos diretamente no WhatsApp para reduzir faltas (no-show).</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Acompanhamento e clareza total</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Painel em tempo real com controle sobre todas as conversas e agendamentos.</p>
                </div>
              </li>
            </ul>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => {
                  setMode('register');
                  setStep(1);
                  setIsFormVisible(true);
                }}
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-2xl font-black text-sm transition-all shadow-lg shadow-primary-600/20 hover:shadow-primary-600/30 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
              >
                Solicitar Adesão Exclusiva
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => {
                  setMode('login');
                  setIsFormVisible(true);
                }}
                className="w-full sm:w-auto px-8 py-4 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50 rounded-2xl font-black text-sm transition-all shadow-sm active:scale-[0.98] cursor-pointer text-center"
              >
                Já Possuo Cadastro
              </button>
            </div>
          </div>

          {/* Right Column (Mascot / Form Container) */}
          <div className="lg:col-span-5 flex justify-center w-full">
            <motion.div
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-md relative z-10"
            >
              <AnimatePresence mode="wait">
                {!isFormVisible ? (
                  /* Mascot Presentation Card */
                  <motion.div
                    key="mascot-card"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="w-full bg-white/70 backdrop-blur-xl border border-slate-200/60 rounded-[2.5rem] p-8 sm:p-10 shadow-2xl shadow-slate-100/50 flex flex-col items-center justify-between min-h-[480px]"
                  >
                    <div className="flex flex-col items-center text-center w-full">
                      {/* Mascot Frame */}
                      <div className="w-52 h-52 sm:w-56 sm:h-56 rounded-[2rem] overflow-hidden shadow-xl ring-4 ring-white border border-slate-100 flex items-center justify-center bg-slate-50 group mb-6 relative">
                        <img
                          src="/sofia-face.png"
                          alt="Sofia Med AI"
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          onError={(e) => {
                            (e.target as HTMLElement).src = '/sofiamini.png';
                          }}
                        />
                      </div>

                      {/* AI Active Badge */}
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-wider mb-4 border border-emerald-100">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                        Sofia Med AI Ativa
                      </span>

                      {/* AI Code Label */}
                      <p className="tracking-[0.2em] font-black text-[10px] text-slate-400 uppercase">
                        # Sofia Med Artificial Intelligence
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setMode('login');
                        setIsFormVisible(true);
                      }}
                      className="w-full py-4 mt-6 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-2xl font-black text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      Acessar Sistema
                      <ChevronRight size={16} />
                    </button>
                  </motion.div>
                ) : (
                  /* Login/Register Form Card */
                  <motion.div
                    key="form-card"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="w-full bg-white border border-slate-200/60 rounded-[2.5rem] p-8 sm:p-10 shadow-2xl shadow-slate-100/50 flex flex-col justify-between relative"
                  >
                    <div>
                      {/* Back to Presentation Button */}
                      <button
                        onClick={() => {
                          setIsFormVisible(false);
                          setStep(1);
                        }}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 text-xs font-black mb-6 transition-colors group cursor-pointer"
                      >
                        <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                        Voltar para Apresentação
                      </button>

                      {registrationSuccess ? (
                        /* Registration Success */
                        <motion.div
                          key="success"
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-center py-6"
                        >
                          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mx-auto mb-6 border border-emerald-100 shadow-sm">
                            <ShieldCheck size={40} />
                          </div>
                          <h2 className="text-2xl font-black text-slate-900 mb-4 font-heading">Cadastro efetuado!</h2>
                          <p className="text-slate-600 mb-8 text-sm leading-relaxed">
                            Enviamos um link de confirmação para o seu e-mail.<br/>
                            <strong>Assim que confirmar, o sistema abrirá automaticamente.</strong>
                          </p>
                          <div className="space-y-4">
                            <button
                              onClick={() => window.location.reload()}
                              className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-primary-600/10 cursor-pointer"
                            >
                              Já confirmei, entrar agora <ChevronRight size={18} />
                            </button>
                            <button
                              onClick={() => setRegistrationSuccess(false)}
                              className="text-slate-500 hover:text-slate-800 text-sm font-bold transition-colors cursor-pointer"
                            >
                              Voltar para o login
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        /* Tabs & Form */
                        <div>
                          {step === 1 && (
                            <div className="flex p-1 bg-slate-50 rounded-2xl mb-8 border border-slate-100" onClick={() => setFormError(null)}>
                              <button
                                type="button"
                                onClick={() => setMode('login')}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all cursor-pointer ${
                                  mode === 'login'
                                    ? 'bg-white text-slate-955 shadow-sm border border-slate-200/50 font-black'
                                    : 'text-slate-400 hover:text-slate-600'
                                }`}
                              >
                                <LogIn size={16} /> Entrar
                              </button>
                              {allowSignups ? (
                                <button
                                  type="button"
                                  onClick={() => setMode('register')}
                                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all cursor-pointer ${
                                    mode === 'register'
                                      ? 'bg-white text-slate-955 shadow-sm border border-slate-200/50 font-black'
                                      : 'text-slate-400 hover:text-slate-600'
                                  }`}
                                >
                                  <UserPlus size={16} /> Solicitar
                                </button>
                              ) : (
                                <div className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-not-allowed">
                                  <Lock size={12} /> Inscrições Off
                                </div>
                              )}
                            </div>
                          )}

                          {step === 2 && (
                            <button
                              type="button"
                              onClick={() => setStep(1)}
                              className="flex items-center gap-2 text-slate-400 hover:text-slate-600 text-xs font-black mb-6 transition-colors group cursor-pointer"
                            >
                              <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                              Voltar para e-mail/senha
                            </button>
                          )}

                          <form onSubmit={handleEmailAuth} className="space-y-4">
                            <AnimatePresence mode="wait">
                              {mode === 'register' && step === 2 ? (
                                <motion.div
                                  key="step2"
                                  initial={{ opacity: 0, x: 15 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: -15 }}
                                  className="space-y-4"
                                >
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                                    <div className="relative">
                                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                      <input
                                        type="text"
                                        placeholder="Seu nome e sobrenome"
                                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-slate-900 placeholder:text-slate-400 focus:ring-4 focus:ring-primary-50 focus:border-primary-500 transition-all outline-none text-sm"
                                        value={nomeCompleto}
                                        onChange={(e) => setNomeCompleto(e.target.value)}
                                        required
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp</label>
                                    <div className="relative">
                                      <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                      <input
                                        type="tel"
                                        placeholder="Ex: 5511999999999"
                                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-slate-900 placeholder:text-slate-400 focus:ring-4 focus:ring-primary-50 focus:border-primary-500 transition-all outline-none text-sm"
                                        value={whatsapp}
                                        onChange={(e) => setWhatsapp(e.target.value)}
                                        required
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Empresa/Clínica</label>
                                    <div className="relative">
                                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                      <input
                                        type="text"
                                        placeholder="Sua clínica ou consultório"
                                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-slate-900 placeholder:text-slate-400 focus:ring-4 focus:ring-primary-50 focus:border-primary-500 transition-all outline-none text-sm"
                                        value={nomeEmpresa}
                                        onChange={(e) => setNomeEmpresa(e.target.value)}
                                        required
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Especialidade / Nicho</label>
                                    <div className="relative">
                                      <Target className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                      <input
                                        type="text"
                                        placeholder="Ex: Ortopedia, Dermatologia, Estética..."
                                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-slate-900 placeholder:text-slate-400 focus:ring-4 focus:ring-primary-50 focus:border-primary-500 transition-all outline-none text-sm"
                                        value={nicho}
                                        onChange={(e) => setNicho(e.target.value)}
                                        required
                                      />
                                    </div>
                                  </div>
                                </motion.div>
                              ) : (
                                <motion.div
                                  key="step1"
                                  initial={{ opacity: 0, x: -15 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: 15 }}
                                  className="space-y-4"
                                >
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail de acesso</label>
                                    <div className="relative">
                                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                      <input
                                        type="email"
                                        placeholder="exemplo@email.com"
                                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-slate-900 placeholder:text-slate-400 focus:ring-4 focus:ring-primary-50 focus:border-primary-500 transition-all outline-none text-sm"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between px-1">
                                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Senha</label>
                                      {mode === 'login' && (
                                        <button
                                          type="button"
                                          onClick={handleForgotPassword}
                                          className="text-xs font-bold text-primary-600 hover:text-primary-700 transition-colors cursor-pointer animate-none bg-transparent border-none outline-none"
                                        >
                                          Esqueceu?
                                        </button>
                                      )}
                                    </div>
                                    <div className="relative">
                                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                      <input
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 focus:bg-white rounded-xl text-slate-900 placeholder:text-slate-400 focus:ring-4 focus:ring-primary-50 focus:border-primary-500 transition-all outline-none text-sm"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer"
                                      >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            <button
                              type="submit"
                              disabled={isLoading}
                              className="w-full mt-2 py-3.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-primary-600/10 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 cursor-pointer"
                            >
                              {isLoading ? (
                                <Loader2 size={18} className="animate-spin" />
                              ) : (
                                <>
                                  {mode === 'login' ? 'Entrar na Plataforma' : step === 1 ? 'Próximo Passo' : 'Finalizar Solicitação'}
                                  <ChevronRight size={16} />
                                </>
                              )}
                            </button>

                            {formError && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="flex items-center gap-2 p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-bold mt-2"
                              >
                                <AlertCircle size={14} className="shrink-0" />
                                <p>{formError}</p>
                              </motion.div>
                            )}
                          </form>

                          <div className="relative my-6 text-center">
                            <div className="absolute inset-0 flex items-center">
                              <div className="w-full border-t border-slate-100"></div>
                            </div>
                            <span className="relative px-3 bg-white text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">ou acesse com</span>
                          </div>

                          <button
                            onClick={handleGoogleLogin}
                            disabled={isLoading}
                            className="w-full py-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 transition-all flex items-center justify-center gap-2 active:scale-[0.98] text-xs shadow-sm cursor-pointer"
                          >
                            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4 grayscale-[0.3]" />
                            Google
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-8 flex items-center justify-center gap-2 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                      <ShieldCheck size={14} className="text-emerald-500" />
                      Conexão Criptografada & Segura
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </main>

        {/* Footer */}
        <footer className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-slate-100 gap-4">
          <p className="text-slate-400 text-xs font-medium">
            &copy; {new Date().getFullYear()} Sofia Med. Todos os direitos reservados.
          </p>
          <p className="text-slate-400 text-xs font-medium">
            Precisa de ajuda?{" "}
            {supportWhatsapp ? (
              <a
                href={`https://wa.me/${supportWhatsapp.replace(/\D/g, '')}?text=Olá, preciso de ajuda com meu login na Sofia.`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-600 hover:text-slate-900 transition-colors font-bold underline underline-offset-4"
              >
                Fale com o suporte no WhatsApp
              </a>
            ) : (
              <span className="text-slate-600 font-bold">Fale com a administração</span>
            )}
          </p>
        </footer>
      </div>
    </div>
  );
}
