#!/usr/bin/env bash
# Exporta los menús reales scrapeados (restaurantes con platos) a src/data/generated/menus.json.
# Ese archivo NO va a git (regla del proyecto: los datos scrapeados no se suben). Sin él, la app funciona
# igual, solo que sin la sección "Cerca de ti". Uso: ./scripts/export-menus.sh [base, por defecto rappi]
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$(brew --prefix)/opt/postgresql@17/bin:$PATH"
DB="${1:-rappi}"
OUT="src/data/generated/menus.json"
mkdir -p "$(dirname "$OUT")"

psql -d "$DB" -AtX -v ON_ERROR_STOP=1 > "$OUT" <<'SQL'
with latest as (
  -- Precio de la última corrida de cada plato
  select distinct on (item_id) item_id, price, real_price, discount_pct, is_available
  from menu_price_snapshots
  order by item_id, scraped_at desc
)
select coalesce(json_agg(restaurant order by restaurant ->> 'name'), '[]'::json)
from (
  select json_build_object(
    'id', s.store_id,
    'name', s.name,
    'rating', rd.rating,
    'reviews', rd.review_count,
    'deliveryCost', rd.delivery_cost,
    'eta', rd.eta,
    'tags', rd.tags,
    'sections', (
      select json_agg(json_build_object(
        'name', ms.name,
        'items', (
          select json_agg(json_build_object(
            'id', m.item_id,
            'name', m.name,
            'description', m.description,
            'image', m.image_url,
            'popular', m.is_popular,
            'price', l.price,
            'realPrice', l.real_price,
            'discount', l.discount_pct,
            'available', coalesce(l.is_available, true)
          ) order by m.is_popular desc, m.item_id)
          from menu_items m
          left join latest l using (item_id)
          where m.section_id = ms.section_id
        )
      ) order by ms.position)
      from menu_sections ms
      where ms.store_id = s.store_id
        and exists (select 1 from menu_items m where m.section_id = ms.section_id)
    )
  ) as restaurant
  from stores s
  left join restaurant_details rd using (store_id)
  where exists (select 1 from menu_items m where m.store_id = s.store_id)
) as restaurants;
SQL

echo "Menús exportados en $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
