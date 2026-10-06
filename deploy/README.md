# Deploying AI Hub to a VPS

One Docker Compose stack: the Next.js app plus its Postgres. HTTPS is handled by
the Caddy that already fronts the server, which reaches the app over a shared
Docker network called `edge`.

```
internet ──▶ Caddy (:80/:443, existing, Let's Encrypt)
                │  edge network
                ▼
            aihub-app:3000 ──▶ aihub-db:5432 (private)
                │
                └─ aihub-storage volume (uploaded documents)
```

DNS for `aiops-cocenter.site` is served by Namecheap. Cloudflare is an optional
extra layer, covered at the end; nothing here depends on it.

Everything below runs on the server as root, except step 1.

---

## 1. Point the hostname at the server

**Already done for `aihub.aiops-cocenter.site`.** In Namecheap → Domain List →
Manage → Advanced DNS there is an `A` record, host `aihub`, value
`173.212.241.218`. For a different hostname, add the same kind of record.

Check it resolves before going on:

```bash
dig +short aihub.aiops-cocenter.site
```

It should print `173.212.241.218`.

## 2. Create the shared network (once per server)

```bash
docker network create edge || true
```

## 3. Put Caddy on that network

The existing Caddy needs to reach the app and to know about the new hostname.
In `~/ai-ops-command-center/deploy`, the `caddy` service gains a `networks`
list, the file gains a top-level `networks` block, and the Caddyfile gains a
second site. Those edits are already committed in that repo, so:

```bash
cd ~/ai-ops-command-center/deploy && git pull
```

Add the new hostname to that stack's `.env`:

```bash
echo 'AIHUB_DOMAIN=aihub.aiops-cocenter.site' >> ~/ai-ops-command-center/deploy/.env
```

Check the config parses **before** restarting anything:

```bash
cd ~/ai-ops-command-center/deploy && docker compose config --quiet && echo OK
```

Hold off on restarting Caddy until step 6, so it is not asking for a
certificate for a host that answers nothing yet.

## 4. Get the code and write the secrets

```bash
cd ~ && git clone https://github.com/YangKaiZZ/ai-hub.git && cd ai-hub/deploy
cp .env.example .env
```

Generate the three secrets and paste them in:

```bash
echo "SESSION_SECRET=$(openssl rand -base64 36)"
echo "INTEGRATION_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-28)"
```

Then edit `.env` and set `DOMAIN`, those three values, and `DEEPSEEK_API_KEY`.
Keep a copy of `INTEGRATION_ENCRYPTION_KEY` somewhere off the server: it
decrypts stored LMS tokens, and a lost key means every user reconnects.

## 5. Build and start

```bash
cd ~/ai-hub/deploy && docker compose up -d --build
```

The first build takes a few minutes. The container applies database migrations
itself on every start, so there is no separate migrate step.

Watch it come up:

```bash
docker compose logs -f app
```

Look for `applying database migrations`, then `starting server on port 3000`.

## 6. Turn on HTTPS

```bash
cd ~/ai-ops-command-center/deploy && docker compose up -d caddy
```

That restarts Caddy, which also serves the AI Ops site; expect a second or two
of downtime there. Caddy requests the certificate on the first request to the
new hostname:

```bash
curl -s https://aihub.aiops-cocenter.site/api/health
```

Expect `{"ok":true,"status":"healthy",...}`. If the certificate fails, check
that port 80 is open and that the DNS record from step 1 resolves. Then check
the AI Ops site still answers:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://aiops-cocenter.site/
```

## 7. Load the demo data (optional, once)

The landing page's demo link expects the seeded student to exist.

```bash
cd ~/ai-hub/deploy && docker compose exec app npx tsx prisma/seed.ts
```

That creates `andrew@demo.aihub.local` and `admin@demo.aihub.local`, both with
password `Password123`. The seed is idempotent, so re-running it is safe.
**Change the admin password after the first login**, since these credentials
are public in the repository.

---

## Updating

```bash
cd ~/ai-hub && git pull && cd deploy && docker compose up -d --build
```

Migrations run on start. Check `docker compose logs --tail 50 app` afterwards.

## Backups

The database dump and the uploaded files are two separate things.

```bash
# Database, keeps the newest 14
~/ai-hub/deploy/scripts/backup.sh

# Uploaded documents
docker run --rm -v ai-hub_aihub-storage:/data -v ~/ai-hub/deploy/backups:/out \
  alpine tar czf /out/aihub-storage-$(date +%F).tar.gz -C /data .
```

Daily at 03:50, via `crontab -e`:

```
50 3 * * * /root/ai-hub/deploy/scripts/backup.sh >> /root/ai-hub/deploy/backups/cron.log 2>&1
```

Copy the dumps off the server. A backup that lives only on the machine it
protects is not a backup.

## Restoring

```bash
cd ~/ai-hub/deploy
gunzip -c backups/ai_hub-YYYYMMDD-HHMMSS.sql.gz | \
  docker compose exec -T db sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## Troubleshooting

| Symptom | Where to look |
|---|---|
| 502 from Caddy | `docker compose -p ai-hub logs --tail 50 app`; the app is down or still building |
| Caddy will not start | `AIHUB_DOMAIN` missing from the AI Ops `.env`, or the `edge` network does not exist |
| App exits on boot | Usually a missing secret. The error names the variable. |
| AI replies look canned | `AI_PROVIDER` is `mock`, or `DEEPSEEK_API_KEY` is empty so the app fell back |
| Uploads vanish after redeploy | The `aihub-storage` volume was removed. `docker compose down` keeps it; `down -v` does not. |
| Cloudflare 521 or 522 | The origin is not answering. Check the app container, then that the firewall rules from the Cloudflare section did not lock Cloudflare out. |
| Cloudflare 526 | SSL mode is Full (strict) but the origin certificate is missing or expired. Grey-cloud the record, let Caddy issue, then re-proxy. |
| Tutor replies arrive in one lump | Something is buffering the event stream. The app already sends `no-transform` and `X-Accel-Buffering: no`; check for a Cloudflare rule that rewrites `/api/*`. |

## Optional: put Cloudflare in front

Not needed: Caddy already provides HTTPS. Cloudflare adds caching and DDoS
absorption, at the cost of moving the whole domain. That means changing the
nameservers at Namecheap to Cloudflare's, which moves **every** record for
`aiops-cocenter.site`, including the AI Ops site and the Resend email records.
Check Cloudflare imported all of them before switching, or email stops.

Once the domain is on Cloudflare:

1. Set **SSL/TLS** to **Full (strict)**. Other modes either fail or quietly drop
   encryption between Cloudflare and this server.
2. Switch the `aihub` record's proxy on (orange cloud) and re-run the health check.
3. Only then, and only once every site on this server is proxied, restrict ports
   80 and 443 to Cloudflare's ranges. Doing it earlier locks out every visitor
   to both sites:

```bash
for ip in $(curl -s https://www.cloudflare.com/ips-v4) $(curl -s https://www.cloudflare.com/ips-v6); do
  ufw allow from "$ip" to any port 80,443 proto tcp
done
```

The app already prefers Cloudflare's `CF-Connecting-IP` header for rate
limiting when it is present, and falls back to `X-Forwarded-For` when it is not.

## What is deliberately not here

- **No exposed database port.** Postgres is reachable only from the app container.
- **No email provider.** Password-reset links are written to the app log
  (`docker compose logs app`). Wire a real SMTP provider before relying on resets.
- **In-memory rate limiting.** Correct for one instance. Running two app
  containers needs a shared store; `RateLimitStore` in `src/lib/rate-limit.ts`
  is the seam for Redis.
