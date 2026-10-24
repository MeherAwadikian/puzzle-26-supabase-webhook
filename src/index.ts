export interface Env {
  WEBHOOK_LOG: KVNamespace;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/webhook") {
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
      const events = await readLog(env.WEBHOOK_LOG);
      return new Response(JSON.stringify({ count: events.length, events }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/log/clear") {
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
            "POST /webhook": "receives Supabase Database Webhook payloads",
            "GET /log": "returns the last stored webhook payloads",
            "POST /log/clear": "clears the stored log",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};
