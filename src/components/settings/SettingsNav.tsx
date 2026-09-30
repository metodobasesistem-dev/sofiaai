import React from 'react';

/**
 * Rail de navegação das Configurações.
 *
 * Coluna vertical à esquerda, no lugar das abas horizontais. A troca foi feita
 * porque a lista vai crescer: abas horizontais só cabem quatro ou cinco antes
 * de virar rolagem lateral, que esconde opções sem avisar.
 */

export interface SecaoDeConfiguracao {
  id: string;
  label: string;
  /** Aparece no cabeçalho do painel de conteúdo. */
  descricao: string;
  icon: React.ReactNode;
}

export default function SettingsNav({
  secoes,
  ativa,
  onSelecionar,
}: {
  secoes: SecaoDeConfiguracao[];
  ativa: string;
  onSelecionar: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Seções de configuração"
      /* No celular vira uma tira rolável: empilhar 10 itens antes do conteúdo
         empurraria a tela inteira para baixo. */
      className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible no-scrollbar -mx-1 px-1 md:mx-0 md:px-0"
    >
      {secoes.map(secao => {
        const estaAtiva = ativa === secao.id;
        return (
          <button
            key={secao.id}
            onClick={() => onSelecionar(secao.id)}
            aria-current={estaAtiva ? 'page' : undefined}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap shrink-0 md:w-full text-left
              ${estaAtiva
                ? 'bg-primary-50 text-primary-700'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
          >
            <span className={estaAtiva ? 'text-primary-600' : 'text-gray-400'}>{secao.icon}</span>
            {secao.label}
          </button>
        );
      })}
    </nav>
  );
}
