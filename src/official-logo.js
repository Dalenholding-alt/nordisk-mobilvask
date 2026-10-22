// The uploaded artwork, cropped only around its outer whitespace and resized.
// A unique URL avoids reusing earlier, incorrect cached logo files.
export const OFFICIAL_LOGO = '/assets/nordisk-original-222df8ef-20261023.webp';
export const BRAND_VERSION = 'official-222df8ef-20261023';
const legacyPaths = new Set([
  '/logo.svg',
  '/logo-transparent.png',
  '/assets/nordisk-logo-v2.png',
]);

export function isLegacyLogo(value, requestUrl) {
  if (!value) return false;
  try {
    const base = new URL(requestUrl);
    const asset = new URL(value, base);
    return asset.origin === base.origin && legacyPaths.has(asset.pathname);
  } catch {
    return false;
  }
}

export class OfficialLogoImage {
  constructor(requestUrl) { this.requestUrl = requestUrl; }
  element(element) {
    if (!isLegacyLogo(element.getAttribute('src'), this.requestUrl)) return;
    element.setAttribute('src', OFFICIAL_LOGO);
    element.removeAttribute('srcset');
    element.setAttribute('alt', 'Nordisk Mobilvask');
    element.setAttribute('width', '400');
    element.setAttribute('height', '228');
    element.setAttribute('data-nm-brand', BRAND_VERSION);
    // Do not turn the official coloured artwork into a white silhouette.
    const style = element.getAttribute('style') || '';
    element.setAttribute('style', style + ';filter:none!important;opacity:1!important;object-fit:contain;background:#fff;border-radius:8px');
  }
}

export class OfficialLogoIcon {
  constructor(requestUrl) { this.requestUrl = requestUrl; }
  element(element) {
    if (!isLegacyLogo(element.getAttribute('href'), this.requestUrl)) return;
    element.setAttribute('href', OFFICIAL_LOGO);
    element.setAttribute('type', 'image/webp');
  }
}

export function applyOfficialLogo(response, requestUrl) {
  if (response.status !== 200 || !(response.headers.get('content-type') || '').includes('text/html')) {
    return response;
  }
  return new HTMLRewriter()
    .on('img[src]', new OfficialLogoImage(requestUrl))
    .on('link[rel~="icon"]', new OfficialLogoIcon(requestUrl))
    .transform(response);
}
