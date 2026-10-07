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
