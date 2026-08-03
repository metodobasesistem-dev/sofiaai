import axios from 'axios';

async function checkProduction() {
  try {
    const res = await axios.get('https://baseai.natandesouza.com.br/api/health-check');
    console.log('Servidor de produção respondendo:');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Erro ao conectar ao servidor de produção:', err.message);
  }
}

checkProduction().then(() => process.exit());
