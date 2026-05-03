import { supabase } from '../lib/supabaseClient.js';

export const leoMetaService = {
  async fetchCampaigns(companyId: string) {
    console.log('[LeoMetaService] Fetching campaigns for:', companyId);
    // Integração com Meta Ads API
    return [];
  },

  async updateCampaignStats(campaignId: string) {
    // Atualizar métricas
  }
};
