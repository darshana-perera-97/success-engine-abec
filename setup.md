# Success Engine — AWS EC2 production (4 vCPU / 8 GB RAM, ~20 users)

This guide covers **production on EC2** and **local development**. The app auto-tunes polling, memory, and WhatsApp startup based on `NODE_ENV`.

---

## Architecture (production)

- **Single Node process** serves API + static frontend (`frontend/build`)
- **JSON file store** with in-memory cache (do not run multiple Node workers)
- **PM2** for auto-restart and memory limits
- **Nginx** (recommended) for HTTPS and reverse proxy

---

## 1. EC2 system packages (WhatsApp / Puppeteer)

```bash
sudo apt-get update
sudo apt-get install -y \
  ca-certificates curl git nginx \
  fonts-liberation libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 \
  libc6 libcairo2 libcups2t64 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
  libgcc-s1 libglib2.0-0t64 libgtk-3-0t64 libnspr4 libnss3 libpango-1.0-0 \
  libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
  libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
  libxss1 libxtst6 lsb-release wget xdg-utils
```

Install Node.js 20 LTS and PM2:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

---

## 2. Deploy application

```bash
git clone <your-repo> /var/www/success-engine
cd /var/www/success-engine

# Backend env
cp backend/.env.example backend/.env
# Edit backend/.env — set ADMIN_*, SMTP, DATA_DIR, APP_PUBLIC_URL, OPENAI_API_KEY

# Persistent data (recommended on EC2)
sudo mkdir -p /var/lib/success-engine/data
sudo chown $USER:$USER /var/lib/success-engine/data
# In backend/.env:
#   DATA_DIR=/var/lib/success-engine/data
#   NODE_ENV=production

cd backend && npm install
cd ../frontend && npm install && npm run build
```

---

## 3. Start with PM2 (production)

From repo root:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # follow printed command to enable boot start
```

Health check: `curl http://127.0.0.1:3334/api/health`

**Important:** Keep `instances: 1` in `ecosystem.config.cjs`. Multiple workers break JSON file consistency.

Manual start (without PM2):

```bash
cd backend && npm run start:prod
```

---

## 4. Nginx reverse proxy (example)

```nginx
server {
    listen 80;
    server_name your-domain.example.com;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3334;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Use Certbot for HTTPS. Set `APP_PUBLIC_URL=https://your-domain.example.com` in `backend/.env`.

---

## 5. Production tuning (already configured)

| Setting | Production | Development (localhost) |
|---------|------------|-------------------------|
| `NODE_ENV` | `production` | `development` (default) |
| Listen address | `0.0.0.0` | `127.0.0.1` |
| WhatsApp at boot | Lazy (on connect) | Eager (all saved sessions) |
| JSON cache warm-up | Yes | No |
| Student list API | Summary payloads | Summary payloads |
| Frontend polling | 30s (students/tasks) | 10s |
| Node heap limit | 1536 MB (PM2) | default |

Override via `backend/.env`:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3334
WHATSAPP_LAZY_START=true
WARM_JSON_CACHE_ON_START=true
MEETING_REMINDER_POLL_MS=120000
DATA_DIR=/var/lib/success-engine/data
```

Frontend polling overrides: `frontend/.env.production` or `frontend/.env.development`.

---

## 6. Local development

**Terminal 1 — backend:**

```bash
cd backend
cp .env.example .env   # first time only
npm install
npm run start:dev      # listens on http://127.0.0.1:3334
```

**Terminal 2 — frontend:**

```bash
cd frontend
npm install
npm start              # http://localhost:3000
```

When the browser is on `localhost`, the frontend **automatically** calls `http://localhost:3334` (no need to change profile `API_BASE`).

Optional override in `frontend/.env.development`:

```env
REACT_APP_API_BASE=http://localhost:3334
```

---

## 7. Memory budget (~20 users on 8 GB)

| Component | Approx. RAM |
|-----------|-------------|
| Node.js API | 200–600 MB |
| WhatsApp (per active Puppeteer session) | 100–300 MB each |
| OS + Nginx | ~1 GB |
| Headroom | ~2 GB |

With **lazy WhatsApp start**, idle servers stay under ~1 GB. Connect WhatsApp only for staff who need it.

---

## 8. Updating production

```bash
cd /var/www/success-engine
git pull
cd frontend && npm install && npm run build
cd ../backend && npm install
pm2 restart success-engine
```

---

## 9. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Slow / frozen UI | Rebuild frontend; confirm `?summary=1` polling (Network tab) |
| Port in use | `pm2 list` or change `PORT` in `.env` |
| WhatsApp high RAM | Keep `WHATSAPP_LAZY_START=true`; disconnect unused sessions |
| Data not persisting | Set `DATA_DIR` to a volume path outside the repo |
| CORS / wrong API | Production: serve frontend from same backend; dev: use localhost |
