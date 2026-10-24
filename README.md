# puzzle-26-supabase-webhook

Puzzle #26 (Task Forge campaign): a Supabase Postgres table with a trigger that
fires an async HTTP POST (via `pg_net`) to a live Cloudflare Worker on every
INSERT and UPDATE, carrying the changed row's data. Functionally identical to
what Supabase's Dashboard "Database Webhooks" UI generates under the hood
(a trigger calling `net.http_post`), applied directly via SQL/MCP instead of
the Studio UI.

## Pieces

- **Supabase project**: `yfvwfccaubmrqgqkabcf` (mini-url-shortener, reused from
  puzzle #145/#25), table `public.webhook_demo_events`.
- **Trigger function**: `public.notify_webhook_demo_events()`, fires `AFTER
  INSERT OR UPDATE`, calls `net.http_post` with `TG_OP`/table/schema/record/
  old_record as the JSON body.
- **Worker** (this repo): `POST /webhook` stores the payload in a KV log,
  `GET /log` returns the last 50 received payloads, `POST /log/clear` resets it.

## Live

- Worker: https://puzzle-26-supabase-webhook.krikormher.workers.dev
- `GET /log` to see real delivered webhook payloads.
