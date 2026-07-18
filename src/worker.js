const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function withHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({
        ok: true,
        service: "Nordisk Mobilvask",
        environment: "test",
        time: new Date().toISOString(),
      }), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          ...securityHeaders,
        },
      });
    }

    if (url.pathname === "/portal") {
      return Response.redirect(`${url.origin}/portal/`, 308);
    }

    if (!env.ASSETS) {
      return new Response("Static assets binding is missing.", { status: 500 });
    }

    return withHeaders(await env.ASSETS.fetch(request));
  },
};
