# STORE GUIDE — publishing the MediVault app

How to get the MediVault mobile app onto the **Apple App Store** and **Google
Play Store**.

> **Read this first.** The backend must be deployed and reachable on a public
> HTTPS URL *before* you submit to the stores — the app the reviewers test must
> actually work. Do **DEPLOY_GUIDE.md** first.
>
> Also: MediVault is a **health/medical app**. Both stores apply extra scrutiny
> to these. Budget 1–3 weeks from "first submission" to "approved," including
> likely rejections to respond to. This is normal.

---

## Before you start — the checklist

You cannot submit without all of these:

- [ ] **Backend deployed** to a public HTTPS URL (see DEPLOY_GUIDE.md).
- [ ] **A privacy policy hosted at a public URL.** Mandatory for both stores,
      and non-negotiable for a health app. Have a lawyer review it.
- [ ] **A support URL or email** for users to contact.
- [ ] **An app icon** — 1024×1024 PNG, no transparency, no rounded corners
      (the stores round it for you).
- [ ] **Screenshots** of the app running, for several device sizes (see below).
- [ ] **An Apple Developer account** — US$99/year, https://developer.apple.com.
      For a medical app, enrolling as a **company/organization** (not an
      individual) is strongly advised — Apple often requires the legal entity
      to own a health app.
- [ ] **A Google Play Developer account** — US$25 one-time,
      https://play.google.com/console.
- [ ] A clear, honest **app description** — do not overstate medical claims.

---

## Step 1 — Prepare the app's identity

The app's identifiers are already set in `apps/mobile/app.json`:

- iOS bundle ID: `app.medivault.client`
- Android package: `app.medivault.client`

Change `app.medivault.client` to something you own (tied to a domain you
control) if you prefer. You also need to add, in `app.json`:

- An `icon` field pointing to your 1024×1024 icon file.
- A `version` (e.g. `1.0.0`) and, for stores, build numbers.
- The privacy policy URL is entered in the store consoles, not `app.json`.

---

## Step 2 — Set the production API URL

The published app must talk to your deployed backend, not localhost. Set this
when building:

```
EXPO_PUBLIC_API_URL=https://api.medivault.app
```

(Use your real domain from the deploy step.)

---

## Step 3 — Install EAS, Expo's build service

The app is built with Expo. Expo's cloud build service (**EAS**) compiles the
iOS and Android binaries for you — you do not need a Mac for the iOS build.

```bash
npm install -g eas-cli
eas login                       # create a free Expo account if needed
cd apps/mobile
eas build:configure             # creates eas.json
```

---

## Step 4 — Build the binaries

```bash
# iOS — produces an .ipa
eas build --platform ios --profile production

# Android — produces an .aab
eas build --platform android --profile production
```

EAS will walk you through signing credentials (it can manage them for you —
say yes unless you have a reason not to). Each build takes 10–20 minutes and
runs in the cloud. When done, EAS gives you a download link and can submit
directly.

---

## Step 5 — Apple App Store submission

1. In **App Store Connect** (https://appstoreconnect.apple.com), create a new
   app. Use the bundle ID from Step 1.
2. Fill in:
   - **App name**, subtitle, description, keywords.
   - **Privacy policy URL** (required).
   - **Category** — "Medical".
   - **Screenshots** — at minimum a 6.7" iPhone set. Take these from a real
     device or simulator running the app.
   - **App Privacy** questionnaire — declare exactly what data you collect
     (health records, contact info, etc.) and how it's used. Be accurate; this
     is legally binding and Apple cross-checks it.
3. Submit the build (EAS can upload it, or use Apple's Transporter app).
4. In the review notes, **give Apple a working test account** (a pre-registered
   patient login) so reviewers can get past the OTP screen. Explain that the
   app stores personal health records.
5. Submit for review.

**Expect questions.** Medical apps are often asked to justify health-data
handling or to prove the entity is a legitimate healthcare provider. Respond
promptly and honestly in the Resolution Center.

---

## Step 6 — Google Play submission

1. In the **Play Console** (https://play.google.com/console), create a new app.
2. Fill in the **store listing** — title, short + full description, screenshots,
   feature graphic (1024×500), app icon.
3. Complete the **Data safety** form — like Apple's, you declare what data is
   collected and why. Health data must be declared.
4. Complete the **content rating** questionnaire.
5. Under **Policy → App content**, complete the **Health apps declaration** if
   prompted — Google asks medical apps to confirm compliance with its health
   policies.
6. Upload the `.aab` from Step 4 to a release track. Start with **internal
   testing** or **closed testing** before production — this lets you and a few
   testers verify the live app before the public sees it.
7. Provide a **test account** in the review notes (same reason as Apple — the
   OTP screen blocks reviewers otherwise).
8. Roll out to production.

---

## Step 7 — After approval

- **Phased rollout** — Google lets you release to a percentage of users first.
  Use it. Apple has a similar phased release option.
- **Monitor** — watch the API's CloudWatch logs and the stores' crash reports
  for the first few days.
- **Respond to reviews** — both stores let you reply to user reviews.

---

## Updating the app later

1. Bump the `version` and build number in `app.json`.
2. `eas build` for each platform again.
3. Upload the new build to App Store Connect / Play Console.
4. Submit for review (updates are usually reviewed faster than the first
   submission).

For small JavaScript-only changes, Expo's **over-the-air updates** (`eas update`)
can push fixes without a store review — but new native features still need a
full store submission.

---

## Gaps to close before the app is store-quality

The app works, but these will improve approval odds and user trust:

1. **No app icon or splash screen** is configured yet — only a background
   colour. Design proper assets before submitting.
2. **Push notifications don't work** — if you mention notifications in the
   store listing, they must actually function. Either wire up delivery (see
   the architecture docs) or don't advertise the feature.
3. **Biometric login** (Face ID / fingerprint) is described in the original
   spec but not implemented — fine to ship without, just don't list it.
4. **Doctor and caregiver registration** currently happen via the API, not the
   app. If you market the app to doctors, add in-app doctor sign-up first.
5. **In-app legal text** — link the privacy policy and terms inside the app,
   not just in the store listing.

None of these block submission, but the icon/splash and an honest feature list
are the minimum bar for a polished first release.

---

See **RUN_GUIDE.md** to run the app locally and **DEPLOY_GUIDE.md** to deploy
the backend it depends on.
