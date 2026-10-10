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

Both scripts create throwaway users and a test business in the Supabase project, run their checks, then delete everything they made. They need `SUPABASE_SECRET_KEY` in `.env.local`.

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

The camera scanner, the stamp animation and the screen wake lock are not covered here. Test them on real phones.
