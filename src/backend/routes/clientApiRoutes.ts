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

const router = Router();
router.use(requireAuth as any);

/** Campos do contato que a ficha do cliente pode editar. */
const CONTACT_FIELDS = ['nome', 'telefone', 'email', 'instagram', 'website'] as const;

/** Campos da ficha comercial. */
const PROFILE_FIELDS = [
  'mensalidade', 'moeda', 'ciclo', 'cliente_desde',
  'status_contrato', 'observacoes', 'custom_fields',
] as const;

const pick = (source: any, fields: readonly string[]) =>
  Object.fromEntries(
    Object.entries(source || {}).filter(([k]) => fields.includes(k))
  );

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
    const clientes = (contatos || []).map(c => ({ ...c, profile: porContato.get(c.id) || null }));

    // Receita recorrente: só contrato ativo entra, e anual é diluído em 12
    // para que o número seja comparável mês a mês.
    const mrr = clientes.reduce((total, c) => {
      const p = c.profile;
      if (!p || p.status_contrato !== 'ativo' || !p.mensalidade) return total;
      const valor = Number(p.mensalidade) || 0;
      if (p.ciclo === 'anual') return total + valor / 12;
      if (p.ciclo === 'unico') return total; // pagamento único não é recorrente
      return total + valor;
    }, 0);

    const ativos = clientes.filter(c => c.profile?.status_contrato === 'ativo').length;

    res.json({
      success: true,
      data: clientes,
      summary: {
        total: clientes.length,
        ativos,
        mrr: Math.round(mrr * 100) / 100,
        ticket_medio: ativos > 0 ? Math.round((mrr / ativos) * 100) / 100 : 0,
      },
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
      .select('id, data, time, status, summary, professional_name, tipo_consulta')
      .eq('user_id', userId)
      .or(`contact_id.eq.${contactId}${telefone ? `,client_phone.ilike.%${telefone.slice(-8)}%` : ''}`)
      .order('data', { ascending: false })
      .limit(50);

    res.json({
      success: true,
      data: { ...contato, profile: profile || null, appointments: agendamentos || [] },
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
      const { error } = await supabase
        .from('client_profiles')
        .upsert(
          { contact_id: contactId, user_id: userId, ...dadosFicha, updated_at: new Date().toISOString() },
          { onConflict: 'contact_id' }
        );
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
