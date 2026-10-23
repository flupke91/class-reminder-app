/* Service Worker —— 让「可安装到桌面」这件事真的成立。
 *
 * 之前仓库里根本没有 sw.js，manifest.json 也没写 icons，所以 README 里说的
 * 「PWA 支持：可安装到桌面」实际上只是添加了一个网页快捷方式：Chrome 判定
 * 可安装的三个条件（manifest 带 192/512 图标、有注册的 SW、SW 有 fetch 处理）
 * 一个都没满足。
 *
 * 策略：
 *   - 导航请求（打开页面）走 network-first，保证发版后立刻拿到新 HTML；
 *     断网时回退到缓存的 shell。
 *   - 静态资源走 cache-first，二次打开不再走网络。
 *   - /api 与跨源请求一律不碰，课表数据必须实时。
 */

const CACHE = 'classbell-v1';

const PRECACHE = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './bg.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // 逐个 add：单个文件 404 不应该让整个 install 失败
        Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // 页面导航：优先网络，断网回退缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // 静态资源：先用缓存，同时后台更新（这样 xlsx 这类按需加载的库也能进来）
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((hit) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || network;
      })
    )
  );
});
