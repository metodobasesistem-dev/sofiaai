import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  console.log('--- CRIANDO USUÁRIO TEMPORÁRIO ---');
  const tempEmail = `temp_admin_${Date.now()}@test.com`;
  const tempPassword = 'TempPassword123!@#';
  
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true
  });
  
  if (authErr || !authData.user) {
    console.error('Erro ao criar usuário:', authErr?.message);
    return;
  }
  
  const userId = authData.user.id;
  
  try {
    console.log('--- DEFININDO ROLE COMO ADMIN ---');
    await new Promise(r => setTimeout(r, 1500));
    
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', userId);
      
    if (updateErr) {
      console.error('Erro ao definir role como admin:', updateErr.message);
      await cleanUp(userId);
      return;
    }
    
    console.log('Role definida como admin.');
    
    console.log('--- FAZENDO LOGIN ---');
    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
      email: tempEmail,
      password: tempPassword
    });
    
    if (loginErr || !loginData.session) {
      console.error('Erro no login:', loginErr?.message);
      await cleanUp(userId);
      return;
    }
    
    const token = loginData.session.access_token;
    
    console.log('--- CHAMANDO ENDPOINT DE CAMPANHAS DE PRODUÇÃO ---');
    try {
      const res = await axios.get('https://baseai.natandesouza.com.br/api/v2/radar/campaigns', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      console.log('Sucesso! Resposta da Produção:');
      console.log(JSON.stringify(res.data, null, 2));
    } catch (err) {
      if (err.response) {
        console.log(`Produção retornou erro (Status ${err.response.status}):`);
        console.log(JSON.stringify(err.response.data, null, 2));
      } else {
        console.error('Erro ao conectar na produção:', err.message);
      }
    }
    
  } finally {
    await cleanUp(userId);
  }
}

async function cleanUp(userId) {
  console.log('--- LIMPANDO REGISTROS TEMPORÁRIOS ---');
  await supabase.from('profiles').delete().eq('id', userId);
  await supabase.auth.admin.deleteUser(userId);
  console.log('Limpeza finalizada.');
}

run().then(() => process.exit());
