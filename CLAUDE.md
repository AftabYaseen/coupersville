# Coupersville

A digital coupon web app. Businesses publish coupons, consumers browse and redeem them in store, and the platform owner oversees everything. Built by Devnix Solution for a client.

Read this whole file before writing code. Build one phase at a time (see "Build phases") and stop for review after each.

## Roles

- **Consumer**: browses, searches, saves, and redeems coupons. Sees redemption history.
- **Merchant**: owns a business. Manages profile, store locations, coupons, sees redemption stats, and has a scanner page for staff. Needs an active plan to publish.
- **Admin**: platform owner. Manages merchants, categories, all coupons, subscriptions (can grant free ones), and sees platform stats.

## Stack

- Next.js (latest stable, App Router) with TypeScript, deployed on Vercel
- Tailwind CSS (latest)
- Supabase: Postgres, Auth, Storage, Row Level Security, PostGIS
- `@supabase/ssr` for server and browser clients
- Payments: Authorize.net (billing Part B, 2026-11-05). Cards are entered only on Authorize.net's hosted pages (Accept Hosted for checkout, the hosted profile page for Update card); card data never reaches our servers. `AUTHORIZE_NET_ENV` picks the endpoint, and nothing calls the production endpoint unless it is `production`.. Stripe was removed on 2026-11-11 (code, package, webhook, env vars and tables)
- React Hook Form + Zod for forms
- `qrcode` to render QR codes, `html5-qrcode` to scan
- Resend for email
- Later: Capacitor Android wrapper that loads the live site (not part of the web build)

## Domain

- Live site: **https://coupersville.com** (primary domain). `www.coupersville.com` redirects to it. Hosted on Vercel.
- `NEXT_PUBLIC_SITE_URL` holds the live address, `https://coupersville.com` (set in `.env.local` and on Vercel). It is read at build time, so changing it needs a redeploy. Every absolute link the app sends out (auth email links, staff invite links, `metadataBase`) is built from it through `src/lib/site.ts`. Never build links from request headers or hard-code a domain.
- Supabase Auth Site URL (`https://coupersville.com`, redirect URLs `https://coupersville.com/**`) and the Authorize.net return and webhook URLs all point at this domain. Webhooks must use the primary domain, since a redirect is not followed.

## Supabase access

- Project ref: `aidfrqepbtspddgwjpfw`
- Use the connected Supabase MCP server to apply migrations and inspect the database.
- Every schema change is also saved as a SQL file in `supabase/migrations/` with a timestamped name, so the database can be rebuilt from the repo. Never change the schema without a matching file.
- Env vars live in `.env.local` (already has the two public ones). Keep `.env.example` updated with names only.

```
NEXT_PUBLIC_SITE_URL           # https://coupersville.com
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY            # server only, added by the developer
AUTHORIZE_NET_API_LOGIN_ID     # billing Part B
AUTHORIZE_NET_TRANSACTION_KEY
AUTHORIZE_NET_SIGNATURE_KEY    # verifies X-ANET-Signature on webhooks
AUTHORIZE_NET_ENV              # sandbox | production; .env.local is always sandbox
RESEND_API_KEY                 # phase 7
EMAIL_FROM                     # sender on mail.coupersville.com, for example "Coupersville <hello@mail.coupersville.com>"
CRON_SECRET                    # Vercel Cron sends it as a Bearer token to /api/cron/daily
```

Never print, log, or commit secret values. If a key is missing, stop and ask the developer to add it.

## Product decisions (defaults until the client confirms)

Store these in a single-row `platform_settings` table so they can be changed without code edits.

