# APE APP - USDA Proxy Worker

Cloudflare Worker that proxies USDA FoodData Central API requests, keeping the API key server-side and caching results in KV.

## Setup

1. Install Wrangler CLI:
   ```
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```
   wrangler login
   ```

3. Create a KV namespace for caching:
   ```
   wrangler kv namespace create USDA_CACHE
   ```
   Copy the `id` from the output into `wrangler.toml`.

4. Set your USDA API key as a secret:
   ```
   wrangler secret put USDA_API_KEY
   ```
   Paste your key when prompted. Get a free key at: https://fdc.nal.usda.gov/api-key-signup.html

5. Deploy:
   ```
   wrangler deploy
   ```

6. Your worker URL will be something like:
   `https://ape-usda-proxy.your-account.workers.dev`

7. Update the app's USDA proxy URL in the environment or code.

## Endpoints

- `GET /search?query=chicken+breast&pageSize=10` — Search foods
- `GET /barcode?upc=012345678901` — Barcode lookup

## Caching

Results are cached in KV for 24 hours. HTTP Cache-Control is set to 1 hour. This significantly reduces API calls for repeated searches.

## Limits

- Cloudflare free tier: 100,000 requests/day
- USDA API: 1,000 requests/hour per key
- KV cache eliminates most repeat requests
