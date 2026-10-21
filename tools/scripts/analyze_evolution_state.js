import axios from 'axios';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const API_URL = process.env.EVOLUTION_API_URL;
const API_KEY = process.env.EVOLUTION_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'apikey': API_KEY
  }
});

async function runDiagnostics() {
  console.log("=== EVOLUTION API DIAGNOSTICS ===\n");
  try {
    // 1. Get all instances
    console.log("1. Fetching instances...");
    const { data: instances } = await api.get('/instance/fetchInstances');
    console.log(`Found ${instances.length} instances.`);
    
    if (instances.length === 0) {
      console.log("NO INSTANCES FOUND! The user needs to scan the QR code.");
      return;
    }

    console.log(JSON.stringify(instances));
    for (const inst of instances) {
      const name = inst.instance?.instanceName || inst.name || inst;
      console.log(`\n--- Instance: ${name} ---`);
      
      // 2. Check connection state
      const { data: stateData } = await api.get(`/instance/connectionState/${name}`);
      console.log(`State: ${stateData.instance.state}`);

      // 3. Check webhooks
      try {
        const { data: webhookData } = await api.get(`/webhook/find/${name}`);
        console.log(`Webhooks Configured:`, JSON.stringify(webhookData, null, 2));
      } catch (e) {
         console.log(`Webhooks Configured: NONE or Error (${e.message})`);
      }

      // 4. Check Supabase
      const { data: profile } = await supabase.from('profiles').select('id, email, whatsapp_status').eq('whatsapp_instance_id', name).maybeSingle();
      if (profile) {
        console.log(`Supabase Match: YES! UUID: ${profile.id}, Email: ${profile.email}, Status: ${profile.whatsapp_status}`);
      } else {
        console.log(`Supabase Match: NO PROFILE FOUND FOR THIS INSTANCE ID!`);
      }
    }
  } catch (error) {
    console.error("DIAGNOSTIC FAILED:", error.response?.data || error.message);
  }
}

runDiagnostics();
