import { supabase } from '../lib/supabaseClient.js';
import crypto from 'node:crypto';
import { InstagramAccount, InstagramStatus } from '../../types/leo.js';

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET || 'wppai_leo_secret_default_2024'; // Fallback fix
const REDIRECT_URI = 'https://sofia.zyreo.com.br/api/leo/instagram/callback';

// Helper de criptografia
function encrypt(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(META_APP_SECRET, 'salt', 32), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(text: string): string {
  if (!text) return '';
  try {
    const data = Buffer.from(text, 'base64');
    const iv = data.subarray(0, 16);
    const tag = data.subarray(16, 32);
    const encrypted = data.subarray(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(META_APP_SECRET, 'salt', 32), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (err: any) {
    console.error('[LeoInstagramService] Erro crítico na descriptografia. Verifique se o META_APP_SECRET mudou:', err.message);
    throw new Error('Falha de segurança ao ler o token do Instagram. Tente reconectar sua conta.');
  }
}

export const leoInstagramService = {
  async generateAuthUrl(companyId: string): Promise<string> {
    const token = crypto.randomUUID();
    const state = Buffer.from(JSON.stringify({ token, company_id: companyId })).toString('base64');

    // Salvar state token no banco (usar upsert para garantir que o registro exista)
    await supabase
      .from('leo_config')
      .upsert({ 
        company_id: companyId,
        instagram_state_token: token 
      }, { onConflict: 'company_id' });

    const scopes = [
      'instagram_basic',
      'instagram_manage_comments',
      'instagram_manage_messages',
      'pages_show_list',
      'pages_read_engagement',
      'business_management'
    ].join(',');

    return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scopes}&state=${state}`;
  },

  async handleCallback(code: string, state: string): Promise<InstagramAccount> {
    const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    const { token, company_id: companyId } = decodedState;

    // Validar state token
    const { data: config } = await supabase
      .from('leo_config')
      .select('instagram_state_token')
      .eq('company_id', companyId)
      .single();

    if (!config) {
      console.error('[LeoInstagramService] No config found for company:', companyId);
      throw new Error('Configuração não encontrada para esta empresa');
    }

    if (config.instagram_state_token !== token) {
      console.error('[LeoInstagramService] State token mismatch. Expected:', config.instagram_state_token, 'Got:', token);
      throw new Error('Token de estado inválido ou expirado');
    }

    // 1. Trocar code por User Access Token
    const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`);
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message);

    const userAccessToken = tokenData.access_token;

    // 2. Buscar as Páginas do Facebook vinculadas e suas contas do Instagram
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=name,access_token,instagram_business_account{id,username,name,profile_picture_url}&access_token=${userAccessToken}`);
    const pagesData = await pagesRes.json();
    
    console.log('[LeoInstagramService] Resposta da busca de páginas:', JSON.stringify(pagesData));

    if (pagesData.error) {
      throw new Error(`Erro na Meta ao buscar páginas: ${pagesData.error.message}`);
    }

    if (!pagesData.data || pagesData.data.length === 0) {
      console.warn('[LeoInstagramService] Lista de páginas vazia para o usuário.');
      throw new Error('A Meta não retornou nenhuma página. Verifique se você concedeu as permissões de "Páginas" durante o login e se o seu App está no modo "Live".');
    }

    // Procurar a primeira página que tenha uma conta do Instagram Business vinculada
    const pageWithIg = pagesData.data.find((p: any) => p.instagram_business_account);
    
    if (!pageWithIg) {
      const hasPages = pagesData.data.length;
      console.warn(`[LeoInstagramService] Usuário tem ${hasPages} páginas, mas nenhuma com IG Business vinculado.`);
      throw new Error(`Encontramos ${hasPages} página(s), mas nenhuma delas tem uma "Conta do Instagram Business" vinculada corretamente. Verifique se a sua conta do Instagram é "Comercial" e não "Criador/Pessoal".`);
    }

    const igAccount = pageWithIg.instagram_business_account;
    const pageAccessToken = pageWithIg.access_token;
    const pageId = pageWithIg.id;
    const encryptedToken = encrypt(userAccessToken); // Salvamos o token do usuário que tem permissão geral

    // 3. Inscrever a Página no Webhook do App
    try {
      console.log(`[LeoInstagramService] Inscrevendo a página ${pageId} no webhook...`);
      const subRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscribed_fields: ['messages', 'comments', 'messaging_postbacks'],
          access_token: pageAccessToken
        })
      });
      const subData = await subRes.json();
      console.log(`[LeoInstagramService] Resposta da inscrição da página:`, subData);
      if (subData.error) {
        console.warn(`[LeoInstagramService] Falha ao inscrever página no webhook:`, subData.error);
      }
    } catch (err) {
      console.error(`[LeoInstagramService] Erro na requisição de inscrição da página:`, err);
    }

    // 4. Salvar no banco
    await supabase
      .from('leo_config')
      .update({
        instagram_access_token: encryptedToken,
        instagram_account_id: igAccount.id,
        instagram_username: igAccount.username,
        instagram_name: igAccount.name,
        instagram_picture_url: igAccount.profile_picture_url,
        instagram_token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 dias aprox
        instagram_state_token: null
      })
      .eq('company_id', companyId);

    return {
      id: igAccount.id,
      username: igAccount.username,
      name: igAccount.name,
      picture_url: igAccount.profile_picture_url
    };
  },

  async getStatus(companyId: string): Promise<InstagramStatus> {
    const { data: config } = await supabase
      .from('leo_config')
      .select(`
        instagram_username, 
        instagram_name, 
        instagram_picture_url, 
        instagram_token_expires_at, 
        instagram_access_token,
        instagram_account_id,
        insta_auto_follow_enabled,
        insta_auto_follow_msg,
        insta_auto_comment_enabled,
        insta_auto_comment_msg
      `)
      .eq('company_id', companyId)
      .single();

    if (!config || !config.instagram_access_token) {
      return { connected: false, account: null, expires_at: null };
    }

    // Buscar dados extras da conta via Graph API
    let followers = 0;
    let media = 0;
    try {
      const accessToken = decrypt(config.instagram_access_token);
      const res = await fetch(`https://graph.facebook.com/v19.0/${config.instagram_account_id}?fields=followers_count,media_count&access_token=${accessToken}`);
      const data = await res.json();
      followers = data.followers_count || 0;
      media = data.media_count || 0;
    } catch (err) {
      console.error('[LeoInstagramService] Error fetching extra account data:', err);
    }

    return {
      connected: true,
      account: {
        id: config.instagram_account_id,
        username: config.instagram_username,
        name: config.instagram_name,
        picture_url: config.instagram_picture_url,
        followers_count: followers,
        media_count: media
      },
      expires_at: config.instagram_token_expires_at,
      settings: {
        insta_auto_follow_enabled: config.insta_auto_follow_enabled,
        insta_auto_follow_msg: config.insta_auto_follow_msg,
        insta_auto_comment_enabled: config.insta_auto_comment_enabled,
        insta_auto_comment_msg: config.insta_auto_comment_msg
      }
    };
  },

  async disconnect(companyId: string): Promise<void> {
    await supabase
      .from('leo_config')
      .update({
        instagram_access_token: null,
        instagram_account_id: null,
        instagram_username: null,
        instagram_name: null,
        instagram_picture_url: null,
        instagram_token_expires_at: null,
        instagram_state_token: null
      })
      .eq('company_id', companyId);
  },

  async refreshToken(companyId: string): Promise<void> {
    const { data: config } = await supabase
      .from('leo_config')
      .select('instagram_access_token')
      .eq('company_id', companyId)
      .single();

    if (!config?.instagram_access_token) throw new Error('Not connected');

    const currentToken = decrypt(config.instagram_access_token);
    const refreshRes = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`);
    const refreshData = await refreshRes.json();

    const encryptedToken = encrypt(refreshData.access_token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 60);

    await supabase
      .from('leo_config')
      .update({
        instagram_access_token: encryptedToken,
        instagram_token_expires_at: expiresAt.toISOString()
      })
      .eq('company_id', companyId);
  },

  validateWebhookSignature(payload: string, signature: string): boolean {
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', META_APP_SECRET)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  },

  async processWebhookEvent(body: any): Promise<void> {
    console.log('[LeoWebhook] Evento bruto recebido:', JSON.stringify(body, null, 2));
    const entry = body.entry?.[0];
    if (!entry) {
      console.warn('[LeoWebhook] Payload sem "entry".');
      return;
    }

    const instagramAccountId = entry.id;
    console.log('[LeoWebhook] ID da conta no evento:', instagramAccountId);
    
    // Buscar qual empresa é dona desta conta do Instagram
    const { data: config, error: configError } = await supabase
      .from('leo_config')
      .select('company_id')
      .eq('instagram_account_id', instagramAccountId)
      .maybeSingle();

    if (configError) {
      console.error('[LeoWebhook] Erro ao buscar config:', configError);
    }

    if (!config) {
      console.warn('[LeoWebhook] Nenhuma empresa encontrada para o ID:', instagramAccountId);
      return;
    }

    const companyId = config.company_id;
    const changes = entry.changes?.[0];
    const messaging = entry.messaging?.[0];

    if (changes) {
      await this.handleComment(changes.value, companyId);
    } else if (messaging) {
      await this.handleDM(messaging, companyId);
    }
  },

  async handleComment(value: any, companyId: string) {
    console.log(`[LeoWebhook] Processando comentário de @${value.from?.username}: "${value.text}"`);
    if (!value.from || !value.text) return;
    const instagramUid = value.from.id;

    // 1. Obter ou Criar Lead (Manual para evitar falha de constraint)
    let { data: lead, error: leadError } = await supabase
      .from('leo_leads')
      .select('*')
      .eq('company_id', companyId)
      .eq('instagram_uid', instagramUid)
      .maybeSingle();

    if (leadError) {
      console.error('[LeoWebhook] Erro ao buscar lead:', leadError);
    }

    if (!lead) {
      console.log('[LeoWebhook] Criando novo lead para Instagram UID:', instagramUid);
      const { data: newLead, error: createError } = await supabase
        .from('leo_leads')
        .insert({
          company_id: companyId,
          instagram_uid: instagramUid,
          nome: value.from.username,
          plataforma: 'instagram'
        })
        .select()
        .single();
      
      if (createError) {
        console.error('[LeoWebhook] Erro ao criar lead:', createError);
        return;
      }
      lead = newLead;
    } else {
      // Atualizar nome se mudou
      if (lead.nome !== value.from.username) {
        await supabase.from('leo_leads').update({ nome: value.from.username }).eq('id', lead.id);
      }
    }

    if (!lead) {
      console.error('[LeoWebhook] Falha crítica: Lead não disponível após upsert manual.');
      return;
    }

    // 2. Registrar Interação
    await supabase.from('leo_instagram_interacoes').insert({
      lead_id: lead.id,
      tipo: 'comentario',
      conteudo: value.text,
      instagram_message_id: value.id
    });

    console.log(`[LeoWebhook] Comentário processado para lead: ${value.from.username}`);

    // 3. Automação por Palavra-Chave (Gatilhos)
    const { data: triggers } = await supabase
      .from('leo_insta_gatilhos')
      .select('*')
      .eq('company_id', companyId)
      .eq('ativo', true);

    const commentText = value.text.toLowerCase().trim();
    const matchedTrigger = triggers?.find(t => commentText.includes(t.palavra_chave.toLowerCase().trim()));

    if (matchedTrigger) {
      console.log(`[LeoWebhook] Gatilho encontrado para "${matchedTrigger.palavra_chave}"`);
      
      // Ação 1: Enviar DM
      if (matchedTrigger.mensagem_dm) {
        try {
          await this.sendMessage(instagramUid, matchedTrigger.mensagem_dm, companyId);
          await supabase.from('leo_instagram_interacoes').insert({
            lead_id: lead.id,
            tipo: 'dm_enviada',
            conteudo: matchedTrigger.mensagem_dm
          });
        } catch (err) {
          console.error('[LeoWebhook] Erro ao enviar DM do gatilho:', err);
        }
      }

      // Ação 2: Responder Comentário Publicamente
      if (matchedTrigger.resposta_comentario) {
        try {
          await this.replyToComment(value.id, matchedTrigger.resposta_comentario, companyId);
        } catch (err) {
          console.error('[LeoWebhook] Erro ao responder comentário do gatilho:', err);
        }
      }

      return; // Se houve match de gatilho, encerra aqui (não executa a resposta padrão)
    }

    // 4. Automação de Resposta Padrão (Fallback)
    const { data: config } = await supabase
      .from('leo_config')
      .select('insta_auto_comment_enabled, insta_auto_comment_msg')
      .eq('company_id', companyId)
      .single();

    if (config?.insta_auto_comment_enabled && config.insta_auto_comment_msg) {
      try {
        await this.sendMessage(instagramUid, config.insta_auto_comment_msg, companyId);
        
        // Registrar DM enviada pela automação
        await supabase.from('leo_instagram_interacoes').insert({
          lead_id: lead.id,
          tipo: 'dm_enviada',
          conteudo: config.insta_auto_comment_msg
        });
      } catch (err) {
        console.error('[LeoWebhook] Erro ao enviar auto-resposta de comentário:', err);
      }
    }
  },

  async handleDM(messaging: any, companyId: string) {
    const instagramUid = messaging.sender.id;
    const text = messaging.message?.text;
    if (!text) return;

    // 1. Upsert Lead
    const { data: lead } = await supabase.from('leo_leads').upsert({
      company_id: companyId,
      instagram_uid: instagramUid,
      plataforma: 'instagram'
    }, { onConflict: 'company_id,instagram_uid' }).select().single();

    if (!lead) return;

    // 2. Registrar Interação
    await supabase.from('leo_instagram_interacoes').insert({
      lead_id: lead.id,
      tipo: 'dm_recebida',
      conteudo: text,
      instagram_message_id: messaging.message.mid
    });

    // 3. Chamar Qualificação (IA)
    try {
      const { leoQualificationService } = await import('./leoQualificationService.js');
      await leoQualificationService.qualifyLead(lead.id);
    } catch (err) {
      console.error('[LeoWebhook] Erro no fluxo de DM:', err);
    }
  },

  async sendMessage(recipientIgUid: string, text: string, companyId: string): Promise<void> {
    const { data: config } = await supabase
      .from('leo_config')
      .select('instagram_access_token, instagram_account_id')
      .eq('company_id', companyId)
      .single();

    if (!config?.instagram_access_token) return;

    const accessToken = decrypt(config.instagram_access_token);
    
    const res = await fetch(`https://graph.facebook.com/v19.0/${config.instagram_account_id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientIgUid },
        message: { text },
        access_token: accessToken
      })
    });

    const result = await res.json();
    if (result.error) throw new Error(result.error.message);
  },

  async replyToComment(commentId: string, text: string, companyId: string): Promise<void> {
    const { data: config } = await supabase
      .from('leo_config')
      .select('instagram_access_token')
      .eq('company_id', companyId)
      .single();

    if (!config?.instagram_access_token) return;
    const accessToken = decrypt(config.instagram_access_token);

    const res = await fetch(`https://graph.facebook.com/v19.0/${commentId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        access_token: accessToken
      })
    });

    const result = await res.json();
    if (result.error) throw new Error(result.error.message);
  },

  async getHistory(companyId: string) {
    const { data: leads } = await supabase
      .from('leo_leads')
      .select('id')
      .eq('company_id', companyId);
    
    if (!leads || leads.length === 0) return { comments: [], dms: [] };

    const leadIds = leads.map(l => l.id);

    const { data: interacoes } = await supabase
      .from('leo_instagram_interacoes')
      .select('*, lead:leo_leads(nome, instagram_uid)')
      .in('lead_id', leadIds)
      .order('created_at', { ascending: false })
      .limit(20);

    return {
      comments: interacoes?.filter(i => i.tipo === 'comentario') || [],
      dms: interacoes?.filter(i => i.tipo !== 'comentario') || []
    };
  },

  async updateSettings(companyId: string, settings: any) {
    await supabase
      .from('leo_config')
      .update(settings)
      .eq('company_id', companyId);
  },

  async getTriggers(companyId: string) {
    const { data } = await supabase
      .from('leo_insta_gatilhos')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    return data || [];
  },

  async getInsights(companyId: string) {
    const { data: config } = await supabase
      .from('leo_config')
      .select('instagram_access_token, instagram_account_id')
      .eq('company_id', companyId)
      .maybeSingle();

    if (!config?.instagram_access_token || !config?.instagram_account_id) {
      return { metrics: [], summary: {} };
    }

    const accessToken = decrypt(config.instagram_access_token);
    const igId = config.instagram_account_id;

    // 1. Métricas Internas (Últimos 7 dias)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Buscar leads da empresa
    const { data: leads } = await supabase.from('leo_leads').select('id').eq('company_id', companyId);
    const leadIds = leads?.map(l => l.id) || [];

    const { data: interacoes } = await supabase
      .from('leo_instagram_interacoes')
      .select('tipo, created_at')
      .in('lead_id', leadIds)
      .gte('created_at', sevenDaysAgo.toISOString());

    // 2. Métricas Externas (Meta Insights)
    let metaInsights: any[] = [];
    try {
      const res = await fetch(`https://graph.facebook.com/v19.0/${igId}/insights?metric=reach,impressions,profile_views,website_clicks,follower_count&period=day&access_token=${accessToken}`);
      const data = await res.json();
      metaInsights = data.data || [];
    } catch (err) {
      console.error('[LeoInstagramService] Meta Insights Error:', err);
    }

    // 3. Agregação por Dia
    const dailyStats: Record<string, any> = {};
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    days.forEach(day => {
      dailyStats[day] = {
        name: day,
        comentarios: 0,
        dms: 0,
        alcance: 0,
        visitas: 0,
        cliques: 0,
        seguidores: 0
      };
    });

    // Somar interações internas
    interacoes?.forEach(int => {
      const day = int.created_at.split('T')[0];
      if (dailyStats[day]) {
        if (int.tipo === 'comentario') dailyStats[day].comentarios++;
        else if (int.tipo === 'dm_enviada') dailyStats[day].dms++;
      }
    });

    // Mapear Meta Insights
    metaInsights.forEach(metric => {
      metric.values?.forEach((val: any) => {
        const day = val.end_time.split('T')[0];
        if (dailyStats[day]) {
          if (metric.name === 'reach') dailyStats[day].alcance = val.value;
          if (metric.name === 'profile_views') dailyStats[day].visitas = val.value;
          if (metric.name === 'website_clicks') dailyStats[day].cliques = val.value;
          if (metric.name === 'follower_count') dailyStats[day].seguidores = val.value;
        }
      });
    });

    return {
      metrics: Object.values(dailyStats),
      summary: {
        total_comentarios: interacoes?.filter(i => i.tipo === 'comentario').length || 0,
        total_dms: interacoes?.filter(i => i.tipo === 'dm_enviada').length || 0,
        total_cliques: Object.values(dailyStats).reduce((acc, curr) => acc + curr.cliques, 0),
        total_seguidores: Object.values(dailyStats).reduce((acc, curr) => acc + curr.seguidores, 0),
        today_reach: dailyStats[days[days.length - 1]]?.alcance || 0
      }
    };
  },

  async addTrigger(companyId: string, trigger: any) {
    const { data, error } = await supabase
      .from('leo_insta_gatilhos')
      .insert({ ...trigger, company_id: companyId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteTrigger(companyId: string, triggerId: string) {
    const { error } = await supabase
      .from('leo_insta_gatilhos')
      .delete()
      .eq('id', triggerId)
      .eq('company_id', companyId);
    if (error) throw error;
  }
};
