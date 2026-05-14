import { useState } from 'react';
import { Sparkles, FileText } from 'lucide-react';
import AdminTemplatesTab from './AdminTemplatesTab';
import TemplateBuilderModal from './TemplateBuilderModal';

/**
 * Standalone page for the "Templates" sidebar item (admin_group).
 * Shows the cross-tenant template overview table + "Criar Template" button.
 */
export default function MetaTemplatesAdminPage() {
  const [showBuilder, setShowBuilder] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex-shrink-0 px-8 pt-8 pb-6 flex items-center justify-between border-b border-slate-100 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-violet-50 flex items-center justify-center">
            <FileText size={18} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">Templates Meta</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Gerencie, monitore e crie templates WhatsApp de todos os tenants
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowBuilder(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 shadow-md shadow-violet-200"
        >
          <Sparkles size={14} />
          Criar Template
        </button>
      </div>

      {/* Table content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <AdminTemplatesTab key={refreshKey} />
      </div>

      {/* Builder modal */}
      <TemplateBuilderModal
        isOpen={showBuilder}
        onClose={() => setShowBuilder(false)}
        onSubmitted={() => {
          setShowBuilder(false);
          setRefreshKey(k => k + 1);
        }}
      />
    </div>
  );
}
