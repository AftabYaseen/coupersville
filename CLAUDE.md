# Coupersville

A digital coupon web app. Businesses publish coupons, consumers browse and redeem them in store, and the platform owner oversees everything. Built by Devnix Solution for a client.

Read this whole file before writing code. Build one phase at a time (see "Build phases") and stop for review after each.

## Roles

- **Consumer**: browses, searches, saves, and redeems coupons. Sees redemption history.
- **Merchant**: owns a business. Manages profile, store locations, coupons, sees redemption stats, and has a scanner page for staff. Needs an active annual subscription to publish.
- **Admin**: platform owner. Manages merchants, categories, all coupons, subscriptions (can grant free ones), and sees platform stats.

## Stack

- Next.js (latest stable, App Router) with TypeScript, deployed on Vercel
- Tailwind CSS (latest)
- Supabase: Postgres, Auth, Storage, Row Level Security, PostGIS
- `@supabase/ssr` for server and browser clients
- Stripe Billing (Checkout, Customer Portal, webhooks) for the merchant annual plan
- React Hook Form + Zod for forms
- `qrcode` to render QR codes, `html5-qrcode` to scan
- Resend for email
- Later: Capacitor Android wrapper that loads the live site (not part of the web build)

## Supabase access

- Project ref: `aidfrqepbtspddgwjpfw`
- Use the connected Supabase MCP server to apply migrations and inspect the database.
- Every schema change is also saved as a SQL file in `supabase/migrations/` with a timestamped name, so the database can be rebuilt from the repo. Never change the schema without a matching file.
- Env vars live in `.env.local` (already has the two public ones). Keep `.env.example` updated with names only.

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY            # server only, added by the developer
STRIPE_SECRET_KEY              # phase 6
STRIPE_WEBHOOK_SECRET          # phase 6
STRIPE_ANNUAL_PRICE_ID         # phase 6
RESEND_API_KEY                 # phase 7
NEXT_PUBLIC_GOOGLE_MAPS_KEY    # optional, address autocomplete
```

Never print, log, or commit secret values. If a key is missing, stop and ask the developer to add it.

## Product decisions (defaults until the client confirms)

Store these in a single-row `platform_settings` table so they can be changed without code edits.

| Decision | Default |
|---|---|
| Redemption method | QR code with a 6-digit code fallback |
| Coupon moderation | Merchant coupons go live instantly; admin can unpublish |
| Subscription expiry | Coupons are hidden from consumers until the merchant renews |
| Consumer login | Browsing is open; saving and redeeming require an account |
| Plans | One annual plan |
| Region | No restriction |

## Data model

All tables have `id uuid` primary keys, `created_at`, and `updated_at` where it makes sense. Enable RLS on every table.

- **profiles**: `id` (matches `auth.users.id`), `role` (`consumer` | `merchant` | `admin`), `full_name`, `phone`, `status` (`active` | `suspended`). Created by a trigger on signup.
- **categories**: `name`, `slug`, `stock_tint` (`mint` | `pink` | `sky` | `butter`), `sort_order`, `active`. Seed: Restaurants, Grocery, Bakeries, Toys, Jewelry, Clothes, Shoes, Household Supplies, Pharmacy, Luggage/Bags/Wallets, Millinery, Beauty, Other. Rotate the four tints across them.
- **businesses**: `owner_id`, `name`, `description`, `primary_category_id`, `logo_path`, `cover_path`, `contact_email`, `contact_phone`, `website_url`, `status` (`draft` | `active` | `suspended`).
- **business_members**: `business_id`, `user_id`, `role` (`owner` | `manager` | `staff`). Staff can only use the scanner.
- **locations**: `business_id`, `store_name`, `store_number`, `address_line1`, `address_line2`, `city`, `state`, `postal_code`, `geo` (PostGIS `geography(Point)`), `phone`, `active`.
- **coupons**: `business_id`, `category_id`, `title`, `description`, `discount_type` (`percent` | `amount`), `discount_value`, `included_products`, `limits_text`, `min_spend`, `min_qty`, `max_people`, `starts_at`, `expires_at`, `status` (`draft` | `published` | `paused`), `image_path`, `all_locations` (bool), `per_user_limit` (default 1), `total_limit` (nullable), `featured` (bool, admin only), `created_by`.
- **coupon_locations**: `coupon_id`, `location_id` (used when `all_locations` is false).
- **favorites**: `user_id`, `coupon_id`, unique together.
- **redemption_tokens**: `coupon_id`, `user_id`, `token` (random, for the QR), `short_code` (6 digits), `expires_at` (5 minutes), `used_at`.
- **redemptions**: `coupon_id`, `user_id`, `business_id`, `location_id`, `token_id`, `method` (`qr` | `code`), `verified_by`, `redeemed_at`.
- **subscriptions**: `business_id` (unique), `source` (`stripe` | `complimentary`), `stripe_customer_id`, `stripe_subscription_id`, `status` (`active` | `past_due` | `canceled` | `expired`), `current_period_end`, `cancel_at_period_end`.
- **platform_settings**: single row holding the decisions above.

"Expired" is never stored on a coupon. A coupon is live when `status = 'published'`, now is between `starts_at` and `expires_at`, the business is active, and its subscription is active. Put this in a view or SQL function (`live_coupons`) and have every consumer query use it.

### Access rules (RLS)

- Consumers: read live coupons, categories, active businesses and locations. Read and write only their own favorites, tokens, and redemption history.
- Merchants: full access to their own business, locations, and coupons through `business_members`. Read redemptions for their business. No access to other businesses' drafts or data.
- Admins: everything. Check the role with a `security definer` helper function (`is_admin()`), not by trusting the client.
- `featured`, business `status`, and subscription rows are writable by admins and server code only.

### Redemption (must be atomic)

Two Postgres functions, both `security definer`:

1. `create_redemption_token(coupon_id)`: called by the logged-in consumer. Confirms the coupon is live and the user is under `per_user_limit`, then returns a token and short code valid for 5 minutes.
2. `verify_redemption(token_or_code, location_id)`: called by a member of the coupon's business. In one transaction it locks the token row, checks it is unused and unexpired, rechecks the coupon is live, the location is eligible, and the per-user and total limits, then marks the token used and inserts the redemption. Returns a clear result code for each failure case (expired, already used, wrong business, limit reached).

No redemption logic in frontend code. Minimum spend and quantity are shown to staff on the confirm screen for them to check by eye.

### Storage

Buckets `logos` and `coupon-images`, public read, write restricted to members of the owning business. Accept JPG, PNG, WebP up to 5 MB. Use Next.js `Image` for resizing.

## Routes

```
/                       home: featured, categories, near me
/c/[category]           category listing
/search                 search and filters
/coupon/[id]            coupon detail, save, redeem
/redeem/[tokenId]       QR + short code with countdown
/saved  /history  /account
/login  /signup  /reset-password

