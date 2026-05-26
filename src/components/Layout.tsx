import React, { useState } from 'react';
import {
  LayoutDashboard,
  Inbox,
  Users,
  Bot,
  Calendar,
  Layers,
  Settings,
  ChevronLeft,
  ChevronRight,
  Search,
  Bell,
  User as UserIcon,
  Menu,
  X,
  ChevronDown,
  Clock,
  LogOut,
  Sparkles,
  CreditCard,
  MessageSquare,
  ChevronUp,
  Star,
  BarChart3,
  Activity,
  Shield,
  Zap,
  Send,
  Plug,
  Wallet,
  FileText,
  Rocket
} from 'lucide-react';
import { ONBOARDING_STORAGE_KEY } from './OnboardingGuide';

import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { useFeature, useFeatureContext } from '../contexts/FeatureFlagContext';
import { useRef, useEffect } from 'react';
import SofiaChat from './Sofia/SofiaChat';
import { useNotification } from '../contexts/NotificationContext';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed: boolean;
  onClick?: () => void;
  hasSubmenu?: boolean;
  isSubmenuOpen?: boolean;
}

interface MenuItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  minPlan?: string;
  flag?: string;
  subItems?: {
    id: string;
    label: string;
    icon: React.ReactNode;
    minPlan?: string;
    flag?: string;
  }[];
}

interface MenuSection {
  id: string;
  title?: string;
  role?: 'admin';
  items: MenuItem[];
}


