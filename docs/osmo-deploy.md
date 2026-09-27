# Putting Osmo online

Osmo runs on Vercel from the private GitHub repository `mistif/osmo`. Every push to `main` redeploys him.

## 1. Close sign-ups first (Supabase dashboard → Authentication)
Do this before any deploy: once Osmo is online, the key that talks to Supabase is public, and with sign-ups open anyone could make an account.

1. **Sign In / Providers:** turn off "Allow new users to sign up".
2. **Sign In / Providers → Anonymous:** turn off anonymous sign-ins.

## 2. Deploy on Vercel
1. Sign in to vercel.com with GitHub, choose **Add New → Project**, and import `mistif/osmo`.
2. Framework: Next.js (detected). Leave the build settings as they are.
3. Environment variables (Production and Preview), copied from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

   Do not add `NEXT_PUBLIC_OSMO_DEMO`.
4. Deploy. Note the address, for example `osmo-gur.vercel.app`.

## 3. Finish the Supabase settings (dashboard → Authentication)
These need the Vercel address from step 2.

1. **Passkeys:** turn them on. Set the relying party ID to your Vercel domain (`osmo-gur.vercel.app`, with no `https://`) and the allowed origin to `https://osmo-gur.vercel.app`.
2. **URL Configuration:** set the Site URL to `https://osmo-gur.vercel.app`.

Until passkeys are turned on (step 1 here), the Devices list in Settings shows "I can't reach my memory right now" and the fingerprint button doesn't work; that's expected.

## 4. Check it yourself (about three minutes)
1. Before signing in anywhere, open the address in a private window: you land on the lock screen, and opening `/assistant` or `/login` also takes you to the lock screen.
2. Open the Vercel address. You land on the lock screen.
3. Choose "This device doesn't have my passkey", then sign in with your email and password.
4. When Osmo asks "Remember this device?", choose **Remember** and confirm with Windows Hello, Face ID or your fingerprint.
5. You are in his room. Open **Settings**: your device is listed. Rename it (for example "Home PC").
6. Open the address in a second tab too. In the first tab, choose **Lock Osmo**: both tabs go to the lock screen. Choose **Unlock with fingerprint or face**. You are back in without a password.
7. On your phone, open the same address. If your passkeys sync (iCloud Keychain or Google Password Manager), the fingerprint or face button works right away. If not, repeat steps 3 and 4 there.
8. Open **Memory**, change one small thing and change it back. Open **Insights** and tap today.
9. In **Settings**, choose **Remove** on a test or old device, confirm, and check it's gone from the list. If you remove the device you're using, it will need your email and password next time.

## Your password is the real key
The email and password path works on every device, so use a long, unique password for it. If your Supabase plan offers leaked-password protection, turn it on.

## Local development
Passkeys belong to one address, so passkeys saved on the Vercel site don't work on `localhost`. On your own computer, use "This device doesn't have my passkey" and your email and password.
