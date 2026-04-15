import React, { useState, useEffect } from 'react';
import { 
  MessageCircle, 
  Calendar, 
  CreditCard, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle,
  Settings,
  QrCode,
  X,
  Loader2,
  RefreshCw,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { getUserProfile, updateUserProfile, signInWithGoogleCalendar, disconnectGoogleCalendar, listGoogleCalendars, type UserProfile } from '../services/supabaseService';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import WhatsAppWebJsConnect from './WhatsAppWebJsConnect';

interface IntegrationCardProps {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  status: 'connected' | 'disconnected' | 'connecting';
  buttonText: string;
  buttonVariant?: 'primary' | 'secondary';
  onClick?: () => void;
  isLoading?: boolean;
}

const IntegrationCard = ({ 
  icon, 
  iconBg, 
  iconColor, 
  title, 
  description, 
  status, 
  buttonText, 
  buttonVariant = 'secondary',
  onClick,
  isLoading = false
}: IntegrationCardProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card glass-card-hover rounded-3xl p-8 flex flex-col relative overflow-hidden group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center shadow-sm`}>
          {icon}
        </div>
        {status === 'connected' ? (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100">
            <CheckCircle2 size={12} /> Conectado
          </span>
        ) : status === 'connecting' ? (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">
            <Loader2 size={12} className="animate-spin" /> Conectando
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-100">
            <AlertCircle size={12} /> Desconectado
          </span>
        )}
      </div>

      <div className="flex-1 relative z-10">
        <h3 className="text-xl font-black text-slate-900 mb-2 tracking-tight">{title}</h3>
        <p className="text-sm text-slate-500 leading-relaxed font-medium">
          {description}
        </p>
      </div>

      <div className="mt-8 pt-8 border-t border-slate-50 flex items-center justify-between gap-4 relative z-10">
        <button 
          onClick={onClick}
          disabled={isLoading}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-black transition-all duration-300 disabled:opacity-70 active:scale-95
          ${buttonVariant === 'primary' 
            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200' 
            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              {buttonText === 'Gerar QR Code' && <QrCode size={16} />}
              {buttonText === 'Conectando...' && <Loader2 size={16} className="animate-spin" />}
              {buttonText === 'Configurar' && <Settings size={16} />}
              {buttonText === 'Conectar' && <ExternalLink size={16} />}
              {buttonText === 'Desconectar' && <X size={16} />}
            </>
          )}
          {buttonText}
        </button>
      </div>
    </motion.div>
  );
};

export default function Integrations({ user, role }: { user: User | null, role: string | null }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [calendars, setCalendars] = useState<any[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);

  useEffect(() => {
    const initIntegrations = async () => {
      // Safety Timeout to force-unlock UI
      const safetyTimeout = setTimeout(() => {
        console.warn('[Integrations] Safety unlock triggered after 8s');
        setLoading(false);
        setConnectingGoogle(false);
      }, 8000);

      try {
        const isConnecting = localStorage.getItem('connecting_google') === 'true';

        if (isConnecting) {
          // Acabou de voltar do OAuth do Google — capturar tokens da sessão
          const { data: { session } } = await supabase.auth.getSession();

          if (session?.user) {
            const updateData: any = {
              google_calendar_active: true,
              google_calendar_email: session.user.email
            };

            // provider_refresh_token só vem na primeira autorização
            if (session.provider_refresh_token) {
              console.log('[Integrations] Refresh token recebido do Google.');
              updateData.google_refresh_token = session.provider_refresh_token;
            } else {
              console.warn('[Integrations] Refresh token não disponível (re-autorização). Mantendo conexão ativa.');
            }

            await updateUserProfile(updateData);
            toast.success('Google Calendar conectado e sincronizado!');
          }
          localStorage.removeItem('connecting_google');
          setConnectingGoogle(false);
        }

        // Buscar perfil atualizado após processar OAuth
        const p = await getUserProfile();
        setProfile(p);
      } catch (err: any) {
        console.error('[Integrations] Erro na inicialização:', err);
        localStorage.removeItem('connecting_google');
        setConnectingGoogle(false);
        if (localStorage.getItem('connecting_google') === 'true') {
           toast.error('Falha ao finalizar conexão com Google. Tente novamente.');
        }
      } finally {
        clearTimeout(safetyTimeout);
        setLoading(false);
      }
    };

    initIntegrations();
  }, [user, user?.id]);

  useEffect(() => {
    if (profile?.google_calendar_active) {
      loadCalendars();
    }
  }, [profile?.google_calendar_active]);

  const loadCalendars = async () => {
    try {
      setLoadingCalendars(true);
      const list = await listGoogleCalendars();
      setCalendars(list);
    } catch (err) {
      console.error('Error loading calendars:', err);
    } finally {
      setLoadingCalendars(false);
    }
  };

  const handleSelectCalendar = async (id: string) => {
    try {
      await updateUserProfile({ selected_calendar_id: id });
      setProfile(prev => prev ? { ...prev, selected_calendar_id: id } : null);
      toast.success('Agenda selecionada com sucesso');
    } catch (err) {
      toast.error('Erro ao salvar agenda');
    }
  };

  const handleGoogleConnect = async () => {
    try {
      setConnectingGoogle(true);
      localStorage.setItem('connecting_google', 'true');
      await signInWithGoogleCalendar();
      // The page will redirect to Google OAuth
    } catch (err) {
      toast.error('Erro ao iniciar conexão com Google');
      localStorage.removeItem('connecting_google');
      setConnectingGoogle(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    if (!window.confirm('Tem certeza que deseja desconectar o Google Calendar?')) return;
    try {
      setConnectingGoogle(true);
      await disconnectGoogleCalendar();
      setProfile(prev => prev ? { ...prev, google_calendar_active: false, google_calendar_email: undefined } : null);
      toast.success('Google Calendar desconectado');
    } catch (err) {
      toast.error('Erro ao desconectar');
    } finally {
      setConnectingGoogle(false);
    }
  };

  const googleStatus = profile?.google_calendar_active ? 'connected' : 'disconnected';

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Integrações</h1>
        <p className="text-slate-500 font-medium mt-1">Conecte seus canais e ferramentas ao WppAI para automatizar seu fluxo de trabalho.</p>
      </div>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <WhatsAppWebJsConnect user={user} />

        <IntegrationCard 
          icon={<Calendar size={24} />}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          title="Google Calendar"
          description={profile?.google_calendar_email 
            ? `Sincronizado com: ${profile.google_calendar_email}`
            : "Sincronize os agendamentos feitos pela IA diretamente na sua agenda do Google para evitar conflitos de horário."
          }
          status={googleStatus}
          buttonText={googleStatus === 'connected' ? "Desconectar" : "Conectar"}
          buttonVariant={googleStatus === 'connected' ? "secondary" : "primary"}
          onClick={googleStatus === 'connected' ? handleGoogleDisconnect : handleGoogleConnect}
          isLoading={connectingGoogle || loading}
        />

        {googleStatus === 'connected' && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-600 rounded-3xl p-6 mt-[-32px] border-t-0 rounded-t-none relative z-0 shadow-xl shadow-blue-100"
          >
            <label className="block text-[10px] font-black text-white/70 uppercase tracking-widest mb-3 px-1">
              Agenda Sincronizada
            </label>
            <div className="relative group">
              <select 
                value={profile?.selected_calendar_id || ''}
                onChange={(e) => handleSelectCalendar(e.target.value)}
                disabled={loadingCalendars}
                className="w-full bg-white/10 border border-white/20 rounded-2xl py-3 px-4 text-sm font-bold text-white outline-none focus:ring-4 focus:ring-white/10 focus:bg-white/20 transition-all appearance-none cursor-pointer pr-10"
              >
                <option value="" className="text-slate-900">Selecione uma agenda...</option>
                {calendars.map(cal => (
                  <option key={cal.id} value={cal.id} className="text-slate-900">
                    {cal.summary} {cal.primary ? '(Principal)' : ''}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/60">
                {loadingCalendars ? <Loader2 size={18} className="animate-spin" /> : <Settings size={18} />}
              </div>
            </div>
            <p className="text-[10px] text-white/60 mt-3 px-1 leading-relaxed font-bold">
              A IA Sofia agendará novos compromissos automaticamente nesta agenda.
            </p>
          </motion.div>
        )}

        <IntegrationCard 
          icon={<CreditCard size={24} />}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          title="Stripe"
          description="Receba pagamentos e crie links de cobrança diretamente nas conversas do WhatsApp através da nossa integração."
          status="disconnected"
          buttonText="Conectar"
          buttonVariant="secondary"
        />
      </div>

      {/* Coming Soon Section */}
      <div className="mt-12">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">Em breve</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-60 grayscale">
          <div className="bg-white p-6 rounded-xl border border-gray-100 flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
              <span className="font-bold text-xs">CRM</span>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">HubSpot</p>
              <p className="text-xs text-gray-500">Sincronização de leads</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
              <span className="font-bold text-xs">API</span>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Webhooks</p>
              <p className="text-xs text-gray-500">Integração personalizada</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