/merchant               dashboard and stats
/merchant/onboarding    business profile, first location
/merchant/business  /merchant/locations
/merchant/coupons  /merchant/coupons/new  /merchant/coupons/[id]
/merchant/scan          staff scanner + code entry
/merchant/billing

/admin                  platform stats
/admin/merchants  /admin/coupons  /admin/categories
/admin/subscriptions  /admin/settings
```

Protect `/merchant` and `/admin` in middleware and again on the server in each page.

## Brand and UI

The idea: Coupersville is a town, and coupons are printed tickets from its shops. The look is two-ink printing on ticket stock. It must not look like a generic SaaS template.

### Colour tokens

```
--ink:        #1B2A8F   primary, outlines, buttons
--ink-deep:   #121A4D   body text (use instead of black)
--marigold:   #FFB81C   discount values, key highlights
--paper:      #F2F4F8   page background
--white:      #FFFFFF   surfaces
--signal:     #D8342C   expiring soon and errors only
--stock-mint:   #CFEBDD
--stock-pink:   #F9D2DC
--stock-sky:    #CFE2F7
--stock-butter: #FBEBB0
```

Each category has a stock tint. A coupon ticket uses its category's tint as its background, so colour carries meaning.

### Type

One family: **Archivo** (variable, via `next/font/google`, with the width axis enabled).

- Offer text ("20% OFF", "$5 OFF"): width 62 to 75, weight 800 to 900, tight line height, large.
- Everything else: normal width, weights 400, 500, 600.
- Sentence case everywhere. Tabular numerals for dates, counts, and money.

### Shape

- The coupon is a **ticket**, not a card: half-circle notches cut into the left and right edges, and a dashed perforation line between the offer side and the stub (expiry, limits, store). Build it as one reusable `<Ticket>` component.
- Flat. No box shadows, no gradients, no glass effects.
- 1.5px `--ink` outlines where separation is needed.
- Buttons: solid `--ink` with white text, 4px radius. Secondary buttons: ink outline. No pill buttons.
- Mobile first. Design every consumer screen at 380px wide before scaling up. Tap targets at least 44px.

### Imagery and identity (client update, 2026-10-08)

- Name stays "Coupersville". No logo or wordmark for now; the header uses plain text.
- `public/Img-1.jpeg` (the welcome sign) appears only on the home page, as a postcard: natural size up to 800px wide, white surface, 1.5px ink outline, no text over it, via `next/image`. Not on sign-in or sign-up.
- `public/Img-2.jpeg` (shop interior) is reference for the long-term look. Do not use it anywhere yet.
- Palette confirmed: keep the ink and marigold tokens above. No palette change.
- Long-term vision, targeted around March 2027: the site feels like a small town, and opening a category feels like walking into that shop to see its coupons. Until then, build for function.

### The one animated moment

When a redemption is verified, the consumer's redeem screen shows an ink stamp reading "Redeemed" with the date, rotated a few degrees, pressing onto the ticket, and the stub tears away. Respect `prefers-reduced-motion`. No other decorative animation anywhere: no fade-in-on-scroll, no hover effects on every card.

### Do not use

- Purple or blue gradients, glassmorphism, soft grey drop shadows
- Inter, Poppins, Space Grotesk, or any serif display font
- Cream backgrounds, terracotta accents, near-black with neon accents
- All-caps labels with wide letter spacing, small labels above every heading
- Monospace fonts for data labels
- Arrows appended to button or link text
- Emoji as icons (use `lucide-react`, 1.5px stroke, ink colour)
- Em dashes anywhere in UI copy or docs

### Copy

Plain, short, sentence case. Buttons say what happens: "Save coupon", "Redeem now", "Publish coupon". The same action keeps the same name across the flow. Light town flavour in a few headings only ("Welcome to Coupersville", "New on Main Street"). Errors say what went wrong and what to do next. Empty screens invite an action.

## Build phases

Stop after each phase, summarise what was built, and list anything the developer needs to do or decide.

1. **Foundation**: scaffold Next.js, Tailwind tokens, Archivo, base layout, `<Ticket>` component with a sample page, all migrations (schema, RLS, functions, seed categories), Supabase clients, auth pages, role-based redirects, middleware.
2. **Merchant portal**: onboarding, business profile, locations, coupon builder with image upload, coupon list by status. Until Stripe exists, a merchant can publish only if an admin has granted a complimentary subscription (insert one manually for testing).
3. **Consumer app**: home, categories, search and filters, near me, coupon detail, save, saved list.
4. **Redemption**: redeem screen with QR, code, and countdown; merchant scanner page with camera scan and code entry; confirm screen showing limits for staff; the stamp moment; consumer history; merchant stats.
5. **Admin portal**: merchants, coupons, categories, complimentary subscriptions, settings, platform stats.
6. **Billing**: Stripe Checkout for the annual plan, Customer Portal, webhook handler as the only writer of Stripe subscription status.
7. **Finish**: Resend emails (verification, reset, subscription notices), PWA manifest and icons, offline page, account deletion, empty and error states, accessibility pass, seed script with demo businesses and coupons.

## Working rules

- TypeScript strict. Generate Supabase types after each migration and use them.
- Server Components and Server Actions by default; client components only where interaction needs them.
- Validate every form and action input with Zod on the server.
- Never expose the secret key to the browser.
- Commit after each meaningful step with a clear message.
- Do not add features outside this file without asking.
