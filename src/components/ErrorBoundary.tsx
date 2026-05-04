import React, { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = 'Ocorreu um erro inesperado.';
      let isFirestoreError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.operationType) {
            isFirestoreError = true;
            if (parsed.error.includes('Missing or insufficient permissions')) {
              errorMessage = `Erro de Permissão: Você não tem permissão para realizar esta operação (${parsed.operationType} em ${parsed.path}).`;
            } else {
              errorMessage = `Erro no Banco de Dados: ${parsed.error}`;
            }
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
          {/* Background Decorative Elements */}
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100/50 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-100/50 rounded-full blur-[120px]" />

          <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl shadow-blue-900/5 border border-white p-10 text-center relative z-10">
            <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-blue-500/20">
              <RotateCcw size={40} className="animate-spin" style={{ animationDuration: '3s' }} />
            </div>
            
            <h1 className="text-3xl font-black text-slate-900 mb-4 tracking-tighter">Otimizando sua experiência</h1>
            <p className="text-slate-500 text-sm leading-relaxed mb-10 font-medium">
              Estamos ajustando a conexão para garantir o melhor desempenho da sua plataforma. 
              Este processo é automático e leva apenas um segundo.
            </p>

            <button
              onClick={this.handleReset}
              className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-slate-900/10 flex items-center justify-center gap-3"
            >
              <RotateCcw size={18} />
              Recuperar Acesso Agora
            </button>

            <div className="mt-8 pt-8 border-t border-slate-100">
               <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest italic">WppAI Ecosystem v3.0</p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
