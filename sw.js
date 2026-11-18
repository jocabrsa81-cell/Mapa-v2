
'use strict';

// Versão da aplicação: ao atualizar, o browser instala este service worker novo.
const SHELL = 'mapa-app-v2';
// Mantém os mapas e dados já guardados pelo utilizador entre atualizações.
const DADOS = 'mapa-dados';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(cache => cache.addAll(['./', './index.html', './manifest.json']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== SHELL && key !== DADOS)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Usa primeiro a cópia local. Se o armazenamento estiver cheio, não bloqueia
// o carregamento do recurso que acabou de chegar da Internet.
async function cacheFirst(request) {
  const cache = await caches.open(DADOS);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    try {
      await cache.put(request, response.clone());
    } catch (error) {
      // Falha de cache: devolve na mesma a resposta da rede.
    }
  }
  return response;
}

// Mostra imediatamente o recurso guardado e atualiza a cópia em segundo plano.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const update = fetch(request)
    .then(async response => {
      if (response.ok) {
        try {
          await cache.put(request, response.clone());
        } catch (error) {
          // A atualização da cache não deve invalidar uma resposta válida.
        }
      }
      return response;
    })
    .catch(() => null);

  return cached || (await update) || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Estilo do mapa: serve a última versão guardada e atualiza em segundo plano.
  if (url.hostname === 'tiles.openfreemap.org' && url.pathname.startsWith('/styles/')) {
    event.respondWith(staleWhileRevalidate(request, DADOS));
    return;
  }

  // Mosaicos do mapa e biblioteca MapLibre: cache-first para utilização offline.
  if (url.hostname === 'tiles.openfreemap.org' || url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Ficheiros da própria aplicação: cópia guardada com atualização em segundo plano.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, SHELL));
  }
});
