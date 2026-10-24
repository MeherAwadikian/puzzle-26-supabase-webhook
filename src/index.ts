export interface Env {
  WEBHOOK_LOG: KVNamespace;
  ADMIN_TOKEN: string;
  WEBHOOK_SECRET: string;
}

const LOG_KEY = "events";
const MAX_EVENTS = 50;

interface StoredEvent {
  received_at: string;
  type: string | null;
  table: string | null;
  schema: string | null;
  record: unknown;
  old_record: unknown;
}

async function readLog(kv: KVNamespace): Promise<StoredEvent[]> {
  const raw = await kv.get(LOG_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StoredEvent[];
  } catch {
    return [];
  }
}

async function writeLog(kv: KVNamespace, events: StoredEvent[]): Promise<void> {
  await kv.put(LOG_KEY, JSON.stringify(events));
}

// Constant-time string comparison. Avoids leaking timing information about
// how many leading characters of a secret matched (early-exit `===` does not).
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  // Compare against a fixed-length buffer so length mismatches don't
  // short-circuit the loop (length alone is already allowed to differ
  // without leaking much, but this keeps the comparison itself uniform).
  const len = Math.max(aBytes.length, bBytes.length, 32);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < len; i++) {
    const x = i < aBytes.length ? aBytes[i] : 0;
    const y = i < bBytes.length ? bBytes[i] : 0;
    diff |= x ^ y;
  }
  return diff === 0;
}

function isAuthorizedAdmin(request: Request, env: Env): boolean {
  if (!env.ADMIN_TOKEN) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.ADMIN_TOKEN}`;
  return timingSafeEqual(header, expected);
}

function isAuthorizedWebhook(request: Request, env: Env): boolean {
  if (!env.WEBHOOK_SECRET) return false;
  const header = request.headers.get("x-webhook-secret") ?? "";
  return timingSafeEqual(header, env.WEBHOOK_SECRET);
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/webhook") {
      if (!isAuthorizedWebhook(request, env)) {
        return unauthorized();
      }

      let body: Record<string, unknown> = {};
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "invalid JSON body" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const event: StoredEvent = {
        received_at: new Date().toISOString(),
        type: typeof body.type === "string" ? body.type : null,
        table: typeof body.table === "string" ? body.table : null,
        schema: typeof body.schema === "string" ? body.schema : null,
        record: body.record ?? null,
        old_record: body.old_record ?? null,
      };

      const events = await readLog(env.WEBHOOK_LOG);
      events.unshift(event);
      if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
      await writeLog(env.WEBHOOK_LOG, events);

      return new Response(JSON.stringify({ ok: true, stored: event }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/log") {
      if (!isAuthorizedAdmin(request, env)) {
        return unauthorized();
      }
      const events = await readLog(env.WEBHOOK_LOG);
      return new Response(JSON.stringify({ count: events.length, events }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/log/clear") {
      if (!isAuthorizedAdmin(request, env)) {
        return unauthorized();
      }
      await writeLog(env.WEBHOOK_LOG, []);
      return new Response(JSON.stringify({ ok: true, cleared: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        JSON.stringify({
          service: "puzzle-26-supabase-webhook",
          endpoints: {
            "POST /webhook": "receives Supabase Database Webhook payloads (requires x-webhook-secret header)",
            "GET /log": "returns the last stored webhook payloads (requires Authorization: Bearer <ADMIN_TOKEN>)",
            "POST /log/clear": "clears the stored log (requires Authorization: Bearer <ADMIN_TOKEN>)",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};
