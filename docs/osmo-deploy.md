# Putting Osmo online

Osmo runs on Vercel from the private GitHub repository `mistif/osmo`. Every push to `main` redeploys him.

## 1. Deploy on Vercel
1. Sign in to vercel.com with GitHub, choose **Add New → Project**, and import `mistif/osmo`.
2. Framework: Next.js (detected). Leave the build settings as they are.
3. Environment variables (Production and Preview), copied from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

   Do not add `NEXT_PUBLIC_OSMO_DEMO`.
4. Deploy. Note the address, for example `osmo-gur.vercel.app`.

## 2. Supabase settings (dashboard → Authentication)
1. **Sign In / Providers:** turn off "Allow new users to sign up".
2. **Passkeys:** turn them on. Set the relying party ID to your Vercel domain (`osmo-gur.vercel.app`, with no `https://`) and the allowed origin to `https://osmo-gur.vercel.app`.
3. **URL Configuration:** set the Site URL to `https://osmo-gur.vercel.app`.

Until passkeys are turned on (step 2), the Devices list in Settings shows "I can't reach my memory right now" and the fingerprint button doesn't work; that's expected.

## 3. Check it yourself (about two minutes)
1. Before signing in anywhere, open the address in a private window: you land on the lock screen, and opening `/assistant` also takes you to the lock screen.
2. Open the Vercel address. You land on the lock screen.
3. Choose "This device doesn't have my passkey", then sign in with your email and password.
4. When Osmo asks "Remember this device?", choose **Remember** and confirm with Windows Hello, Face ID or your fingerprint.
5. You are in his room. Open **Settings**: your device is listed. Rename it (for example "Home PC").
6. Choose **Lock Osmo**. On the lock screen, choose **Unlock with fingerprint or face**. You are back in without a password.
7. On your phone, open the same address. If your passkeys sync (iCloud Keychain or Google Password Manager), the fingerprint or face button works right away. If not, repeat steps 3 and 4 there.
8. Open **Memory**, change one small thing and change it back. Open **Insights** and tap today.

## Local development
Passkeys belong to one address, so passkeys saved on the Vercel site don't work on `localhost`. On your own computer, use "This device doesn't have my passkey" and your email and password.
