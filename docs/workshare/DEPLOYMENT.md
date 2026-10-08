# Workshare production cutover

## Target and access

- Vercel project: `aboutvelocityswimming`
- Owner: `coachchristian-7668s-projects`
- Team ID: `team_YD6V0nc3tnozNNfWvgcYwfl1`
- Canonical portal: `https://www.aboutvelocityswimming.com/tools/workshare`
- Firebase project: `velocityworkshareportal`

The connected Vercel account returned HTTP 403 for this owner during implementation.
The local Vercel CLI had no credentials. Connect or authenticate an account with
access to this owner before executing the release. Do not create a replacement
project under another owner.

## Release procedure

1. Run the checks in README.md against the complete integrated working tree,
   including Swim Resources and the public site. Record the previous production
   deployment ID and the exact reviewed source revision/snapshot.
2. Confirm the owner/project with Vercel project inspection. Preserve all existing
   project settings, domains, and environment variables.
3. Add the `NEXT_PUBLIC_WORKSHARE_FIREBASE_*` values from the existing Workshare web
   app to the production environment. Set
   `NEXT_PUBLIC_WORKSHARE_USE_FIREBASE_EMULATORS=false`. These values are compiled
   into the client bundle, so rebuild after configuration changes.
4. Both production domains were authorized on 2026-10-08. Verify with
   `node scripts/workshare/configure-auth-domains.mjs --check`. To restore missing
   entries, use the same script with `--production`. This adds
   `www.aboutvelocityswimming.com` and `aboutvelocityswimming.com` to Firebase
   Authentication's authorized domains, preserving existing domains and the current
   Firebase `authDomain`. Keep the current Google provider configuration. Authorize
   a staging hostname only if it is needed for testing.
5. Stage a production build without assigning the public domains:
   `vercel deploy --prod --skip-domain --scope coachchristian-7668s-projects` from
   the confirmed project directory. Follow any access protection requirements when
   testing that deployment.
6. Check Tools, the Workshare login, direct deep links, private-page metadata,
   assets, and the existing site. With authorized Firebase CLI access, run the
   explicit fixture-based smoke test against that deployment:
   `WORKSHARE_SMOKE_ORIGIN=https://<staged-host> node scripts/workshare/verify-live-invitations.mjs --production`.
   It creates tagged temporary users and records, sends no email, and cleans up in
   `finally`. It must never run automatically in CI.
7. Promote the tested production deployment with `vercel promote <deployment-url>
   --scope coachchristian-7668s-projects`. Verify the canonical URL and repeat the
   fixture smoke test without the staging-origin override. Verify Google and email
   sign-in with the owner's test account and inspect runtime errors.

No backend schema migration, historical record rewrite, reminder duplication,
Functions redeployment, or old-domain redirect is part of this cutover. The old
Firebase Hosting release remains available as a rollback reference. Users sign in
again on the new origin; their accounts and earned hours remain in the same project.

## Rollback

Use Vercel's previous production deployment to restore the website. Keep the old
Workshare hosting release available if families need it. The unchanged Firebase
backend requires no data rollback. Vercel rollback may suspend automatic production
assignment; explicitly promote the next verified production deployment to resume it.
