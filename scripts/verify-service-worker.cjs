const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const listeners = new Map();
const pages = new Map();
let online = true;
const cache = {
  addAll: async () => {},
  put: async (request, response) => pages.set(typeof request === 'string' ? request : request.url, response)
};
const context = {
  URL,
  self: {
    location: { origin: 'https://school.test' },
    addEventListener: (type, listener) => listeners.set(type, listener)
  },
  caches: {
    open: async () => cache,
    keys: async () => [],
    match: async request => pages.get(typeof request === 'string' ? request : request.url)
  },
  Request: class {
    constructor(request) { this.url = request.url; }
  },
  Response: { error: () => ({ marker: 'error' }) },
  fetch: async request => {
    if (!online) throw new Error('offline');
    const marker = request.url.endsWith('/teacher-portal.html') ? 'portal' : 'app';
    return { ok: true, marker, clone() { return { ok: true, marker }; } };
  }
};

vm.runInNewContext(fs.readFileSync('service-worker.js', 'utf8'), context);

async function navigate(path) {
  const request = { url: `https://school.test${path}`, method: 'GET', mode: 'navigate' };
  let responsePromise;
  listeners.get('fetch')({ request, respondWith(promise) { responsePromise = promise; } });
  const result = await responsePromise;
  await new Promise(resolve => setTimeout(resolve, 0));
  return result;
}

(async () => {
  assert.equal((await navigate('/index.html')).marker, 'app');
  assert.equal((await navigate('/teacher-portal.html')).marker, 'portal');
  assert.equal(pages.get('https://school.test/index.html').marker, 'app');
  assert.equal(pages.get('https://school.test/teacher-portal.html').marker, 'portal');
  online = false;
  assert.equal((await navigate('/index.html')).marker, 'app');
  assert.equal((await navigate('/teacher-portal.html')).marker, 'portal');
  assert.equal((await navigate('/unknown.html')).marker, 'error');
  console.log('Service worker keeps app and teacher portal navigation caches separate');
})().catch(error => { console.error(error); process.exitCode = 1; });
