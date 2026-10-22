import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { OFFICIAL_LOGO, BRAND_VERSION, isLegacyLogo, OfficialLogoImage, OfficialLogoIcon, applyOfficialLogo } from '../src/official-logo.js';
const url = 'https://nordiskmobilvask.com/portal/login/';
function fakeElement(initial) {
  const attrs = new Map(Object.entries(initial));
  return { attrs, getAttribute: k => attrs.get(k) ?? null, setAttribute(k,v) {attrs.set(k,v);}, removeAttribute(k) {attrs.delete(k);} };
}
test('uses the exact verified uploaded image bytes', () => {
  const data = readFileSync(new URL('../public' + OFFICIAL_LOGO, import.meta.url));
  assert.equal(data.toString('ascii',0,4), 'RIFF');
  assert.equal(data.readUInt32LE(4) + 8, data.length);
  const hash = createHash('sha1').update('blob ' + data.length + '\0').update(data).digest('hex');
  assert.equal(hash, 'e086ab1fb5e63825ac1e724a869f26ccf6082e92');
});
test('recognizes old versioned logo URLs, not customer images', () => {
  for (const path of ['/logo.svg','/logo-transparent.png?v=4','/assets/nordisk-logo-v2.png?v=2']) assert.equal(isLegacyLogo(path,url),true);
  for (const path of [OFFICIAL_LOGO,'/car.jpg','https://example.org/logo.svg',null]) assert.equal(isLegacyLogo(path,url),false);
});
test('replaces old artwork and removes footer colour inversion', () => {
  const el = fakeElement({src:'/logo.svg',srcset:'/old.svg 2x',style:'max-width:230px'});
  new OfficialLogoImage(url).element(el);
  assert.equal(el.attrs.get('src'),OFFICIAL_LOGO);
  assert.equal(el.attrs.get('data-nm-brand'),BRAND_VERSION);
  assert.equal(el.attrs.has('srcset'),false);
  assert.match(el.attrs.get('style'),/max-width:230px;filter:none!important/);
});
test('leaves service photos untouched', () => {
  const el = fakeElement({src:'/service.jpg',alt:'Service'});
  new OfficialLogoImage(url).element(el);
  assert.deepEqual(Object.fromEntries(el.attrs),{src:'/service.jpg',alt:'Service'});
});
test('favicon uses the same official artwork', () => {
  const el = fakeElement({href:'/logo-transparent.png?v=4',type:'image/png'});
  new OfficialLogoIcon(url).element(el);
  assert.equal(el.attrs.get('href'),OFFICIAL_LOGO);
  assert.equal(el.attrs.get('type'),'image/webp');
});
test('does not alter booking JSON, authentication redirects, or errors', () => {
  for (const response of [Response.json({ok:true,reference:'NM-test'}),new Response(null,{status:302,headers:{location:'/portal/login/'}}),new Response('error',{status:500})]) {
    assert.equal(applyOfficialLogo(response,url),response);
  }
});
test('HTML handling uses only image and favicon selectors', () => {
  const selectors=[];
  globalThis.HTMLRewriter=class { on(selector) {selectors.push(selector);return this;} transform(response) {return response;} };
  const response=new Response('<html></html>',{headers:{'content-type':'text/html;charset=utf-8'}});
  assert.equal(applyOfficialLogo(response,url),response);
  assert.deepEqual(selectors,['img[src]','link[rel~="icon"]']);
  delete globalThis.HTMLRewriter;
});
