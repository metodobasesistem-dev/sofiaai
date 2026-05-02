import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface FeatureFlags {
  [key: string]: boolean;
}

interface FeatureFlagContextType {
  flags: FeatureFlags;
  isLoading: boolean;
  refreshFlags: () => Promise<void>;
}

const FeatureFlagContext = createContext<FeatureFlagContextType | undefined>(undefined);

export const FeatureFlagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flags, setFlags] = useState<FeatureFlags>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchFlags = async () => {
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('key, enabled');

      if (error) throw error;

      const flagMap = (data || []).reduce((acc: FeatureFlags, curr) => {
        acc[curr.key] = curr.enabled;
        return acc;
      }, {});

      setFlags(flagMap);
    } catch (err) {
      console.error('[FeatureFlagContext] Error fetching flags:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();

    // Subscribe to changes in real-time for immediate updates in admin
    const channel = supabase
      .channel('public:feature_flags')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags' }, () => {
        fetchFlags();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <FeatureFlagContext.Provider value={{ flags, isLoading, refreshFlags: fetchFlags }}>
      {children}
    </FeatureFlagContext.Provider>
  );
};

export const useFeature = (key: string): boolean => {
  const context = useContext(FeatureFlagContext);
  if (context === undefined) {
    throw new Error('useFeature must be used within a FeatureFlagProvider');
  }
  // While loading, we default to false to be safe, but the app should handle the loading state globally
  return context.isLoading ? false : !!context.flags[key];
};

export const useFeatureContext = () => {
  const context = useContext(FeatureFlagContext);
  if (context === undefined) {
    throw new Error('useFeatureContext must be used within a FeatureFlagProvider');
  }
  return context;
};