| Decision | Default |
|---|---|
| Redemption method | QR code with a 6-digit code fallback |
| Coupon moderation | Merchant coupons go live instantly; admin can unpublish (an admin hold the merchant cannot undo) |
| Subscription expiry | Coupons are hidden from consumers until the merchant renews |
| Consumer login | Browsing is open; saving and redeeming require an account. Shoppers sign in with a 6-digit email code (no password); merchants and admins use email and password |
| Plans | Offers as data (`offers` table, `/admin/offers`): Pioneer Circle, Early Bird, Main Street, Boulevard, Build Your Route (renamed 2026-11-12; codes unchanged) |
| Publishing opens | 2026-11-01 00:00 Pacific (`publishing_opens_at`). Before then merchants sign up and save drafts |
| Founding free seat rule | Profile complete and first coupon published (`founders_rule`; or profile complete only) |
| Founders seats fill early | Early Bird applies straight away (`founders_full_early_access`), pending client confirmation |
| Region | No restriction |

## Data model

All tables have `id uuid` primary keys, `created_at`, and `updated_at` where it makes sense. Enable RLS on every table.

- **profiles**: `id` (matches `auth.users.id`), `role` (`consumer` | `merchant` | `admin`), `full_name` (optional), `status` (`active` | `suspended`). Created by a trigger on signup.
- **categories**: `name`, `slug`, `description` (one sentence for category cards and pages), `shop_label` (no longer shown to shoppers; new categories copy the name), `stock_tint` (`mint` | `pink` | `sky` | `butter`), `sort_order`, `active`. Names from the client's copy deck (2026-11-10), in sentence case: Eat & drink, Groceries & markets, Bakeries & sweets, Toys & gifts, Jewelry, Fashion & clothing, Shoes, Home & household, Pharmacy & wellness, Bags & luggage, Hats & millinery, Beauty & grooming, More around town. Slugs never change, so links keep working. Rotate the four tints across them.
- **businesses**: `owner_id`, `name`, `description`, `primary_category_id`, `logo_path`, `cover_path`, `contact_email`, `contact_phone`, `website_url`, `status` (`draft` | `active` | `suspended`), `timezone` (IANA name; coupon dates are calendar days in this zone), `pioneer_welcome_seen_at` (when the owner saw the Pioneer Circle welcome; server code only). Onboarding creates the business as `draft`; server code sets it `active` once the profile and first store are saved. `owner_id` is empty once the owner has deleted their account; the business is then suspended.
- **business_members**: `business_id`, `user_id`, `role` (`owner` | `manager` | `staff`). Staff can only use the scanner.
- **locations**: `business_id`, `store_name`, `store_number`, `address_line1`, `address_line2`, `city`, `state`, `postal_code`, `country` (optional), `geo` (PostGIS `geography(Point)`), `phone`, `active`.
- **coupons**: `business_id`, `category_id`, `title`, `description`, `discount_type` (`percent` | `amount` | `fixed_price` | `free`), `discount_value` (the percent, the amount off, or the price; empty for `free`), `included_products`, `limits_text`, `exclusions` (shown under Good to know, "None stated" when empty, and to staff on the confirm screen), `min_spend`, `min_qty`, `max_people`, `starts_at`, `expires_at`, `status` (`draft` | `published` | `paused`), `image_path`, `all_locations` (bool), `per_user_limit` (default 1; empty means unlimited during the promotion), `redeem_frequency` (`day` | `week`, optional), `schedule_days` (ISO weekdays 1 to 7, optional), `schedule_start` / `schedule_end` (optional daily window), `total_limit` (nullable), `featured` (bool, admin only), `created_by`, `admin_hold` (bool), `hold_reason`, `held_by`, `held_at`, `visibility` (`public` | `private`, see Just for You), `private_key` (set by the database for a private coupon, never changes).
- **Just for You** (client, 2026-11-12): the builder asks "Who can see this offer?": "Everyone: appears publicly on Coupersville" (default) or "Just for You: private offer for one customer". Merchants see the exact label "Private Offer – Just for You" (`src/lib/just-for-you.ts`; the only place with that dash), shoppers see "Just for You". A private coupon is left out of `live_coupons`, so it never appears on the home page, search, categories, Explore, featured rows or the sitemap, and the coupons table hides it from shoppers; it can never be featured. It opens only at `/just-for-you/[key]` through `private_offer(key)` (128-bit random key; noindex, no referrer, disallowed in robots.txt), and `create_redemption_token` needs that key. Its `total_limit` is fixed at 1 by the database; every other rule still applies, and after it is redeemed the link says "This offer has been used." It cannot be saved to a list. Who can see a coupon cannot change after its first publish. After publishing, the coupon page shows the link with Copy link; Coupersville sends no email. The scanner and redemption work as normal; staff see "Just for You" on the confirm screen (`redemption_offer.just_for_you`), and stats count it like any coupon. No personal data is stored about the recipient. Only a public coupon can claim a free Pioneer Circle seat: `claim_founding_seat` returns `coupon_private` for a Just for You offer, which stays a draft, and the next public coupon claims the seat. Allowance per business per month (client, 2026-11-12): Pioneer Circle 5, Early Bird 5, Main Street 8, Boulevard 12, shown on Business membership and as "X of 5 Just for You offers used this month".
- **Admin hold**: an admin unpublishes a coupon by setting `admin_hold` with an optional reason; the database fills in `held_by` and `held_at`. A held coupon is never live, so it is left out of `live_coupons` and every redemption check. The merchant sees it as "Removed by Coupersville" with the reason, cannot resume or republish it, and can still edit it, or delete it if it was never redeemed. Only an admin can release the hold, which returns the coupon to the merchant's own status.
- **coupon_locations**: `coupon_id`, `location_id` (used when `all_locations` is false).
- **favorites**: `user_id`, `coupon_id`, unique together.
- **redemption_tokens**: `coupon_id`, `user_id`, `token` (random, for the QR), `short_code` (6 digits), `expires_at` (5 minutes), `used_at`.
- **redemptions**: `coupon_id`, `user_id`, `business_id`, `location_id`, `token_id`, `method` (`qr` | `code`), `verified_by`, `redeemed_at`.
- **Redemption rules**: per customer once, up to N times, or unlimited; optionally at most once per calendar day or week (weeks start Monday); optionally only on some weekdays and inside a time window (start included, end excluded). Days, weeks and times are in the business timezone. `coupon_rule_problem` enforces them inside `create_redemption_token`, `preview_redemption` and `verify_redemption` (results `outside_schedule`, `user_limit_reached`, `frequency_limit`, `total_limit_reached`). A coupon outside its schedule is still live and listed; the app shows the rules in words (`src/lib/rules.ts`) and greys out Redeem with when it is next available.
- **staff_invites**: `business_id`, `email` (lowercase), `token` (random, for the join link), `invited_by`, `expires_at` (14 days), `accepted_at`, `accepted_by`. Owners create them; `accept_staff_invite` adds the member when the signed-in email matches.
- **auth_code_requests**: `kind` (`send` | `verify`), `email_hash`, `ip_hash` (keyed hashes, never the address), `created_at`. Rate limits for shopper sign-in codes through `register_auth_code_request`: sending 3 per email per 10 minutes and 10 a day, 10 per IP per 10 minutes and 50 a day; checking 10 per email per 10 minutes and 30 a day, 30 per IP per 10 minutes and 200 a day. Server code only.
- **subscriptions**: `business_id` (unique), `source` (`complimentary` | `authorize_net`), `status` (`active` | `past_due` | `canceled` | `expired`), `current_period_end`, `cancel_at_period_end`, `past_due_since`, `offer_code` (the offer a plan came from; `founding_merchant` on a free seat).
- **offers**: `code` (primary key), `name`, `window_starts_at` / `window_ends_at` (sign-up window, end exclusive, null is open), `seat_cap`, `free_seats`, `term_months` (12, or null for ongoing), `annual_price_cents`, `monthly_price_cents` (null is annual only), `renews_into`, `active`, `max_locations` (enforced), `campaigns_per_location` (campaigns per open location per month, enforced), `private_offers_per_month` (Just for You allowance per business, enforced), `max_live_coupons` (stored, not enforced); null is unlimited; `sort_order`. Names (client round 3, 2026-11-12) by code: `founding_merchant` Pioneer Circle, `early_access` Early Bird, `general` Main Street, `merchant_plus` Boulevard, `enterprise` Build Your Route. Codes never change. Every page, email and admin screen reads names from the table (`src/lib/offer-names.ts`, or the offer row it already has), so a rename is one edit in Admin > Offers; never hard-code a level name. Seeded: Pioneer Circle (Nov 1, 2026 to Jan 31, 2027, 200 seats, first 50 free, $99 a year or $12 a month, 12 months, renews into Main Street on the same cycle), Early Bird (Feb 1 to Jun 30, 2027, $149 a year or $19 a month, 12 months, renews into Main Street), Main Street (from Jul 1, 2027, $249 or $29, ongoing), Boulevard ($499 or $49, inactive), Build Your Route (inactive, admin only, no price, no checkout: an admin grants it on the merchant page with its own limits). Pioneer Circle, Early Bird and Main Street include 1 location and 10 campaigns per location a month; Boulevard 3 locations and 20 per location. Just for You offers a month: Pioneer Circle 5, Early Bird 5, Main Street 8, Boulevard 12 (client, 2026-11-12). Admins read and edit; merchants read active offers with seats used through `offer_overview()`. Never deleted, only deactivated; the seat cap and free seats cannot go below the seats taken.
- **offer_seat_claims**: `offer_code`, `business_id`, `seat_number`, `free`, `coupon_id`, `claimed_by`, `claimed_at`. One per business per offer; seat numbers never repeat. Permanent: revoking the plan does not give the seat back. Written only by `claim_founding_seat`.
- **Founding free seats**: `claim_founding_seat(business_id, coupon_id)` (security definer) checks that publishing is open, the business is active (profile and first store saved), it has no current plan, the rule is met, and the Founding offer is active, in its window and has free seats. It locks the offer row, so two merchants claiming the last seat at once get exactly one claim, then in one transaction records the claim, gives a 12-month complimentary plan with `offer_code`, and publishes the coupon. A merchant without a plan can publish only through it, so no plan-less coupon is ever live. When the free seats are gone the coupon stays a draft and Billing shows "Pioneer Circle: $99 a year or $12 a month for your first year" with "Payments open soon". In Part A a free-seat plan just ends after 12 months; renewing into Main Street needs the payment processor.
- **coupon_campaigns**: `business_id`, `coupon_id` (unique, emptied if the coupon is deleted), `month` (first day, business timezone), `kind` (`campaign` | `private`: which allowance it used, fixed when counted), `counted_at`. One row per coupon's first publish, so deleting a coupon never gives a campaign back. Written only by the `count_coupon_campaign` trigger.
- **business_limit_overrides**: `business_id` (primary key), `max_locations`, `campaigns_per_month` (a total for the business, replacing per location times open stores; null uses the plan), `updated_by`. Admins write it from `/admin/merchants/[id]`; it stays until an admin clears it.
- **Limits**: a business's limits are its override, else its plan's offer, else Main Street (`general`) (a grant with no offer, or no plan). A campaign is a coupon's first publish; editing, pausing and resuming do not count; a free seat's first coupon counts as one. The monthly campaign allowance is the offer's campaigns per location times the business's open (active) stores, unless an admin override sets a total. Just for You offers count against their own allowance (`private_offers_per_month`), or as campaigns when `platform_settings.private_offers_count_as_campaigns` is on (Admin > Settings, off by default; it applies to first publishes from then on). Counted per business per calendar month in its timezone, resetting on the 1st, no rollover. `count_coupon_campaign` and `enforce_location_limit` refuse signed-in users over the limit (hints `campaign_limit`, `private_limit`, `location_limit`); server code and the SQL editor are not refused, but first publishes still count. Only active stores count, and lowering a limit closes nothing. `business_usage` gives owners, managers and admins the numbers; `src/lib/limits.ts` words them. The site's contact address is `platform_settings.enterprise_contact_email` and the promised reply time `contact_response_time` (both in Admin > Settings; `src/lib/site-contact.ts`).
- **Billing rules**: a plan is current (`plan_is_current`) when it is active and not past its end date (paid plans get one extra day for a late renewal), or when a paid plan is past due for under 7 days. A paid plan that starts replaces a complimentary one. An admin can grant a complimentary plan only once a paid plan has lapsed. Checkout, the Customer Portal and the success page were removed in billing Part A.
- **Paid billing (Authorize.net, Part B)**: `src/lib/paid-billing.ts`, `src/lib/authorize-net.ts`.
  - **Buying**: when `payments_open` is on, Billing offers the current offer with annual or monthly. Before payment the merchant ticks a box next to the automatic-renewal terms (price, cycle, renewal date, renewal price, how to cancel; New York GBL 527-a, `src/lib/renewal-terms.ts`); the wording and time are recorded in `renewal_consents` and repeated in the plan started email. Paid Founding seats are held for 30 minutes under the offer lock (`begin_paid_checkout`), and Founding is bought only once its free seats are gone.
  - **Confirming**: checkout only authorises. The return page, the webhook (`/api/authorize-net/webhook`, X-ANET-Signature checked, duplicates ignored) and the daily sweep each confirm with getTransactionDetails, take a lock (`checkout_start_resolving`), then capture, or void if the seat is gone; `checkout_finish` records it once. A payment is captured exactly once, whichever path gets there first. The return page keeps confirming for a few seconds, because Authorize.net lists a new payment 10 to 20 seconds late. Admins are emailed about a checkout unresolved after 24 hours or a renewal with an unknown result.
  - **Renewals**: our own daily job, only while the `renewals_enabled` setting is on (off at launch). It charges the saved card at the offers-table price on the renewal date (a 12-month term renews into its `renews_into` offer), retries on days 1, 3 and 7 with a 7-day grace, sends one payment failed email per period, then ends the plan. Each attempt has a unique key per plan, period and day, so a second run never charges twice; an unknown or held result is settled later by transaction id or invoice. Reminders go out 60 and 30 days ahead; a free Founding seat gets add-a-card reminders and, with a card, continues on Main Street.
  - **Cancelling**: Cancel renewal on Billing, any time; the plan lasts to the end of the paid period, no partial refunds. Billing history shows date, amount, last 4 and status.
  - **Admin test**: `/admin/merchants/[id]` has Test checkout, which buys the admin-only $1.00 `admin_test` offer (inactive, `admin_only`, no seat cap): merchants never see it, and it claims no Founding seat.
