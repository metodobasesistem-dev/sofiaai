import axios from 'axios';

async function checkServer() {
  try {
    const res = await axios.get('http://localhost:3000/api/health-check');
    console.log('Servidor local respondendo em http://localhost:3000:');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Erro ao conectar ao servidor local na porta 3000:', err.message);
  }

  try {
    const res = await axios.get('http://localhost:3000/api/health/chat');
    console.log('\nChat Health Check:');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Erro ao conectar ao chat health check:', err.message);
  }
}

checkServer().then(() => process.exit());
