import { makeDeps } from '../_shared/deps.ts';
import { handleCreateCheckout } from '../_shared/handlers.ts';
import { cors, json } from '../_shared/http.ts';

declare const Deno: { serve(h: (r: Request) => Response | Promise<Response>): void };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const r = await handleCreateCheckout(makeDeps(), await req.json());
    return json(r.status, r.body);
  } catch (e) {
    console.error(e);
    return json(502, { code: 'NETWORK', message: 'Payment provider is not reachable — please try again' });
  }
});