- **checkouts**, **payments**, **renewal_attempts**, **renewal_consents**, **anet_events**: the Part B billing records. Server code writes them; managers and admins read their own business's checkouts, payments and agreements.
- **email_notices**: `kind`, `ref` (primary key together), `sent_at`. Emails that must go out once: server code claims the row before sending and releases it if the send fails. Server code only.
- **platform_settings**: single row holding the decisions above. `/admin/settings` shows only the settings the app acts on (plan expiry, publishing open date, the Founding seat rule, what happens when Founding seats fill, payments, renewals, and whether Just for You offers count as campaigns). The others, and the retired `plans` column, stay in the table, out of the UI, until they are built.

"Expired" is never stored on a coupon. A coupon is live when `status = 'published'`, it is not under an admin hold, now is between `starts_at` and `expires_at`, the business is active, and its subscription is active. Put this in a view or SQL function (`live_coupons`) and have every consumer query use it.

### Access rules (RLS)

- Consumers: read live coupons, categories, active businesses and locations. Read and write only their own favorites, tokens, and redemption history.
- Merchants: full access to their own business, locations, and coupons through `business_members`. Read redemption counts for their business only through `business_redemption_stats`; they cannot read redemption rows, which carry the shopper's user id. Merchant and staff screens never show a shopper's email or name. No access to other businesses' drafts or data.
- Admins: everything. Check the role with a `security definer` helper function (`is_admin()`), not by trusting the client.
- `featured`, business `status`, and subscription rows are writable by admins and server code only.

