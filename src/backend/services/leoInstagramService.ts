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

    // Salvar state token no banco
    await supabase
      .from('leo_config')
      .update({ instagram_state_token: token })
      .eq('company_id', companyId);

    const scopes = [
      'instagram_business_basic',
      'instagram_manage_comments',
      'instagram_business_manage_messages'
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

    if (!config || config.instagram_state_token !== token) {
      throw new Error('Invalid state token');
    }

    // 1. Trocar code por short-lived token
    const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`);
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message);

    // 2. Trocar por long-lived token
    const longTokenRes = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${META_APP_SECRET}&access_token=${tokenData.access_token}`);
    const longTokenData = await longTokenRes.json();

    // 3. Buscar dados da conta
    const meRes = await fetch(`https://graph.instagram.com/me?fields=id,username,name,profile_picture_url&access_token=${longTokenData.access_token}`);
    const meData = await meRes.json();

    const encryptedToken = encrypt(longTokenData.access_token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 60);

    // 4. Salvar no banco
    await supabase
      .from('leo_config')
      .update({
        instagram_access_token: encryptedToken,
        instagram_account_id: meData.id,
        instagram_username: meData.username,
        instagram_name: meData.name,
        instagram_picture_url: meData.profile_picture_url,
        instagram_token_expires_at: expiresAt.toISOString(),
        instagram_state_token: null
      })
      .eq('company_id', companyId);

    return {
      id: meData.id,
      username: meData.username,
      name: meData.name,
      picture_url: meData.profile_picture_url
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
