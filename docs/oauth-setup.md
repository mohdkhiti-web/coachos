# Google and Apple sign-in

CoachOS signs coaches in with **Better Auth**'s built-in Google and Apple providers. Both are optional and independent:
a provider's button appears on the sign-in and sign-up screens **only when all of its environment variables are set**.
Nothing is faked — with no credentials there is no button, and a half-configured provider stops the server at boot with a
message naming the missing variable.

| Provider | Callback URL to register             | Environment variables                                                   |
| -------- | ------------------------------------ | ----------------------------------------------------------------------- |
| Google   | `{APP_URL}/api/auth/callback/google` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                              |
| Apple    | `{APP_URL}/api/auth/callback/apple`  | `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` |

`{APP_URL}` is the `APP_URL` variable — the public origin of the deployment (for local work, `http://localhost:3000`).
Apple only allows HTTPS redirect URLs on a real domain (it rejects `localhost`), so test Apple against a deployed or
tunnelled HTTPS URL.

Secrets are read on the server only (`src/lib/env.ts`); nothing here is sent to the browser. Never commit them.

## Google

1. Google Cloud Console → **APIs & Services → OAuth consent screen**: create the consent screen (app name CoachOS, your
   support email, authorised domain).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. **Authorised redirect URIs**: add `{APP_URL}/api/auth/callback/google` (one per environment).
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Publish the consent screen (or add test users while it is in "Testing").

## Apple

1. Apple Developer → **Certificates, Identifiers & Profiles → Identifiers**: create (or reuse) an **App ID** with the
   _Sign in with Apple_ capability.
2. Create a **Services ID** (this is `APPLE_CLIENT_ID`, e.g. `com.yourcompany.coachos.web`). Enable _Sign in with Apple_,
   **Configure**, choose the App ID as primary, and add:
   - **Domains**: your domain (e.g. `coachos.example.com`)
   - **Return URLs**: `{APP_URL}/api/auth/callback/apple`
3. **Keys → +**: create a key with _Sign in with Apple_ enabled (primary App ID as above). Download the `.p8` **once** — Apple
   will not show it again. The key's ID is `APPLE_KEY_ID`.
4. Your **Team ID** (top right of the developer account, 10 characters) is `APPLE_TEAM_ID`.
5. `APPLE_PRIVATE_KEY` is the contents of the `.p8` file. If your host wants a single line, replace the line breaks with
   `\n` — both forms are accepted.

Apple's "client secret" is a short-lived JWT signed with that key. CoachOS mints one at start-up (valid five months; Apple's
maximum is six), so **any redeploy renews it** — deploy at least every few months, or schedule a restart.

Apple only sends the person's name the _first_ time they authorise the app; CoachOS falls back to the name they enter in
onboarding. People may also choose "Hide my email": the address is then a private relay address, which works for sign-in.

## How accounts behave

- A new person who signs in with Google/Apple gets a CoachOS account and workspace automatically, then goes through
  onboarding like everyone else.
- If the provider's (verified) email matches an existing CoachOS account, the provider is **linked** to that account
  rather than creating a duplicate. Only Google and Apple are trusted for this, because they verify the address.
- Email/password sign-in is unchanged, including email verification and rate limits.

## Failure states

A cancelled or failed social sign-in returns to `/sign-in` with a plain-language message (the provider's error code picks
the message; it is never shown to the coach). Network errors on starting the flow are shown inline on the button.

## Verifying the wiring without live credentials

The e2e suite runs the app with **fake** credentials and a throw-away Apple key, clicks each button, and asserts the
browser is sent to the provider's real authorization endpoint with the right callback URL, client ID, `state`, and (for
Apple) `response_mode=form_post`. That proves the application side. A real sign-in additionally needs real credentials and
is not something automated tests can do — do it once by hand after configuring each provider.