### Redemption (must be atomic)

Two Postgres functions, both `security definer`:

1. `create_redemption_token(coupon_id)`: called by the logged-in consumer. Confirms the coupon is live and passes its redemption rules for this shopper, then returns a token and short code valid for 5 minutes.
2. `verify_redemption(token_or_code, location_id)`: called by a member of the coupon's business. In one transaction it locks the token row, checks it is unused and unexpired, rechecks the coupon is live, the location is eligible, and the per-user and total limits, then marks the token used and inserts the redemption. Returns a clear result code for each failure case (expired, already used, wrong business, limit reached).

No redemption logic in frontend code. Minimum spend and quantity are shown to staff on the confirm screen for them to check by eye.

### Storage

Buckets `logos` and `coupon-images`, public read, write restricted to members of the owning business. Accept JPG, PNG, WebP up to 5 MB. Use Next.js `Image` for resizing.

### Email

Sent through Resend's HTTP API from `src/lib/email/` (brand templates in `templates.ts`, each with a plain text version). A failed send never undoes the action that caused it, and addresses on reserved domains (example.com, .test) are skipped, so tests send nothing. Sign-in codes, confirmation and reset links are Supabase Auth emails (Resend SMTP, templates in the Supabase dashboard).

| Email | When | Sent once by |
|---|---|---|
| Welcome | First sign-in of an account made in the last 2 days | `email_notices` (user id) |
| Staff invite | Owner invites staff; the copy-link stays as a fallback | the invite itself |
| Plan started | A paid plan is captured (with the agreed renewal terms), an admin grants a new complimentary plan, or a merchant claims a Founding seat (Founding wording) | `email_notices` |
| Payment failed | A renewal is declined (once per plan period; retried on days 1, 3 and 7) | `email_notices` (business + period end) |
| Plan ending in 7 days | Daily job: complimentary, or renewal turned off, ending within 7 days | `email_notices` (plan + end date) |
| Renewal reminder | 60 and 30 days before a paid plan renews, with date and price (only while renewals are on) | `email_notices` (business + end date) |
| Add a card | 60 and 30 days before a free Founding seat ends | `email_notices` (business + end date) |
| Card saved | A free Founding seat adds a card, repeating the agreed renewal terms | `email_notices` (agreement id) |
| Billing alert (admins) | A checkout unresolved after 24 hours, a renewal with an unknown result or held for review | `email_notices` (record + admin) |
| Plan ended | Daily job: plan stopped being current in the last 7 days (not past due) | `email_notices` (plan + end date) |
| Coupon removed by Coupersville | Admin puts a coupon on hold | `email_notices` (coupon + held at) |

