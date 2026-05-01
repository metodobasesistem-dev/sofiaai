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
  ArrowLeft
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
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Google Auth Error:', error);
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
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      toast.success('E-mail de recuperação enviado!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar e-mail de recuperação.');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
      console.log(`[Auth] Starting ${mode} for:`, email);
      
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        toast.success('Bem-vindo de volta!');
      } else {
        // Mode = Register & Step = 2
        if (!nomeCompleto || !whatsapp || !nomeEmpresa || !nicho) {
          toast.error('Por favor, preencha todos os dados da empresa.');
          setIsLoading(false);
          return;
        }

        console.log('[Auth] Attempting signUp with metadata...');
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
              trial_ends_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
            }
          }
        });

        if (error) {
          console.error('[Auth] SignUp Error:', error);
          throw error;
        }

        console.log('[Auth] SignUp Response:', data);

        if (data.user && !data.session) {
          // Email confirmation is required
          setRegistrationSuccess(true);
          toast.info('Conta criada! Verifique seu e-mail para acessar o sistema.', {
            duration: 10000
          });
        } else if (data.session) {
          toast.success('Conta criada com sucesso! Aproveite seus 10 dias de teste.');
          // App.tsx will detect session and redirect
        }
      }
    } catch (error: any) {
      console.error('[Auth] Process Error:', error);
      const msg = error.message || 'Erro inesperado';
      
      let displayMsg = 'Erro: ' + msg;
      if (error.status === 429 || msg.includes('rate limit')) {
        displayMsg = 'Muitas tentativas! Por favor, aguarde alguns minutos antes de tentar novamente ou use outro e-mail.';
      } else if (msg.includes('nome_completo')) {
        displayMsg = 'Erro no banco: A coluna nome_completo não foi encontrada. Por favor, execute o script SQL novamente.';
      }

      setFormError(displayMsg);
      toast.error(displayMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-0 -left-20 w-96 h-96 bg-blue-600/20 blur-[100px] rounded-full"></div>
      <div className="absolute bottom-0 -right-20 w-96 h-96 bg-indigo-600/20 blur-[100px] rounded-full"></div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg relative z-10"
      >
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center text-white mb-4 shadow-2xl shadow-blue-500/20 ring-4 ring-white/5">
            <Bot size={40} />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">WppAI</h1>
          <p className="text-slate-400 font-medium">Automação Inteligente de WhatsApp</p>
        </div>

        {/* Main Card */}
        <div className="bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 p-8 md:p-10 shadow-3xl">
          <AnimatePresence mode="wait">
            {registrationSuccess ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-6"
              >
                <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-6 shadow-2xl shadow-emerald-500/20">
                  <ShieldCheck size={40} />
                </div>
                <h2 className="text-2xl font-black text-white mb-4">Cadastro efetuado!</h2>
                <p className="text-slate-400 mb-8 leading-relaxed">
                  Enviamos um link de confirmação para o seu e-mail. <br/>
                  <strong>Assim que confirmar, o sistema abrirá automaticamente.</strong>
                </p>
                <div className="space-y-4">
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-3 transition-all"
                  >
                    Já confirmei, entrar agora <ChevronRight size={18} />
                  </button>
                  <button
                    onClick={() => setRegistrationSuccess(false)}
                    className="text-slate-500 hover:text-slate-300 text-sm font-bold transition-colors"
                  >
                    Voltar para o login
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {/* Tabs */}
                {step === 1 && (
                  <div className="flex p-1 bg-slate-900/50 rounded-2xl mb-10 border border-white/5" onClick={() => setFormError(null)}>
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                        mode === 'login' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <LogIn size={18} /> Entrar
                    </button>
                    {allowSignups ? (
                      <button
                        type="button"
                        onClick={() => setMode('register')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                          mode === 'register' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <UserPlus size={18} /> Cadastrar
                      </button>
                    ) : (
                      <div className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 cursor-not-allowed">
                        <Lock size={14} /> Inscrições Off
                      </div>
                    )}
                  </div>
                )}

                {step === 2 && (
                  <button 
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-bold mb-8 transition-colors group"
                  >
                    <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    Voltar para dados de acesso
                  </button>
                )}

                <form onSubmit={handleEmailAuth} className="space-y-5">
                  <AnimatePresence mode="wait">
                    {mode === 'register' && step === 2 ? (
                      <motion.div
                        key="step2"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-5"
                      >
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                          <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                              type="text"
                              placeholder="Como deseja ser chamado?"
                              className="w-full pl-12 pr-4 py-4 bg-slate-900/50 border border-white/10 rounded-2xl text-white placeholder:text-slate-600 focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600 transition-all outline-none"
                              value={nomeCompleto}
                              onChange={(e) => setNomeCompleto(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp</label>
                          <div className="relative">
                            <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                              type="tel"
                              placeholder="Ex: 5511999999999"
                              className="w-full pl-12 pr-4 py-4 bg-slate-900/50 border border-white/10 rounded-2xl text-white placeholder:text-slate-600 focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600 transition-all outline-none"
                              value={whatsapp}
                              onChange={(e) => setWhatsapp(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Empresa</label>
                          <div className="relative">
                            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                              type="text"
                              placeholder="Sua empresa ou marca"
                              className="w-full pl-12 pr-4 py-4 bg-slate-900/50 border border-white/10 rounded-2xl text-white placeholder:text-slate-600 focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600 transition-all outline-none"
                              value={nomeEmpresa}
                              onChange={(e) => setNomeEmpresa(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Área de Atuação (Nicho)</label>
                          <div className="relative">
                            <Target className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                              type="text"
                              placeholder="Ex: Imobiliária, Estética, TI..."
                              className="w-full pl-12 pr-4 py-4 bg-slate-900/50 border border-white/10 rounded-2xl text-white placeholder:text-slate-600 focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600 transition-all outline-none"
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
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-5"
                      >
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                          <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                              type="email"
                              placeholder="exemplo@email.com"
                              className="w-full pl-12 pr-4 py-4 bg-slate-900/50 border border-white/10 rounded-2xl text-white placeholder:text-slate-600 focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600 transition-all outline-none"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between px-1">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Senha</label>
                            {mode === 'login' && (
                              <button 
                                type="button" 
                                onClick={handleForgotPassword}
                                className="text-xs font-bold text-blue-500 hover:text-blue-400 transition-colors"
                              >
                                Esqueceu a senha?
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                              type="password"
                              placeholder="••••••••"
                              className="w-full pl-12 pr-4 py-4 bg-slate-900/50 border border-white/10 rounded-2xl text-white placeholder:text-slate-600 focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600 transition-all outline-none"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-600/20 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
                  >
                    {isLoading ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <>
                        {mode === 'login' 
                          ? 'Entrar na Plataforma' 
                          : step === 1 
                            ? 'Próximo Passo' 
                            : 'Finalizar Cadastro'}
                        <ChevronRight size={18} />
                      </>
                    )}
                  </button>

                  {formError && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold"
                    >
                      <AlertCircle size={14} className="shrink-0" />
                      <p>{formError}</p>
                    </motion.div>
                  )}
                </form>

                {/* Divider */}
                <div className="relative my-8 text-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/5"></div>
                  </div>
                  <span className="relative px-4 bg-transparent text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">ou continue com</span>
                </div>

                {/* Social Provider */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-bold text-white transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-70"
                >
                  <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 grayscale-[0.5]" />
                  Google
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer Info */}
          <div className="mt-8 flex items-center justify-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            <ShieldCheck size={14} className="text-emerald-500" />
            Conexão Criptografada & Segura
          </div>
        </div>

        {/* Support Link */}
        <p className="mt-8 text-center text-slate-500 text-xs font-medium">
          Precisa de ajuda? {supportWhatsapp ? (
            <a 
              href={`https://wa.me/${supportWhatsapp.replace(/\D/g, '')}?text=Olá, preciso de ajuda com meu login no WppAI.`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-white transition-colors underline underline-offset-4"
            >
              Fale com o suporte
            </a>
          ) : (
            <button className="text-slate-300 hover:text-white transition-colors underline underline-offset-4">
              Fale com o suporte
            </button>
          )}
        </p>
      </motion.div>
    </div>
  );
}
