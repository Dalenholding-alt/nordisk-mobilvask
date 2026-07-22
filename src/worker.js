const COOKIE = 'nm_session';
const ITERATIONS = 100000;
const LEGACY_ITERATIONS = 210000;
const HQ_EMAIL = 'post@nordiskmobilvask.no';
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://images.unsplash.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

const SETTINGS = {
  company_name: 'Nordisk Mobilvask', legal_name: 'Nordisk Mobilvask AS', org_no: '937942060',
  public_email: HQ_EMAIL, admin_email: HQ_EMAIL, invoice_email: HQ_EMAIL, phone: '94197662',
  address: 'Isakveien 70', postcode: '2004', city: 'Lillestrøm',
  opening_hours: 'Mandag–fredag 09–17. Helg etter avtale.', coverage: 'Akershus, Oslo og Østfold',
  payment_terms_days: '14', website_url: 'https://nordiskmobilvask.no',
};
const SERVICES = [
  ['Utvendig vask','utvendig-vask','Mobilvask',60,54400,'Skånsom utvendig håndvask levert der bilen står.'],
  ['Innvendig vask','innvendig-vask','Klargjøring',90,78400,'Støvsuging og rengjøring av kupé og bagasjerom.'],
  ['Innvendig og utvendig vask','komplett-vask','Klargjøring',150,134400,'Komplett vask og klargjøring innvendig og utvendig.'],
  ['Full rens','full-rens','Detailing',210,118400,'Grundig rens av tekstil, matter, seter og overflater.'],
  ['Polering med grundig vask','polering','Detailing',300,310400,'Lakkrens og polering for glans og beskyttelse.'],
  ['Keramisk coating','keramisk-coating','Detailing',480,630400,'Forarbeid og keramisk lakkbeskyttelse.'],
  ['Bedrift og anleggsbransje','bedrift-anlegg','Bedrift',180,0,'Tilpasset tilbud for bilparker, maskiner og nyttekjøretøy.'],
  ['Foliering og PPF','foliering-ppf','Foliering',480,0,'PPF, solfilm, chrome delete og firmaprofilering.'],
];
let seeded;

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...HEADERS, ...extra },
});
function secure(response, noStore = false) {
  const headers = new Headers(response.headers);
  Object.entries(HEADERS).forEach(([k,v]) => headers.set(k,v));
  if (noStore) headers.set('cache-control','no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
const clean = (value, max = 500) => String(value || '').trim().slice(0,max);
const email = value => clean(value,254).toLowerCase();
const phone = value => clean(value,40).replace(/[^0-9+]/g,'');
const asInt = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
const sqlDate = date => date.toISOString().slice(0,19).replace('T',' ');
function cookies(request) {
  const out = {}; for (const part of String(request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('='); if (i > 0) out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim());
  } return out;
}
function b64(bytes) { let s=''; for (const x of bytes) s += String.fromCharCode(x); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function token(size=32) { const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return b64(bytes); }
async function hash(password,salt,iterations=ITERATIONS) {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),{name:'PBKDF2'},false,['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations},key,256);
  return b64(new Uint8Array(bits));
}
function equal(a,b) { a=String(a); b=String(b); if(a.length!==b.length)return false; let x=0; for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i); return x===0; }
async function verify(password,user) { if(equal(await hash(password,user.password_salt),user.password_hash))return true; return equal(await hash(password,user.password_salt,LEGACY_ITERATIONS),user.password_hash); }
const sameOrigin = request => request.headers.get('origin') === new URL(request.url).origin;
async function body(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) throw new Error('TYPE');
  const text = await request.text(); if (text.length > 50000) throw new Error('SIZE'); return JSON.parse(text || '{}');
}
function publicUser(u) { return {id:Number(u.id),name:u.name,email:u.email,role:u.role,franchiseeId:u.franchisee_id==null?null:Number(u.franchisee_id),franchiseeName:u.franchisee_name||null}; }
function publicService(s) { const ex=Number(s.price_ex_vat||0),vat=Number(s.vat_rate||25); return {id:Number(s.id),name:s.name,slug:s.slug,category:s.category,durationMinutes:Number(s.duration_minutes||0),priceExVat:ex,vatRate:vat,priceInclVat:Math.round(ex*(1+vat/100)),description:s.description||''}; }

async function seed(env) {
  if (!seeded) seeded = (async()=>{
    await env.DB.batch(Object.entries(SETTINGS).map(([k,v])=>env.DB.prepare('INSERT OR IGNORE INTO company_settings(key,value) VALUES(?,?)').bind(k,v)));
    let hq = await env.DB.prepare("SELECT id FROM franchisees WHERE slug='hovedkontor' LIMIT 1").first();
    if (!hq) {
      await env.DB.prepare(`INSERT INTO franchisees(name,slug,org_no,contact_name,email,phone,region,address,postcode,city,daily_capacity,route_priority,active)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)`).bind('Nordisk Mobilvask Hovedkontor','hovedkontor',SETTINGS.org_no,'Niklas Skøyum Rugås',HQ_EMAIL,SETTINGS.phone,SETTINGS.coverage,SETTINGS.address,SETTINGS.postcode,SETTINGS.city,12,9999).run();
    }
    const count = Number((await env.DB.prepare('SELECT COUNT(*) count FROM services').first())?.count||0);
    if (!count) await env.DB.batch(SERVICES.map(s=>env.DB.prepare(`INSERT INTO services(name,slug,category,duration_minutes,price_ex_vat,vat_rate,description,public_bookable,active)
      VALUES(?,?,?,?,?,25,?,1,1)`).bind(...s)));
  })().catch(e=>{seeded=null;throw e});
  return seeded;
}
async function settings(env) { const rows=await env.DB.prepare('SELECT key,value FROM company_settings').all(); const out={...SETTINGS}; for(const r of rows.results||[])out[r.key]=r.value; return out; }
async function sessionUser(request,env) {
  const id=cookies(request)[COOKIE]; if(!id)return null;
  return env.DB.prepare(`SELECT u.id,u.name,u.email,u.role,u.franchisee_id,f.name franchisee_name FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN franchisees f ON f.id=u.franchisee_id
    WHERE s.id=? AND datetime(s.expires_at)>CURRENT_TIMESTAMP AND u.active=1 LIMIT 1`).bind(id).first();
}
async function createSession(userId,env,remember=false) { const id=token(); const d=new Date(Date.now()+(remember?30*86400000:12*3600000)); await env.DB.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(id,userId,sqlDate(d)).run(); return id; }
async function auth(request,env,roles=null) { const user=await sessionUser(request,env); if(!user)return{response:json({error:'Ikke innlogget.'},401)}; if(roles&&!roles.includes(user.role))return{response:json({error:'Ingen tilgang.'},403)}; return{user}; }
const scope = (user,alias='') => user.role==='admin' ? {sql:'',params:[]} : user.franchisee_id==null ? {sql:' AND 1=0',params:[]} : {sql:` AND ${alias?alias+'.':''}franchisee_id=?`,params:[Number(user.franchisee_id)]};
async function log(env,userId,type,id,action,details=null) { await env.DB.prepare('INSERT INTO activity_log(user_id,entity_type,entity_id,action,details) VALUES(?,?,?,?,?)').bind(userId||null,type,id||null,action,details).run(); }

async function setup(request,env) {
  if(!sameOrigin(request))return json({error:'Ugyldig forespørsel.'},403);
  const configured=clean(env.SETUP_TOKEN,500); if(!configured)return json({error:'SETUP_TOKEN mangler i Cloudflare.'},503);
  if(Number((await env.DB.prepare('SELECT COUNT(*) count FROM users').first())?.count||0))return json({error:'Systemet er allerede satt opp.'},409);
  const x=await body(request),name=clean(x.name,120)||'Dalen Holding',mail=email(x.email),pass=String(x.password||'');
  if(!equal(clean(x.setupToken,500),configured))return json({error:'Ugyldig oppsettstoken.'},403);
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)||pass.length<12)return json({error:'Kontroller navn, e-post og passord (minst 12 tegn).'},400);
  const salt=token(18),passwordHash=await hash(pass,salt);
  await env.DB.prepare("INSERT INTO users(name,email,role,password_hash,password_salt,active) VALUES(?,?,'admin',?,?,1)").bind(name,mail,passwordHash,salt).run();
  const user=await env.DB.prepare('SELECT id,name,email,role,franchisee_id FROM users WHERE email=?').bind(mail).first();
  const sid=await createSession(user.id,env,true); return json({ok:true,user:publicUser(user)},201,{'set-cookie':`${COOKIE}=${encodeURIComponent(sid)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`});
}
async function login(request,env) {
  if(!sameOrigin(request))return json({error:'Ugyldig forespørsel.'},403); const x=await body(request);
  const user=await env.DB.prepare('SELECT u.*,f.name franchisee_name FROM users u LEFT JOIN franchisees f ON f.id=u.franchisee_id WHERE u.email=? AND u.active=1 LIMIT 1').bind(email(x.email)).first();
  if(!user||!await verify(String(x.password||''),user))return json({error:'Feil e-post eller passord.'},401);
  const sid=await createSession(user.id,env,!!x.remember); return json({ok:true,user:publicUser(user)},200,{'set-cookie':`${COOKIE}=${encodeURIComponent(sid)}; Path=/; HttpOnly; Secure; SameSite=Strict${x.remember?'; Max-Age=2592000':''}`});
}
async function chooseBranch(env,postcode,date) {
  const pc=asInt(postcode,-1); const candidates=await env.DB.prepare(`SELECT DISTINCT f.*,sa.label,sa.exclusive,sa.priority FROM franchisees f JOIN service_areas sa ON sa.franchisee_id=f.id
    WHERE f.active=1 AND sa.active=1 AND ((sa.postcode_from IS NOT NULL AND ? BETWEEN sa.postcode_from AND sa.postcode_to) OR (sa.postcode_prefix IS NOT NULL AND ? LIKE sa.postcode_prefix||'%'))
    ORDER BY sa.exclusive DESC,sa.priority ASC,f.route_priority ASC`).bind(pc,String(postcode)).all();
  for(const f of candidates.results||[]) {
    const block=await env.DB.prepare('SELECT closed,capacity_override FROM availability_blocks WHERE franchisee_id=? AND work_date=?').bind(f.id,date).first();
    if(block?.closed)continue; const cap=block?.capacity_override==null?Number(f.daily_capacity||6):Number(block.capacity_override);
    const used=Number((await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM booking_requests WHERE franchisee_id=? AND preferred_date=? AND status NOT IN ('avvist','avlyst')) +
      (SELECT COUNT(*) FROM orders WHERE franchisee_id=? AND scheduled_date=? AND status<>'avlyst') used`).bind(f.id,date,f.id,date).first())?.used||0);
    if(used<cap)return{branch:f,reason:`Automatisk tildelt: ${f.label||'postnummerområde'} (${used}/${cap} booket)`};
  }
  const hq=await env.DB.prepare("SELECT * FROM franchisees WHERE slug='hovedkontor' LIMIT 1").first(); return{branch:hq,reason:candidates.results?.length?'Lokale avdelinger manglet kapasitet – sendt til hovedkontoret.':'Ingen registrert franchiseavdeling for postnummeret – sendt til hovedkontoret.'};
}
async function publicBooking(request,env) {
  if(!sameOrigin(request))return json({error:'Ugyldig forespørsel.'},403); const x=await body(request);
  const name=clean(x.name,120),tel=phone(x.phone),mail=email(x.email),address=clean(x.address,240),postcode=clean(x.postcode,4),city=clean(x.city,80),date=isoDate(x.preferredDate);
  if(name.length<2||tel.length<5||address.length<3||!/^\d{4}$/.test(postcode)||!date||!x.consent)return json({error:'Kontroller navn, telefon, adresse, postnummer, dato og samtykke.'},400);
  const service=await env.DB.prepare('SELECT * FROM services WHERE id=? AND active=1 AND public_bookable=1').bind(asInt(x.serviceId)).first(); if(!service)return json({error:'Velg en gyldig tjeneste.'},400);
  const assignment=await chooseBranch(env,postcode,date); if(!assignment.branch)return json({error:'Fant ingen mottakende avdeling.'},503);
  const ref=`NM-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${token(4).toUpperCase()}`;
  const result=await env.DB.prepare(`INSERT INTO booking_requests(reference,franchisee_id,service_id,customer_name,customer_email,customer_phone,address,postcode,city,vehicle_reg_no,vehicle_make_model,preferred_date,preferred_time,notes,consent,status,assignment_reason,source)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'tildelt',?,'nettside')`).bind(ref,assignment.branch.id,service.id,name,mail||null,tel,address,postcode,city||null,clean(x.regNo,20)||null,clean(x.vehicle,120)||null,date,clean(x.preferredTime,10)||null,clean(x.notes,1500)||null,assignment.reason).run();
  await log(env,null,'booking_request',result.meta?.last_row_id,'created',JSON.stringify({to:assignment.branch.email||HQ_EMAIL}));
  return json({ok:true,reference:ref,branch:assignment.branch.name,reason:assignment.reason},201);
}

async function dashboard(request,env) {
  const a=await auth(request,env); if(a.response)return a.response; const s=scope(a.user,'o'),b=scope(a.user,'b'); const today=new Date().toISOString().slice(0,10);
  const orders=Number((await env.DB.prepare(`SELECT COUNT(*) count FROM orders o WHERE o.scheduled_date=?${s.sql}`).bind(today,...s.params).first())?.count||0);
  const requests=Number((await env.DB.prepare(`SELECT COUNT(*) count FROM booking_requests b WHERE b.status IN ('ny','tildelt')${b.sql}`).bind(...b.params).first())?.count||0);
  const branches=a.user.role==='admin'?Number((await env.DB.prepare('SELECT COUNT(*) count FROM franchisees WHERE active=1').first())?.count||0):1;
  const invoice=Number((await env.DB.prepare(`SELECT COALESCE(SUM(i.total),0) total FROM invoices i JOIN orders o ON o.id=i.order_id WHERE i.status IN ('utkast','sendt')${s.sql}`).bind(...s.params).first())?.total||0);
  const upcoming=await env.DB.prepare(`SELECT o.id,o.order_no,o.title,o.status,o.scheduled_date,o.start_time,c.name customer_name,f.name franchisee_name FROM orders o JOIN customers c ON c.id=o.customer_id JOIN franchisees f ON f.id=o.franchisee_id WHERE o.scheduled_date>=?${s.sql} ORDER BY o.scheduled_date,o.start_time LIMIT 8`).bind(today,...s.params).all();
  return json({stats:{ordersToday:orders,newRequests:requests,branches,invoiceReady:invoice},upcoming:upcoming.results||[]});
}
async function listBookings(request,env) { const a=await auth(request,env); if(a.response)return a.response; const s=scope(a.user,'b'); const rows=await env.DB.prepare(`SELECT b.*,s.name service_name,f.name franchisee_name FROM booking_requests b LEFT JOIN services s ON s.id=b.service_id LEFT JOIN franchisees f ON f.id=b.franchisee_id WHERE 1=1${s.sql} ORDER BY b.created_at DESC LIMIT 200`).bind(...s.params).all(); return json({bookings:rows.results||[]}); }
async function updateBooking(request,env,id) { const a=await auth(request,env); if(a.response)return a.response; if(!sameOrigin(request))return json({error:'Ugyldig forespørsel.'},403); const x=await body(request),s=scope(a.user); const row=await env.DB.prepare(`SELECT * FROM booking_requests WHERE id=?${s.sql}`).bind(id,...s.params).first(); if(!row)return json({error:'Forespørselen finnes ikke.'},404); const status=clean(x.status,30); if(status&&!['ny','tildelt','bekreftet','avvist','omfordeles','konvertert','avlyst'].includes(status))return json({error:'Ugyldig status.'},400); let branch=row.franchisee_id; if(a.user.role==='admin'&&x.franchiseeId)branch=asInt(x.franchiseeId); await env.DB.prepare('UPDATE booking_requests SET status=?,franchisee_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status||row.status,branch,id).run(); await log(env,a.user.id,'booking_request',id,'updated'); return json({ok:true}); }
async function convertBooking(request,env,id) {
  const a=await auth(request,env); if(a.response)return a.response; if(!sameOrigin(request))return json({error:'Ugyldig forespørsel.'},403); const s=scope(a.user,'b'); const b=await env.DB.prepare(`SELECT b.*,s.name service_name,s.duration_minutes,s.price_ex_vat,s.vat_rate FROM booking_requests b LEFT JOIN services s ON s.id=b.service_id WHERE b.id=?${s.sql}`).bind(id,...s.params).first();
  if(!b)return json({error:'Forespørselen finnes ikke.'},404); if(b.status==='konvertert')return json({error:'Forespørselen er allerede konvertert.'},409);
  let customer=await env.DB.prepare('SELECT * FROM customers WHERE franchisee_id=? AND phone=? ORDER BY id DESC LIMIT 1').bind(b.franchisee_id,b.customer_phone).first();
  if(!customer){const r=await env.DB.prepare('INSERT INTO customers(franchisee_id,name,email,phone,billing_address,postcode,city) VALUES(?,?,?,?,?,?,?)').bind(b.franchisee_id,b.customer_name,b.customer_email,b.customer_phone,b.address,b.postcode,b.city).run(); customer={id:r.meta.last_row_id};}
  let vehicleId=null; if(b.vehicle_reg_no||b.vehicle_make_model){const r=await env.DB.prepare('INSERT INTO vehicles(customer_id,reg_no,make_model) VALUES(?,?,?)').bind(customer.id,b.vehicle_reg_no,b.vehicle_make_model).run(); vehicleId=r.meta.last_row_id;}
  const no=`ORD-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${token(3).toUpperCase()}`;
  const r=await env.DB.prepare(`INSERT INTO orders(order_no,source_request_id,franchisee_id,customer_id,vehicle_id,service_id,title,status,scheduled_date,start_time,duration_minutes,address,postcode,city,notes,price_ex_vat,vat_rate,created_by)
    VALUES(?,?,?,?,?,?,?,'bekreftet',?,?,?,?,?,?,?,?,?,?)`).bind(no,b.id,b.franchisee_id,customer.id,vehicleId,b.service_id,b.service_name||'Mobilvask',b.preferred_date,b.preferred_time||'09:00',b.duration_minutes||90,b.address,b.postcode,b.city,b.notes,b.price_ex_vat||0,b.vat_rate||25,a.user.id).run();
  await env.DB.prepare("UPDATE booking_requests SET status='konvertert',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run(); await log(env,a.user.id,'order',r.meta.last_row_id,'created_from_booking',String(id)); return json({ok:true,orderId:r.meta.last_row_id,orderNo:no},201);
}
async function listOrders(request,env) { const a=await auth(request,env); if(a.response)return a.response; const s=scope(a.user,'o'); const rows=await env.DB.prepare(`SELECT o.*,c.name customer_name,c.phone customer_phone,v.reg_no,v.make_model,s.name service_name,f.name franchisee_name FROM orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN vehicles v ON v.id=o.vehicle_id LEFT JOIN services s ON s.id=o.service_id JOIN franchisees f ON f.id=o.franchisee_id WHERE 1=1${s.sql} ORDER BY o.scheduled_date DESC,o.start_time DESC LIMIT 250`).bind(...s.params).all(); return json({orders:rows.results||[]}); }
async function updateOrder(request,env,id) { const a=await auth(request,env); if(a.response)return a.response; if(!sameOrigin(request))return json({error:'Ugyldig forespørsel.'},403); const x=await body(request),s=scope(a.user); const row=await env.DB.prepare(`SELECT * FROM orders WHERE id=?${s.sql}`).bind(id,...s.params).first(); if(!row)return json({error:'Ordren finnes ikke.'},404); const status=clean(x.status,30); if(status&&!['ny','bekreftet','pågår','ferdig','fakturaklar','fakturert','avlyst'].includes(status))return json({error:'Ugyldig status.'},400); await env.DB.prepare('UPDATE orders SET status=?,invoice_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status||row.status,status==='fakturaklar'?'klar':row.invoice_status,id).run(); await log(env,a.user.id,'order',id,'status_changed',status); return json({ok:true}); }
async function listCustomers(request,env) { const a=await auth(request,env); if(a.response)return a.response; const s=scope(a.user,'c'); const rows=await env.DB.prepare(`SELECT c.*,COUNT(DISTINCT o.id) order_count FROM customers c LEFT JOIN orders o ON o.customer_id=c.id WHERE 1=1${s.sql} GROUP BY c.id ORDER BY c.name LIMIT 250`).bind(...s.params).all(); return json({customers:rows.results||[]}); }
async function listBranches(request,env) { const a=await auth(request,env); if(a.response)return a.response; const s=scope(a.user,'f'); const rows=await env.DB.prepare(`SELECT f.*,GROUP_CONCAT(sa.label,' | ') areas FROM franchisees f LEFT JOIN service_areas sa ON sa.franchisee_id=f.id AND sa.active=1 WHERE 1=1${s.sql} GROUP BY f.id ORDER BY f.name`).bind(...s.params).all(); return json({branches:rows.results||[]}); }
async function createBranch(request,env) { const a=await auth(request,env,['admin']); if(a.response)return a.response; if(!sameOrigin(request))return json({error:'Ugyldig forespørsel.'},403); const x=await body(request),name=clean(x.name,140); if(name.length<2)return json({error:'Skriv inn avdelingsnavn.'},400); const slug=(clean(x.slug,80)||name).toLowerCase().replace(/[^a-z0-9æøå]+/g,'-').replace(/^-|-$/g,''); const r=await env.DB.prepare(`INSERT INTO franchisees(name,slug,org_no,contact_name,email,phone,region,address,postcode,city,daily_capacity,route_priority,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)`).bind(name,slug,clean(x.orgNo,20)||null,clean(x.contactName,120)||null,email(x.email)||null,phone(x.phone)||null,clean(x.region,120)||null,clean(x.address,180)||null,clean(x.postcode,4)||null,clean(x.city,80)||null,Math.max(1,asInt(x.dailyCapacity,6)),asInt(x.routePriority,100)).run(); const id=r.meta.last_row_id; const from=asInt(x.postcodeFrom,-1),to=asInt(x.postcodeTo,-1); if(from>=0&&to>=from)await env.DB.prepare('INSERT INTO service_areas(franchisee_id,label,postcode_from,postcode_to,priority,exclusive,active) VALUES(?,?,?,?,100,?,1)').bind(id,clean(x.areaLabel,120)||`${from}–${to}`,from,to,x.exclusive?1:0).run(); await log(env,a.user.id,'franchisee',id,'created'); return json({ok:true,id},201); }
async function listServices(request,env) { const publicOnly=new URL(request.url).pathname.startsWith('/api/public/'); if(publicOnly){const rows=await env.DB.prepare('SELECT * FROM services WHERE active=1 AND public_bookable=1 ORDER BY category,name').all();return json({services:(rows.results||[]).map(publicService)});} const a=await auth(request,env); if(a.response)return a.response; const rows=await env.DB.prepare('SELECT * FROM services ORDER BY active DESC,category,name').all(); return json({services:(rows.results||[]).map(publicService)}); }
async function listUsers(request,env) { const a=await auth(request,env,['admin']); if(a.response)return a.response; const rows=await env.DB.prepare('SELECT u.id,u.name,u.email,u.role,u.active,u.franchisee_id,f.name franchisee_name,u.created_at FROM users u LEFT JOIN franchisees f ON f.id=u.franchisee_id ORDER BY u.active DESC,u.name').all(); return json({users:rows.results||[]}); }
async function createUser(request,env) { const a=await auth(request,env,['admin']); if(a.response)return a.response; if(!sameOrigin(request))return json({error:'Ugyldig forespørsel.'},403); const x=await body(request),name=clean(x.name,120),mail=email(x.email),pass=String(x.password||''),role=clean(x.role,20),fid=x.franchiseeId?asInt(x.franchiseeId):null; if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)||pass.length<12||!['admin','franchisee','staff'].includes(role))return json({error:'Kontroller feltene. Passord må ha minst 12 tegn.'},400); if(role!=='admin'&&!fid)return json({error:'Velg avdeling.'},400); const salt=token(18),ph=await hash(pass,salt); try{const r=await env.DB.prepare('INSERT INTO users(franchisee_id,name,email,role,password_hash,password_salt,active) VALUES(?,?,?,?,?,?,1)').bind(role==='admin'?null:fid,name,mail,role,ph,salt).run();return json({ok:true,id:r.meta.last_row_id},201)}catch{return json({error:'E-postadressen er allerede i bruk.'},409)} }
async function listInvoices(request,env) { const a=await auth(request,env); if(a.response)return a.response; const s=scope(a.user,'o'); const rows=await env.DB.prepare(`SELECT i.*,o.order_no,o.title,c.name customer_name,f.name franchisee_name FROM invoices i JOIN orders o ON o.id=i.order_id JOIN customers c ON c.id=i.customer_id JOIN franchisees f ON f.id=o.franchisee_id WHERE 1=1${s.sql} ORDER BY i.created_at DESC`).bind(...s.params).all(); return json({invoices:rows.results||[]}); }
async function createInvoice(request,env,id) { const a=await auth(request,env); if(a.response)return a.response; if(!sameOrigin(request))return json({error:'Ugyldig forespørsel.'},403); const s=scope(a.user,'o'); const o=await env.DB.prepare(`SELECT * FROM orders o WHERE o.id=?${s.sql}`).bind(id,...s.params).first(); if(!o)return json({error:'Ordren finnes ikke.'},404); const existing=await env.DB.prepare('SELECT id FROM invoices WHERE order_id=?').bind(id).first(); if(existing)return json({error:'Fakturagrunnlag finnes allerede.'},409); const subtotal=Number(o.price_ex_vat||0),vat=Math.round(subtotal*Number(o.vat_rate||25)/100),total=subtotal+vat,issue=new Date().toISOString().slice(0,10),due=new Date(Date.now()+14*86400000).toISOString().slice(0,10); const no=`FAK-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${token(3).toUpperCase()}`; const r=await env.DB.prepare("INSERT INTO invoices(invoice_no,order_id,customer_id,status,issue_date,due_date,subtotal,vat,total) VALUES(?,?,?,'utkast',?,?,?,?,?)").bind(no,id,o.customer_id,issue,due,subtotal,vat,total).run(); await env.DB.prepare("UPDATE orders SET invoice_status='klar',status=CASE WHEN status='ferdig' THEN 'fakturaklar' ELSE status END WHERE id=?").bind(id).run(); return json({ok:true,id:r.meta.last_row_id,invoiceNo:no},201); }

async function api(request,env,url) {
  try {
    await seed(env);
    if(url.pathname==='/api/health')return json({ok:true,service:'Nordisk Mobilvask',version:'2.0.0'});
    if(url.pathname==='/api/public/config'&&request.method==='GET'){const s=await settings(env),rows=await env.DB.prepare('SELECT * FROM services WHERE active=1 AND public_bookable=1 ORDER BY category,name').all();return json({settings:s,services:(rows.results||[]).map(publicService)});}
    if(url.pathname==='/api/public/booking'&&request.method==='POST')return publicBooking(request,env);
    if(url.pathname==='/api/auth/status'){const u=await sessionUser(request,env),count=Number((await env.DB.prepare('SELECT COUNT(*) count FROM users').first())?.count||0);return json({initialized:count>0,authenticated:!!u,user:u?publicUser(u):null});}
    if(url.pathname==='/api/auth/setup'&&request.method==='POST')return setup(request,env);
    if(url.pathname==='/api/auth/login'&&request.method==='POST')return login(request,env);
    if(url.pathname==='/api/auth/logout'&&request.method==='POST'){if(!sameOrigin(request))return json({error:'Ugyldig forespørsel.'},403);const sid=cookies(request)[COOKIE];if(sid)await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(sid).run();return json({ok:true},200,{'set-cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`});}
    if(url.pathname==='/api/auth/me'){const a=await auth(request,env);return a.response||json({user:publicUser(a.user)});}
    if(url.pathname==='/api/dashboard')return dashboard(request,env);
    if(url.pathname==='/api/bookings'&&request.method==='GET')return listBookings(request,env);
    let m=url.pathname.match(/^\/api\/bookings\/(\d+)$/);if(m&&request.method==='PATCH')return updateBooking(request,env,Number(m[1]));
    m=url.pathname.match(/^\/api\/bookings\/(\d+)\/convert$/);if(m&&request.method==='POST')return convertBooking(request,env,Number(m[1]));
    if(url.pathname==='/api/orders'&&request.method==='GET')return listOrders(request,env);
    m=url.pathname.match(/^\/api\/orders\/(\d+)$/);if(m&&request.method==='PATCH')return updateOrder(request,env,Number(m[1]));
    m=url.pathname.match(/^\/api\/orders\/(\d+)\/invoice$/);if(m&&request.method==='POST')return createInvoice(request,env,Number(m[1]));
    if(url.pathname==='/api/customers'&&request.method==='GET')return listCustomers(request,env);
    if(url.pathname==='/api/branches'&&request.method==='GET')return listBranches(request,env);
    if(url.pathname==='/api/branches'&&request.method==='POST')return createBranch(request,env);
    if(url.pathname==='/api/services'&&request.method==='GET')return listServices(request,env);
    if(url.pathname==='/api/users'&&request.method==='GET')return listUsers(request,env);
    if(url.pathname==='/api/users'&&request.method==='POST')return createUser(request,env);
    if(url.pathname==='/api/invoices'&&request.method==='GET')return listInvoices(request,env);
    return json({error:'Ikke funnet.'},404);
  } catch(error) { console.error(error); return json({error:error.message==='TYPE'?'Ugyldig innholdstype.':error.message==='SIZE'?'Forespørselen er for stor.':'En intern feil oppstod.'},error.message==='TYPE'?415:error.message==='SIZE'?413:500); }
}
async function asset(request,env,path,noStore=false){const u=new URL(path,request.url);return secure(await env.ASSETS.fetch(new Request(u,request)),noStore);}
export default { async fetch(request,env) {
  const url=new URL(request.url); if(url.pathname.startsWith('/api/'))return api(request,env,url);
  const appHost=url.hostname.startsWith('app.')||url.hostname.startsWith('app-test.'); if(appHost&&url.pathname==='/')return Response.redirect(`${url.origin}/portal/`,302);
  if(url.pathname==='/'||url.pathname==='/index.html')return asset(request,env,'/index-v2.html');
  if(url.pathname==='/portal'||url.pathname==='/portal/') {if(!await sessionUser(request,env))return Response.redirect(`${url.origin}/portal/login/`,302);return asset(request,env,'/portal/v2.html',true);}
  if(url.pathname==='/portal/login'||url.pathname==='/portal/login/') {if(await sessionUser(request,env))return Response.redirect(`${url.origin}/portal/`,302);return asset(request,env,'/portal/login-v2.html',true);}
  if(url.pathname.startsWith('/portal/')&&!await sessionUser(request,env))return Response.redirect(`${url.origin}/portal/login/`,302);
  return secure(await env.ASSETS.fetch(request));
}};
