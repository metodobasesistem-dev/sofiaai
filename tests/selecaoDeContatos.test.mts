/**
 * Testes da lógica da lista de contatos da campanha.
 *
 * São as regras que erram em silêncio: uma data de "nunca" que vira "hoje", um
 * tempo de envio que não bate com o servidor, um contato sem telefone que se
 * deixa marcar.
 *
 * Execute: npx tsx --test tests/selecaoDeContatos.test.mts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ATRASO_MIN_SEG,
  ATRASO_MAX_SEG,
  ATRASO_MEDIO_SEG,
  estimarDuracao,
  formatarHa,
  ehEnviavel,
  telefoneDaConversa,
  juntarComConversas,
  filtrarPorBusca,
  ordenar,
  paginar,
  FAIXAS,
  faixaDe,
  contarPorFaixa,
  filtrarPorFaixa,
  rotuloDaFaixa,
  diasDesde,
  intervaloEntre,
  primeirosEnviaveis,
  resumirEnvios,
  juntarComEnvios,
  recebeuRecentemente,
  ocultarRecentes,
  type IdDaFaixa,
  type LinhaDeContato,
  type ContatoDoBanco,
  type ConversaDoBanco,
} from '../src/lib/selecaoDeContatos.js';

/** Agora fixo, para as datas relativas não dependerem do dia em que roda. */
const AGORA = new Date('2026-10-07T15:00:00');

const linha = (p: Partial<LinhaDeContato> = {}): LinhaDeContato => ({
  id: 'u_5532988009060',
  nome: 'Ana Souza',
  telefone: '5532988009060',
  statusFunil: 'Lead',
  isClient: false,
  ultimaConversa: null,
  ultimaResposta: null,
  ultimoEnvio: null,
  campanhaDoEnvio: null,
  enviosTotal: 0,
  ...p,
});

describe('estimarDuracao — bate com o envio do servidor', () => {
  it('a faixa é a mesma que o servidor sorteia (60 a 180 s)', () => {
    assert.equal(ATRASO_MIN_SEG, 60);
    assert.equal(ATRASO_MAX_SEG, 180);
    assert.equal(ATRASO_MEDIO_SEG, 120);
  });

  it('a primeira mensagem sai sem espera: são n-1 intervalos', () => {
    assert.equal(estimarDuracao(1).segundos, 0);
    assert.equal(estimarDuracao(2).segundos, 120);
    assert.equal(estimarDuracao(0).segundos, 0);
  });

  it('142 contatos levam em torno de 4h 42min', () => {
    const d = estimarDuracao(142);
    assert.equal(d.segundos, 141 * 120);
    assert.equal(d.texto, '≈ 4h 42min');
  });

  it('mostra a faixa possível, já que o intervalo é sorteado', () => {
    assert.equal(estimarDuracao(142).faixa, 'entre 2h 21min e 7h 3min');
  });

  it('uma mensagem só não promete tempo nenhum', () => {
    assert.equal(estimarDuracao(1).texto, '≈ menos de 1 min');
  });

  it('hora cheia não ganha "0min"', () => {
    assert.equal(estimarDuracao(31).texto, '≈ 1h');
  });
});

