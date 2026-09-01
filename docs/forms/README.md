# Router Forms

Forms are optional, versioned presentations for Router endpoints. The implementation keeps endpoints and leads canonical while adding draft authoring, explicit publishing, hosted pages, generic embeds, and WordPress placements.

## Runtime contracts

- Hosted form: `https://forms.router.so/{publicId}`
- Public definition: `GET /api/public/forms/{publicId}`
- Render session: `POST /api/public/forms/{publicId}/render-session`
- Public lead: `POST /api/public/forms/{publicId}/leads`
- WordPress picker: `GET /api/integrations/wordpress/forms`
- Immutable embed entrypoint: `https://forms.router.so/embed/v1.js`

The legacy `POST /api/endpoints/{endpointId}` URL and bearer-token behavior remain unchanged. Both submission paths use `lib/forms/lead-acceptance.ts`.

## Local verification

```sh
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm wordpress:check
pnpm wordpress:package
```

Set `TEST_DATABASE_URL` to a disposable migrated PostgreSQL database before running `pnpm test:db`.

## Required production configuration

- `POSTGRES_URL`
- `AUTH_SECRET`
- `FORM_SUBMISSION_SECRET` (may fall back to `AUTH_SECRET`, but a distinct random secret is recommended)
- `RESEND_API_KEY` and `ROUTER_EMAIL_FROM` for 80% and 100% usage notices
- New Pro and Business Stripe price IDs from `.env.example`
- Optional PostHog public key and host for product events

The app builds without Stripe or Resend credentials. Billing and notification operations fail closed or skip delivery until their credentials are configured.
