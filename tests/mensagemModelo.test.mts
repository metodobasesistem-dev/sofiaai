/**
 * Testes do renderizador de modelos.
 *
 * O caso que motiva o módulo: a variável sem dado precisa sumir SEM deixar
 * pontuação solta. "Olá {nome}, tudo bem?" sem nome não pode chegar ao
 * paciente como "Olá , tudo bem?".
 *
 * Execute: npx tsx --test tests/mensagemModelo.test.mts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderizarModelo, variaveisUsadas } from '../src/lib/mensagemModelo.js';

describe('renderizarModelo — com os dados presentes', () => {
  it('troca a variável pelo valor', () => {
    assert.equal(
      renderizarModelo('Olá {nome}, sua consulta é {data} às {hora}.', {
        nome: 'Ana', data: '12/10', hora: '14h',
      }),
      'Olá Ana, sua consulta é 12/10 às 14h.'
    );
  });

  it('troca TODAS as ocorrências, não só a primeira', () => {
    // O defeito que existia espalhado: .replace('{nome}', v) com string troca
    // apenas a primeira.
    assert.equal(
      renderizarModelo('Olá {nome}, até logo {nome}!', { nome: 'Ana' }),
      'Olá Ana, até logo Ana!'
    );
  });

  it('preserva o espaçamento quando nada faltou', () => {
    const modelo = 'Olá {nome}!\n\nAté breve.\n';
    assert.equal(renderizarModelo(modelo, { nome: 'Ana' }), 'Olá Ana!\n\nAté breve.\n');
  });
});

describe('renderizarModelo — variável sem dado', () => {
  it('não deixa espaço antes da vírgula', () => {
    assert.equal(renderizarModelo('Olá {nome}, tudo bem?', {}), 'Olá, tudo bem?');
  });

  it('não deixa espaço antes do ponto', () => {
    assert.equal(renderizarModelo('Consulta confirmada {data}.', {}), 'Consulta confirmada.');
  });

  it('não começa a frase com pontuação', () => {
    assert.equal(renderizarModelo('{nome}, bom dia!', {}), 'bom dia!');
  });

  it('não repete pontuação quando a variável estava entre duas', () => {
    assert.equal(renderizarModelo('Olá {nome}, {data}, até breve.', {}), 'Olá, até breve.');
  });

  it('valor vazio ou só espaços conta como ausente', () => {
    assert.equal(renderizarModelo('Olá {nome}, tudo bem?', { nome: '   ' }), 'Olá, tudo bem?');
    assert.equal(renderizarModelo('Olá {nome}, tudo bem?', { nome: null }), 'Olá, tudo bem?');
  });

  it('remove variável que ninguém forneceu, em vez de mostrar as chaves', () => {
    // Um erro de digitação no modelo não pode chegar ao paciente como texto.
    assert.equal(renderizarModelo('Olá {nome}, ligue {telefonee}.', { nome: 'Ana' }), 'Olá Ana, ligue.');
  });

  it('não abre buraco de parágrafo quando a linha inteira some', () => {
    const r = renderizarModelo('Olá {nome}\n\n{profissional}\n\nAté breve.', { nome: 'Ana' });
    assert.ok(!r.includes('\n\n\n'), 'sobrou um vão de três quebras');
    assert.ok(r.includes('Olá Ana'));
    assert.ok(r.includes('Até breve.'));
  });

  it('o que falta sumindo não derruba o resto da mensagem', () => {
    assert.equal(
      renderizarModelo('Olá {nome}! Consulta {data} às {hora} com {profissional}.', { nome: 'Ana', hora: '14h' }),
      'Olá Ana! Consulta às 14h com.'
    );
  });
});

describe('lembrete de consulta — o caso real', () => {
  // Os valores que notificationService monta a partir do agendamento.
  const doAgendamento = (p: Partial<Record<string, string>> = {}) => ({
    nome: 'Ana',
    nome_completo: 'Ana Souza',
    data: '12/10',
    hora: '14h',
    profissional: 'Dra. Adriana',
    ...p,
  });

  const MODELO = 'Olá {nome}. Passando pra relembrar que você tem uma consulta com a {profissional}, agendada para hoje às {hora}.';

  it('monta a mensagem completa', () => {
    assert.equal(
      renderizarModelo(MODELO, doAgendamento()),
      'Olá Ana. Passando pra relembrar que você tem uma consulta com a Dra. Adriana, agendada para hoje às 14h.'
    );
  });

  it('agendamento sem profissional não deixa buraco na frase', () => {
    // appointments.professional_name é opcional — muita clínica não preenche.
    const r = renderizarModelo(MODELO, doAgendamento({ profissional: '' }));
    assert.ok(!r.includes('  '), 'sobrou espaço duplo');
    assert.ok(!r.includes(' ,'), 'sobrou espaço antes da vírgula');
    assert.ok(r.includes('às 14h.'));
  });

  it('um modelo só de variáveis vazias vira texto vazio', () => {
    // É o caso que faz o backend cair no texto padrão em vez de mandar vazio.
    assert.equal(renderizarModelo('{nome} {profissional}', { nome: '', profissional: '' }).trim(), '');
  });
});

describe('variaveisUsadas', () => {
  it('lista as chaves do modelo, sem repetir', () => {
    assert.deepEqual(
      variaveisUsadas('Olá {nome}, {nome}! Em {data}.').sort(),
      ['data', 'nome']
    );
  });

  it('modelo sem variável devolve lista vazia', () => {
    assert.deepEqual(variaveisUsadas('Bom dia!'), []);
  });
});
