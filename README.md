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
  old_record as the JSON body, plus an `x-webhook-secret` header pulled from
  Supabase Vault (`puzzle26_webhook_secret`) at call time (not hardcoded in
  the function source).
- **Worker** (this repo): `POST /webhook` validates the `x-webhook-secret`
  header against the `WEBHOOK_SECRET` Worker secret (timing-safe compare)
  before storing the payload in a KV log. `GET /log` and `POST /log/clear`
  require `Authorization: Bearer <ADMIN_TOKEN>` (also a Worker secret,
  timing-safe compare). Both secrets are set via `wrangler secret put`, never
  committed to source.

## Auth

- Supabase -> Worker: `x-webhook-secret: <shared secret>` header, checked
  against `env.WEBHOOK_SECRET`.
- Caller -> Worker admin endpoints (`GET /log`, `POST /log/clear`):
  `Authorization: Bearer <admin token>` header, checked against
  `env.ADMIN_TOKEN`.
- Unauthenticated requests to any of these get `401 Unauthorized`.

## Live

- Worker: https://puzzle-26-supabase-webhook.krikormher.workers.dev
- `GET /log` (with the admin bearer token) to see real delivered webhook payloads.
