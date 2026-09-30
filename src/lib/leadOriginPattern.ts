/**
 * Casamento da mensagem com as frases de origem cadastradas.
 *
 * Módulo puro de propósito: não toca banco nem rede. Fica em src/lib porque
 * é COMPARTILHADO — o backend usa para detectar, e a tela de configuração
 * usa para mostrar qual frase venceria numa mensagem de teste. Se a regra
 * vivesse só no backend, a tela teria uma segunda cópia para divergir.
 *
 * Não importe nada de backend aqui: este arquivo vai para o bundle do
 * navegador. A gravação fica em backend/services/leadOriginService.ts.
 */

/** Minúscula, sem acento, espaços colapsados. Aplicada aos dois lados. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escolhe qual padrão cadastrado casa a mensagem. O MAIS LONGO vence.
 *
 * Mais de um padrão pode casar a mesma mensagem — é comum a clínica ter uma
 * frase de site cadastrada como rede de segurança, contida também nas
 * mensagens de anúncio:
 *
 *   'anuncio: ig | social'   (20 chars)  →  Instagram
 *   'anuncio: googleads'     (18 chars)  →  Google
 *   'lead via site'          (13 chars)  →  Site      ← rede de segurança
 *
 * Ordenar por tamanho torna o resultado determinístico — a alternativa óbvia,
 * pegar o primeiro que a lista devolver, depende da ordem em que o Postgres
 * devolve as linhas, que sem ORDER BY é indefinida e pode mudar entre
 * execuções — e escolhe o padrão que carrega mais informação.
 *
 * Quem for mexer aqui: essa propriedade precisa continuar valendo.
 */
export function escolherPadrao<T extends { pattern: string }>(
  mensagem: string,
  padroes: T[]
): T | null {
  const alvo = normalizarTexto(mensagem);
  if (!alvo) return null;

  const casaram = padroes
    .map(p => ({ p, normalizado: normalizarTexto(p.pattern) }))
    .filter(({ normalizado }) => normalizado && alvo.includes(normalizado))
    .sort((a, b) => b.normalizado.length - a.normalizado.length);

  return casaram.length ? casaram[0].p : null;
}
