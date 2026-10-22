import app from './worker.js';

// This entry point leaves existing booking storage and authentication unchanged.
export const EMAIL_VERSION = 'booking-email-2026-10-23';
export const EMAIL_TO = 'post@nordiskmobilvask.no';
export const EMAIL_FROM = 'booking@nordiskmobilvask.com';
const initialized = new WeakMap();
const jsonHeaders = { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: jsonHeaders });
const clean = (value, max = 2000) => String(value ?? '').replace(/\u0000/g, '').slice(0, max);
const oneLine = value => clean(value, 160).replace(/[\r\n]/g, ' ');
const escapeHtml = value => clean(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function ensureTable(env) {
  if (!initialized.has(env.DB)) {
    const setup = env.DB.prepare(`CREATE TABLE IF NOT EXISTS booking_email_notifications (
      booking_id INTEGER PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      message_id TEXT,
      error_code TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run().catch(error => { initialized.delete(env.DB); throw error; });
    initialized.set(env.DB, setup);
  }
  await initialized.get(env.DB);
}

export function buildBookingEmail(booking) {
  const mail = {
    from: EMAIL_FROM,
    to: EMAIL_TO,
    subject: `Ny foresp\u00f8rsel ${oneLine(booking.reference)} - ${oneLine(booking.service_name || 'Nordisk Mobilvask')}`,
    text: [
      'Ny kundeforesp\u00f8rsel fra nordiskmobilvask.com',
      '',
      `Referanse: ${clean(booking.reference)}`,
      `Tjeneste: ${clean(booking.service_name)}`,
      `Kunde: ${clean(booking.customer_name)}`,
      `Telefon: ${clean(booking.customer_phone)}`,
      `E-post: ${clean(booking.customer_email)}`,
      `Adresse: ${clean(booking.address)}`,
      `Postnummer og sted: ${clean(booking.postcode)} ${clean(booking.city)}`,
      `\u00d8nsket dato: ${clean(booking.preferred_date)}`,
      `\u00d8nsket tidspunkt: ${clean(booking.preferred_time) || 'Ikke oppgitt'}`,
      `Registreringsnummer: ${clean(booking.vehicle_reg_no)}`,
      `Bilmodell: ${clean(booking.vehicle_make_model)}`,
      `Avdeling: ${clean(booking.franchisee_name) || 'Hovedkontor'}`,
      '',
      'Kommentar fra kunden:',
      clean(booking.notes),
      '',
      'Dette er en foresp\u00f8rsel. Tidspunkt og pris m\u00e5 bekreftes med kunden.',
      'Se foresp\u00f8rselen i portalen: https://nordiskmobilvask.com/portal/#bookings',
    ].join('\n'),
  };
  const replyTo = clean(booking.customer_email, 254).trim();
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(replyTo)) mail.replyTo = replyTo;
  return mail;
}

function errorCode(error) {
  const code = String(error?.code || 'EMAIL_SEND_FAILED');
  return /^[A-Z0-9_]{1,80}$/.test(code) ? code : 'EMAIL_SEND_FAILED';
}

// Atomic claim avoids sending twice when a manual retry overlaps the first send.
// An interrupted/uncertain send stays 'sending' or 'unknown', never auto-retried.
export async function notifyBooking(env, reference) {
  await ensureTable(env);
  const booking = await env.DB.prepare(`SELECT b.*, s.name service_name, f.name franchisee_name
    FROM booking_requests b LEFT JOIN services s ON s.id=b.service_id
    LEFT JOIN franchisees f ON f.id=b.franchisee_id WHERE b.reference=? LIMIT 1`).bind(reference).first();
  if (!booking) return { state: 'not_found' };
  await env.DB.prepare('INSERT OR IGNORE INTO booking_email_notifications(booking_id) VALUES(?)').bind(booking.id).run();
  const previous = await env.DB.prepare('SELECT state FROM booking_email_notifications WHERE booking_id=?').bind(booking.id).first();
  if (['accepted', 'sending', 'unknown'].includes(previous?.state)) return { state: previous.state };
  if (!env.EMAIL || typeof env.EMAIL.send !== 'function') {
    await env.DB.prepare("UPDATE booking_email_notifications SET state='unconfigured',error_code='EMAIL_BINDING_MISSING',updated_at=CURRENT_TIMESTAMP WHERE booking_id=? AND state IN ('pending','failed','unconfigured')").bind(booking.id).run();
    return { state: 'unconfigured' };
  }
  const claimed = await env.DB.prepare("UPDATE booking_email_notifications SET state='sending',attempts=attempts+1,error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE booking_id=? AND state IN ('pending','failed','unconfigured')").bind(booking.id).run();
  if (Number(claimed.meta?.changes) !== 1) return { state: 'skipped' };
  let result;
  try {
    // No customer-controlled recipients, no third-party email API or paid queue.
    result = await env.EMAIL.send(buildBookingEmail(booking));
  } catch (error) {
    const code = errorCode(error);
    await env.DB.prepare("UPDATE booking_email_notifications SET state='failed',error_code=?,updated_at=CURRENT_TIMESTAMP WHERE booking_id=?").bind(code, booking.id).run();
    return { state: 'failed', code };
  }
  try {
    await env.DB.prepare("UPDATE booking_email_notifications SET state='accepted',message_id=?,error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE booking_id=?").bind(result?.messageId || null, booking.id).run();
  } catch {
    // Delivery acceptance and a database write cannot be one transaction.
    // Do not label this as a failed send, which could cause duplicate emails.
    console.error('NM_EMAIL_ACCEPTED_STATUS_WRITE_FAILED', booking.id);
    return { state: 'unknown' };
  }
  return { state: 'accepted', messageId: result?.messageId || null };
}

export function emailAdminPage(ready, rows) {
  const lines = rows.map(r => `<tr><td>${escapeHtml(r.reference)}</td><td>${escapeHtml(r.state || 'not_attempted')}</td><td>${escapeHtml(r.error_code || '')}</td><td>${['accepted','sending','unknown'].includes(r.state) ? '' : `<button data-ref="${escapeHtml(r.reference)}">Send varsel</button>`}</td></tr>`).join('');
  return `<!doctype html><html lang="no"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>E-postkontroll - Nordisk Mobilvask</title><style>body{font:16px system-ui;max-width:960px;margin:32px auto;padding:0 18px;color:#12283a}button{padding:12px;margin:8px;cursor:pointer}td,th{padding:12px;text-align:left;border-bottom:1px solid #ddd}table{width:100%;font-size:14px}pre{white-space:pre-wrap;background:#eff5f9;padding:16px}a{color:#126a87}</style><h1>E-post fra bestillingsskjemaet</h1><p>Avsender: <b>${EMAIL_FROM}</b><br>Mottaker: <b>${EMAIL_TO}</b></p><p>EMAIL-binding: <b>${ready ? 'Funnet' : 'Mangler'}</b>. Avsenderdomenet m\u00e5 ogs\u00e5 v\u00e6re verifisert i Cloudflare.</p><button id="test">Send test-e-post</button><a href="/portal/">Til portalen</a><pre id="result" role="status">Trykk p\u00e5 testknappen og kontroller innboksen og s\u00f8ppelpost. Accepted betyr godkjent av e-posttjenesten, ikke bekreftet levert til innboksen.</pre><h2>Siste 20 foresp\u00f8rsler</h2><p>Send varsel kan brukes p\u00e5 foresp\u00f8rsler som kom f\u00f8r aktiveringen. Ingen automatiske masseutsendinger. Ved sending/unknown: kontroller Cloudflares aktivitetslogg f\u00f8r du fors\u00f8ker p\u00e5 nytt.</p><div style="overflow:auto"><table><thead><tr><th>Referanse</th><th>Status</th><th>Feilkode</th><th>Handling</th></tr></thead><tbody>${lines || '<tr><td colspan="4">Ingen registrerte foresp\u00f8rsler.</td></tr>'}</tbody></table></div><p>Versjon: ${EMAIL_VERSION}</p><script>document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;b.disabled=true;const out=document.getElementById('result');out.textContent='Sender...';try{const r=await fetch('/api/admin/email/'+(b.id==='test'?'test':'retry'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference:b.dataset.ref||null})});const d=await r.json();out.textContent=d.message||d.error||JSON.stringify(d);if(d.state==='accepted'&&b.dataset.ref){b.parentElement.previousElementSibling.previousElementSibling.textContent='accepted';b.remove()}}catch{out.textContent='Kunne ikke kontakte serveren. Kontroller innboksen f\u00f8r du pr\u00f8ver igjen.'}finally{b.disabled=false}});</script></html>`;
}

async function handleAdmin(request, env) {
  const url = new URL(request.url);
  const authRequest = new Request(new URL('/api/auth/me', url), { headers: { cookie: request.headers.get('cookie') || '' } });
  const authResponse = await app.fetch(authRequest, env);
  if (!authResponse.ok) {
    if (request.method === 'GET') return Response.redirect(new URL('/portal/login/', url), 302);
    return json({ error: 'Logg inn som administrator.' }, 401);
  }
  const { user } = await authResponse.json();
  if (user?.role !== 'admin') return json({ error: 'Kun administrator har tilgang.' }, 403);
  const ready = !!env.EMAIL && typeof env.EMAIL.send === 'function';
  if (request.method === 'GET' && url.pathname === '/api/admin/email') {
    await ensureTable(env);
    const rows = await env.DB.prepare(`SELECT b.reference,n.state,n.error_code FROM booking_requests b
      LEFT JOIN booking_email_notifications n ON n.booking_id=b.id ORDER BY b.id DESC LIMIT 20`).all();
    return new Response(emailAdminPage(ready, rows.results || []), { headers: { 'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'" } });
  }
  if (request.method !== 'POST') return json({ error: 'Ikke funnet.' }, 404);
  if (request.headers.get('origin') !== url.origin) return json({ error: 'Ugyldig foresp\u00f8rsel.' }, 403);
  if (!ready) return json({ error: 'EMAIL-binding mangler. Legg til Send Email-binding med navnet EMAIL p\u00e5 Workeren.' }, 503);
  if (url.pathname === '/api/admin/email/test') {
    try {
      const result = await env.EMAIL.send({ from: EMAIL_FROM, to: EMAIL_TO, subject: 'TEST - Nordisk Mobilvask bestillingsvarsler', text: `Dette er en test fra Nordisk Mobilvask.\n\nMottaker: ${EMAIL_TO}\nTest startet av innlogget administrator.\nTid: ${new Date().toISOString()}\n\nDette er ikke en kundebestilling.` });
      return json({ state: 'accepted', messageId: result?.messageId || null, message: 'Testen er godkjent av e-posttjenesten. Kontroller innboksen og s\u00f8ppelpost hos post@nordiskmobilvask.no.' });
    } catch (error) {
      return json({ error: `Testen feilet (${errorCode(error)}). Kontroller avsenderdomene, mottaker og Email Service i Cloudflare.` }, 502);
    }
  }
  if (url.pathname === '/api/admin/email/retry') {
    if (!(request.headers.get('content-type') || '').includes('application/json')) return json({ error: 'JSON kreves.' }, 415);
    const text = await request.text();
    if (text.length > 1000) return json({ error: 'For stor foresp\u00f8rsel.' }, 413);
    let data; try { data = JSON.parse(text); } catch { return json({ error: 'Ugyldig JSON.' }, 400); }
    if (!/^NM-[A-Za-z0-9_-]{1,60}$/.test(data.reference || '')) return json({ error: 'Ugyldig referanse.' }, 400);
    const result = await notifyBooking(env, data.reference);
    return json({ ...result, message: result.state === 'accepted' ? 'Varslet er godkjent av e-posttjenesten.' : `Status: ${result.state}${result.code ? ' - '+result.code : ''}` }, result.state === 'failed' ? 502 : 200);
  }
  return json({ error: 'Ikke funnet.' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/email' || url.pathname.startsWith('/api/admin/email/')) {
      try { return await handleAdmin(request, env); }
      catch { return json({ error: 'E-postkontrollen kunne ikke lastes. Kontroller databasebindingen.' }, 500); }
    }
    const response = await app.fetch(request, env, ctx);
    if (url.pathname === '/api/public/booking' && request.method === 'POST' && response.status === 201) {
      // A notification failure must not turn a saved booking into a failed request.
      const work = response.clone().json().then(data => {
        if (data.ok && data.reference) return notifyBooking(env, data.reference);
      }).catch(() => console.error('NM_BOOKING_EMAIL_PENDING_REVIEW'));
      if (ctx?.waitUntil) ctx.waitUntil(work); else await work;
    }
    if (url.pathname === '/api/health') {
      const headers = new Headers(response.headers); headers.set('x-nm-email-version', EMAIL_VERSION);
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  },
};
