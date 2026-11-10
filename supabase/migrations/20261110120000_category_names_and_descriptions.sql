-- Client copy deck (2026-11-10): new category names and a short description for each.
-- Web addresses (slugs) stay the same, so existing links keep working. Names are in sentence case,
-- like every other heading; admins can change any of them on /admin/categories.
-- shop_label stays in the table but is no longer shown to shoppers.

begin;

alter table public.categories
  add column description text check (description is null or length(trim(description)) between 1 and 200);
comment on column public.categories.description is 'One sentence shown on category cards and pages.';

update public.categories c
set name = v.name, description = v.description
from (values
  ('restaurants',          'Eat & drink',          'Savings from restaurants, cafés and places serving something delicious.'),
  ('grocery',              'Groceries & markets',  'Offers on groceries, specialty foods and everyday essentials.'),
  ('bakeries',             'Bakeries & sweets',    'Fresh deals from bakeries, dessert shops and sweet spots.'),
  ('toys',                 'Toys & gifts',         'Fun finds, thoughtful gifts and something special for every age.'),
  ('jewelry',              'Jewelry',              'Offers on jewelry, watches, accessories and memorable gifts.'),
  ('clothes',              'Fashion & clothing',   'Deals on clothing, style and wardrobe favorites.'),
  ('shoes',                'Shoes',                'Step into savings on footwear for work, weekends and everything between.'),
  ('household-supplies',   'Home & household',     'Practical offers for your home, kitchen and daily life.'),
  ('pharmacy',             'Pharmacy & wellness',  'Savings on pharmacy, personal care and wellness essentials.'),
  ('luggage-bags-wallets', 'Bags & luggage',       'Deals on handbags, wallets, luggage and travel accessories.'),
  ('millinery',            'Hats & millinery',     'Distinctive hats, headwear and finishing touches.'),
  ('beauty',               'Beauty & grooming',    'Offers from beauty shops, salons, barber and tonsorial shops, spas and personal-care businesses.'),
  ('other',                'More around town',     'Discover services, specialty businesses and offers that do not fit neatly into one category.')
) as v(slug, name, description)
where c.slug = v.slug;

commit;