describe('formatarHa', () => {
  it('sem data é "nunca" — conversa que não existe, não conversa antiga', () => {
    assert.equal(formatarHa(null, AGORA), 'nunca');
    assert.equal(formatarHa(undefined, AGORA), 'nunca');
    assert.equal(formatarHa('lixo', AGORA), 'nunca');
  });

  it('hoje e ontem', () => {
    assert.equal(formatarHa('2026-10-07T08:00:00', AGORA), 'hoje');
    assert.equal(formatarHa('2026-10-06T08:00:00', AGORA), 'ontem');
  });

  it('conta dias de calendário, não 24h corridas', () => {
    // Ontem às 23h50, lido hoje às 00:10: são 20 minutos, mas é "ontem".
    const agora = new Date('2026-10-07T00:10:00');
    assert.equal(formatarHa('2026-10-06T23:50:00', agora), 'ontem');
  });

  it('dias, meses e anos', () => {
    assert.equal(formatarHa('2026-10-04T10:00:00', AGORA), 'há 3 dias');
    assert.equal(formatarHa('2026-08-20T10:00:00', AGORA), 'há 1 mês');
    assert.equal(formatarHa('2026-06-01T10:00:00', AGORA), 'há 4 meses');
    assert.equal(formatarHa('2025-09-01T10:00:00', AGORA), 'há 1 ano');
    assert.equal(formatarHa('2024-01-01T10:00:00', AGORA), 'há 2 anos');
  });

  it('a virada de meses para anos não deixa buraco ("há 0 anos")', () => {
    const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
    // 360 a 364 dias: 12 "meses" de 30 dias, ainda sem completar 1 ano.
    for (const n of [359, 360, 362, 364]) {
      const texto = formatarHa(diasAtras(n), AGORA);
      assert.ok(!texto.includes('0 anos'), `${n} dias virou "${texto}"`);
      assert.equal(texto, 'há 11 meses', `${n} dias`);
    }
    assert.equal(formatarHa(diasAtras(365), AGORA), 'há 1 ano');
  });

  it('data no futuro (relógio desalinhado) vira "hoje", não "há -2 dias"', () => {
    assert.equal(formatarHa('2026-10-09T10:00:00', AGORA), 'hoje');
  });
});

describe('blocos por data', () => {
  const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
  const comConversa = (dias: number | null, p: Partial<LinhaDeContato> = {}) =>
    linha({ ultimaConversa: dias === null ? null : diasAtras(dias), ...p });

  it('os limites de cada bloco: 7/8, 30/31, 90/91 e 180/181', () => {
    const casos: [number, IdDaFaixa][] = [
      [0, 'ate_7'], [7, 'ate_7'],
      [8, 'de_8_a_30'], [30, 'de_8_a_30'],
      [31, 'de_31_a_90'], [90, 'de_31_a_90'],
      [91, 'de_91_a_180'], [180, 'de_91_a_180'],
      [181, 'mais_de_180'], [900, 'mais_de_180'],
    ];
    for (const [dias, esperado] of casos) {
      assert.equal(faixaDe(comConversa(dias), 'conversa', AGORA), esperado, `${dias} dias`);
    }
  });

  it('sem data é "nunca", e data no futuro é o bloco mais recente', () => {
    assert.equal(faixaDe(comConversa(null), 'conversa', AGORA), 'nunca');
    const futuro = linha({ ultimaConversa: new Date(AGORA.getTime() + 3 * 86400000).toISOString() });
    assert.equal(faixaDe(futuro, 'conversa', AGORA), 'ate_7');
  });

  it('os blocos NÃO deixam buraco: cada dia de 0 a 400 cai em exatamente um', () => {
    // É a propriedade que importa: um buraco esconderia contatos de todos os filtros.
    for (let dias = 0; dias <= 400; dias++) {
      const candidatas = FAIXAS.filter(f => f.min !== null && dias >= f.min && (f.max === null || dias <= f.max));
      assert.equal(candidatas.length, 1, `${dias} dias caiu em ${candidatas.length} faixas`);
    }
  });

  it('a soma dos blocos é sempre o total da base', () => {
    const base = [
      comConversa(0), comConversa(5), comConversa(20), comConversa(60),
      comConversa(120), comConversa(400), comConversa(null), comConversa(null),
    ];
    const contagem = contarPorFaixa(base, 'conversa', AGORA);
    const soma = Object.values(contagem).reduce((a, b) => a + b, 0);
    assert.equal(soma, base.length);
    assert.deepEqual(contagem, {
      ate_7: 2, de_8_a_30: 1, de_31_a_90: 1, de_91_a_180: 1, mais_de_180: 1, nunca: 2,
    });
  });

  it('a base muda o bloco: respondeu há 100 dias, mas conversou ontem', () => {
    // Quem recebeu uma campanha ontem tem conversa recente, mesmo sem ter respondido.
    const l = linha({ ultimaConversa: diasAtras(1), ultimaResposta: diasAtras(100) });
    assert.equal(faixaDe(l, 'conversa', AGORA), 'ate_7');
    assert.equal(faixaDe(l, 'resposta', AGORA), 'de_91_a_180');
  });

  it('quem conversou mas nunca respondeu cai em "nunca" só na base de resposta', () => {
    const l = linha({ ultimaConversa: diasAtras(10), ultimaResposta: null });
    assert.equal(faixaDe(l, 'conversa', AGORA), 'de_8_a_30');
    assert.equal(faixaDe(l, 'resposta', AGORA), 'nunca');
  });

  it('o rótulo de "nunca" acompanha a base', () => {
    assert.equal(rotuloDaFaixa('nunca', 'conversa'), 'Nunca conversou');
    assert.equal(rotuloDaFaixa('nunca', 'resposta'), 'Nunca respondeu');
  });

  it('filtrar por faixa devolve só o bloco; sem faixa devolve tudo', () => {
    const base = [comConversa(2, { id: 'a' }), comConversa(50, { id: 'b' }), comConversa(null, { id: 'c' })];
    assert.deepEqual(filtrarPorFaixa(base, 'de_31_a_90', 'conversa', AGORA).map(l => l.id), ['b']);
    assert.deepEqual(filtrarPorFaixa(base, 'nunca', 'conversa', AGORA).map(l => l.id), ['c']);
    assert.equal(filtrarPorFaixa(base, null, 'conversa', AGORA).length, 3);
  });

  it('conta dias de calendário, como o resto', () => {
    // 23h50 de ontem lido às 00h10 de hoje: é 1 dia, não 0.
    const agora = new Date('2026-10-07T00:10:00');
    assert.equal(diasDesde('2026-10-06T23:50:00', agora), 1);
    assert.equal(diasDesde(null, agora), null);
  });
});

