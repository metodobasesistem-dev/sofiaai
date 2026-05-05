const CACHE_VERSION = 'v1.0.2'; // Mude aqui para forçar atualização
const CACHE_NAME = 'wppai-' + CACHE_VERSION;
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];


// Instalação: Cacheia os recursos essenciais
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', CACHE_VERSION);
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching critical assets');
      return cache.addAll(ASSETS);
    }).catch(err => {
      console.error('[SW] Install failed:', err);
    })
  );
});

// Ativação: Limpa caches antigos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName.startsWith('wppai-')) {
            console.log('[SW] Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Now controlling all clients');
      return self.clients.claim();
    })
  );
});

// Estratégia Network First: Tenta internet primeiro, se falhar usa cache.
self.addEventListener('fetch', (event) => {
  // Apenas para requisições GET
  if (event.request.method !== 'GET') return;

  // Ignorar requisições de API e extensões do browser
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Se a rede funcionar, clona a resposta e salva no cache para recursos estáticos
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch((err) => {
        console.log('[SW] Fetch failed, trying cache for:', event.request.url);
        // Se a rede falhar (offline), tenta buscar no cache
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          
          // Se não estiver no cache e for uma navegação, retorna o index.html (SPA fallback)
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          
          throw err;
        });
      })
  );
});

