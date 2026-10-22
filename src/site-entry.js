import app from './email-enabled.js';

// Keep legacy links working without exposing the protected HTML assets.
// Authentication and email delivery remain in the existing application.
export const RELEASE = 'routing-email-2026-10-23-reconnected';
const aliases = new Map([
  ['/index-v2', '/'],
  ['/index-v2/', '/'],
  ['/index-v2.html', '/'],
  ['/portal/login-v2', '/portal/login/'],
  ['/portal/login-v2/', '/portal/login/'],
  ['/portal/login-v2.html', '/portal/login/'],
  ['/portal/v2', '/portal/'],
  ['/portal/v2/', '/portal/'],
  ['/portal/v2.html', '/portal/'],
]);

export function normalizeRequest(request) {
  const url = new URL(request.url);
  const canonical = aliases.get(url.pathname);
  if (!canonical || !['GET', 'HEAD'].includes(request.method)) return request;
  url.pathname = canonical;
  return new Request(url, request);
}

export default {
  async fetch(request, env, ctx) {
    const normalized = normalizeRequest(request);
    const response = await app.fetch(normalized, env, ctx);
    const headers = new Headers(response.headers);
    headers.set('x-nm-release', RELEASE);
    const pathname = new URL(normalized.url).pathname;
    if (pathname === '/' || pathname.startsWith('/portal') || pathname.startsWith('/api/')) {
      headers.set('cache-control', 'no-store');
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
