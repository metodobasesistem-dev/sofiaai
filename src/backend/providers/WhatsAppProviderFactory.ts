import { IWhatsAppProvider } from './IWhatsAppProvider.js';
import { EvolutionProvider } from './EvolutionProvider.js';
import { UazApiProvider } from './UazApiProvider.js';
import { MetaProvider } from './MetaProvider.js';
import { supabase } from '../lib/supabaseClient.js';
import { isFeatureEnabled } from '../lib/featureFlags.js';

export class WhatsAppProviderFactory {
  /**
   * Returns a provider instance based on the agent configuration and feature flags.
   */
  static async getProvider(userId: string): Promise<IWhatsAppProvider> {
    // 1. Check if the abstraction feature flag is enabled
    const isAbstractionEnabled = await isFeatureEnabled('whatsapp_provider_abstraction');
    
    // If flag is OFF, always return EvolutionProvider (Legacy fallback)
    if (!isAbstractionEnabled) {
      return new EvolutionProvider();
    }
    
    try {
      // 2. Fetch the tenant's configured provider from profiles (inquilinos)
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('whatsapp_provider')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      
      // 3. Resolve provider hierarchy: Tenant -> Global -> Default
      let providerKey = profile?.whatsapp_provider;
      
      if (!providerKey) {
        const { data: globalSet } = await supabase.from('global_settings').select('whatsapp_provider').limit(1).maybeSingle();
        providerKey = globalSet?.whatsapp_provider || 'evolution';
      }

      console.log(`[WhatsAppProviderFactory] Resolved provider for ${userId}: ${providerKey}`);

      switch (providerKey) {
        case 'uazapi':
          return new UazApiProvider();
        case 'meta_official':
          return new MetaProvider(); 
        case 'evolution':
        default:
          return new EvolutionProvider();
      }
    } catch (err) {
      console.error('[WhatsAppProviderFactory] Error resolving provider, falling back to Evolution:', err);
      return new EvolutionProvider();
    }
  }
}
