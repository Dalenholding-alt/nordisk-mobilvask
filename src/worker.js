const COOKIE = 'nm_session';
const ITER = 210000;
const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

const reply = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SEC, ...extra },
});

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const sameOrigin = request => request.headers.get('origin') === new URL(request.url).origin;

function cookies(request) {
  const out = {};
  for (const part of String(request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: ITER }, key, 256);
  return randomTokenFromBytes(new Uint8Array(bits));
}

function randomTokenFromBytes(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function equal(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function readBody(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) throw new Error('TYPE');
  return JSON.parse(await request.text() || '{}');
}

async function sessionUser(request, env) {
  const token = cookies(request)[COOKIE];
  if (!token) return null;
  return env.DB.prepare(`SELECT u.id,u.name,u.email,u.role,u.franchisee_id,f.name franchisee_name
    FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN franchisees f ON f.id=u.franchisee_id
    WHERE s.id=? AND s.expires_at>CURRENT_TIMESTAMP AND u.active=1 LIMIT 1`).bind(token).first();
}

async function createSession(userId, env, remember = true) {
  const token = randomToken();
  const expiry = remember ? '+30 days' : '+12 hours';
  await env.DB.prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,datetime('now',?))").bind(token, userId, expiry).run();
  return token;
}

function userView(user) {
  return { id: Number(user.id), name: user.name, email: user.email, role: user.role, franchiseeId: user.franchisee_id ?? null, franchiseeName: user.franchisee_name || null };
}

async function api(request, env, url) {
  try {
    if (url.pathname === '/api/health') return reply({ ok: true, service: 'Nordisk Mobilvask' });
    if (url.pathname === '/api/auth/status') {
      const count = Number((await env.DB.prepare('SELECT COUNT(*) count FROM users').first())?.count || 0);
      const user = await sessionUser(request, env);
      return reply({ initialized: count > 0, authenticated: !!user, user: user ? userView(user) : null });
    }
    if (url.pathname === '/api/auth/setup' && request.method === 'POST') {
      if (!sameOrigin(request)) return reply({ error: 'Ugyldig forespørsel.' }, 403);
      const configured = String(env.SETUP_TOKEN || '').trim();
      if (!configured) return reply({ error: 'SETUP_TOKEN mangler i Cloudflare.' }, 503);
      const count = Number((await env.DB.prepare('SELECT COUNT(*) count FROM users').first())?.count || 0);
      if (count > 0) return reply({ error: 'Systemet er allerede satt opp.' }, 409);
      const body = await readBody(request);
      const name = String(body.name || '').trim() || 'Dalen Holding';
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      if (!equal(String(body.setupToken || '').trim(), configured)) return reply({ error: 'Ugyldig oppsettstoken.' }, 403);
      if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) return reply({ error: 'Kontroller navn, e-post og passord (minst 12 tegn).' }, 400);
      const salt = randomToken(18);
      const passwordHash = await hashPassword(password, salt);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users(name,email,role,password_hash,password_salt) VALUES(?,?,'admin',?,?)").bind(name, email, passwordHash, salt),
        env.DB.prepare("INSERT INTO company_settings(key,value) VALUES('company_name',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(body.company || 'Nordisk Mobilvask')),
      ]);
      const user = await env.DB.prepare('SELECT id,name,email,role,franchisee_id FROM users WHERE email=?').bind(email).first();
      const token = await createSession(user.id, env, true);
      return reply({ ok: true, user: userView(user) }, 201, { 'set-cookie': `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000` });
    }
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      if (!sameOrigin(request)) return reply({ error: 'Ugyldig forespørsel.' }, 403);
      const body = await readBody(request);
      const user = await env.DB.prepare('SELECT u.*,f.name franchisee_name FROM users u LEFT JOIN franchisees f ON f.id=u.franchisee_id WHERE u.email=? AND u.active=1 LIMIT 1').bind(normalizeEmail(body.email)).first();
      if (!user || !equal(await hashPassword(String(body.password || ''), user.password_salt), user.password_hash)) return reply({ error: 'Feil e-post eller passord.' }, 401);
      const token = await createSession(user.id, env, !!body.remember);
      const maxAge = body.remember ? '; Max-Age=2592000' : '';
      return reply({ ok: true, user: userView(user) }, 200, { 'set-cookie': `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict${maxAge}` });
    }
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      if (!sameOrigin(request)) return reply({ error: 'Ugyldig forespørsel.' }, 403);
      const token = cookies(request)[COOKIE];
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(token).run();
      return reply({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
    }
    if (url.pathname === '/api/auth/me') {
      const user = await sessionUser(request, env);
      return user ? reply({ user: userView(user) }) : reply({ error: 'Ikke innlogget.' }, 401);
    }
    return reply({ error: 'Ikke funnet.' }, 404);
  } catch (error) {
    console.error(error);
    return reply({ error: error.message === 'TYPE' ? 'Ugyldig innholdstype.' : 'En intern feil oppstod.' }, error.message === 'TYPE' ? 415 : 500);
  }
}

function secure(response, noStore = false) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SEC)) headers.set(key, value);
  if (noStore) headers.set('cache-control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env, url);
    if (url.pathname === '/portal') return Response.redirect(`${url.origin}/portal/`, 308);
    if (url.pathname === '/portal/login') return Response.redirect(`${url.origin}/portal/login/`, 308);
    if (url.pathname.startsWith('/portal/login/')) {
      if (await sessionUser(request, env)) return Response.redirect(`${url.origin}/portal/`, 302);
      return secure(await env.ASSETS.fetch(request), true);
    }
    if (url.pathname.startsWith('/portal/')) {
      if (!(await sessionUser(request, env))) return Response.redirect(`${url.origin}/portal/login/`, 302);
      return secure(await env.ASSETS.fetch(request), true);
    }
    return secure(await env.ASSETS.fetch(request));
  },
};
