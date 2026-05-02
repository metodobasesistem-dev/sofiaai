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
import Professionals from './components/Professionals';
import Overview from './components/Overview';
import AdminPanel from './components/AdminPanel';
 import Login from './components/Login';
 import MaintenancePage from './components/MaintenancePage';
import { supabase } from './lib/supabase';
import { User } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';
import { useFeatureContext } from './contexts/FeatureFlagContext';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settingsSubTab, setSettingsSubTab] = useState('account');
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  // Track current user ID to prevent unnecessary re-renders from onAuthStateChange
  const currentUserIdRef = useRef<string | null>(null);

  const [isInitializingProfile, setIsInitializingProfile] = useState(false);

  // Check for JID in URL to auto-select Inbox
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname;
    
    if (params.has('jid') || params.has('fullscreen')) {
      setActiveTab('inbox');
    } else if (path.includes('/integrations') || localStorage.getItem('connecting_google') === 'true') {
      setActiveTab('integrations');
    }
  }, []);

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
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        
        if (profileError) {
          console.error('[App] Profile fetch error:', profileError);
          setRole('client');
        } else {
          setRole(userRows?.role || 'client');
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

  const handleTabChange = (tab: string, subTab?: string) => {
    setActiveTab(tab);
    if (tab === 'settings' && subTab) {
      setSettingsSubTab(subTab);
    } else if (tab === 'settings' && !subTab) {
      setSettingsSubTab('account');
    }
  };

  const { isLoading: flagsLoading } = useFeatureContext();

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
        return <Dashboard onTabChange={handleTabChange} role={role || 'client'} user={user} />;
      case 'admin_hub':
        return <AdminPanel initialView="hub" onTabChange={handleTabChange} />;
      case 'admin':
        return <AdminPanel onTabChange={handleTabChange} />;
      case 'reports':
        return <Reports />;
      case 'health':
      case 'overview':
        return <Overview />;
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
