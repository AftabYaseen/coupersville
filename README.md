# Coupersville

Digital coupons for local shops. See `CLAUDE.md` for the product spec and build phases.

## Run locally

1. Install Node 20 or newer.
2. Copy `.env.example` to `.env.local` and fill in the Supabase values.
3. Install and start:

   ```
   npm install
   npm run dev
   ```

4. Open http://localhost:3000. The ticket sample is at `/styleguide`.

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

## Database

Migrations live in `supabase/migrations/` and match what is applied to the Supabase project.
After a schema change, regenerate `src/lib/supabase/database.types.ts`.

To make a user an admin, run in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
```

## Tests

The scripts create throwaway users and a test business in the Supabase project, run their checks, then delete everything they made. They need `SUPABASE_SECRET_KEY` in `.env.local`.

```
node --env-file=.env.local scripts/test-redemption.mjs
```

Checks the redemption functions directly, including concurrent verify races, limits, expiry, wrong business, paused coupons, staff invites and Realtime.

```
npm run build
npx next start -p 3100
BASE_URL=http://localhost:3100 node --env-file=.env.local scripts/test-pages.mjs
```

Fetches pages as a shopper, a staff member, an owner and a signed-out visitor, and checks access and content.

```
BASE_URL=http://localhost:3100 node --env-file=.env.local scripts/test-admin-actions.mjs
```

Calls the admin server actions, and the redeem, scanner and staff actions, over HTTP the way the browser does, as an admin, a merchant, a shopper and a signed-out visitor. Needs the same running build. It restores the category order and platform settings afterwards.

```
BASE_URL=http://localhost:3100 node --env-file=.env.local scripts/test-signin-codes.mjs
```

Shopper sign-in with an email code, through the real server actions of a local build: merchants refused, a code signing in and a save carrying on, wrong codes, and the per-email and per-IP limits. The code comes from Supabase's admin `generateLink`, so no email is sent; receiving a real email needs a person with an inbox.

```
BASE_URL=http://localhost:3100 node --env-file=.env.local scripts/test-finish.mjs
```

Phase 7: marketing and legal pages, titles, sitemap, robots, Open Graph image, PWA files and icons, the 404 page, every email (welcome, staff invite, plan started, plan ending, plan ended, coupon removed), the daily job run twice, and account deletion for a shopper and for an owner with a Stripe test plan. Accounts that should get a real email use Resend's test inbox (`delivered+...@resend.dev`), so those emails show in the Resend dashboard but reach no one. It needs `CRON_SECRET` in `.env.local` and stops before calling the daily job if a real plan ends within 7 days.

The camera scanner, the stamp animation and the screen wake lock are not covered here. Test them on real phones.

## Demo data

```
node --env-file=.env.local scripts/seed-demo.mjs            add six demo shops with coupons
node --env-file=.env.local scripts/seed-demo.mjs --remove   remove them
```

Against the production project it refuses unless you add `--production`. Demo owners use `@demo.coupersville.test` addresses, which never receive email.

## Daily job

`vercel.json` runs `/api/cron/daily` at 15:00 UTC. Vercel sends `CRON_SECRET` with it; set the same variable on Vercel. To run it by hand:

```
curl -H "Authorization: Bearer $CRON_SECRET" https://coupersville.com/api/cron/daily
```

Running it twice in a day sends nothing new.

## Open Graph image

`src/app/opengraph-image.jpg` is made from `public/town-sign.jpg` by `node scripts/make-og-image.mjs`. Run it again if the sign changes.
