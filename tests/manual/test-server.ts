import express from 'express';
const app = express();
const PORT = 3000;

app.get('/api/test-top', (req, res) => {
  res.send('SIMPLE TOP OK');
});

app.get('/api/health-check', (req, res) => {
  res.json({ status: 'simple-ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  res.send('Simple Server is Running. Frontend not loaded yet.');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Simple Server running on http://localhost:${PORT}`);
});
