import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Seção retrátil do painel da conversa.
 *
 * O painel é alto e o atendente rola muito para chegar no que importa. Mas
 * esconder a informação atrás de um clique só compensa se o cabeçalho
 * RESPONDER a pergunta: por isso ele carrega o valor atual (`resumo`) e o que
 * mais chamar atenção (`extra`). Fechada, a seção continua dizendo em que pé
 * está; aberta, deixa mexer.
 *
 * O estado é lembrado por seção, no navegador: quem fecha "Contexto do
 * Ticket" não quer fechá-la de novo em cada conversa que abre.
 */
export default function SecaoRetratil({
  id,
  titulo,
  icon,
  resumo,
  extra,
  padraoAberta = false,
  children,
}: {
  /** Identifica a seção no localStorage. Mude e a preferência se perde. */
  id: string;
  titulo: string;
  icon?: React.ReactNode;
  /** O valor atual, mostrado quando fechada. */
  resumo?: React.ReactNode;
  /** Algo que precisa aparecer mesmo fechada — um selo de alerta. */
  extra?: React.ReactNode;
  padraoAberta?: boolean;
  children: React.ReactNode;
}) {
  const chave = `sofia_secao_${id}`;

  const [aberta, setAberta] = useState<boolean>(() => {
    try {
      const salvo = localStorage.getItem(chave);
      return salvo === null ? padraoAberta : salvo === '1';
    } catch {
      // Navegador com armazenamento bloqueado: a seção ainda funciona, só
      // não lembra da escolha.
      return padraoAberta;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(chave, aberta ? '1' : '0');
    } catch {}
  }, [chave, aberta]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setAberta(v => !v)}
        aria-expanded={aberta}
        className="w-full text-left group"
      >
        <div className="flex items-center gap-2">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2 group-hover:text-gray-600 transition-colors">
            {icon}
            {titulo}
          </h4>

          {extra}

          <span className="flex-1" />

          <ChevronDown
            size={15}
            className={`shrink-0 text-gray-300 group-hover:text-gray-500 transition-all ${aberta ? 'rotate-180' : ''}`}
          />
        </div>

        {/* Em linha própria, e não ao lado do título: o painel é estreito, e
            disputar a largura com o título entregava "Anúncio (..." — um
            resumo cortado não resume nada. Some ao abrir, porque aí o próprio
            conteúdo mostra o valor. */}
        {!aberta && resumo && (
          <p className="mt-1 text-[12px] font-bold text-slate-600 truncate">{resumo}</p>
        )}
      </button>

      {aberta && <div className="mt-4">{children}</div>}
    </div>
  );
}
