/**
 * Client API Routes — carteira de clientes DO INQUILINO.
 *
 * Não confundir com a gestão de inquilinos da plataforma (adminApiRoutes):
 * lá são as empresas que contratam o sistema; aqui são os clientes de cada
 * uma delas — quem chegou pelo WhatsApp ou foi cadastrado e foi promovido.
 *
 * "É cliente" mora em contacts.is_client, a mesma flag que o botão do Inbox
 * grava. A ficha comercial vive em client_profiles (1:1 com o contato).
 * Um contato é lead OU cliente, nunca os dois.
 */
import { Router, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { invalidateCache, cacheKey } from '../lib/redisCache.js';
import { normalizePhone } from '../lib/phoneHelper.js';
import { randomUUID } from 'crypto';
import { calcularLTV, resumoCarteira } from '../lib/carteira.js';

const router = Router();
router.use(requireAuth as any);

/** Campos do contato que a ficha do cliente pode editar. */
const CONTACT_FIELDS = ['nome', 'telefone', 'email', 'instagram', 'website'] as const;

/** Campos da ficha comercial. */
const PROFILE_FIELDS = [
  'mensalidade', 'moeda', 'ciclo', 'cliente_desde',
  'status_contrato', 'observacoes', 'custom_fields', 'encerrado_em',
] as const;

const pick = (source: any, fields: readonly string[]) =>
  Object.fromEntries(
    Object.entries(source || {}).filter(([k]) => fields.includes(k))
  );



// ─── POST /api/v2/clients ─────────────────────────────────────────────────
// Cadastro manual: cria o contato já como cliente, com a ficha.
//
// Se o telefone informado já existe na base, o contato existente é promovido
// e atualizado em vez de duplicado — senão o mesmo número passaria a ter dois
// registros e a conversa do WhatsApp ficaria ligada ao antigo.
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const nome = String(req.body?.nome || '').trim();

  if (!nome) {
    return res.status(400).json({ success: false, error: 'O nome é obrigatório.' });
  }

  try {
    const telefone = normalizePhone(String(req.body?.telefone || ''));
    const dadosContato = pick(req.body, CONTACT_FIELDS);
    const dadosFicha = pick(req.body, PROFILE_FIELDS);

    // 1. Já existe alguém com este telefone?
    let contactId: string | null = null;
    if (telefone) {
      const idPadrao = `${userId}_${telefone}`;
      const { data: exato } = await supabase
        .from('contacts')
        .select('id')
        .eq('id', idPadrao)
        .maybeSingle();

      if (exato) {
        contactId = exato.id;
      } else {
        // Base antiga pode ter o número gravado sem o 55 ou com o 9 a mais;
        // os últimos 8 dígitos são a parte estável do número no Brasil.
        const { data: parecido } = await supabase
          .from('contacts')
          .select('id')
          .eq('user_id', userId)
          .ilike('telefone', `%${telefone.slice(-8)}`)
          .limit(1);
        if (parecido?.length) contactId = parecido[0].id;
      }
    }

    // 2. Cria ou atualiza o contato
    if (contactId) {
      const { error } = await supabase
        .from('contacts')
        .update({ ...dadosContato, nome, is_client: true })
        .eq('id', contactId)
        .eq('user_id', userId);
      if (error) throw error;
    } else {
      // Sem telefone o contato não tem como casar com uma conversa: recebe um
      // id próprio, para não colidir com o padrão {userId}_{telefone}.
      contactId = telefone ? `${userId}_${telefone}` : `${userId}_manual_${randomUUID()}`;
      const { error } = await supabase.from('contacts').insert({
        ...dadosContato,
        id: contactId,
        user_id: userId,
        nome,
        telefone: telefone || '',
        status_funil: 'Lead',
        source: 'manual',
        is_client: true,
        data_criacao: new Date().toISOString(),
        primeiro_contato: new Date().toISOString(),
        ultima_interacao: new Date().toISOString(),
        total_mensagens: 0,
      });
      if (error) throw error;
    }

    // 3. Ficha comercial
    const { error: fichaErr } = await supabase
      .from('client_profiles')
      .upsert(
        { contact_id: contactId, user_id: userId, ...dadosFicha },
        { onConflict: 'contact_id' }
      );
    if (fichaErr) throw fichaErr;

    await invalidateCache(cacheKey.contacts(userId)).catch(() => {});
    res.json({ success: true, data: { id: contactId } });
  } catch (err: any) {
    console.error('[ClientAPI] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ─── GET /api/v2/clients ──────────────────────────────────────────────────
// Lista a carteira com a ficha embutida, mais o resumo de receita.
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const { data: contatos, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_client', true)
      .order('ultima_interacao', { ascending: false, nullsFirst: false });

    if (error) throw error;

    const ids = (contatos || []).map(c => c.id);
    let fichas: any[] = [];
    if (ids.length) {
      const { data, error: fErr } = await supabase
        .from('client_profiles')
        .select('*')
        .in('contact_id', ids);
      if (fErr) throw fErr;
      fichas = data || [];
    }

    const porContato = new Map(fichas.map(f => [f.contact_id, f]));
    const clientes = (contatos || []).map(c => {
      const profile = porContato.get(c.id) || null;
      return { ...c, profile, ...calcularLTV(profile) };
    });

    const metricas = resumoCarteira(clientes.map(c => c.profile));

    res.json({
      success: true,
      data: clientes,
      summary: { total: clientes.length, ...metricas },
    });
  } catch (err: any) {
    console.error('[ClientAPI] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v2/clients/:contactId ───────────────────────────────────────
// Ficha completa + histórico (agendamentos do contato).
router.get('/:contactId', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { contactId } = req.params;
  try {
    const { data: contato, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!contato) return res.status(404).json({ success: false, error: 'Contato não encontrado' });

    const { data: profile } = await supabase
      .from('client_profiles')
      .select('*')
      .eq('contact_id', contactId)
      .maybeSingle();

    // Histórico: agendamentos ligados pelo contato ou pelo telefone (registros
    // antigos gravavam só o telefone).
    const telefone = (contato.telefone || '').replace(/\D/g, '');
    const { data: agendamentos } = await supabase
      .from('appointments')
      .select('id, data, time, status, summary, professional_name, modalidade')
      .eq('user_id', userId)
      .or(`contact_id.eq.${contactId}${telefone ? `,client_phone.ilike.%${telefone.slice(-8)}%` : ''}`)
      .order('data', { ascending: false })
      .limit(50);

    res.json({
      success: true,
      data: {
        ...contato,
        profile: profile || null,
        appointments: agendamentos || [],
        ...calcularLTV(profile),
      },
    });
  } catch (err: any) {
    console.error('[ClientAPI] GET :id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/clients/:contactId/promote ──────────────────────────────
// Promove um lead a cliente e abre a ficha.
router.post('/:contactId/promote', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { contactId } = req.params;

  try {
    const { data: contato } = await supabase
      .from('contacts')
      .select('id, is_client')
      .eq('id', contactId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!contato) return res.status(404).json({ success: false, error: 'Contato não encontrado' });

    // A ficha vem primeiro: se o segundo passo falhar, sobra uma ficha sem
    // cliente (invisível na lista) em vez de um cliente sem ficha, que
    // apareceria na tela quebrado.
    const { data: fichaExistente } = await supabase
      .from('client_profiles')
      .select('id')
      .eq('contact_id', contactId)
      .maybeSingle();

    if (!fichaExistente) {
      const { error: insErr } = await supabase
        .from('client_profiles')
        .insert({ contact_id: contactId, user_id: userId, ...pick(req.body, PROFILE_FIELDS) });
      if (insErr) throw insErr;
    }

    const { error: upErr } = await supabase
      .from('contacts')
      .update({ is_client: true })
      .eq('id', contactId)
      .eq('user_id', userId);

    if (upErr) {
      // Compensação: desfaz a ficha que acabamos de criar
      if (!fichaExistente) {
        await supabase.from('client_profiles').delete().eq('contact_id', contactId);
      }
      throw upErr;
    }

    await invalidateCache(cacheKey.contacts(userId)).catch(() => {});
    res.json({ success: true });
  } catch (err: any) {
    console.error('[ClientAPI] promote error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/v2/clients/:contactId/demote ───────────────────────────────
// Devolve o cliente para a lista de leads. A ficha é preservada: se voltar a
// ser cliente, os dados comerciais continuam lá.
router.post('/:contactId/demote', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { contactId } = req.params;
  try {
    const { error } = await supabase
      .from('contacts')
      .update({ is_client: false })
      .eq('id', contactId)
      .eq('user_id', userId);

    if (error) throw error;

    await invalidateCache(cacheKey.contacts(userId)).catch(() => {});
    res.json({ success: true });
  } catch (err: any) {
    console.error('[ClientAPI] demote error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/v2/clients/:contactId ─────────────────────────────────────
// Salva a ficha: dados de contato em contacts, comercial em client_profiles.
router.patch('/:contactId', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const { contactId } = req.params;

  try {
    const dadosContato = pick(req.body, CONTACT_FIELDS);
    const dadosFicha = pick(req.body, PROFILE_FIELDS);

    if (Object.keys(dadosContato).length) {
      const { error } = await supabase
        .from('contacts')
        .update(dadosContato)
        .eq('id', contactId)
        .eq('user_id', userId);
      if (error) throw error;
    }

    if (Object.keys(dadosFicha).length) {
      // O LTV precisa saber quando o contrato acabou para parar de contar.
      // updated_at não serve: muda a cada edição da ficha.
      if ('status_contrato' in dadosFicha) {
        (dadosFicha as any).encerrado_em =
          dadosFicha.status_contrato === 'cancelado'
            ? new Date().toISOString().slice(0, 10)
            : null;
      }

      const gravar = (dados: Record<string, any>) =>
        supabase
          .from('client_profiles')
          .upsert(
            { contact_id: contactId, user_id: userId, ...dados, updated_at: new Date().toISOString() },
            { onConflict: 'contact_id' }
          );

      let { error } = await gravar(dadosFicha);

      // encerrado_em é um campo auxiliar do LTV, criado numa migration
      // posterior. Se ela ainda não foi aplicada, salvar a ficha — que é a
      // ação principal — não pode falhar por causa dele: grava o resto e
      // avisa. O carimbo volta a funcionar sozinho quando a coluna existir.
      const colunaAusente = error && (error.code === '42703' || error.code === 'PGRST204');
      if (colunaAusente && 'encerrado_em' in dadosFicha) {
        console.warn(
          '[ClientAPI] coluna encerrado_em ausente (migration 20260824120000 pendente) — ' +
          'ficha salva sem o carimbo de encerramento.'
        );
        const { encerrado_em, ...semCarimbo } = dadosFicha as any;
        ({ error } = await gravar(semCarimbo));
      }

      if (error) throw error;
    }

    await invalidateCache(cacheKey.contacts(userId)).catch(() => {});
    res.json({ success: true });
  } catch (err: any) {
    console.error('[ClientAPI] PATCH error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
