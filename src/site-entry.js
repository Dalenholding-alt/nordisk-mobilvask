import app from './email-enabled.js';
import { applyOfficialLogo, BRAND_VERSION } from './official-logo.js';

// Keep legacy links working without exposing the protected HTML assets.
// Authentication and email delivery remain in the existing application.
export const RELEASE = 'routing-email-2026-10-23-official-logo';
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
    const original = await app.fetch(normalized, env, ctx);
    const response = request.method === 'GET'
      ? applyOfficialLogo(original, normalized.url)
      : original;
    const headers = new Headers(response.headers);
    headers.set('x-nm-release', RELEASE);
    headers.set('x-nm-brand', BRAND_VERSION);
    if (response !== original) {
      headers.delete('content-length');
      headers.delete('etag');
    }
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