describe('intervaloEntre (Shift + clique)', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('inclui os dois extremos', () => {
    assert.deepEqual(intervaloEntre(ids, 'b', 'd'), ['b', 'c', 'd']);
  });

  it('vale nos dois sentidos', () => {
    assert.deepEqual(intervaloEntre(ids, 'd', 'b'), ['b', 'c', 'd']);
  });

  it('o mesmo item nos dois cliques é só ele', () => {
    assert.deepEqual(intervaloEntre(ids, 'c', 'c'), ['c']);
  });

  it('se um dos dois saiu da lista (a busca mudou), não adivinha: devolve vazio', () => {
    assert.deepEqual(intervaloEntre(ids, 'b', 'zzz'), []);
    assert.deepEqual(intervaloEntre(ids, 'zzz', 'b'), []);
  });

  it('atravessa o que seriam várias páginas', () => {
    const muitos = Array.from({ length: 200 }, (_, i) => `id${i}`);
    assert.equal(intervaloEntre(muitos, 'id10', 'id150').length, 141);
  });
});

describe('primeirosEnviaveis', () => {
  const lista = [
    linha({ id: '1' }),
    linha({ id: '2', telefone: '988' }), // sem DDD: não conta
    linha({ id: '3' }),
    linha({ id: '4' }),
  ];

  it('pega os N primeiros, pulando quem não dá para enviar', () => {
    assert.deepEqual(primeirosEnviaveis(lista, 2).map(l => l.id), ['1', '3']);
  });

  it('N maior que a lista devolve o que há', () => {
    assert.equal(primeirosEnviaveis(lista, 99).length, 3);
  });

  it('N zero, negativo ou quebrado não pega ninguém nem quebra', () => {
    assert.equal(primeirosEnviaveis(lista, 0).length, 0);
    assert.equal(primeirosEnviaveis(lista, -5).length, 0);
    assert.equal(primeirosEnviaveis(lista, 2.9).length, 2);
  });
});

