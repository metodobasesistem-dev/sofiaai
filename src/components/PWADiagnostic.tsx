import React, { useState, useEffect } from 'react';
import { ShieldCheck, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function PWADiagnostic() {
  const [status, setStatus] = useState<{
    sw: 'registered' | 'not-registered' | 'checking';
    manifest: 'ok' | 'error' | 'checking';
    installable: 'yes' | 'no' | 'checking';
    details: string[];
  }>({
    sw: 'checking',
    manifest: 'checking',
    installable: 'checking',
    details: []
  });

  const checkStatus = async () => {
    const details: string[] = [];
    let swStatus: any = 'not-registered';
    let manifestStatus: any = 'error';
    let installableStatus: any = 'no';

    // Check SW
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        swStatus = 'registered';
        details.push(`Service Worker ativo: ${reg.active ? 'Sim' : 'Não'}`);
        details.push(`Scope: ${reg.scope}`);
      } else {
        details.push('Nenhum Service Worker registrado.');
      }
    } else {
      details.push('Navegador não suporta Service Worker.');
    }

    // Check Manifest
    try {
      const resp = await fetch('/manifest.json');
      if (resp.ok) {
        const json = await resp.json();
        manifestStatus = 'ok';
        details.push(`Manifest carregado: ${json.short_name || json.name}`);
        if (!json.icons || json.icons.length === 0) details.push('Erro: Manifest sem ícones.');
      } else {
        details.push(`Erro ao carregar manifest: ${resp.status}`);
      }
    } catch (e: any) {
      details.push(`Erro de fetch no manifest: ${e.message}`);
    }

    // Check Installable
    if ((window as any).deferredPrompt) {
      installableStatus = 'yes';
      details.push('Evento beforeinstallprompt detectado! O app deve ser instalável.');
    } else {
      details.push('Evento beforeinstallprompt NÃO detectado ainda.');
      if (window.matchMedia('(display-mode: standalone)').matches) {
        details.push('O app já parece estar rodando em modo standalone.');
      }
    }

    setStatus({ sw: swStatus, manifest: manifestStatus, installable: installableStatus, details });
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={20} className="text-teal-600" />
          Diagnóstico de Instalação (PWA)
        </h3>
        <button onClick={checkStatus} className="p-2 hover:bg-gray-100 rounded-full transition-all">
          <RefreshCw size={16} className="text-gray-500" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Service Worker</p>
          <div className="flex items-center gap-2">
            {status.sw === 'registered' ? <ShieldCheck size={16} className="text-green-500" /> : <XCircle size={16} className="text-red-500" />}
            <span className="text-sm font-semibold">{status.sw === 'registered' ? 'Registrado' : 'Não Encontrado'}</span>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Manifesto</p>
          <div className="flex items-center gap-2">
            {status.manifest === 'ok' ? <ShieldCheck size={16} className="text-green-500" /> : <XCircle size={16} className="text-red-500" />}
            <span className="text-sm font-semibold">{status.manifest === 'ok' ? 'Válido' : 'Erro'}</span>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Instalável</p>
          <div className="flex items-center gap-2">
            {status.installable === 'yes' ? <ShieldCheck size={16} className="text-green-500" /> : <AlertCircle size={16} className="text-amber-500" />}
            <span className="text-sm font-semibold">{status.installable === 'yes' ? 'Sim' : 'Aguardando...'}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-400 uppercase">Logs Detalhados:</p>
        <div className="bg-gray-900 rounded-lg p-3 font-mono text-[10px] text-teal-400 space-y-1 max-h-40 overflow-y-auto">
          {status.details.map((d, i) => (
            <div key={i}>{`> ${d}`}</div>
          ))}
        </div>
      </div>

      {status.installable === 'no' && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-[11px] text-amber-700">
          <strong>Dica:</strong> Se você estiver em um celular, tente fechar todas as abas e abrir o site novamente. 
          Certifique-se de que está usando HTTPS. No iPhone, use o Safari.
        </div>
      )}
    </div>
  );
}
