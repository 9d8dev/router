# Forms MVP release runbook

This runbook deliberately separates code proof, database migration, deployment, provider changes, UAT, and public activation. Completing one gate does not authorize the next.

## 1. Code and artifact proof

- Run lint, type checking, unit tests, a credential-free production build, database integration tests, and `pnpm wordpress:check`.
- Run `pnpm wordpress:package`, inspect the ZIP contents, and confirm only the plugin directory is included.
- Review `dogfood-output/report.md` and repeat authenticated dashboard UAT against the candidate deployment.

## 2. Database gate

- Back up the target PostgreSQL database.
- Apply migrations `0006` through `0010` in order with `pnpm db:migrate`.
- Confirm `forms`, `formOrigins`, `wordpressConnections`, `usagePeriods`, `formRateBuckets`, and `formPlacementMilestones` exist.
- Confirm existing endpoint and lead counts are unchanged and the current UTC usage backfill is plausible.

## 3. Application deployment gate

- Configure `FORM_SUBMISSION_SECRET`, email settings, PostHog settings, Stripe webhook secret, and the four new price IDs.
- Deploy app code with `FORMS_NAV_ENABLED=false` so direct routes are available for UAT while Forms navigation and endpoint CTAs remain hidden.
- Smoke the legacy endpoint GET and authenticated POST contracts before testing any public form.
- Create a blank form, publish it, open the hosted route, submit it, and confirm the attributed lead and webhook log.
- Repeat with an approved generic origin and a connected WordPress test site.

## 4. Public host gate

- Attach `forms.router.so` only after the application smoke passes.
- Verify TLS, middleware routing, `/embed/v1.js`, hosted render sessions, public submissions, ETags, and unpublish behavior on the actual host.
- Test a stale cached definition by publishing a new revision and confirming the next definition request changes ETag and content.

## 5. WordPress artifact gate

- Test the ZIP on WordPress 6.6 and current stable, using one block theme and one classic theme on PHP 7.4+.
- Verify activation, connection, nonce-protected picker, token revocation, Gutenberg preview, block frontend, shortcode frontend, and multiple forms per page.
- Publish the already verified ZIP for download. WordPress.org submission remains deferred.

## 6. Billing migration gate

- Create and archive the four new Stripe Prices, then configure their IDs in the app.
- Run `pnpm stripe:legacy-migration` without `--apply`; review every subscription in the dry-run output.
- After explicit authorization, re-run with `--apply` and verify Stripe webhook readback records `cancel_at_period_end` and the period end for each affected user.
- Send the approved customer communications from `legacy-customer-email-drafts.md` on the stated schedule.

## 7. Launch gate

- Publish the Router website and docs changes.
- Set `FORMS_NAV_ENABLED=true` only after authenticated UAT and all hosted/embed/WordPress smoke tests pass.
- Watch form creation, publishing, placement connection, first-lead events, quota errors, rate limits, and webhook failures without capturing lead values.

## Rollback

Set `FORMS_NAV_ENABLED=false` and `FORMS_PUBLIC_ENABLED=false`. Do not roll back or edit applied migrations. Existing endpoint APIs, leads, and webhooks must remain operational. If public traffic is unsafe, detach `forms.router.so` after disabling routes; leave the core authenticated endpoint path untouched.
