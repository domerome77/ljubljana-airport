import { makeDeps } from '../_shared/deps.ts';
import { handleWebhook } from '../_shared/handlers.ts';

declare const Deno: { serve(h: (r: Request) => Response | Promise<Response>): void };

Deno.serve(async (req) => {
  const raw = await req.text();
  try {
    const r = await handleWebhook(makeDeps(), raw, {
      'revolut-request-timestamp': req.headers.get('Revolut-Request-Timestamp'),
      'revolut-signature': req.headers.get('Revolut-Signature'),
    });
    return new Response(r.body ? JSON.stringify(r.body) : null, { status: r.status });
  } catch (e) {
    console.error(e);
    return new Response('error', { status: 500 }); // Revolut retries; mark_paid is idempotent
  }
});
