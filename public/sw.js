const CACHE_NAME = 'wppai-v' + Date.now(); // Gera um nome único para cada deploy
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Instalação: Força o novo Service Worker a assumir o controle imediatamente
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Ativação: Limpa TODOS os caches antigos para garantir que nada fique travado
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estratégia Network First: Tenta internet primeiro, se falhar usa cache.
// Isso garante que o usuário sempre veja a versão mais nova.
self.addEventListener('fetch', (event) => {
  // Apenas para requisições GET de documentos ou scripts do próprio site
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Se a rede funcionar, clona a resposta e salva no cache para emergências
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Se a rede falhar (offline), tenta buscar no cache
        return caches.match(event.request);
      })
  );
});
