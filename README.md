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
