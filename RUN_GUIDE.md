# RUN GUIDE — running MediVault on your own machine

Step-by-step instructions to get MediVault running locally for development or a
demo. No cloud account needed. If a step fails, see **Troubleshooting** at the
bottom.

Estimated time first run: ~15 minutes (most of it waiting on installs).

---

## 1. Install the prerequisites

Install these once. Versions matter.

| Tool | Version | Where to get it |
|---|---|---|
| Node.js | 20 LTS or newer | https://nodejs.org (pick the "LTS" download) |
| Docker Desktop | latest | https://www.docker.com/products/docker-desktop |
| Git | any recent | https://git-scm.com |

After installing, open a terminal and confirm:

```bash
node --version     # should print v20.x or higher
docker --version   # should print a version
```

**Start Docker Desktop** and wait until its whale icon stops animating — the
database runs inside Docker.

---

## 2. Get the code

If you already have the `D:\med_record` folder, skip this. Otherwise:

```bash
git clone <your-repo-url> med_record
cd med_record
```

All commands below are run from the `med_record` folder.

---

## 3. Configure the environment file

```bash
copy .env.example .env        # Windows
# or:  cp .env.example .env   # Mac/Linux
```

Open the new `.env` file in a text editor. You must set **one** value:

```
GEMINI_API_KEY=your-key-here
```

Get a key from https://aistudio.google.com/apikey (free tier is fine for testing).
Every other value in `.env` already has a working default for local use.

> ⚠️ Never commit `.env` to git. It's already in `.gitignore`.

---

## 4. Start the database and supporting services

```bash
npm run infra:up
```

This starts three things inside Docker: PostgreSQL (the database), Redis (job
queue), and MinIO (local file storage). Give it ~30 seconds the first time
while it downloads images.

Check they're healthy:

```bash
docker ps
```

You should see `medivault-postgres`, `medivault-redis`, and `medivault-minio`.

---

## 5. Install dependencies

```bash
npm install
```

This installs everything for the API, the mobile app, and the shared package.
First run takes a few minutes.

---

## 6. Set up the database schema

```bash
npm run db:generate     # generates the database client code
npm run db:migrate      # creates all the tables
```

When `db:migrate` asks for a migration name on a fresh database, just press
Enter or type `init`.

---

## 7. Run the API

```bash
npm run dev:api
```

You should see `Server listening at http://localhost:3001`. Leave this terminal
running.

Test it from another terminal:

```bash
curl http://localhost:3001/healthz
```

Expected: `{"status":"ok",...}`. **The backend is now running.**

---

## 8. Run the mobile app

Open a **new** terminal (keep the API running in the first one):

```bash
cd apps/mobile
npx expo start
```

A QR code appears. To open the app:

- **On your phone:** install "Expo Go" from the App Store / Play Store, then
  scan the QR code. Your phone and computer must be on the same Wi-Fi.
  You also need to tell the app where the API is — stop Expo, then run:
  `set EXPO_PUBLIC_API_URL=http://YOUR-COMPUTER-IP:3001` (find your IP with
  `ipconfig`), then `npx expo start` again.
- **iOS simulator** (Mac only): press `i` in the Expo terminal.
- **Android emulator:** press `a` (requires Android Studio installed).

---

## 9. Try it out

1. In the app, tap **"Create one"** to register a patient account.
2. Enter a name, email, phone (format `+12025550100`), and password.
3. You'll be asked for a 6-digit code. The SMS provider is in "mock" mode for
   local dev — **the code is printed in the API terminal**. Look for a line
   like `Your MediVault verification code is 123456`. Type that code.
4. You're in. Tap **"+ Add"** on the Records tab, photograph or pick a
   document, and upload it. Within a few seconds the AI extracts the data and
   the Medications / Timeline tabs populate.

---

## Running the tests

```bash
cd apps/api
npm run test:setup-db     # one time only — creates the test database
npm test                  # runs all 48 integration tests
```

---

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev:api` | Run the backend API |
| `npm run infra:up` / `npm run infra:down` | Start / stop the database services |
| `npm run db:studio` | Open a visual database browser at localhost:5555 |
| `npm test --workspace=@medivault/api` | Run the test suite |
| `cd apps/mobile && npx expo start` | Run the mobile app |

---

## Troubleshooting

**"Cannot connect to the Docker daemon"** — Docker Desktop isn't running. Open
it and wait for the whale icon to settle.

**API says "Invalid environment configuration"** — a required value is missing
from `.env`. The error lists which one. Compare against `.env.example`.

**`db:migrate` fails to connect** — the database container isn't ready. Run
`docker ps` and confirm `medivault-postgres` shows `(healthy)`. Wait 30 seconds
and retry.

**Mobile app can't reach the API** — on a physical phone you must set
`EXPO_PUBLIC_API_URL` to your computer's LAN IP (see step 8). `localhost` from
the phone means the phone itself, not your computer.

**OTP code expired** — codes last 5 minutes. On the verify screen, tap
"Resend code" after the 60-second countdown, or restart sign-up.

**Port already in use** — something else is using port 3001 (API) or 5433
(database). Close the other program, or change `API_PORT` in `.env`.

---

For deploying to a real server, see **DEPLOY_GUIDE.md**.
For publishing the mobile app to the app stores, see **STORE_GUIDE.md**.
