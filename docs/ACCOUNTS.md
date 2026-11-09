# Google accounts and private workspaces

Daylight uses Supabase for Google sign-in and account storage. GitHub Pages serves the compiled app. Supabase verifies sessions and enforces one private workspace per account. Each new account starts empty.

## Set up Supabase and Google

1. In [Supabase](https://supabase.com/dashboard), create a project. Open its **SQL Editor**, paste [the workspace migration](../supabase/migrations/20261109_daylight_workspaces.sql), and run it once. This creates the workspace table and its access policies.
2. In [Google Cloud](https://console.cloud.google.com/), configure the Google Auth consent screen. Choose **External** for users outside your organization. While the app is in testing, add each Google account you plan to test. When you want general access, complete Google's publication and branding steps shown in the console.
3. In Google Cloud, create a **Web application** OAuth client for Daylight account sign-in. Set the authorized redirect URI to the exact Supabase callback displayed under the Google provider settings. It normally looks like `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
4. In Supabase **Authentication → Sign In / Providers → Google**, enable the Google provider and enter the Google OAuth client ID and secret. Keep the secret in the provider settings.
5. In Supabase **Authentication → URL Configuration**, set **Site URL** to `https://planwithdata.github.io/personal-planner/` and add the same URL to **Redirect URLs**. Keep the trailing slash. For local testing, also add the exact local URL you open, such as `http://127.0.0.1:5173/`.
6. In your GitHub repository, open **Settings → Secrets and variables → Actions → Variables**. Add these repository variables from the Supabase project:

   | Variable | Value |
   | --- | --- |
   | `DAYLIGHT_SUPABASE_URL` | Project URL, such as `https://YOUR-PROJECT.supabase.co` |
   | `DAYLIGHT_SUPABASE_PUBLISHABLE_KEY` | Public API key beginning with `sb_publishable_` |

7. Run **Deploy Daylight to GitHub Pages** from the Actions tab. The new site opens with **Continue with Google** and **Use on this device**. Use two test accounts to verify that a task created in one stays private to that account.

For the console details, see [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls). Google Calendar is a separate optional connection with its own [setup](GOOGLE-CALENDAR.md). Signing into Daylight uses your Google identity and does not request Gmail or Calendar access.

## iPhone and existing data

1. Open the deployed URL in Safari. Select **Share → Add to Home Screen**, turn on **Open as Web App** if shown, and open the Daylight icon. [Apple's installation guide](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)
2. Select **Continue with Google** from that window. The full-page sign-in returns to the same Daylight URL. If iOS opens the callback in a different browser context, restart sign-in from the window you want to use, or use Daylight in Safari.
3. To bring a device-only planner into your account, choose **Use on this device**, export a JSON backup, sign in, and restore the file in **Settings & backup**. Restore replaces the signed-in workspace, so back up any existing account data first.

Signed-in edits save locally first and sync when connected. A previously opened account can use its cached workspace offline while the browser retains its sign-in session. New sign-ins and opening an account for the first time require internet access. When another device has saved a newer copy, Daylight lets you export your local edits and explicitly choose the cloud copy.
