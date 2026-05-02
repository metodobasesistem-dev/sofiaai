import { supabase } from './supabaseClient.js';

/**
 * Checks if a specific feature flag is enabled in the database.
 * Returns true if enabled, false otherwise.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      console.error(`[FeatureFlags] Error checking flag ${key}:`, error.message);
      return false;
    }

    return !!data?.enabled;
  } catch (err) {
    console.error(`[FeatureFlags] Unexpected error checking flag ${key}:`, err);
    return false;
  }
}