describe('ehEnviavel', () => {
  it('exige telefone com DDD', () => {
    assert.equal(ehEnviavel({ telefone: '5532988009060' }), true);
    assert.equal(ehEnviavel({ telefone: '32988009060' }), true);
    assert.equal(ehEnviavel({ telefone: '988009060' }), false);
    assert.equal(ehEnviavel({ telefone: '' }), false);
  });
});

describe('juntarComConversas', () => {
  const contato = (p: Partial<ContatoDoBanco> = {}): ContatoDoBanco => ({
    id: 'c1', nome: 'Ana', telefone: '5532988009060', status_funil: 'Lead', is_client: false, ...p,
  });
  const conversa = (p: Partial<ConversaDoBanco> = {}): ConversaDoBanco => ({
    id: 'user1_5532988009060',
    last_message_time: '2026-10-01T10:00:00Z',
    last_inbound_at: '2026-09-28T10:00:00Z',
    ...p,
  });

  it('extrai o telefone do id da conversa', () => {
    assert.equal(telefoneDaConversa('abc-123_5532988009060'), '5532988009060');
  });

  it('traz as duas datas da conversa do mesmo telefone', () => {
    const [l] = juntarComConversas([contato()], [conversa()]);
    assert.equal(l.ultimaConversa, '2026-10-01T10:00:00Z');
    assert.equal(l.ultimaResposta, '2026-09-28T10:00:00Z');
  });

  it('contato sem conversa fica sem data — não herda a data de criação', () => {
    const [l] = juntarComConversas([contato({ telefone: '5511999990000' })], [conversa()]);
    assert.equal(l.ultimaConversa, null);
    assert.equal(l.ultimaResposta, null);
  });

  it('casa pelo nono dígito: contato com 9, conversa sem (e vice-versa)', () => {
    // 5532 9 8800-9060  x  5532 8800-9060
    const [com9] = juntarComConversas(
      [contato({ telefone: '5532988009060' })],
      [conversa({ id: 'u_553288009060' })]
    );
    assert.equal(com9.ultimaConversa, '2026-10-01T10:00:00Z');

    const [sem9] = juntarComConversas(
      [contato({ telefone: '553288009060' })],
      [conversa({ id: 'u_5532988009060' })]
    );
    assert.equal(sem9.ultimaConversa, '2026-10-01T10:00:00Z');
  });

  it('o contato pode ter id UUID: a junção é pelo telefone, não pelo id', () => {
    const [l] = juntarComConversas(
      [contato({ id: '8f14e45f-ceea-467a-9575-1b3e4a1c4e3a' })],
      [conversa()]
    );
    assert.equal(l.ultimaConversa, '2026-10-01T10:00:00Z');
  });

  it('nome vazio cai no telefone, para a linha nunca ficar em branco', () => {
    const [l] = juntarComConversas([contato({ nome: '   ' })], []);
    assert.equal(l.nome, '5532988009060');
  });

  it('is_client e status_funil seguem para a linha', () => {
    const [l] = juntarComConversas([contato({ is_client: true, status_funil: 'Qualificado' })], []);
    assert.equal(l.isClient, true);
    assert.equal(l.statusFunil, 'Qualificado');
  });
});

