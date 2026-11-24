# Checkout design (phase 6)

Agreed with the owner on 2026-11-23 and built the same day. Builds on section 8–9 of [PROJECT_SPEC.md](PROJECT_SPEC.md).

## Decisions

- **No accounts.** After checkout the customer gets a private order link, `/track/CODE#key=SECRET`, the same pattern as group orders. The key is generated in the browser and stored hashed on the server. The page uploads payment screenshots, shows the design proof for approval, and shows status. The link is remembered on the device under "Your orders" and can be sent to WhatsApp.
- **Payment: 50% deposit, rest in cash on delivery or at pickup.** The policy lives in the catalog so the admin panel can change it: `payments: { depositPercent: 50, codFullMaxTotal: 0 }`. 100 means pay everything first. `codFullMaxTotal` greater than 0 lets small orders pay everything on delivery.
- **Deposit methods now:** InstaPay or mobile-wallet transfer, then upload a screenshot that the team confirms. The details go in `src/config/site.ts` (`payment.instapay`, `payment.wallet`, `payment.accountName`). When they're empty, the order page says the team will send payment details on WhatsApp.
- **Later:** card payments through Paymob once the owner has an account (a `card` method that creates a Paymob intention, then redirect, then an HMAC-checked webhook marks it paid). Emails come with deployment, since they need a domain and a Resend account. Promo codes come with the admin panel.

## Server (SQLite, `src/server/orders.ts`)

- Tables: `orders` (code, key_hash, request_id unique, status, payment_status, payment_method, customer_json, shipping_json, totals_json, notes, locale, timestamps), `order_items` (design_json, order_json, quote_json, group_code), `order_events` (timeline), `order_files` (receipts and proofs, private, under `.data/orders/<orderId>/`).
- `createOrder`: validates with zod, enforces idempotency by `requestId` plus key, and is rate-limited. For each item it runs `normalizeDesign`, then `orderIssues`, `designIssues` and `quote` (errors are rejected), and checks the artwork assets exist. Shipping is charged once per order by governorate, or pickup. Totals = Σ item totals + shipping. The deposit is round(total × depositPercent / 100), and the balance is due on delivery.
- Production status: `placed → designReview → proofSent → proofApproved → inProduction → qualityCheck → shipped | readyForPickup → delivered`, plus `cancelled`. Requesting changes sends `proofSent` back to `designReview`.
- Payment status is tracked separately: `unpaid → receiptSubmitted → depositPaid → paid`, plus `refunded`.
- Guards: design review starts once the deposit is confirmed (or for a full-COD order). Production needs an approved proof and a paid deposit.
- Customer API, using the key in the `x-arcane-key` header: `POST /api/orders`, `GET /api/orders/[code]`, `POST /api/orders/[code]/receipts` (PNG/JPEG/WEBP, 10 MB max), `GET /api/orders/[code]/files/[id]` (fetched as a blob, because `<img>` can't send the header), `POST /api/orders/[code]/proof` (approve, or request changes with a comment).
- Admin functions (`confirmPayment`, `sendProof`, `setStatus`) are written now with tests; the admin panel (phase 8) adds their pages.

## Pages

- `/checkout`:
  - Contact: name and Egyptian mobile required, email optional.
  - Delivery: home delivery (governorate, city, address), school/university delivery (same fee), or free pickup.
  - Payment: shows the deposit due now and the balance due on delivery.
  - Notes.
  - Summary with the 3D pictures. Artwork is uploaded first, then the order is placed, the cart is cleared, and the customer is sent to the order link.
- `/track/[code]`: next-step card (pay the deposit, receipt received, review the proof), timeline, items, totals, delivery details, "Print / save as PDF".
- Cart: the "checkout soon" box becomes a Checkout button, plus a "Your orders" list. Cart items from a closed group order carry `groupCode`.

## Tests

- Pure functions: shipping fee, payment plan, cart totals.
- Server: create (totals, deposit, idempotent retry, wrong key, bad governorate, design errors, missing artwork), key required to read, receipt upload (type check, status change), proof approve and changes, status guards.
