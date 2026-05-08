import { supabase } from './src/backend/lib/supabaseClient';

async function checkUserProfile() {
  const userId = '8aa85cb2-0783-4aef-baed-aaf599f9b657';
  console.log(`Checking profile for user: ${userId}`);
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
    
  if (error) {
    console.error('Error fetching profile:', error);
  } else {
    console.log('Profile found:', data);
  }
}

checkUserProfile();
