# SpinSense operator web — authentication and onboarding

Next.js 16, React and Tailwind v4. Public entry, Supabase authentication, FastAPI onboarding and the protected Branches directory are implemented. Onboarding and branch migrations have been applied to the existing Supabase project. See the [monorepo run command](../README.md), [PRD](../docs/PRD.md), [design guide](../docs/DESIGN.md) and [phase tasks](../tasks/todo.md).

## Local setup

Use Node 22.12+ (verified here with 22.17) and install the locked dependencies. From the repository root, `npm run dev` starts this app and FastAPI together and stops both with Ctrl+C. To run only the frontend from this directory:

```powershell
npm ci --ignore-scripts
npm run dev
```

Open [localhost:3000](http://localhost:3000). The app uses the system font and does not fetch Google Fonts.

Keep local values in the ignored `.env.local`; [.env.example](.env.example) contains placeholders. Existing local credentials must not be overwritten.

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: public project configuration, never administrative credentials.
- `NEXT_PUBLIC_SITE_URL`: trusted application origin without a path. Development defaults to `http://localhost:3000`; set it explicitly before production builds/deployment and use HTTPS outside loopback development.
- `NEXT_PUBLIC_API_URL`: FastAPI base URL for the public directory and protected onboarding APIs. The verified Supabase access token is forwarded only by server-side code to protected FastAPI endpoints.

In the existing Supabase project, independently verify email signup/confirmation, email delivery and allowed redirect URLs. For local confirmation the redirect is `http://localhost:3000/auth/confirm`; configure the equivalent trusted URL for another origin. This change does not update the remote project.

The default PKCE confirmation redirect (`code`) and the documented email-token callback (`token_hash` with `type=email`) are supported. The latter requires an appropriately configured confirmation email template if selected. Confirmation returns to login and does not provision a business. See [Supabase SSR setup](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

## Available flow

- `/` → Log in or Register; `/register` → owner or personnel.
- Owner signup → check email → confirmation → login → automatic idempotent onboarding → Branches.
- Personnel signup displays the real organization directory or an honest unavailable/empty state. Submission is disabled without an available organization.
- Pending, rejected, unassigned and unavailable users reach `/membership-status`; an active owner goes directly to `/branches` and can review join requests at `/personnel`.
- `/branches` uses protected FastAPI data and shows a genuine empty state before the first branch. `/dashboard` and branch operational detail remain gated for later migration.
- Sign-out uses Supabase; demo-auth helpers and localStorage grants are retired. Operational routes stay fenced until their own current-permission APIs are migrated.

Signup metadata contains only personal details and an untrusted `onboarding_intent`. FastAPI validates it, freezes the accepted intent and provisions idempotently. No frontend writes `app_metadata.role` or application password records.

The public directory uses `GET /public/organizations` returning `{ organizations: [{ id, name }] }`. Malformed, failed or absent integration is not an empty list. FastAPI exposes only active public identifiers, never private business/staff fields.

## Checks

Run from this directory:

```powershell
npm test
npm run test:e2e
npm run lint
npx --no-install tsc --noEmit --incremental false
npm run build
```

Vitest covers validation, authentication failures, metadata, confirmation callbacks, provider payloads and refreshed-cookie/cache handling. Playwright requires installed Google Chrome and uses isolated local servers on ports 3100/3101, with desktop/mobile and unconfigured-project checks. It sends no live signup or confirmation emails. Mobile emulation does not establish Android PWA acceptance. Browser artifacts are ignored under `test-results/`.

The focused Phase 2 check is `node node_modules/vitest/vitest.mjs run tests/unit/business-onboarding.test.ts`. It covers verified-token forwarding, confirmation gating, unavailable/forbidden states and malformed business responses. Backend tests run from the repository root with `backend/.venv-phase2/Scripts/python.exe -m pytest backend/test_onboarding.py -q`.

Production builds use Next.js's supported `--webpack` option: Turbopack's production PostCSS helper exited before connecting on this Windows environment, including outside the sandbox. Development Turbopack and the Webpack build were verified separately. Type checking is retained.

The pre-change lint baseline was 16 errors/14 warnings; the Phase 1 full-app result was 15 errors/13 warnings in retained prototype files. The new Phase 2 web files pass focused lint. Remaining prototype failures must not be suppressed or treated as authentication requirements. Live signup, mailbox delivery, confirmation allowlists and PostgreSQL/RLS behavior need their own integration evidence.

The Phase 2 migration in `backend/migrations/001_onboarding.sql` was applied to the existing Supabase project during local setup on 2026-10-27. All five tables, enabled RLS and absent direct `anon`/`authenticated` table grants were verified. Ignored `backend/.env` and `frontend-web/.env.local` connect the local app to local FastAPI; `backend/.env.example` contains placeholders only. The existing owner completed signed-in onboarding and one active organization/owner role was observed. Email delivery, redirect settings and a second live idempotent write remain unverified. Render remains unchanged.
