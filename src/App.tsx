import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { buildPath, parsePath, DEFAULT_TAB } from './routes';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Inbox from './components/Inbox';
import PWAInstallPrompt from './components/PWAInstallPrompt';

 import Login from './components/Login';
 import MaintenancePage from './components/MaintenancePage';
import { supabase } from './lib/supabase';
import { User } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';
import { useFeatureContext } from './contexts/FeatureFlagContext';
import { NotificationProvider } from './contexts/NotificationContext';

// Code splitting: telas secundárias só carregam quando o usuário navega para elas
const Agents = lazy(() => import('./components/Agents'));
const Contacts = lazy(() => import('./components/Contacts'));
const Clients = lazy(() => import('./components/Clients'));
const Schedules = lazy(() => import('./components/Schedules'));
const Availability = lazy(() => import('./components/Availability'));
const Integrations = lazy(() => import('./components/Integrations'));
const Settings = lazy(() => import('./components/Settings'));
const Reports = lazy(() => import('./components/Reports'));
const Professionals = lazy(() => import('./components/Professionals'));
const Overview = lazy(() => import('./components/Overview'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const Campaigns = lazy(() => import('./components/Campaigns'));
const QuickReplies = lazy(() => import('./components/QuickReplies'));
const LeoApp = lazy(() => import('./pages/Leo/LeoApp'));
const Finance = lazy(() => import('./components/Finance'));
const MetaTemplatesAdminPage = lazy(() => import('./components/MetaTemplatesAdminPage'));
const SofiaConfig = lazy(() => import('./components/Sofia/SofiaConfig'));
const OnboardingGuide = lazy(() => import('./components/OnboardingGuide'));
const DiagnosticsManager = lazy(() => import('./components/Diagnostics/DiagnosticsManager'));

const PageFallback = () => (
  <div className="h-[60vh] w-full flex items-center justify-center text-primary-500">
    <Loader2 size={36} className="animate-spin" />
  </div>
);

export default function App() {
  // A URL é a fonte da verdade da navegação: recarregar a página mantém a
  // seção, o voltar do navegador funciona e cada tela tem link próprio.
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tab: activeTab, subTab } = parsePath(location.pathname);
  const settingsSubTab = activeTab === 'settings' ? (subTab || 'account') : 'account';

  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [plano, setPlano] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  // Track current user ID to prevent unnecessary re-renders from onAuthStateChange
  const currentUserIdRef = useRef<string | null>(null);

  const [isInitializingProfile, setIsInitializingProfile] = useState(false);

  // Deep links que chegam pela query em vez do caminho:
  //   ?jid= / ?fullscreen= → notificação de push abrindo uma conversa (sw.js)
  //   connecting_google     → retorno do OAuth do Google
  // Só age quando o caminho ainda não aponta para a tela certa, para não
  // brigar com a navegação normal nem com o botão voltar.
  //
  // Também normaliza a URL: "/" e caminhos desconhecidos viram a rota real da
  // seção, e /settings vira /settings/account. Deep link e normalização moram
  // no mesmo efeito de propósito — separados, os dois disparariam navigate()
  // no mesmo ciclo e um sobrescreveria o outro.
  useEffect(() => {
    // O Supabase devolve a sessão do OAuth no HASH da URL (#access_token=…)
    // e a consome via detectSessionInUrl. Enquanto ela estiver lá nenhuma
    // navegação pode acontecer: navigate() reescreve a URL sem o hash, o
    // token se perde e o login cai de volta na tela inicial. O próprio
    // Supabase limpa o hash ao terminar, e o efeito roda de novo.
    if (/access_token|refresh_token|error_description/.test(location.hash)) return;

    const hasInboxDeepLink = searchParams.has('jid') || searchParams.has('fullscreen');

    // 1. Deep link tem prioridade sobre o caminho atual
    if (hasInboxDeepLink && activeTab !== 'inbox') {
      navigate({ pathname: buildPath('inbox'), search: location.search, hash: location.hash }, { replace: true });
      return;
    }

    if (
      !hasInboxDeepLink &&
      localStorage.getItem('connecting_google') === 'true' &&
      activeTab !== 'integrations'
    ) {
      navigate({ pathname: buildPath('integrations'), hash: location.hash }, { replace: true });
      return;
    }

    // 2. Caminho canônico da seção que está na tela
    const canonical = buildPath(activeTab, subTab);
    if (location.pathname !== canonical) {
      navigate({ pathname: canonical, search: location.search, hash: location.hash }, { replace: true });
    }
  }, [activeTab, subTab, location.pathname, location.search, location.hash, navigate, searchParams]);

  // Check public settings (maintenance/signups)
  const checkSafety = async () => {
    try {
      const res = await fetch('/api/v2/public-settings');
      const result = await res.json();
      if (result.success) {
        setMaintenanceMode(result.data.maintenance_mode);
      }
    } catch (e) {}
  };

  useEffect(() => {
    checkSafety();
  }, []);

  // Safety timeout: ensure loading screen disappears after 10s regardless
  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      setLoading(loading => {
        if (loading) {
          console.warn('[App] System recovery: Loading forced after 10s safety timeout');
          return false;
        }
        return loading;
      });
    }, 10000);
    return () => clearTimeout(safetyTimeout);
  }, []);

  // 1. Auth Listener: Only manages the USER object
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[App] Auth event:', event, 'User ID:', session?.user?.id);
      
      const currentUser = session?.user ?? null;
      
      if (event === 'SIGNED_OUT' || !currentUser) {
        setUser(null);
        setRole(null);
        setLoading(false);
        currentUserIdRef.current = null;
      } else {
        // SEGURANÇA: Se o e-mail não estiver confirmado, desloga imediatamente
        if (!currentUser.email_confirmed_at) {
          console.warn('[App] Unconfirmed email detected. Access denied.');
          supabase.auth.signOut();
          setUser(null);
          setLoading(false);
          return;
        }

        setUser(currentUser);
        currentUserIdRef.current = currentUser.id;
        if (event === 'TOKEN_REFRESHED') setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Role Fetcher: Responds to USER changes
  useEffect(() => {
    if (!user || role || isInitializingProfile) return;

    const fetchRole = async () => {
      setIsInitializingProfile(true);
      console.log('[App] Initializing role for user:', user.email);

      const ADMIN_EMAILS = ['ieqmur@gmail.com'];
      if (ADMIN_EMAILS.includes(user.email || '')) {
        setRole('admin');
        setLoading(false);
        setIsInitializingProfile(false);
        return;
      }

      try {
        // Small delay to let Supabase internal state settle
        await new Promise(r => setTimeout(r, 500));
        
        const { data: userRows, error: profileError } = await supabase
          .from('profiles')
          .select('role, plano')
          .eq('id', user.id)
          .maybeSingle();
        
        if (profileError) {
          console.error('[App] Profile fetch error:', profileError);
          setRole('client');
          setPlano('Trial');
        } else {
          setRole(userRows?.role || 'client');
          setPlano(userRows?.plano || 'Trial');
        }
      } catch (err) {
        console.error('[App] Role fetch exception:', err);
        setRole('client');
      } finally {
        setLoading(false);
        setIsInitializingProfile(false);
      }
    };

    fetchRole();
  }, [user, role, isInitializingProfile]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/'; // Força recarregamento total
  };

  /**
   * Ponto único de navegação. A assinatura é a mesma de antes — os componentes
   * que chamam onTabChange('settings', 'ai_config') não precisaram mudar —
   * mas agora ela escreve na URL em vez de num useState.
   *
   * A query é descartada ao trocar de seção — ?jid= pertence a uma conversa —
   * com uma exceção: ao ir PARA o inbox ela é preservada, porque Contatos,
   * Carteira e Dashboard gravam o ?jid= com history.pushState logo antes de
   * chamar esta função. Nesses casos a URL do DOM já está à frente do router,
   * então a leitura tem de ser em window.location.
   */
  const handleTabChange = useCallback((tab: string, subTab?: string) => {
    const search = tab === 'inbox' ? window.location.search : '';
    navigate({ pathname: buildPath(tab, subTab), search });
  }, [navigate]);

  /**
   * Chamado quando a tela troca de aba por dentro (Configurações, Painel Admin,
   * Leo) para refletir isso na URL. A comparação com o pathname atual evita
   * empilhar a mesma entrada no histórico quando a troca veio da própria URL.
   */
  const handleSubTabChange = useCallback((tab: string, nextSubTab: string) => {
    const target = buildPath(tab, nextSubTab);
    if (location.pathname !== target) navigate(target);
  }, [location.pathname, navigate]);

  const { flags = {}, isLoading: flagsLoading } = useFeatureContext();
  const leoEnabled = flags['leo_ai'] === true;
  const agendasEnabled = flags['agendas'] === true;
  const crmEnabled = flags['crm'] !== false; // Permite por padrão se não existir no banco
  const chatEnabled = flags['chat'] !== false; // Permite por padrão se não existir no banco

  if (loading || flagsLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50 text-blue-600">
        <Loader2 size={48} className="animate-spin mb-4" />
        <p className="font-bold text-lg">Carregando...</p>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onTabChange={handleTabChange} role={role || 'client'} user={user} plano={plano} />;
      case 'admin_hub':
        // Os cards do hub abrem abas do painel: a URL vira /admin/:tab para
        // que o F5 não devolva o admin ao hub.
        return (
          <AdminPanel
            key={activeTab}
            initialView="hub"
            onTabChange={handleTabChange}
            onSubTabChange={(t) => handleSubTabChange('admin', t)}
            role={role}
            user={user}
          />
        );
      case 'admin':
        return (
          <AdminPanel
            key={activeTab}
            initialTab={subTab as any}
            onTabChange={handleTabChange}
            onSubTabChange={(t) => handleSubTabChange('admin', t)}
            role={role}
            user={user}
          />
        );
      case 'lead_radar':
        return <AdminPanel key={activeTab} initialTab="lead_radar" onTabChange={handleTabChange} role={role} user={user} />;
      case 'sofia_config':
        return <SofiaConfig />;
      case 'reports':
        return <Reports />;
      case 'health':
      case 'overview':
        return <Overview />;
      case 'professionals':
        if (role !== 'admin' && !crmEnabled) return <Dashboard onTabChange={handleTabChange} role={role || 'client'} user={user} />;
        return <Professionals />;
      case 'agents':
        return <Agents user={user} role={role} />;
      case 'schedule':
        if (role !== 'admin' && !agendasEnabled) return <Dashboard onTabChange={handleTabChange} role={role || 'client'} user={user} />;
        return <Schedules user={user} role={role} />;
      case 'availability':
        if (role !== 'admin' && !agendasEnabled) return <Dashboard onTabChange={handleTabChange} role={role || 'client'} user={user} />;
        return <Availability />;
      case 'inbox':
        if (role !== 'admin' && !chatEnabled) return <Dashboard onTabChange={handleTabChange} role={role || 'client'} user={user} />;
        return <Inbox user={user} role={role} onTabChange={handleTabChange} />;
      case 'kanban':
        if (role !== 'admin' && !chatEnabled) return <Dashboard onTabChange={handleTabChange} role={role || 'client'} user={user} />;
        return <Inbox user={user} role={role} initialTab="kanban" onTabChange={handleTabChange} />;
      case 'contacts':
        return <Contacts onTabChange={handleTabChange} />;
      case 'clients':
        // Carteira do inquilino (CRM). A gestão dos inquilinos da plataforma
        // vive no Painel Admin — são coisas diferentes.
        return <Clients />;
      case 'meta_templates':
        return <MetaTemplatesAdminPage />;
      case 'integrations':
        return <Integrations user={user} role={role} />;
      case 'settings':
        return (
          <Settings
            initialSubTab={settingsSubTab}
            onSubTabChange={(t) => handleSubTabChange('settings', t)}
          />
        );
      case 'leo':
        if (role !== 'admin' && !leoEnabled) return <Dashboard onTabChange={handleTabChange} role={role || 'client'} user={user} />;
        return (
          <LeoApp
            user={user}
            role={role}
            onTabChange={handleTabChange}
            initialView={subTab}
            onViewChange={(v: string) => handleSubTabChange('leo', v)}
          />
        );
      case 'campaigns':
        return <Campaigns />;
      case 'quick_replies':
        return <QuickReplies />;
      case 'finance':
        return <Finance />;
      case 'onboarding':
        return <OnboardingGuide user={user} onTabChange={handleTabChange} />;
      case 'diagnostics':
        if (role !== 'admin') return <Dashboard onTabChange={handleTabChange} role={role || 'client'} user={user} />;
        return <DiagnosticsManager />;

      default:
        return (
          <div className="h-[60vh] flex flex-col items-center justify-center text-gray-400">
            <h2 className="text-xl font-semibold mb-2">Em desenvolvimento</h2>
            <p>A página "{activeTab}" estará disponível em breve.</p>
          </div>
        );
    }
  };

  return (
    <>
      {!user ? (
        <Login />
      ) : maintenanceMode && role !== 'admin' ? (
        <MaintenancePage />
      ) : (
        <NotificationProvider user={user}>
          {searchParams.get('fullscreen') === 'true' && activeTab === 'inbox' ? (
            <div className="w-screen h-screen bg-white">
              <Inbox user={user} role={role} isFullscreen={true} />
            </div>
          ) : (
            <Layout 
              activeTab={activeTab} 
              onTabChange={handleTabChange} 
              user={user} 
              role={role}
              plano={plano}
            >
              <Suspense fallback={<PageFallback />}>
                {renderContent()}
              </Suspense>
            </Layout>
          )}
        </NotificationProvider>
      )}
      <Toaster position="top-right" richColors />
      <PWAInstallPrompt />
    </>
  );
}
