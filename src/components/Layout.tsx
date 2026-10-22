import React, { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
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
import NotificationBell from './NotificationBell';

import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { useFeature, useFeatureContext } from '../contexts/FeatureFlagContext';
import { useRef, useEffect } from 'react';
import SofiaChat from './Sofia/SofiaChat';
import { useNotification } from '../contexts/NotificationContext';
import { podeVer } from '../lib/acesso';

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

const SIDEBAR_STORAGE_KEY = 'sidebar_collapsed';

/**
 * Item do menu lateral escuro.
 * - Recolhido: só o ícone, com o nome aparecendo num balão ao passar o mouse.
 * - Expandido: ícone + nome (+ seta quando tem submenu).
 */
const SidebarItem = ({ icon, label, active, collapsed, onClick, hasSubmenu, isSubmenuOpen }: SidebarItemProps) => {
  // Com o submenu aberto, o destaque forte fica no subitem ativo, não no pai.
  const strongActive = active && (collapsed || !hasSubmenu);
  const softActive = active && !strongActive;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group relative flex w-full items-center rounded-lg h-10 transition-colors duration-150
        ${collapsed ? 'justify-center' : 'gap-3 px-3'}
        ${strongActive
          ? 'bg-primary-600 text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.7)]'
          : softActive
            ? 'bg-white/[0.06] text-white'
            : 'text-slate-400 hover:bg-sidebar-hover hover:text-white'
        }`}
    >
      <span className="flex shrink-0 items-center justify-center">{icon}</span>

      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left text-[13px] font-medium">{label}</span>
          {hasSubmenu && (
            <ChevronDown
              size={14}
              className={`shrink-0 opacity-60 transition-transform duration-200 ${isSubmenuOpen ? 'rotate-180' : ''}`}
            />
          )}
        </>
      )}

      {collapsed && (
        <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity duration-150 group-hover:opacity-100">
          {label}
        </span>
      )}
    </button>
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
  // O menu começa recolhido (só ícones), como no padrão visual adotado.
  // A escolha do usuário fica salva para a próxima visita.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Ler a URL pelo router (e não por window.location) faz a barra inferior
  // reagir quando a navegação acontece sem recarregar a página.
  const location = useLocation();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {}
  }, [collapsed]);

  /**
   * A barra inferior tem atalhos para telas que hoje são seções de
   * Configurações. Só `activeTab` não basta para acendê-los: ele vale
   * 'settings' para todas elas, então é preciso olhar a sub-seção na URL.
   */
  const estaEmConfig = (secao: string) =>
    activeTab === 'settings' && location.pathname.split('/')[2] === secao;

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    admin_menu: false,
    prospeccao_menu: false,
    atendimento_menu: true,
    ia_menu: false,
  });
  const [isHeaderProfileOpen, setIsHeaderProfileOpen] = useState(false);
  const headerProfileRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  // Atalho Ctrl+K (ou Cmd+K) para focar a busca do cabeçalho
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
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

  const displayName: string = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário';
  const roleLabel = role === 'admin' ? 'Administrador' : plano ? `Plano ${plano}` : 'Usuário';

  // Log de diagnóstico para permissões (apenas em desenvolvimento)
  useEffect(() => {
    if (user) {
      console.log(`[Permissions] User: ${user.email} | Role: ${role}`);
    }
  }, [user, role]);

  // Auto-expandir os submenus se a aba correspondente estiver ativa
  useEffect(() => {
    if (['admin', 'sofia_config', 'overview', 'meta_templates', 'diagnostics'].includes(activeTab)) {
      setOpenMenus(prev => ({ ...prev, admin_menu: true }));
    }
    if (['lead_radar'].includes(activeTab)) {
      setOpenMenus(prev => ({ ...prev, prospeccao_menu: true }));
    }
    if (['inbox', 'kanban', 'contacts', 'clients', 'schedule'].includes(activeTab)) {
      setOpenMenus(prev => ({ ...prev, suporte_menu: true }));
    }
    if (['finance', 'reports'].includes(activeTab)) {
      setOpenMenus(prev => ({ ...prev, financeiro_menu: true }));
    }
    // 'agents' e 'quick_replies' saíram daqui: viraram seções de
    // Configurações, e a URL deles resolve para 'settings'.
    if (['leo', 'campaigns'].includes(activeTab)) {
      setOpenMenus(prev => ({ ...prev, ia_menu: true }));
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
          icon: <Shield size={18} />,
          label: 'Administração',
          subItems: [
            { id: 'admin', label: 'Painel Admin', icon: <Shield size={14} /> },
            { id: 'sofia_config', label: 'Configurações Sofia', icon: <Bot size={14} /> },
            { id: 'overview', label: 'Visão Geral', icon: <Activity size={14} /> },
            { id: 'meta_templates', label: 'Templates', icon: <FileText size={14} /> },
            { id: 'diagnostics', label: 'Diagnósticos', icon: <Rocket size={14} /> },
          ]
        }
      ]
    },
    {
      id: 'sec_dashboard',
      items: [
        {
          id: 'dashboard',
          icon: <LayoutDashboard size={18} />,
          label: 'Dashboard',
        }
      ]
    },
    {
      id: 'sec_prospeccao',
      items: [
        {
          id: 'prospeccao_menu',
          icon: <Search size={18} />,
          label: 'Prospecção Ativa',
          subItems: [
            { id: 'lead_radar', icon: <Search size={14} />, label: 'Radar de Leads' }
          ]
        }
      ]
    },
    {
      id: 'sec_suporte',
      items: [
        {
          id: 'suporte_menu',
          icon: <MessageSquare size={18} />,
          label: 'Suporte',
          subItems: [
            {
              id: 'inbox',
              icon: (
                <div className="relative">
                  <Inbox size={14} />
                  {unreadTotal > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white border-2 border-sidebar">
                      {unreadTotal > 99 ? '99+' : unreadTotal}
                    </span>
                  )}
                </div>
              ),
              label: 'Atendimento'
            },
            { id: 'kanban', icon: <Layers size={14} />, label: 'Kanban', minPlan: 'Pro' },
            { id: 'contacts', icon: <Users size={14} />, label: 'Leads' },
            { id: 'clients', icon: <Star size={14} />, label: 'Clientes' },
            // Agendamentos é operação do dia a dia, como o resto daqui — a
            // disponibilidade, que é o ajuste por trás dele, fica em
            // Configurações.
            { id: 'schedule', icon: <Calendar size={14} />, label: 'Agendamentos', flag: 'agendas', minPlan: 'Pro' },
          ]
        }
      ]
    },
    {
      id: 'sec_financeiro',
      items: [
        {
          id: 'financeiro_menu',
          icon: <Wallet size={18} />,
          label: 'Financeiro',
          subItems: [
            { id: 'finance', icon: <Wallet size={14} />, label: 'Meu Plano' },
            { id: 'reports', icon: <BarChart3 size={14} />, label: 'Relatórios', minPlan: 'Pro' },
          ]
        }
      ]
    },
    {
      id: 'sec_automacao',
      items: [
        {
          id: 'ia_menu',
          icon: <Bot size={18} />,
          label: 'Automação',
          subItems: [
            // Agentes de IA e Atalhos mudaram para Configurações → o menu
            // lateral ficou só com o que se USA no dia a dia; o que se
            // CONFIGURA uma vez mora junto em Configurações.
            {
              id: 'leo',
              icon: <Zap size={14} />,
              label: 'Leo',
              flag: 'leo_ai',
              minPlan: 'Starter'
            },
            { id: 'campaigns', icon: <Send size={14} />, label: 'Campanhas', flag: 'campaigns', minPlan: 'Elite' },
          ]
        }
      ]
    },
    {
      // Configurações é item de primeiro nível, sem submenu: depois que
      // Equipe, Agentes, Atalhos, Disponibilidade e Integrações mudaram para
      // dentro dela, a seção "Sistema" existia só para abrigar um item — um
      // clique a mais para chegar na tela que mais recebe ajuste.
      id: 'sec_configuracoes',
      items: [
        {
          id: 'settings',
          icon: <Settings size={18} />,
          label: 'Configurações',
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
          // Mesma regra do rail de Configurações (lib/acesso): duas cópias
          // divergiriam, e o sintoma seria um cliente vendo tela que o plano
          // dele não cobre — ou perdendo uma que cobre.
          clonedItem.subItems = clonedItem.subItems.filter(sub =>
            podeVer(sub, { role, plano, flags })
          );
        }
        return clonedItem;
      }).filter(item => {
        if (!podeVer(item, { role, plano, flags })) return false;

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
      // Com o menu recolhido não há onde mostrar o submenu: expande e abre.
      if (collapsed) {
        setCollapsed(false);
        setOpenMenus(prev => ({ ...prev, [id]: true }));
        return;
      }
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

  /** Lista de subitens (usada no menu desktop expandido e no mobile). */
  const renderSubItems = (subItems: NonNullable<MenuItem['subItems']>) => (
    <div className="ml-[22px] mt-1 mb-1.5 space-y-0.5 border-l border-white/10 pl-3">
      {subItems.map((sub) => (
        <button
          type="button"
          key={sub.id}
          onClick={() => handleTabClick(sub.id)}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors
            ${activeTab === sub.id
              ? 'bg-primary-600 text-white font-semibold'
              : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
            }`}
        >
          <span className="shrink-0 opacity-80">{sub.icon}</span>
          <span className="truncate">{sub.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-[100dvh] bg-app-bg font-sans text-slate-900 overflow-hidden">
      {/* Sidebar Desktop */}
      <motion.aside 
        initial={false}
        animate={{ width: collapsed ? 64 : 248 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="hidden md:flex flex-col bg-sidebar relative z-30 shrink-0"
      >
        {/* Marca */}
        <div className={`h-16 flex items-center shrink-0 ${collapsed ? 'justify-center' : 'px-4 gap-2.5'}`}>
          <button
            type="button"
            onClick={() => handleTabClick('dashboard')}
            className="w-9 h-9 rounded-lg overflow-hidden ring-1 ring-white/10 shrink-0 bg-slate-800"
            aria-label="Ir para o Dashboard"
          >
            <img src="/sofiamini.png" alt="Zyreo Sofia" className="w-full h-full object-cover" />
          </button>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="text-[14px] font-bold text-white tracking-tight truncate">Zyreo Sofia</p>
              <p className="text-[11px] text-slate-500 truncate">Atendimento com IA</p>
            </div>
          )}
        </div>

        <nav className={`flex-1 px-3 pt-2 space-y-1 ${collapsed ? 'overflow-visible' : 'overflow-y-auto no-scrollbar'}`}>
          {filteredSections.map((section, idx) => (
            <div key={section.id} className="space-y-1">
              {idx > 0 && section.id === 'sec_configuracoes' && (
                <div className="h-px bg-white/[0.06] my-2" />
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
                  
                  <AnimatePresence initial={false}>
                    {item.subItems && !collapsed && openMenus[item.id] && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        {renderSubItems(item.subItems)}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          ))}
        </nav>

        {role === 'admin' && (
          <div className={`mt-auto ${collapsed ? 'px-0 py-3 flex justify-center' : 'px-3 py-3'}`}>
            <SystemHealthStatus compact={collapsed} />
          </div>
        )}

        <div className={`p-3 border-t border-white/[0.06] ${role === 'admin' ? '' : 'mt-auto'}`}>
          <button 
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className={`w-full h-9 flex items-center rounded-lg text-slate-500 hover:bg-sidebar-hover hover:text-white transition-colors ${collapsed ? 'justify-center' : 'gap-2 px-3'}`}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? (
              <ChevronRight size={16} />
            ) : (
              <>
                <ChevronLeft size={16} />
                <span className="text-[12px] font-medium">Recolher menu</span>
              </>
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
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-sidebar z-50 md:hidden flex flex-col shadow-2xl"
            >
              <div className="h-16 px-4 flex items-center justify-between border-b border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg overflow-hidden ring-1 ring-white/10">
                    <img src="/sofiamini.png" alt="Zyreo Sofia" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-[14px] font-bold text-white">Zyreo Sofia</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-lg text-slate-400 hover:bg-sidebar-hover hover:text-white"
                  aria-label="Fechar menu"
                >
                  <X size={18} />
                </button>
              </div>
              <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
                {filteredSections.map((section) => (
                  <div key={section.id} className="space-y-1">
                    {section.items.map((item) => (
                      <div key={item.id}>
                        <SidebarItem 
                          icon={item.icon} 
                          label={item.label} 
                          active={isTabActive(item.id, item.subItems)} 
                          collapsed={false}
                          onClick={() => {
                            if (item.subItems) {
                              setOpenMenus(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                            } else {
                              handleTabClick(item.id);
                            }
                          }}
                          hasSubmenu={!!item.subItems}
                          isSubmenuOpen={openMenus[item.id] || false}
                        />
                        {item.subItems && openMenus[item.id] && renderSubItems(item.subItems)}
                      </div>
                    ))}
                  </div>
                ))}
              </nav>

              <div className="p-4 border-t border-white/[0.06]">
                <p className="text-[11px] text-slate-500 font-medium text-center">Sofia System v1.0.5</p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200/80 flex items-center justify-between gap-4 px-4 md:px-6 fixed md:sticky top-0 left-0 right-0 z-30">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button 
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg"
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
            
            <div className="relative max-w-md w-full hidden sm:block">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input 
                ref={searchInputRef}
                id="global-search"
                type="text" 
                placeholder="Buscar conversas, leads, clientes..." 
                className="block w-full h-9 pl-9 pr-16 rounded-lg border border-slate-200 bg-slate-50/70 text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition"
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                Ctrl+K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {role === 'admin' && <HeaderHealthPill />}

            <NotificationBell user={user} onTabChange={onTabChange} />
            
            <div className="h-8 w-px bg-slate-200 hidden md:block" />
            
            <div className="relative" ref={headerProfileRef}>
              <button 
                type="button"
                id="header-profile-button"
                onClick={() => setIsHeaderProfileOpen(!isHeaderProfileOpen)}
                className="flex items-center gap-2.5 rounded-lg p-1 pr-2 hover:bg-slate-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center text-[12px] font-bold overflow-hidden shrink-0">
                  {user?.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    getInitials(displayName)
                  )}
                </div>
                <div className="hidden md:block text-left leading-tight max-w-[180px]">
                  <p className="text-[13px] font-semibold text-slate-900 truncate">{displayName}</p>
                  <p className="text-[11px] text-slate-500 truncate">{roleLabel}</p>
                </div>
                <ChevronDown size={14} className={`hidden md:block text-slate-400 transition-transform ${isHeaderProfileOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isHeaderProfileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200/80 overflow-hidden z-[100]"
                  >
                    <div className="p-4 border-b border-slate-100 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {getInitials(displayName)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {displayName}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {user?.email}
                        </p>
                      </div>
                    </div>
                    <div className="p-1.5">
                      <button 
                        type="button"
                        onClick={() => { onTabChange('settings', 'subscription'); setIsHeaderProfileOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Sparkles size={16} className="text-primary-600" />
                        Fazer upgrade
                      </button>
                      <div className="h-px bg-slate-100 my-1 mx-2" />
                      <button 
                        type="button"
                        onClick={() => { onTabChange('settings', 'account'); setIsHeaderProfileOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <UserIcon size={16} className="text-slate-400" />
                        Minha Conta
                      </button>
                      <button 
                        type="button"
                        onClick={() => { onTabChange('settings', 'subscription'); setIsHeaderProfileOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <CreditCard size={16} className="text-slate-400" />
                        Assinatura
                      </button>
                      <div className="h-px bg-slate-100 my-1 mx-2" />
                      <button 
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-red-600 hover:bg-red-50 transition-colors font-semibold"
                      >
                        <LogOut size={16} />
                        Sair do sistema
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
          className={`flex-1 flex flex-col min-h-0 overscroll-none px-3 sm:px-4 md:px-5 py-3 md:py-4 ${
            activeTab === 'inbox'
              ? 'overflow-hidden pt-16 md:pt-3 pb-20 md:pb-3'
              : 'overflow-y-auto pt-16 md:pt-3 pb-20 md:pb-5'
          }`}
          style={{ overscrollBehaviorY: 'none' }}
        >
          {activeTab === 'inbox' ? (
            <div className="w-full max-w-[1780px] mx-auto flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="shrink-0 mb-3">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Atendimento</h1>
                <p className="text-sm text-slate-500 mt-0.5">Gerencie suas conversas e atendimentos em tempo real.</p>
              </div>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {children}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[1780px] mx-auto">{children}</div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 items-center justify-around z-50 px-2
        ${(activeTab === 'inbox' && (searchParams.has('jid') || location.hash.includes('jid'))) ? 'hidden' : 'flex'}`}>
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

        {/* Integrações e Agentes agora vivem em Configurações. Os atalhos
            apontam direto para lá: passar pela URL antiga funcionaria pelo
            redirecionamento, mas o item nunca acenderia como ativo. */}
        <button
          onClick={() => onTabChange('settings', 'integrations')}
          className={`flex flex-col items-center gap-1 ${estaEmConfig('integrations') ? 'text-primary-600' : 'text-slate-400'}`}
        >
          <Layers size={22} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Integrações</span>
        </button>

        <button
          onClick={() => onTabChange('settings', 'agents')}
          className={`flex flex-col items-center gap-1 ${estaEmConfig('agents') ? 'text-primary' : 'text-slate-400'}`}
        >
          <div className="w-[22px] h-[22px] overflow-hidden rounded-md">
            <img
              src="/sofiamini.png"
              alt="Agentes"
              className={`w-full h-full object-cover ${estaEmConfig('agents') ? '' : 'grayscale opacity-60'}`}
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

/**
 * Lê a tabela sys_health e acompanha mudanças em tempo real.
 * Cada uso cria seu próprio canal para não haver conflito de nomes.
 */
const useSystemHealth = (channelPrefix: string) => {
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
      .channel(`${channelPrefix}_${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sys_health' }, () => {
        fetchHealth();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [channelPrefix]);

  return { isDegraded: health.some(h => h.status === 'error'), loading };
};

/** Selo de status no cabeçalho (ex.: "Sistema operacional"). */
const HeaderHealthPill = () => {
  const { isDegraded, loading } = useSystemHealth('header_health');
  if (loading) return null;

  return (
    <span
      className={`hidden lg:inline-flex items-center gap-2 h-8 px-3 rounded-full border text-[12px] font-medium
        ${isDegraded ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-700'}`}
    >
      <span className={`w-2 h-2 rounded-full ${isDegraded ? 'bg-amber-500' : 'bg-emerald-500'}`} />
      {isDegraded ? 'Instabilidade detectada' : 'Sistema operacional'}
    </span>
  );
};

const SystemHealthStatus = ({ compact = false }: { compact?: boolean }) => {
  const { isDegraded } = useSystemHealth('sidebar_health');

  const dot = (
    <span className="relative flex h-2 w-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isDegraded ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
      <span className={`relative inline-flex rounded-full h-2 w-2 ${isDegraded ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
    </span>
  );

  // Menu recolhido: só o ponto de status, com o texto no balão
  if (compact) {
    return (
      <div className="group relative flex h-8 w-8 items-center justify-center" aria-label="Status do sistema">
        {dot}
        <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity group-hover:opacity-100">
          {isDegraded ? 'Sistema com instabilidade' : 'Sistema operacional'}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-3 bg-white/[0.04] border border-white/[0.06]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.06em]">Status do Sistema</span>
        <div className="flex items-center gap-1.5">
          {dot}
          <span className={`text-[11px] font-semibold ${isDegraded ? 'text-amber-400' : 'text-emerald-400'}`}>
            {isDegraded ? 'Degradado' : 'Operacional'}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 leading-snug">
        {isDegraded 
          ? 'Alguns serviços estão com instabilidade. Verifique a Visão Geral.' 
          : 'IA, Redis e Supabase respondendo normalmente.'}
      </p>
    </div>
  );
};
