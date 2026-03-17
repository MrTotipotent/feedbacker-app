# Feedbacker — Deployment Guide

Step-by-step instructions for deploying to Vercel and connecting to your Xano backend.

---

## Prerequisites

- A [GitHub](https://github.com) account (free)
- A [Vercel](https://vercel.com) account (free — sign up with your GitHub account)
- Your Xano workspace already set up with the three API groups

---

## Step 1 — Push the code to GitHub

1. Go to [github.com/new](https://github.com/new) and create a new **private** repository called `feedbacker-app`
2. Open a terminal in the `feedbacker-app` folder and run:

```bash
git init
git add .
git commit -m "Initial Feedbacker app"
git remote add origin https://github.com/YOUR-USERNAME/feedbacker-app.git
git push -u origin main
```

> **Note:** `.env.local` is listed in `.gitignore` so your Xano URLs are never pushed to GitHub.

---

## Step 2 — Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Import Git Repository"** and select `feedbacker-app`
3. Vercel auto-detects Next.js — leave all build settings as-is
4. **Before clicking Deploy**, expand **"Environment Variables"** and add the three variables below

---

## Step 3 — Set Environment Variables in Vercel

In the Vercel project settings, add these three variables:

| Variable Name | Value |
|---|---|
| `NEXT_PUBLIC_XANO_SURVEY_API` | `https://xtw2-xdvy-nt5f.e2.xano.io/api:tkq1OGP7` |
| `NEXT_PUBLIC_XANO_AUTH_API` | `https://xtw2-xdvy-nt5f.e2.xano.io/api:Pmigfx7N` |
| `NEXT_PUBLIC_XANO_DASH_API` | `https://xtw2-xdvy-nt5f.e2.xano.io/api:DLfhPC-k` |

Set all three for **Production**, **Preview**, and **Development** environments.

> **How to find your Xano URLs:** In Xano, open each API Group → click the group name → copy the **Base URL** shown at the top.

To add variables after deployment: **Vercel Dashboard → Your Project → Settings → Environment Variables → Add**.
After adding variables you must **redeploy**: Deployments → ⋯ → Redeploy.

---

## Step 4 — Click Deploy

Click **Deploy**. Vercel will build and deploy in ~2 minutes.

Your app will be live at: `https://feedbacker-app.vercel.app` (or your chosen name).

---

## Step 5 — Add a Custom Domain (optional)

1. Vercel Dashboard → Your Project → **Settings → Domains**
2. Add your domain (e.g. `app.feedbacker.co.uk`)
3. Follow the DNS instructions shown (add a CNAME record at your domain registrar)

---

## Step 6 — Configure Xano CORS (important for production)

In Xano, each API group needs your Vercel domain whitelisted:

1. Open each API Group in Xano
2. Go to **Settings → CORS**
3. Add your Vercel URL: `https://feedbacker-app.vercel.app`
4. If using a custom domain, add that too

---

## Step 7 — Post-deployment checklist

Test each of these after deploying:

- [ ] `https://your-app.vercel.app/survey?id=garlic lettuce` — survey loads with clinician name
- [ ] `https://your-app.vercel.app/login` — can sign in with a real Xano account
- [ ] `/dashboard` — protected, redirects to `/login` if not signed in
- [ ] `/dashboard` after login — shows score cards, radar chart, QR code
- [ ] `/reviews` — Wall of Love loads
- [ ] `/settings` — can save redirect URL, QR code displays
- [ ] `/appraisal` — Download PDF button opens print dialog
- [ ] `/cqc` — date filter + Download PDF works (Practice Manager only)

---

## Local development

```bash
cd feedbacker-app
npm install
npm run dev
# → http://localhost:3000
```

Environment variables are loaded from `.env.local` automatically.

---

## Redeploying after code changes

Any `git push` to the `main` branch automatically triggers a new Vercel deployment.

```bash
git add .
git commit -m "Your change description"
git push
```

Vercel deploys in ~1 minute. No manual steps needed.

---

## Architecture summary

```
Patient phone
    │ scans QR code
    ▼
/survey?id=[clinician_id]   ← public, no auth
    │ GET  Xano: get_clinician_info
    │ POST Xano: create_submission
    │ redirect → Google Review / practice site

GP / Practice Manager
    │ logs in
    ▼
/login
    │ POST Xano: auth/login → authToken stored in localStorage
    ▼
/dashboard /reviews /appraisal /settings   ← JWT protected
    │ all calls: Authorization: Bearer [authToken]
    ▼
Xano Dashboard API group
```

---

## Environment variables reference

| Variable | Which page uses it | Description |
|---|---|---|
| `NEXT_PUBLIC_XANO_SURVEY_API` | `/survey` | Survey group base URL |
| `NEXT_PUBLIC_XANO_AUTH_API` | `/login` | Auth group base URL |
| `NEXT_PUBLIC_XANO_DASH_API` | `/dashboard`, `/reviews`, `/practice`, `/cqc`, `/appraisal`, `/settings` | Dashboard group base URL |

All variables are prefixed `NEXT_PUBLIC_` because they are used in client-side browser code.
