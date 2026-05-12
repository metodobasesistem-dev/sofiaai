import React, { useState } from 'react';
import LeoDashboard from './LeoDashboard';
import LeoLeads from './LeoLeads';
import LeoCampanhas from './LeoCampanhas';
import LeoInstagram from './LeoInstagram';
import LeoConfig from './LeoConfig';
import LeoPostagens from './LeoPostagens';

export default function LeoApp({ user, role, onTabChange }: any) {
  const [currentView, setCurrentView] = useState('dashboard');

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <LeoDashboard />;
      case 'leads': return <LeoLeads />;
      case 'campanhas': return <LeoCampanhas />;
      case 'instagram': return <LeoInstagram role={role} />;
      case 'postagens': return <LeoPostagens role={role} />;
      case 'configuracoes': return <LeoConfig role={role} />;
      default: return <LeoDashboard />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-6 mb-8 border-b border-gray-100 pb-4 overflow-x-auto">
        {['dashboard', 'leads', 'campanhas', 'instagram', 'postagens', 'configuracoes'].map((view) => (
          <button
            key={view}
            onClick={() => setCurrentView(view)}
            className={`text-sm font-bold capitalize transition-all whitespace-nowrap ${
              currentView === view 
                ? 'text-amber-600 border-b-2 border-amber-600 pb-4 -mb-4.5' 
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {view === 'configuracoes' ? 'Configurações' : view}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {renderView()}
      </div>
    </div>
  );
}