describe('filtrarPorBusca', () => {
  const base = [
    linha({ id: '1', nome: 'Ana Souza', telefone: '5532988009060' }),
    linha({ id: '2', nome: 'João Pereira', telefone: '5511977776666' }),
    linha({ id: '3', nome: 'Anabela', telefone: '5521955554444' }),
  ];

  it('busca por nome sem acento nem caixa', () => {
    assert.deepEqual(filtrarPorBusca(base, 'joao').map(l => l.id), ['2']);
    assert.deepEqual(filtrarPorBusca(base, 'ANA').map(l => l.id), ['1', '3']);
  });

  it('busca por trecho do telefone', () => {
    assert.deepEqual(filtrarPorBusca(base, '7777').map(l => l.id), ['2']);
  });

  it('dois dígitos não casam todo mundo de um DDD', () => {
    assert.equal(filtrarPorBusca(base, '32').length, 0);
  });

  it('texto com letras e números é nome, não telefone', () => {
    // Regressão: "Dr 123" trazia todo paciente cujo telefone contém 123.
    const com123 = [
      linha({ id: 'a', nome: 'Dr 123 Silva', telefone: '5511900001111' }),
      linha({ id: 'b', nome: 'Outra Pessoa', telefone: '5511912345678' }),
    ];
    assert.deepEqual(filtrarPorBusca(com123, 'Dr 123').map(l => l.id), ['a']);
  });

  it('telefone digitado com máscara ainda acha o número', () => {
    // Os símbolos da máscara saem; sobram os dígitos 2195555 / 55219.
    assert.deepEqual(filtrarPorBusca(base, '(21) 95555').map(l => l.id), ['3']);
    assert.deepEqual(filtrarPorBusca(base, '+55 21 9').map(l => l.id), ['3']);
    assert.deepEqual(filtrarPorBusca(base, '95555').map(l => l.id), ['3']);
  });

  it('busca vazia devolve tudo', () => {
    assert.equal(filtrarPorBusca(base, '   ').length, 3);
  });
});

describe('ordenar', () => {
  const base = [
    linha({ id: 'recente', nome: 'B', ultimaConversa: '2026-10-05T10:00:00Z' }),
    linha({ id: 'nunca', nome: 'A', ultimaConversa: null }),
    linha({ id: 'antiga', nome: 'C', ultimaConversa: '2026-01-01T10:00:00Z' }),
  ];

  it('mais antigas primeiro', () => {
    assert.deepEqual(ordenar(base, 'conversa_antiga').map(l => l.id), ['antiga', 'recente', 'nunca']);
  });

  it('mais recentes primeiro', () => {
    assert.deepEqual(ordenar(base, 'conversa_recente').map(l => l.id), ['recente', 'antiga', 'nunca']);
  });

  it('quem nunca conversou vai para o fim nas DUAS direções', () => {
    // No topo de "mais antigas primeiro" ele esconderia as conversas antigas de verdade.
    assert.equal(ordenar(base, 'conversa_antiga').at(-1)!.id, 'nunca');
    assert.equal(ordenar(base, 'conversa_recente').at(-1)!.id, 'nunca');
  });

  it('por nome', () => {
    assert.deepEqual(ordenar(base, 'nome').map(l => l.nome), ['A', 'B', 'C']);
  });

  it('não altera a lista original', () => {
    const antes = base.map(l => l.id);
    ordenar(base, 'conversa_antiga');
    assert.deepEqual(base.map(l => l.id), antes);
  });
});

describe('paginar', () => {
  const lista = Array.from({ length: 120 }, (_, i) => i);

  it('fatia a página pedida', () => {
    const p = paginar(lista, 2, 50);
    assert.equal(p.itens.length, 50);
    assert.equal(p.itens[0], 50);
    assert.equal(p.totalPaginas, 3);
  });

  it('última página traz o resto', () => {
    assert.equal(paginar(lista, 3, 50).itens.length, 20);
  });

  it('busca que encolhe a lista não deixa a tela numa página inexistente', () => {
    const p = paginar([1, 2, 3], 7, 50);
    assert.equal(p.pagina, 1);
    assert.equal(p.itens.length, 3);
  });

  it('lista vazia tem uma página, vazia', () => {
    const p = paginar([], 1, 50);
    assert.equal(p.totalPaginas, 1);
    assert.deepEqual(p.itens, []);
  });
});