Business emails go to the owner's sign-in address.

### Pricing

Prices are read from `offers` everywhere: `/business-membership` (public, confirmed by the client's pricing sheet and copy deck, 2026-11-11; `src/lib/membership.ts` builds each level's dates, seats, limits and annual savings from the table), `/merchant/billing` and `/admin/offers`. Public pages never promise unlimited coupons or locations.

### Shopper sign-in and data

- "Save coupon" and "Redeem now" when signed out open a bottom sheet on the same page: email, then the code from the email (Supabase email OTP, `signInWithOtp` and `verifyOtp`). The action then carries on. New accounts made this way are shoppers; the name is optional and set in Account. Merchant and admin emails are refused and pointed to password sign-in.
- Per shopper we store: the auth account (email, optional password hash, sign-in times), the profile (role, optional name, status), saved coupons, redemption codes and redemptions. Unused redemption codes are deleted a day after they expire by the hourly `purge_stale_codes` cron job; a code linked to a redemption is never deleted.
- Deleting an account (Account page, type "delete" to confirm) removes the sign-in, profile, saved coupons and redemption codes. Redemptions stay with `user_id` and `verified_by` emptied, so counts stay right. An owner's businesses are suspended, their contact email, phone and website cleared, their staff and every staff invite (accepted or waiting) removed, and a paid plan stops renewing (it lasts to the end of the period already paid for). Admin accounts cannot be deleted from the app.
- Near me rounds the location to 3 decimal places (about 110 m) and keeps it in a 30-minute HttpOnly `cpv_near` cookie (`src/lib/near-me.ts`). The search address carries only `near=1`, so coordinates never appear in URLs or request logs, and they are never stored.
- An admin can delete a business from `/admin/merchants/[id]` after typing its name (`src/lib/business-deletion.ts`). With no payments, redemptions or Founding seat it is deleted completely, with its images. Otherwise only the business name, store addresses, plan and payment records, the Founding seat and the redeemed coupons (for redemption counts) are kept; contact details, store phones, images, unredeemed coupons, the team and invites are removed, and the plan stops renewing.
- No third-party scripts or trackers on any page. Fonts are self-hosted at build time.

