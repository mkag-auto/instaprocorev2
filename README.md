# InstaProcore — Setup Guide

TV-friendly photo feed for DAKboard. Pulls recent jobsite photos from all Procore projects and displays them in a looping full-screen feed.

---

## Prerequisites 

- Vercel account (vercel.com)
- GitHub account
- Access to Procore as a company admin or user with photo access

---

## Step 1 — Register Your Procore App

1. Go to **https://developers.procore.com**
2. Sign in with your Procore account
3. Click **Create New App**
4. Fill in:
   - **App Name**: `InstaProcore Feed` (or anything)
   - **Description**: Internal TV photo feed
5. Under **OAuth Redirect URIs**, add:
   ```
   https://YOUR-APP-NAME.vercel.app/api/auth/callback
   ```
   (You'll know this URL after Step 2 — you can come back and add it)
6. Save the app. Note your **Client ID** and **Client Secret**.

---

## Step 2 — Deploy to Vercel

1. Push this folder to a new GitHub repo
2. Go to **vercel.com/new** and import your repo
3. When prompted for environment variables, add:

   | Variable | Value |
   |---|---|
   | `PROCORE_CLIENT_ID` | From Step 1 |
   | `PROCORE_CLIENT_SECRET` | From Step 1 |
   | `PROCORE_COMPANY_ID` | Your Procore Company ID* |
   | `NEXT_PUBLIC_APP_URL` | `your-app.vercel.app` (no https://) |

   *Find your Company ID in Procore URL: `app.procore.com/XXXXXXX/...` — that number is your Company ID

4. Click **Deploy**
5. Note your deployed URL (e.g. `https://instaprocore-xyz.vercel.app`)

---

## Step 3 — Update Redirect URI in Procore

1. Go back to your Procore app at **developers.procore.com**
2. Update the OAuth Redirect URI to your actual Vercel URL:
   ```
   https://instaprocore-xyz.vercel.app/api/auth/callback
   ```

---

## Step 4 — Authenticate (One Time)

1. In your browser, visit:
   ```
   https://your-app.vercel.app/api/auth
   ```
2. You'll be redirected to Procore's login/approval screen
3. Approve the app
4. You'll see a page showing your **Access Token** and **Refresh Token**

5. Go to **Vercel Dashboard → Your Project → Settings → Environment Variables**
6. Add:
   - `PROCORE_ACCESS_TOKEN` = the access token shown
   - `PROCORE_REFRESH_TOKEN` = the refresh token shown

7. Go to **Deployments** → click `...` on latest → **Redeploy**

---

## Step 5 — (Recommended) Enable Auto Token Refresh

Without this step, you'd need to manually repeat Step 4 if the refresh token ever expires. With it, tokens rotate automatically forever.

1. Go to **https://vercel.com/account/tokens** → Create token → Copy it
2. Go to your Vercel project → **Settings → General** → copy the **Project ID**
3. Add two more env vars to Vercel:
   - `VERCEL_TOKEN` = your Vercel access token
   - `VERCEL_PROJECT_ID` = your project ID
4. Redeploy one more time

---

## Step 6 — Add to DAKboard

1. Open DAKboard
2. Edit your board → Add Widget → **Website/URL**
3. Paste your Vercel URL: `https://your-app.vercel.app`
4. Set the widget to full screen
5. Done — every TV using this DAKboard will show the feed with no login

---

## Finding Your Procore Company ID

- Log into Procore
- Look at the URL: `https://app.procore.com/123456/company/...`
- The number after `.com/` is your Company ID

---

## Tuning the Feed

All of these are optional env vars you can set in Vercel:

| Variable | Default | Description |
|---|---|---|
| `DAYS_BACK` | `14` | How many days of photos to show |
| `NEXT_PUBLIC_SLIDE_MS` | `8000` | Seconds per photo (ms) |
| `NEXT_PUBLIC_POLL_MS` | `30000` | How often to check for new photos (ms) |
| `NEXT_PUBLIC_NEW_BURST_MS` | `15000` | How long to show new photos before resuming |
| `CONCURRENCY` | `6` | Parallel Procore requests |
| `MAX_PROJECTS` | `0` | Cap projects scanned (0 = all) |

---

## Troubleshooting

**Feed shows "Error Loading Feed"**
- Check that `PROCORE_ACCESS_TOKEN` is set correctly
- Visit `/api/auth` again to get fresh tokens
- Check Vercel function logs

**Feed shows "No images found"**
- Increase `DAYS_BACK` env var
- Confirm the authenticated user has photo access to projects

**Tokens expire / feed goes blank after a while**
- Complete Step 5 (VERCEL_TOKEN + VERCEL_PROJECT_ID) for automatic refresh
- Or revisit `/api/auth` to get new tokens

**DAKboard shows a login screen**
- This should not happen with this app — the `/` page has no auth
- Check that you're using the root URL (`/`), not `/api/auth`
