# KingAuth cutover

Kingflix uses the KingAuth SDK's browser mode and Worker-compatible `/verifier`.
No KingAuth changes, app registration, client secret, or password copying are needed.
The existing KingAuth password is used for sign-in and protected-action confirmation.

## Verified ownership

Both live identity services were checked on November 17, 2026 for the verified email
`wakeyjakey@gmail.com`. KingAuth also reports the account approved.

| Provider | Account ID |
| --- | --- |
| Clerk | `user_3JiLSTiHdcPsMrLQYTdxhgrkmyc` |
| KingAuth | `206b7c4f-39a4-48d5-8886-62f11fd39250` |

The production D1 inventory contained seven profiles and two Roku device records
owned by that Clerk ID. Migration `0018_kingauth_owner.sql` changes only those
ownership columns. Profile IDs, PIN hashes/salts, history, favorites, media, and
Roku token hashes/deadlines remain intact. Other owners are untouched. The SQL is
safe to repeat. This document records preparation, not proof of live deployment.

## Cutover order

1. Back up production D1 before applying the ownership migration. Keep the export
   private; it contains family profiles and PIN hashes.
2. Copy the **exact current Worker `CLERK_SECRET_KEY` value** to a Worker secret
   named `APP_SIGNING_SECRET` and the GitHub repository secret of the same name.
   Existing PIN hashes and signed media links depend on this byte-for-byte value.
   Do not generate a replacement value, use an account password, or delete/revoke
   the old Clerk key during this step. A later signing-key rotation needs its own
   PIN migration/reset plan. New installs can use a random 32+ character secret.
3. Deploy the updated API and apply migration `0018` in a brief maintenance window,
   then deploy the web app. The workflows apply migrations before Worker upload;
   the old app will temporarily lose access after ownership changes. Coordinate
   the API and web workflow runs; they are separate deployments.
4. Sign in with the existing KingAuth account. Check all seven profiles, existing
   PINs, favorites, resume positions, playback/seeking/captions, and both Rokus.
   Browser sign-in and profile unlock must be repeated because the identity ID
   changes; saved data remains. Device credentials themselves remain valid.
5. Check password confirmation for managing videos/profiles, changing avatars,
   and overriding a PIN. Wrong passwords must deny the action while leaving the
   KingAuth session signed in. Confirm cancelling the dialog leaves settings intact.
6. After validation, remove obsolete Clerk secrets and the old
   `VITE_CLERK_PUBLISHABLE_KEY` GitHub variable. Retain the preserved value under
   `APP_SIGNING_SECRET`. The app no longer calls Clerk.

The `Provision infrastructure` workflow installs `APP_SIGNING_SECRET`; the ordinary
API workflow preserves existing Worker secrets. Install the renamed Worker secret
before running the ordinary workflow. GitHub Actions uses Node 24 for KingAuth.
The lockfile pins the SDK's resolved Git commit.

## Access and password confirmation

Any verified, approved KingAuth account can sign in to Kingflix, including accounts
created through KingSports or King Comics. KingAuth enforces approval centrally;
Kingflix has no separate account allowlist. Viewing profiles, history, favorites,
and Roku devices remain scoped to their account. The media catalog is shared across
accounts, and signed-in users can manage media after confirming their password.

The API accepts only configured frontend origins, verifies the bearer credential
centrally on each request, and requires a verified email and valid account ID.
KingAuth outages fail closed. Browser sessions are independent across websites.

Protected routes derive the action identifier on the server. The frontend renders
KingAuth's `Reauthenticate` component, then sends its transient proof in
`X-Reauthentication-Proof`. The API consumes it centrally before granting access.
Proofs are single-use and bound to the session, user, origin, and action. No local
password validation or substitute identity protocol is implemented in Kingflix.
After confirmation, the existing 12-hour Kingflix management token controls app
management access. It is kept only in React state and requires a valid login too.

## Recovery

Keep the previous web/API deployment available. If rollback is needed, stop writes,
restore the previous builds and secrets, and reverse only the two verified ownership
updates (KingAuth UUID back to the Clerk ID above) in `profiles` and `roku_devices`.
Preserve all profile IDs and dependent rows. Avoid restoring the full D1 export over
newer watch progress unless a full data restore is intended. Reconcile profiles or
devices created after cutover before reversing ownership. Existing browser profile
and management tokens should be discarded and profiles unlocked again.

## Validation

Run `npm run check` and:

```sh
node --test services/api/test/king-auth.test.mjs services/api/test/avatar-access.test.mjs services/api/test/kingauth-migration.test.mjs services/api/test/roku.test.mjs services/api/test/read-efficiency.test.mjs
```

The suite covers shared account access, trusted origins, verified email, service failure,
revocation, missing/wrong/replayed confirmation proofs, PIN lockout and overrides,
management authorization, and ownership migration preserving history and Roku tokens.
