# Qəpik

## Product

Qəpik is a price comparison site for Azerbaijan. It collects prices, delivery, instalment totals and stock from local online stores and shows the same product side by side. It does not sell anything; the purchase happens on the store's own site.

## Users

Shoppers in Azerbaijan (Baku first) checking a phone, laptop, appliance or gadget before buying, on a phone as often as on a desktop. They arrive from search or a shared link, look up one model, and want the lowest trustworthy price and the store that has it in stock. Store owners use the "Mağazanı əlavə et" flow; the owner runs the admin panel.

## Language and voice

Azerbaijani only (`lang="az"`), informal "sən". Plain, factual and calm. No invented urgency, no discount percentages a store did not publish, no "ən yaxşı" claims the data cannot back.

## Truth constraints

- Every price shown comes from a recorded store offer with a checked time.
- Store logos and colours are never altered.
- Numbers and dates use the hand-built Azerbaijani formats in `components/format.ts` (1 799,99 ₼; 27.10.2026).

## Platform

web (responsive; installable via web manifest). Native apps are not built.

## Surfaces

- Home: Persuade (search-first, shows what comparison reveals).
- Catalog, search, product, compare, stores, favourites, alerts: Operate.
- Guide and FAQ: Read.
- Admin: Operate, owner only.