describe('histórico de envios de campanha', () => {
  const nomes = { c1: 'Black Friday', c2: 'Retorno' };

  it('resumirEnvios guarda o mais recente, a campanha dele e a contagem', () => {
    const r = resumirEnvios([
      { contact_id: 'a', campaign_id: 'c1', sent_at: '2026-09-01T10:00:00Z' },
      { contact_id: 'a', campaign_id: 'c2', sent_at: '2026-09-20T10:00:00Z' },
      { contact_id: 'b', campaign_id: 'c1', sent_at: '2026-09-02T10:00:00Z' },
    ], nomes);
    assert.deepEqual(r.a, { ultimoEnvio: '2026-09-20T10:00:00Z', campanha: 'Retorno', vezes: 2 });
    assert.equal(r.b.vezes, 1);
  });

  it('a ordem de chegada dos logs não decide qual é o último', () => {
    const r = resumirEnvios([
      { contact_id: 'a', campaign_id: 'c2', sent_at: '2026-09-20T10:00:00Z' },
      { contact_id: 'a', campaign_id: 'c1', sent_at: '2026-09-01T10:00:00Z' },
    ], nomes);
    assert.equal(r.a.campanha, 'Retorno');
  });

  it('descarta log sem contato ou com data inválida; campanha apagada vira "Campanha"', () => {
    const r = resumirEnvios([
      { contact_id: null, campaign_id: 'c1', sent_at: '2026-09-01T10:00:00Z' },
      { contact_id: 'a', campaign_id: 'c1', sent_at: 'lixo' },
      { contact_id: 'b', campaign_id: 'zzz', sent_at: '2026-09-01T10:00:00Z' },
    ], nomes);
    assert.equal(r.a, undefined);
    assert.equal(r.b.campanha, 'Campanha');
  });

  it('juntarComEnvios liga por id e, na falta, pelo telefone da chave de conversa', () => {
    const resumo = resumirEnvios([
      { contact_id: 'u_5532988009060', campaign_id: 'c1', sent_at: '2026-09-01T10:00:00Z' },
      { contact_id: 'u_5511999990000', campaign_id: 'c2', sent_at: '2026-09-05T10:00:00Z' },
    ], nomes);
    const [x, y, z] = juntarComEnvios([
      linha(),
      linha({ id: 'uuid-1', telefone: '5511999990000' }),
      linha({ id: 'uuid-2', telefone: '5521988887777' }),
    ], resumo);
    assert.equal(x.campanhaDoEnvio, 'Black Friday');
    assert.equal(y.campanhaDoEnvio, 'Retorno');
    assert.equal(z.ultimoEnvio, null);
    assert.equal(z.enviosTotal, 0);
  });

  it('id e telefone do mesmo contato somam em vez de um apagar o outro', () => {
    const resumo = resumirEnvios([
      { contact_id: 'uuid-1', campaign_id: 'c1', sent_at: '2026-09-01T10:00:00Z' },
      { contact_id: 'u_5511999990000', campaign_id: 'c2', sent_at: '2026-09-05T10:00:00Z' },
    ], nomes);
    const [r] = juntarComEnvios([linha({ id: 'uuid-1', telefone: '5511999990000' })], resumo);
    assert.equal(r.enviosTotal, 2);
    assert.equal(r.campanhaDoEnvio, 'Retorno');
  });

  it('recebeuRecentemente é inclusivo no limite e nunca marca quem não recebeu', () => {
    const dia = (n: number) => new Date(AGORA.getTime() - n * 86400000).toISOString();
    assert.equal(recebeuRecentemente({ ultimoEnvio: dia(7) }, 7, AGORA), true);
    assert.equal(recebeuRecentemente({ ultimoEnvio: dia(8) }, 7, AGORA), false);
    assert.equal(recebeuRecentemente({ ultimoEnvio: null }, 7, AGORA), false);
  });

  it('ocultarRecentes tira só quem recebeu dentro da janela', () => {
    const dia = (n: number) => new Date(AGORA.getTime() - n * 86400000).toISOString();
    const lista = [
      linha({ id: 'a', ultimoEnvio: dia(2) }),
      linha({ id: 'b', ultimoEnvio: dia(30) }),
      linha({ id: 'c' }),
    ];
    assert.deepEqual(ocultarRecentes(lista, 7, AGORA).map(l => l.id), ['b', 'c']);
  });
});
