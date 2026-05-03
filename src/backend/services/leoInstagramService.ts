import { supabase } from '../lib/supabaseClient.js';
import crypto from 'node:crypto';
import { InstagramAccount, InstagramStatus } from '../../types/leo.js';

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const REDIRECT_URI = 'https://baseai.natandesouza.com.br/api/leo/instagram/callback';

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
  const data = Buffer.from(text, 'base64');
  const iv = data.subarray(0, 16);
  const tag = data.subarray(16, 32);
  const encrypted = data.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(META_APP_SECRET, 'salt', 32), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
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
      'pages_read_engagement'
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
      throw new Error('A Meta não retornou nenhuma página vinculada a este login. Verifique se você é administrador da página.');
    }

    // Procurar a primeira página que tenha uma conta do Instagram Business vinculada
    const pageWithIg = pagesData.data.find((p: any) => p.instagram_business_account);
    if (!pageWithIg) {
      throw new Error('Nenhuma conta do Instagram Business vinculada às suas páginas do Facebook.');
    }

    const igAccount = pageWithIg.instagram_business_account;
    const encryptedToken = encrypt(userAccessToken); // Salvamos o token do usuário que tem permissão geral

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
      .select('instagram_username, instagram_name, instagram_picture_url, instagram_token_expires_at, instagram_access_token')
      .eq('company_id', companyId)
      .single();

    if (!config || !config.instagram_access_token) {
      return { connected: false, account: null, expires_at: null };
    }

    return {
      connected: true,
      account: {
        id: '', // Not stored/needed here
        username: config.instagram_username,
        name: config.instagram_name,
        picture_url: config.instagram_picture_url
      },
      expires_at: config.instagram_token_expires_at
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
    // Implementação básica de roteamento de eventos
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const messaging = entry?.messaging?.[0];

    if (changes) {
      // Comentário
      const value = changes.value;
      if (value.from && value.text) {
        await this.handleComment(value);
      }
    } else if (messaging) {
      // DM
      await this.handleDM(messaging);
    }
  },

  async handleComment(value: any) {
    const instagramUid = value.from.id;
    // ... Lógica de criação de lead e interação
  },

  async handleDM(messaging: any) {
    const instagramUid = messaging.sender.id;
    // ... Lógica de atualização de conversa e qualificação
  }
};
