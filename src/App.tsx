import { useState, useEffect, useRef } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Agents from './components/Agents';
import Inbox from './components/Inbox';
import Contacts from './components/Contacts';
import Clients from './components/Clients';
import Schedules from './components/Schedules';
import Availability from './components/Availability';
import Integrations from './components/Integrations';
import Settings from './components/Settings';
import Reports from './components/Reports';
import Professionals from './components/Professionals';
import Health from './components/Health';
 import AdminPanel from './components/AdminPanel';
 import Login from './components/Login';
 import MaintenancePage from './components/MaintenancePage';
import { supabase } from './lib/supabase';
import { User } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settingsSubTab, setSettingsSubTab] = useState('account');
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  // Track current user ID to prevent unnecessary re-renders from onAuthStateChange
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Check for JID in URL to auto-select Inbox
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname;
    
    if (params.has('jid') || params.has('fullscreen')) {
      setActiveTab('inbox');
    } else if (path.includes('/integrations') || localStorage.getItem('connecting_google') === 'true') {
      setActiveTab('integrations');
    }

    // Supabase Auth listener
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

    checkSafety();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[App] Auth event:', event);
      
      const currentUser = session?.user ?? null;
      const incomingId = currentUser?.id ?? null;

      // TOKEN_REFRESHED: JWT renovado automaticamente
      if (event === 'TOKEN_REFRESHED') {
        console.log('[App] Token refreshed — atualizando user');
        if (currentUser) setUser(currentUser);
        setLoading(false);
        return;
      }

      // SIGNED_OUT: limpar estado
      if (event === 'SIGNED_OUT' || !currentUser) {
        currentUserIdRef.current = null;
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      // Evita re-inicialização se o ID for o mesmo (exceto se role for null)
      if (incomingId && incomingId === currentUserIdRef.current && role) {
        console.log('[App] Mesmo usuário e role já definido — ignorando');
        setLoading(false);
        return;
      }

      // Usuário novo ou primeira autenticação
      currentUserIdRef.current = incomingId;
      setUser(currentUser);

      // ADMIN BYPASS
      const ADMIN_EMAILS = ['ieqmur@gmail.com'];
      if (ADMIN_EMAILS.includes(currentUser.email || '')) {
        setRole('admin');
        setLoading(false);
        return;
      }

      try {
        // Buscar role por id ou email
        const { data: userRows } = await supabase
          .from('profiles')
          .select('role, id')
          .or(`id.eq.${currentUser.id},email.eq.${currentUser.email}`)
          .limit(1);
        
        const profileRole = userRows?.[0]?.role;
        setRole(profileRole || 'client');
      } catch (err) {
        console.error('[App] Role refresh error:', err);
        setRole('client');
      } finally {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/'; // Força recarregamento total
  };

  const handleTabChange = (tab: string, subTab?: string) => {
    setActiveTab(tab);
    if (tab === 'settings' && subTab) {
      setSettingsSubTab(subTab);
    } else if (tab === 'settings' && !subTab) {
      setSettingsSubTab('account');
    }
  };

  if (loading) {
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
        return <Dashboard onTabChange={handleTabChange} role={role || 'client'} user={user} />;
      case 'admin':
        return <AdminPanel />;
      case 'reports':
        return <Reports />;
      case 'health':
        return <Health />;
      case 'professionals':
        return <Professionals />;
      case 'agents':
        return <Agents user={user} role={role} />;
      case 'schedule':
        return <Schedules user={user} role={role} />;
      case 'availability':
        return <Availability />;
      case 'inbox':
        return <Inbox user={user} role={role} />;
      case 'contacts':
        return <Contacts onTabChange={handleTabChange} user={user} role={role} />;
      case 'clients':
        return <Clients onTabChange={handleTabChange} user={user} role={role} />;
      case 'integrations':
        return <Integrations user={user} role={role} />;
      case 'settings':
        return <Settings initialSubTab={settingsSubTab} />;
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
      ) : window.location.search.includes('fullscreen=true') && activeTab === 'inbox' ? (
        <div className="w-screen h-screen bg-white">
          <Inbox user={user} role={role} isFullscreen={true} />
        </div>
      ) : (
        <Layout activeTab={activeTab} onTabChange={handleTabChange} user={user} role={role}>
          {renderContent()}
        </Layout>
      )}
      <Toaster position="top-right" richColors />
    </>
  );
}