const SidebarItem = ({ icon, label, active, collapsed, onClick, hasSubmenu, isSubmenuOpen }: SidebarItemProps) => {
  return (
    <div
      onClick={onClick}
      className={`flex items-center p-2 rounded-xl cursor-pointer transition-all duration-300 group relative
        ${active
          ? 'bg-primary text-white shadow-lg shadow-primary/20'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 group-active:scale-95'
        }`}
    >
      {active && (
        <motion.div
          layoutId="activeTab"
          className="absolute inset-y-2 -left-1 w-1 bg-white rounded-r-full"
        />
      )}
      <div className={`${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`}>
        {icon}
      </div>
      {!collapsed && (
        <div className="ml-2.5 flex-1 flex items-center justify-between overflow-hidden">
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-xs font-medium whitespace-nowrap"
          >
            {label}
          </motion.span>
          {hasSubmenu && (
            <ChevronDown
              size={13}
              className={`transition-transform duration-200 ${isSubmenuOpen ? 'rotate-180' : ''}`}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default function Layout({ 
  children, 
  activeTab, 
  onTabChange, 
  user,
  role,
  plano
}: { 
  children: React.ReactNode, 
  activeTab: string, 
  onTabChange: (tab: string, subTab?: string) => void,
  user: User | null,
  role: string | null,
  plano: string | null
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY(user.id));
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        setOnboardingDone(Object.values(parsed).filter(Boolean).length);
      }
    } catch {}
  }, [user?.id, activeTab]);

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    admin_menu: false,
    prospeccao_menu: false,
    atendimento_menu: true,
    ia_menu: false,
    config_menu: false,
  });
  const [isHeaderProfileOpen, setIsHeaderProfileOpen] = useState(false);
  const headerProfileRef = useRef<HTMLDivElement>(null);
  const { unreadTotal } = useNotification();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (headerProfileRef.current && !headerProfileRef.current.contains(event.target as Node)) {
        setIsHeaderProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    console.log('[Layout] Logging out safely...');
    try {
      // 1. Limpa o localStorage do Supabase manualmente para garantir
      Object.keys(localStorage).forEach(key => {
        if (key.includes('supabase.auth.token') || key.includes('-auth-token')) {
          localStorage.removeItem(key);
        }
      });
      
      // 2. Chama o signOut (com timeout de segurança)
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SignOut Timeout')), 2000))
      ]);
    } catch (e) {
      console.warn('[Logout] Fallback triggered', e);
    } finally {
      // 3. Limpeza total de cookies e estado
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substring(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      }
      
      // 4. Força o recarregamento total para a raiz
      window.location.replace('/');
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/).filter(p => p.toLowerCase() !== 'de' && p.toLowerCase() !== 'da' && p.toLowerCase() !== 'do' && p.toLowerCase() !== 'dos');
    if (parts.length === 0) return name[0].toUpperCase();
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Log de diagnóstico para permissões (apenas em desenvolvimento)
  useEffect(() => {
    if (user) {
      console.log(`[Permissions] User: ${user.email} | Role: ${role}`);
    }
  }, [user, role]);

  // Auto-expandir os submenus se a aba correspondente estiver ativa
  useEffect(() => {
    if (['admin', 'sofia_config', 'overview', 'clients', 'meta_templates'].includes(activeTab)) {
      setOpenMenus(prev => ({ ...prev, admin_menu: true }));
    }
    if (['lead_radar'].includes(activeTab)) {
      setOpenMenus(prev => ({ ...prev, prospeccao_menu: true }));
    }
    if (['inbox', 'kanban', 'contacts'].includes(activeTab)) {
      setOpenMenus(prev => ({ ...prev, suporte_menu: true }));
    }
    if (['finance'].includes(activeTab)) {
      setOpenMenus(prev => ({ ...prev, financeiro_menu: true }));
    }
    if (['agents', 'leo', 'campaigns', 'quick_replies'].includes(activeTab)) {
      setOpenMenus(prev => ({ ...prev, ia_menu: true }));
    }
    if (['schedule', 'availability', 'integrations', 'reports', 'professionals', 'settings'].includes(activeTab)) {
      setOpenMenus(prev => ({ ...prev, config_menu: true }));
    }
  }, [activeTab]);

  const { flags } = useFeatureContext();

  // Estrutura de dados das seções e itens do menu lateral
  const menuSections: MenuSection[] = [
    {
      id: 'sec_admin',
      role: 'admin' as const,
      items: [
        {
          id: 'admin_menu',
          icon: <Shield size={16} />,
          label: 'Administração',
          subItems: [
            { id: 'admin', label: 'Painel Admin', icon: <Shield size={13} /> },
            { id: 'sofia_config', label: 'Configurações Sofia', icon: <Bot size={13} /> },
            { id: 'overview', label: 'Visão Geral', icon: <Activity size={13} /> },
            { id: 'clients', label: 'Carteira', icon: <Star size={13} /> },
            { id: 'meta_templates', label: 'Templates', icon: <FileText size={13} className="text-violet-500" /> },
          ]
        }
      ]
    },
    {
      id: 'sec_prospeccao',
      items: [
        {
          id: 'prospeccao_menu',
          icon: <Search size={16} />,
          label: 'Prospecção Ativa',
          subItems: [
            { id: 'lead_radar', icon: <Search size={13} />, label: 'Radar de Leads' }
          ]
        }
      ]
    },
    {
      id: 'sec_dashboard',
      items: [
        {
          id: 'dashboard',
          icon: <LayoutDashboard size={16} />,
          label: 'Dashboard',
        }
      ]
    },
    {
      id: 'sec_suporte',
      items: [
        {
          id: 'suporte_menu',
          icon: <MessageSquare size={16} />,
          label: 'Suporte',
          subItems: [
            {
              id: 'inbox',
              icon: (
                <div className="relative">
                  <Inbox size={13} />
                  {unreadTotal > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white border-2 border-white">
                      {unreadTotal > 99 ? '99+' : unreadTotal}
                    </span>
                  )}
                </div>
              ),
              label: 'Atendimento'
            },
            { id: 'kanban', icon: <Layers size={13} />, label: 'Triagem', minPlan: 'Pro' },
            { id: 'contacts', icon: <Users size={13} />, label: 'Contatos' },
          ]
        }
      ]
    },
    {
      id: 'sec_financeiro',
      items: [
        {
          id: 'financeiro_menu',
          icon: <Wallet size={16} />,
          label: 'Financeiro',
          subItems: [
            { id: 'finance', icon: <Wallet size={13} />, label: 'Meu Plano' },
            { id: 'reports', icon: <BarChart3 size={13} />, label: 'Relatórios', minPlan: 'Pro' },
          ]
        }
      ]
    },
    {
      id: 'sec_automacao',
      items: [
        {
          id: 'ia_menu',
          icon: <Bot size={16} />,
          label: 'Automação',
          subItems: [
            { id: 'agents', icon: <img src="/sofiamini.png" className="w-3.5 h-3.5 object-cover rounded-md" alt="Agentes" />, label: 'Agentes de IA', minPlan: 'Pro' },
            {
              id: 'leo',
              icon: <Zap size={13} className="text-amber-500" />,
              label: 'Leo',
              flag: 'leo_ai',
              minPlan: 'Starter'
            },
            { id: 'campaigns', icon: <Send size={13} />, label: 'Campanhas', flag: 'campaigns', minPlan: 'Elite' },
            { id: 'quick_replies', icon: <MessageSquare size={13} />, label: 'Atalhos', minPlan: 'Starter' },
          ]
        }
      ]
    },
    {
      id: 'sec_sistema',
      items: [
        {
          id: 'config_menu',
          icon: <Settings size={16} />,
          label: 'Sistema',
          subItems: [
            { id: 'schedule', label: 'Agendamentos', icon: <Calendar size={13} />, flag: 'agendas', minPlan: 'Pro' },
            { id: 'availability', label: 'Disponibilidade', icon: <Clock size={13} />, flag: 'agendas', minPlan: 'Pro' },
            { id: 'integrations', icon: <Plug size={13} />, label: 'Integrações', flag: 'official_api' },
            { id: 'professionals', icon: <Users size={13} />, label: 'Equipe', flag: 'crm' },
            { id: 'settings', icon: <Settings size={13} />, label: 'Configurações' },
          ]
        }
      ]
    }
  ];

  // Filtra as seções e os itens internos com base nas permissões e planos do usuário
  const filteredSections = menuSections
    .map(section => {
      // 1. Filtrar se a seção inteira é restrita ao admin
      if (section.role === 'admin' && role !== 'admin') {
        return null;
      }

      // 2. Filtrar os itens da seção e os subitens
      const filteredItems = section.items.map(item => {
        const clonedItem = { ...item };
        if (clonedItem.subItems) {
          clonedItem.subItems = clonedItem.subItems.filter(sub => {
            if (sub.flag && flags[sub.flag] === false) return false;
            if (role === 'admin') return true;
            if (sub.minPlan) {
              const plans = ['Trial', 'Starter', 'Pro', 'Elite', 'Enterprise'];
              const userPlanIdx = plans.indexOf(plano || 'Trial');
              const minPlanIdx = plans.indexOf(sub.minPlan);
              if (userPlanIdx < minPlanIdx) return false;
            }
            return true;
          });
        }
        return clonedItem;
      }).filter(item => {
        // Feature Flag Check no item principal
        if (item.flag && flags[item.flag] === false) return false;
        
        if (role === 'admin') return true;
        
        // Plan Restriction Check no item principal
        if (item.minPlan) {
          const plans = ['Trial', 'Starter', 'Pro', 'Elite', 'Enterprise'];
          const userPlanIdx = plans.indexOf(plano || 'Trial');
          const minPlanIdx = plans.indexOf(item.minPlan);
          
          if (userPlanIdx < minPlanIdx) return false;
        }

        // Se o item tem subitens e após o filtro ficou vazio, oculte-o
        if (item.subItems && item.subItems.length === 0) {
          return false;
        }

        return true;
      });

      if (filteredItems.length === 0) return null;

      return {
        ...section,
        items: filteredItems
      };
    })
    .filter((section): section is Exclude<typeof section, null> => section !== null);

  const handleTabClick = (id: string, hasSubmenu?: boolean) => {
    if (hasSubmenu) {
      setOpenMenus(prev => ({ ...prev, [id]: !prev[id] }));
      return;
    }
    onTabChange(id);
    setMobileMenuOpen(false);
  };

  const isTabActive = (id: string, subItems?: any[]) => {
    if (activeTab === id) return true;
    if (subItems) {
      return subItems.some(sub => sub.id === activeTab);
    }
    return false;
  };

  return (
    <div className="flex h-[100dvh] bg-[#F8FAFC] font-sans text-slate-900 overflow-hidden">
      {/* Sidebar Desktop */}
      <motion.aside 
        initial={false}
        animate={{ width: collapsed ? '80px' : '260px' }}
        className="hidden md:flex flex-col bg-white border-r border-slate-200 transition-all duration-300 ease-in-out relative z-30"
      >
        <div className="p-6 flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2 font-bold text-xl text-primary cursor-pointer" onClick={() => handleTabClick('dashboard')}>
              <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white shadow-lg shadow-primary/30 overflow-hidden border border-white/10">
                <img src="/sofiamini.png" alt="Zyreo Sofia" className="w-full h-full object-cover" />
              </div>
              <span className="tracking-tighter font-black">Zyreo <span className="text-primary">Sofia</span></span>
            </div>
          )}
          {collapsed && (
            <div 
              className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white mx-auto cursor-pointer shadow-lg shadow-primary/30 overflow-hidden"
              onClick={() => handleTabClick('dashboard')}
            >
              <img src="/sofiamini.png" alt="Zyreo Sofia" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-4 mt-4 overflow-y-auto custom-scrollbar">
          {/* Primeiros Passos — sempre primeiro */}
          <div
            onClick={() => { onTabChange('onboarding'); setMobileMenuOpen(false); }}
            className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all group relative
              ${activeTab === 'onboarding'
                ? 'bg-primary text-white shadow-lg shadow-primary/30'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
          >
            <div className={`w-7 h-7 flex items-center justify-center rounded-lg shrink-0 transition-all
              ${activeTab === 'onboarding' ? 'text-white' : 'text-slate-500 group-hover:text-primary'}`}>
              <Rocket size={16} />
            </div>
            {!collapsed && (
              <span className="text-sm font-semibold flex-1 truncate">Primeiros Passos</span>
            )}
            {!collapsed && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0
                ${onboardingDone >= 5
                  ? 'bg-emerald-100 text-emerald-600'
                  : activeTab === 'onboarding'
                    ? 'bg-white/20 text-white'
                    : 'bg-orange-100 text-orange-600'
                }`}>
                {onboardingDone}/5
              </span>
            )}
            {collapsed && (
              <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                Primeiros Passos
              </div>
            )}
          </div>

          {filteredSections.map((section) => (
            <div key={section.id} className="space-y-1">
              {collapsed && (
                <div className="h-px bg-slate-100 my-2 first:hidden" />
              )}
              {section.items.map((item) => (
                <div key={item.id}>
                  <SidebarItem 
                    icon={item.icon} 
                    label={item.label} 
                    active={isTabActive(item.id, item.subItems)} 
                    collapsed={collapsed}
                    onClick={() => handleTabClick(item.id, !!item.subItems)}
                    hasSubmenu={!!item.subItems}
                    isSubmenuOpen={openMenus[item.id] || false}
                  />
                  
                  {item.subItems && !collapsed && openMenus[item.id] && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="ml-9 mt-1 space-y-1"
                    >
                      {item.subItems.map((sub) => (
                        <div
                          key={sub.id}
                          onClick={() => handleTabClick(sub.id)}
                          className={`flex items-center p-1.5 rounded-lg cursor-pointer text-xs transition-all
                            ${activeTab === sub.id
                              ? 'text-primary font-semibold bg-primary-light/50'
                              : 'text-slate-400 hover:text-slate-800 hover:bg-slate-50'
                            }`}
                        >
                          <span className="mr-2 opacity-70">{sub.icon}</span>
                          {sub.label}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>

        {role === 'admin' && !collapsed && (
          <div className="px-4 py-4 mt-auto">
            <SystemHealthStatus />
          </div>
        )}

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center p-2.5 rounded-xl text-gray-400 hover:bg-slate-50 hover:text-slate-900 transition-all border border-transparent hover:border-slate-100 group"
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? (
              <ChevronRight size={20} />
            ) : (
              <div className="flex items-center gap-2 w-full px-2">
                <ChevronLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" /> 
                <span className="text-xs font-medium text-slate-500">Recolher menu</span>
              </div>
            )}
          </button>
        </div>
      </motion.aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-64 bg-white z-50 md:hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 flex items-center justify-between border-bottom border-gray-100">
                <div className="flex items-center gap-2 font-bold text-xl text-sofia-purple">
                  <div className="w-8 h-8 bg-sofia-purple rounded-lg flex items-center justify-center text-white overflow-hidden">
                    <img src="/sofiamini.png" alt="Sofia" className="w-full h-full object-cover" />
                  </div>
                  <span>Sofia</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="hidden">
                  <X size={24} />
                </button>
              </div>
              <nav className="flex-1 px-4 space-y-4 mt-4 overflow-y-auto">
                {/* Primeiros Passos — sempre primeiro */}
                <div
                  onClick={() => { onTabChange('onboarding'); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all
                    ${activeTab === 'onboarding'
                      ? 'bg-primary text-white shadow-lg shadow-primary/30'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                >
                  <div className="w-7 h-7 flex items-center justify-center rounded-lg shrink-0">
                    <Rocket size={16} />
                  </div>
                  <span className="text-sm font-semibold flex-1">Primeiros Passos</span>
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full
                    ${onboardingDone >= 5 ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                    {onboardingDone}/5
                  </span>
                </div>

                {filteredSections.map((section) => (
                  <div key={section.title} className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-1.5 mt-3 first:mt-0 select-none">
                      {section.title}
                    </div>
                    {section.items.map((item) => (
                      <div key={item.id}>
                        <SidebarItem 
                          icon={item.icon} 
                          label={item.label} 
                          active={isTabActive(item.id, item.subItems)} 
                          collapsed={false}
                          onClick={() => handleTabClick(item.id, !!item.subItems)}
                          hasSubmenu={!!item.subItems}
                          isSubmenuOpen={openMenus[item.id] || false}
                        />
                        {item.subItems && openMenus[item.id] && (
                          <div className="ml-9 mt-1 space-y-1">
                            {item.subItems.map((sub) => (
                              <div
                                key={sub.id}
                                onClick={() => handleTabClick(sub.id)}
                                className={`flex items-center p-2 rounded-lg cursor-pointer text-sm transition-all
                                  ${activeTab === sub.id 
                                    ? 'text-primary-600 font-semibold' 
                                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                  }`}
                              >
                                <span className="mr-2 opacity-70">{sub.icon}</span>
                                {sub.label}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </nav>

              <div className="p-6 border-t border-gray-100 flex flex-col items-center gap-2">
                <p className="text-[10px] text-gray-300 font-medium text-center">Sofia System v1.0.5</p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white/95 md:bg-white/80 md:backdrop-blur-md border-b border-slate-100 flex items-center justify-between px-4 md:px-10 fixed md:sticky top-0 left-0 right-0 z-30 transform-gpu">
          <div className="flex items-center gap-4 flex-1">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              <Menu size={20} />
            </button>
            
            <div className="relative max-w-sm w-full hidden sm:block">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search size={16} />
              </div>
              <input 
                type="text" 
                placeholder="Pesquisar..." 
                className="block w-full pl-10 pr-4 py-2.5 border border-slate-100 rounded-xl bg-slate-50 text-xs font-semibold placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:bg-white focus:border-primary transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            <button className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            
            <div className="h-8 w-px bg-gray-200 hidden md:block"></div>
            
            <div className="relative" ref={headerProfileRef}>
              <div 
                onClick={() => setIsHeaderProfileOpen(!isHeaderProfileOpen)}
                className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center text-primary border-2 border-transparent hover:border-primary-light transition-all overflow-hidden cursor-pointer shadow-sm active:scale-95"
              >
                {user?.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon size={20} />
                )}
              </div>

              <AnimatePresence>
                {isHeaderProfileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[100]"
                  >
                    <div className="p-4 border-b border-gray-50 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-pink-500 flex items-center justify-center text-white font-bold shrink-0">
                        {getInitials(user?.user_metadata?.full_name || user?.email)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {user?.user_metadata?.full_name || 'Usuário'}
                        </p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {user?.email}
                        </p>
                      </div>
                    </div>
                    <div className="p-2">
                      <button 
                        onClick={() => { onTabChange('settings', 'subscription'); setIsHeaderProfileOpen(false); }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-all"
                      >
                        <Sparkles size={18} className="text-gray-400" />
                        Upgrade to Pro
                      </button>
                      <div className="h-px bg-gray-50 my-1 mx-2" />
                      <button 
                        onClick={() => { onTabChange('settings', 'account'); setIsHeaderProfileOpen(false); }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-all"
                      >
                        <UserIcon size={18} className="text-gray-400" />
                        Minha Conta
                      </button>
                      <button 
                        onClick={() => { onTabChange('settings', 'subscription'); setIsHeaderProfileOpen(false); }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-all"
                      >
                        <CreditCard size={18} className="text-gray-400" />
                        Assinatura
                      </button>
                      <div className="h-px bg-gray-50 my-1 mx-2" />
                      <button 
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-all font-bold"
                      >
                        <LogOut size={18} />
                        Sair do sistema (Logout)
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Content */}
        <main
          className={`flex-1 overscroll-none ${
            activeTab === 'inbox'
              ? 'overflow-hidden pt-20 md:pt-0'
              : 'overflow-y-auto p-4 md:p-8 pt-24 md:pt-8'
          }`}
          style={{ overscrollBehaviorY: 'none' }}
        >
          {activeTab === 'inbox' ? (
            <div className="h-full">{children}</div>
          ) : (
            <div className="max-w-7xl mx-auto">{children}</div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 items-center justify-around z-50 px-2
        ${(activeTab === 'inbox' && (window.location.search.includes('jid') || window.location.hash.includes('jid'))) ? 'hidden' : 'flex'}`}>
        <button 
          onClick={() => onTabChange('inbox')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'inbox' ? 'text-primary' : 'text-slate-400'}`}
        >
          <MessageSquare size={22} fill={activeTab === 'inbox' ? 'currentColor' : 'none'} className={activeTab === 'inbox' ? 'opacity-20' : ''} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Conversas</span>
        </button>
        
        {useFeature('crm') && (
          <button 
            onClick={() => onTabChange('contacts')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'contacts' ? 'text-primary' : 'text-slate-400'}`}
          >
            <Users size={22} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Contatos</span>
          </button>
        )}

        <button 
          onClick={() => onTabChange('integrations')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'integrations' ? 'text-primary-600' : 'text-slate-400'}`}
        >
          <Layers size={22} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Integrações</span>
        </button>

        <button 
          onClick={() => onTabChange('agents')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'agents' ? 'text-primary' : 'text-slate-400'}`}
        >
          <div className="w-[22px] h-[22px] overflow-hidden rounded-md">
            <img 
              src="/sofiamini.png" 
              alt="Agentes" 
              className={`w-full h-full object-cover ${activeTab === 'agents' ? '' : 'grayscale opacity-60'}`} 
            />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Agentes</span>
        </button>

        {role === 'admin' && (
          <button 
            onClick={() => onTabChange('admin_hub')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'admin_hub' ? 'text-primary-600' : 'text-slate-400'}`}
          >
            <Shield size={22} fill={activeTab === 'admin_hub' ? 'currentColor' : 'none'} className={activeTab === 'admin_hub' ? 'opacity-20' : ''} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Admin</span>
          </button>
        )}
      </div>
      
      {/* Sofia Assistant Chat - Somente Elite ou Admin */}
      {(plano === 'Elite' || plano === 'Enterprise' || role === 'admin') && <SofiaChat />}
    </div>
  );
}
const SystemHealthStatus = () => {
  const [health, setHealth] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      const { data } = await supabase.from('sys_health').select('status');
      setHealth(data || []);
      setLoading(false);
    };
    fetchHealth();

    const channel = supabase
      .channel('sidebar_health')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sys_health' }, () => {
        fetchHealth();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const isDegraded = health.some(h => h.status === 'error');

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-2xl p-4 border transition-colors ${isDegraded ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status do Sistema</span>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isDegraded ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isDegraded ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
          </span>
          <span className={`text-[10px] font-black uppercase ${isDegraded ? 'text-amber-600' : 'text-emerald-600'}`}>
            {isDegraded ? 'Degradado' : 'Operacional'}
          </span>
        </div>
      </div>
      <p className="text-[10px] text-slate-500 font-medium leading-tight">
        {isDegraded 
          ? 'Alguns serviços estão apresentando instabilidade. Verifique a Visão Geral.' 
          : 'Todos os serviços (IA, Redis, Supabase) estão respondendo normalmente.'}
      </p>
    </motion.div>
  );
};