## Routes

```
/                       home: featured, categories, near me
/c/[category]           category listing
/search                 search and filters (category, discount type, business name, available now, ending soon; sort newest, nearest, ending soon, biggest savings: free, then percent off, then dollars off, then fixed price)
/coupon/[id]            coupon detail, save, redeem
/just-for-you/[key]     a Just for You private offer, by its private link only (redeem, no save)
/redeem/[tokenId]       QR + short code with countdown
/saved  /history  /account  /account-deleted
/login  /signup  /reset-password   /login uses the deck page 18 merchant copy (plain wording when a shopper returns to a shopper page); /signup?type=merchant is the deck page 16 business sign-up: the details wait in the account metadata (business_signup) and fill in /merchant/onboarding after the email is confirmed, so an unconfirmed address never creates a business
/explore               every category with its description and live deal count
/pioneer-circle        the client's Pioneer Circle text (2026-11-11): expectations, nothing to sign; name and seat count from offers (src/lib/pioneer.ts, cached an hour). Linked from the home and For businesses callouts, Business membership, the footer, the free-seat email and Pioneer dashboards. Honorary Pioneer, seat reopening and surveys are described but not built
/faq                   the client's FAQ, collapsible, grouped by her headings, three answers corrected to match the app; linked from the footer, How to save and Business membership
/how-to-save  /for-businesses  /business-membership  /about   marketing pages, linked in header and footer (/how-it-works redirects to /how-to-save)
/contact               form emailed to the contact address (Resend, Reply-To the sender; honeypot field; per email and IP limits as kind 'contact' in auth_code_requests; nothing stored)
/privacy  /terms        drafts for the client's lawyer, linked in footer, sign-in sheet, signup

/merchant               dashboard and stats
/merchant/onboarding    business profile, first location; finishing it while the founding offer window is open goes to /merchant/welcome
/merchant/welcome       the Pioneer Circle page once, with "Got it, take me to my dashboard" (opening it records pioneer_welcome_seen_at)
/merchant/business  /merchant/locations
/merchant/coupons  /merchant/coupons/new  /merchant/coupons/[id]
/merchant/scan          staff scanner + code entry
/merchant/staff         owner invites and removes staff
/merchant/billing       plan state, current offer, seats left, Claim free seat, Continue to payment, Update card, Cancel renewal
/merchant/billing/history  payments: date, amount, last 4, status
/join                  permanent short address on the client's printed QR code: 307 to /signup?type=merchant (next.config.ts). Never change or remove it; the destination may move
/join/[token]           staff accept an invite
/api/authorize-net/webhook  Authorize.net events (signature checked; confirms payments, refreshes saved cards)
/api/cron/daily         Vercel Cron (vercel.json): confirm open checkouts, renewals and reminders (when on), plan ending in 7 days, plan ended

/admin                  platform stats
/admin/merchants  /admin/coupons  /admin/categories
/admin/subscriptions  /admin/offers  /admin/settings
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
- `public/town-sign.jpg` (the welcome sign, 1666px wide) appears only on the home page, as a postcard in the hero (client round 3, 2026-11-12: below "Local offers. Local shoppers. One simple marketplace." and its supporting line; beside the headline on wide screens, above it on a phone): shown up to 560px wide, white surface, 1.5px ink outline, no text over it, via `next/image`. Not on sign-in or sign-up. (Client update 2026-10-19: replaces the earlier `Img-1.jpeg`, which is deleted.)
- `public/Img-2.jpeg` (shop interior) and `public/coffee-shop.jpg` are reference for the long-term look. Both are git-ignored. Do not use them anywhere yet.
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

Public and merchant wording follows the client's copy deck (`docs/Coupersville_Website_Copy_Deck.pdf`, 2026-11-10), in sentence case, with no all-caps eyebrows. Shared lines live in `src/lib/site-copy.ts`. Shoppers browse freely but sign up with their email before saving or redeeming: never write that no account is needed; use `ACCOUNT_LINE` ("No password, no app, no printing. Just enter your email and a one-time code the first time you redeem."). Coupon pages show each coupon's real rules, never a fixed "One per customer". The Pioneer Circle (founding offer) callout reads its name, dates and free seats from `offers` (`src/lib/founding-callout.ts`).

Phase 3 of the deck (2026-11-12): Get my coupon opens "Ready to use this deal?" with Generate my QR coupon and Not yet, so no code or timer starts until Generate. The coupon page has a breadcrumb (Coupersville > category > business) and Get directions links that open the store address in Apple Maps or Google Maps only when tapped (nothing from a maps service loads with the page). Good to know comes from `src/lib/good-to-know.ts`, shared with the builder's Preview coupon. Publish now asks "Publish this coupon now?" first. The dashboard shows Redemptions this month (`business_redemption_stats.this_month`, calendar month in the business timezone).


Plain, short, sentence case. Buttons say what happens: "Save coupon", "Redeem now", "Publish coupon". The same action keeps the same name across the flow. Light town flavour in a few headings only ("Welcome to Coupersville", "New on Main Street"). Errors say what went wrong and what to do next. Empty screens invite an action.

## Build phases

Stop after each phase, summarise what was built, and list anything the developer needs to do or decide.

1. **Foundation**: scaffold Next.js, Tailwind tokens, Archivo, base layout, `<Ticket>` component with a sample page, all migrations (schema, RLS, functions, seed categories), Supabase clients, auth pages, role-based redirects, middleware.
2. **Merchant portal**: onboarding, business profile, locations, coupon builder with image upload, coupon list by status. Until payments exist, a merchant can publish only if an admin has granted a complimentary subscription (insert one manually for testing).
3. **Consumer app**: home, categories, search and filters, near me, coupon detail, save, saved list.
4. **Redemption**: redeem screen with QR, code, and countdown; merchant scanner page with camera scan and code entry; confirm screen showing limits for staff; the stamp moment; consumer history; merchant stats.
5. **Admin portal**: merchants, coupons, categories, complimentary subscriptions, settings, platform stats.
6. **Billing**: originally Stripe (removed 2026-11-11). Billing Part A (2026-10-31) replaced Checkout and the portal with offers and Founding free seats; Part B adds the payment processor.
7. **Finish**: Resend emails (verification, reset, subscription notices), PWA manifest and icons, offline page, account deletion, empty and error states, accessibility pass, seed script with demo businesses and coupons.

## Working rules

- TypeScript strict. Generate Supabase types after each migration and use them.
- Server Components and Server Actions by default; client components only where interaction needs them.
- Validate every form and action input with Zod on the server.
- Never expose the secret key to the browser.
- Commit after each meaningful step with a clear message.
- Do not add features outside this file without asking.
