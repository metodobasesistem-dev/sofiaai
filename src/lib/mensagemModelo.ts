/**
 * Substituição das variáveis dos modelos de mensagem — FONTE ÚNICA.
 *
 * Hoje isso existia espalhado: notificationService e campaignRoutes faziam
 * cada um o seu `.replace('{nome}', valor)`. Com argumento string, o replace
 * troca SÓ A PRIMEIRA ocorrência — "Olá {nome}, até logo {nome}" saía pela
 * metade. Aqui a troca é global.
 *
 * O que ninguém implementava e todo mundo sente: quando o dado não existe, a
 * variável tem que sumir SEM DEIXAR PONTUAÇÃO SOLTA. Tirar `{nome}` de
 * "Olá {nome}, tudo bem?" não pode entregar "Olá , tudo bem?" ao paciente.
 */

/** As variáveis que um modelo pode usar, com o que explicar na tela. */
export const VARIAVEIS_DO_MODELO = [
  { chave: 'nome', descricao: 'Primeiro nome do paciente' },
  { chave: 'nome_completo', descricao: 'Nome completo, como está no cadastro' },
  { chave: 'data', descricao: 'Data do agendamento' },
  { chave: 'hora', descricao: 'Horário do agendamento' },
  { chave: 'profissional', descricao: 'Profissional que vai atender' },
] as const;

export type ChaveDeVariavel = (typeof VARIAVEIS_DO_MODELO)[number]['chave'];

/** Os valores conhecidos no momento do envio. Faltando, a variável some. */
export type ValoresDoModelo = Partial<Record<ChaveDeVariavel | string, string | null | undefined>>;

/** Qualquer `{identificador}` em minúsculas é tratado como variável. */
const TOKEN = /\{([a-z][a-z0-9_]*)\}/g;

/**
 * Limpa o que sobra quando uma variável sai do meio do texto.
 *
 * A ordem importa: primeiro junta os espaços duplicados que o buraco deixou,
 * depois cola a pontuação no que veio antes dela, e só então resolve a
 * pontuação que ficou repetida ou órfã no começo da linha.
 */
function tirarPontuacaoSolta(texto: string): string {
  return texto
    .split('\n')
    .map(linha =>
      linha
        // "Olá  , tudo bem" → "Olá , tudo bem"
        .replace(/[ \t]{2,}/g, ' ')
        // "Olá , tudo bem" → "Olá, tudo bem"
        .replace(/[ \t]+([,.;:!?])/g, '$1')
        // "Olá,, tudo" → "Olá, tudo"   |   "consulta às ." → "consulta às."
        .replace(/([,;:])\1+/g, '$1')
        .replace(/,(\s*\.)/g, '$1')
        // A linha começou com pontuação porque a variável abria a frase.
        .replace(/^[\s,;:.!?-]+/, '')
        .trimEnd()
    )
    .join('\n')
    // Três ou mais quebras viram duas: um parágrafo que sumiu não pode abrir
    // um buraco no meio da mensagem.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Troca as variáveis pelos valores. O que não tiver valor é removido, e o
 * texto em volta é costurado.
 */
export function renderizarModelo(modelo: string, valores: ValoresDoModelo = {}): string {
  if (!modelo) return '';

  let faltou = false;

  const comValores = modelo.replace(TOKEN, (_, chave: string) => {
    const valor = valores[chave];
    const texto = valor == null ? '' : String(valor).trim();
    if (!texto) {
      faltou = true;
      return '';
    }
    return texto;
  });

  // Sem buraco nenhum, o texto do usuário sai como ele escreveu — inclusive
  // o espaçamento que ele quis.
  return faltou ? tirarPontuacaoSolta(comValores) : comValores;
}

/** As variáveis usadas num modelo, para a tela avisar o que ele precisa. */
export function variaveisUsadas(modelo: string): string[] {
  const achadas = new Set<string>();
  for (const m of modelo.matchAll(TOKEN)) achadas.add(m[1]);
  return [...achadas];
}
