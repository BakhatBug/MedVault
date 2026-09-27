# @medivault/mobile

Expo React Native client for MediVault. v0.12 scope: **patient flows only** (auth, home, records, medications, timeline, profile).

## Quickstart

```bash
# From the repo root (npm workspaces will hoist most deps):
npm install

# Start the API + infra (separate terminal)
docker compose up -d
npm run dev:api

# Start Expo
cd apps/mobile
npx expo start
```

Then:

- **iOS simulator**: press `i` in the Expo terminal
- **Android emulator**: press `a`
- **Physical device**: install Expo Go, scan the QR. On Wi-Fi only the host LAN address works — set `EXPO_PUBLIC_API_URL` to your machine's IP (e.g. `http://192.168.1.42:3001`).

## Architecture

| Layer | Notes |
|---|---|
| `app/` | expo-router file-based routes. `(auth)` and `(patient)` are route groups. |
| `lib/api.ts` | fetch wrapper with bearer token + auto-refresh on 401 |
| `lib/token-store.ts` | Keychain/Keystore via expo-secure-store; localStorage on web |
| `lib/auth-context.tsx` | hydrates on boot, exposes `signIn`/`signOut`, drives the route gate |
| `lib/queries.ts` | react-query hooks per endpoint |
| `lib/theme.ts` | shared colors/spacing — no UI library |

## Status

- Login → token storage → `/me` hydration → patient tabs → real backend data ✅
- Token refresh on 401 ✅
- Record upload UI ❌ (deferred — backend supports it)
- Doctor & caregiver tabs ❌ (deferred)
- Push notifications ❌ (DB notifications exist, FCM delivery deferred)
- Biometric login ❌
- Mobile registration / OTP ❌ (use web for now)
