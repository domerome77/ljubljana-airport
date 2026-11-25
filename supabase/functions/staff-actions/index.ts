import { callerRole, makeDeps, serviceClient } from '../_shared/deps.ts';
import { handleStaffAction } from '../_shared/handlers.ts';
import { cors, json } from '../_shared/http.ts';

declare const Deno: { serve(h: (r: Request) => Response | Promise<Response>): void };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = serviceClient();
    const role = await callerRole(sb, req.headers.get('Authorization'));
    const r = await handleStaffAction(makeDeps(sb), role, await req.json());
    return json(r.status, r.body);
  } catch (e) {
    console.error(e);
    return json(500, { code: 'INVALID', message: e instanceof Error ? e.message : 'Error' });
  }
});
