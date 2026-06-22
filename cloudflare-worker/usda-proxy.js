export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // /search?query=chicken+breast&pageSize=10
    if (path === '/search') {
      const query = url.searchParams.get('query');
      const pageSize = url.searchParams.get('pageSize') || '10';
      if (!query) return jsonResponse({ error: 'Missing query parameter' }, 400);

      const cacheKey = `usda:search:${query.toLowerCase()}:${pageSize}`;
      const cached = await env.USDA_CACHE?.get(cacheKey);
      if (cached) return jsonResponse(JSON.parse(cached));

      const res = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=${pageSize}&api_key=${env.USDA_API_KEY}`
      );
      const data = await res.json();

      // Cache for 24 hours
      if (env.USDA_CACHE && data.foods) {
        await env.USDA_CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: 86400 });
      }

      return jsonResponse(data);
    }

    // /barcode?upc=012345678901
    if (path === '/barcode') {
      const upc = url.searchParams.get('upc');
      if (!upc) return jsonResponse({ error: 'Missing upc parameter' }, 400);

      const cacheKey = `usda:barcode:${upc}`;
      const cached = await env.USDA_CACHE?.get(cacheKey);
      if (cached) return jsonResponse(JSON.parse(cached));

      const res = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(upc)}&dataType=Branded&pageSize=3&api_key=${env.USDA_API_KEY}`
      );
      const data = await res.json();

      if (env.USDA_CACHE && data.foods) {
        await env.USDA_CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: 86400 });
      }

      return jsonResponse(data);
    }

    return jsonResponse({ error: 'Not found', endpoints: ['/search?query=...', '/barcode?upc=...'] }, 404);
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': status === 200 ? 'public, max-age=3600' : 'no-cache',
    },
  });
}
