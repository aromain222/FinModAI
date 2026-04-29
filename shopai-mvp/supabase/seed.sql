insert into users (id, email)
values ('00000000-0000-0000-0000-000000000001', 'demo@shopai.local')
on conflict (email) do nothing;

insert into products (
  id,
  name,
  brand,
  price,
  image,
  rating,
  category,
  retailer,
  purchase_url,
  colors,
  styles,
  use_cases,
  summary,
  description
)
values
  (
    'meridian-studio-quarter-zip',
    'Meridian Studio Quarter-Zip',
    'Meridian',
    118,
    '/placeholders/apparel.svg',
    4.8,
    'Apparel',
    'Nordhaven',
    'https://example.com/products/meridian-studio-quarter-zip',
    '{"black","charcoal"}',
    '{"professional","modern","minimalist"}',
    '{"office","work","travel"}',
    'Fine-gauge merino quarter-zip with clean tailoring and a polished drape.',
    'A premium merino layer built for smart casual office wear, with a trim silhouette and understated hardware.'
  ),
  (
    'axis-knit-half-zip',
    'Axis Knit Half-Zip',
    'Axis',
    79,
    '/placeholders/apparel.svg',
    4.4,
    'Apparel',
    'Threadline',
    'https://example.com/products/axis-knit-half-zip',
    '{"black","navy"}',
    '{"minimalist","modern","budget-friendly"}',
    '{"office","commute"}',
    'Clean-lined half-zip with a slightly relaxed shape and matte zipper.',
    'A lower-cost knit option that still feels refined enough for a client meeting and casual enough for daily wear.'
  ),
  (
    'vector-run-pro-4',
    'Vector Run Pro 4',
    'Vector',
    145,
    '/placeholders/footwear.svg',
    4.8,
    'Footwear',
    'SprintLab',
    'https://example.com/products/vector-run-pro-4',
    '{"white","black","lime"}',
    '{"performance","modern"}',
    '{"running","training"}',
    'High-cushion trainer with strong energy return for daily mileage.',
    'A dependable performance runner that stays under the typical premium shoe ceiling while keeping top-tier cushioning.'
  ),
  (
    'slate-minimal-desk-kit',
    'Slate Minimal Desk Kit',
    'Slate',
    489,
    '/placeholders/desk.svg',
    4.7,
    'Home Office',
    'Workform',
    'https://example.com/products/slate-minimal-desk-kit',
    '{"walnut","black"}',
    '{"minimalist","modern","premium"}',
    '{"desk setup","home office","productivity"}',
    'Desk bundle with monitor riser, lamp, tray, and cable management pieces.',
    'A cohesive minimalist setup that fits a sub-$500 furnishing prompt while keeping the workspace visually calm.'
  ),
  (
    'maison-ember-vanilla-reserve',
    'Maison Ember Vanilla Reserve',
    'Maison Ember',
    112,
    '/placeholders/fragrance.svg',
    4.7,
    'Fragrance',
    'Scent Atelier',
    'https://example.com/products/maison-ember-vanilla-reserve',
    '{"amber","black"}',
    '{"luxury","warm","modern"}',
    '{"fragrance","evening","signature scent"}',
    'Warm vanilla fragrance with woods and spice for a refined, smoky finish.',
    'A sophisticated vanilla-forward scent that lands close to luxury tobacco-vanilla profiles at a friendlier price.'
  )
on conflict (id) do nothing;

insert into saved_items (user_id, product_id)
values ('00000000-0000-0000-0000-000000000001', 'meridian-studio-quarter-zip')
on conflict (user_id, product_id) do nothing;
