# Prompt for Claude Code — "Arcane" Custom Apparel Website

> Copy everything below the line into Claude Code, from inside an empty project folder.
> Before you paste: put your logo files in the project at `/public/brand/` (e.g. `logo.svg`, `logo-white.svg`, `icon.png`) and fill in your brand colors in Section 3.

---

## 0. Role and how to work

You are a senior full-stack engineer and product designer. You're building a production-ready e-commerce website for **Arcane**, a custom clothing brand in **Egypt**. Work in phases (Section 14). At the end of each phase, run the app, check that it works, and show me what changed before you start the next phase. Ask me before you make any decision this prompt leaves open. Don't invent business rules. Every price, fee and option must come from the database / admin panel, never hard-coded. The prices in Section 6.3 are **seed values only**. They're rough Egyptian market averages that we'll change later from the admin panel.

## 1. About the business

Arcane makes custom apparel for:
1. **Graduating seniors** in schools and universities: "Class of 20XX" hoodies and tees, often with each student's name printed on their own piece or all class names printed on the back.
2. **Uniforms** for schools, university departments and teams.
3. **Club merch** for school and university clubs and student activities (logos, event drops, committee shirts).

Most orders are **group orders**: one organizer (class rep, club president, school admin) designs one garment, collects everyone's size and name through a shared link, and **the organizer pays for the whole order**. The website has to make designing fun and collecting sizes/names painless.

- Country: **Egypt**
- Currency: **EGP (ج.م)**. Format prices as `EGP 1,250`. Keep currency configurable.
- Languages: **English is the default.** Add a visible **language toggle button (EN / عربي)** in the header that switches the whole site to **Arabic with full RTL layout**, and remember the choice. All UI strings live in translation files (use `next-intl`). The customizer's text tool must support Arabic text and Arabic fonts on the garment too.

## 2. Tech stack (use this unless you have a strong reason, and tell me if you change it)

- **Next.js 15 (App Router) + TypeScript (strict)**
- **Tailwind CSS + shadcn/ui** for UI, **Framer Motion** for motion
- **Fabric.js** (or Konva) for the 2D design canvas on the garment mockups
- **3D is NOT in this build.** The 2D preview comes first. But design the architecture so an **immersive 3D customizer (React Three Fiber + a `.glb` garment model)** can be added later without rewriting anything: keep the design state (colors per part, artwork per print area as textures, personalization) in a renderer-agnostic JSON model, and put the 2D preview behind a `GarmentRenderer` interface so a `ThreeGarmentRenderer` can be plugged in later.
- **Database:** PostgreSQL via **Prisma** (Supabase or Neon)
- **Auth:** Auth.js (NextAuth) or Supabase Auth, with email magic link + Google + phone number field (Egyptian customers rely on phone/WhatsApp)
- **File storage:** Supabase Storage or S3-compatible storage for uploaded artwork and generated mockups
- **Payments:** a `PaymentProvider` abstraction. Implement **Paymob** first (cards, Meeza, mobile wallets like Vodafone Cash, InstaPay if available through Paymob). Also add **Cash on Delivery** and **manual bank transfer / InstaPay with receipt upload** (admin confirms). Keep Fawry as a pluggable option for later.
- **Email:** Resend (order confirmations, group-order invites, deadline reminders). Add a placeholder `NotificationProvider` for **WhatsApp** notifications later.
- **Validation:** Zod on every API boundary. **State:** Zustand for the customizer.
- **Testing:** Vitest for the pricing engine (heavily unit tested), Playwright for the main flows
- Deployable to **Vercel**. Include a `.env.example` and a clear README.

## 3. Brand and visual direction

- Name: **ARCANE**. Logo files are in `/public/brand/`:
  - `logo-seal.svg`: **MAIN LOGO.** Symmetrical round seal: deep-red circle with outer and inner gold rings. "SENIORS ✦ CLUBS ✦ UNIFORMS ✦ MERCH" curves along the top band, "STUDIOS" curves along the bottom band, gold stars sit at the left and right where the two texts meet, and "ARCANE" (Anton) sits alone in the center, with no stars above or below it. Use it on the home hero, footer, emails, invoice PDF, OG images, packaging and stickers. On very small sizes switch to `logo-mark.svg`.
  - `logo-primary.svg`: simpler alternate circle logo ("ARCANE" + "CUSTOM APPAREL"), for places where the seal's small ring text would be too small to read.
  - `wordmark.svg`: star + "ARCANE" in one line. Use it in the **website header** and on mobile.
  - `logo-mark.svg`: "A" + star in the circle. Use it for the **favicon**, app icons and the loading spinner (generate the favicon/apple-touch PNG sizes from it).
  - `logo-circle.png` (the original logo) and `thank-you-card.png` (packaging card) are style references only.
  - The SVGs load Anton/Cinzel from Google Fonts. **Convert their text to outlined paths** for production so they render the same everywhere.
  - The 4-point star is a recurring brand motif. Reuse it as bullet points, section dividers, loading animation and hover sparkles.
- **Packaging style (thank-you card):** dark wine/burgundy background with a subtle textured, velvet-like feel, gold text, an elegant gold serif "ARCANE" heading and a script/serif accent line ("Thank you for your support"), and a gold Instagram QR code. The website should feel like this card: **premium, warm, luxurious, a bit mystical.**
- **Brand colors** (sampled from the logo and card, tune them slightly for contrast):
  - `--arcane-red` **#7A0A0A**: primary (logo circle, buttons, highlights)
  - `--arcane-wine` **#4A1218**: dark backgrounds and sections (from the card)
  - `--arcane-gold` **#C9A227**: accent (logo text, headings, prices, icons, borders)
  - `--arcane-gold-light` **#E2C766**: hover states and glows
  - `--arcane-ink` **#140A0B**: near-black base background
  - `--arcane-cream` **#F5EBD8**: body text on dark and light-section backgrounds
  - Default theme: dark (ink/wine backgrounds, gold + red accents). Add a subtle grain/velvet texture overlay and soft gold glows. Gold text must pass contrast checks on the dark backgrounds.
- Vibe: premium streetwear, mystical, a little dark. Smooth scroll animations. It should **not** look like a school supply shop.
- Fonts (Google Fonts):
  - Logo-style display / big headings: **"Anton"** or **"Bebas Neue"** (tall condensed bold, matches the logo)
  - Elegant accent headings (like the card): **"Cinzel"** or **"Playfair Display"**
  - Body: **"Inter"** or **"Manrope"**
  - Arabic: **"Cairo"** (UI) + **"Reem Kufi"** or **"Aref Ruqaa"** (decorative headings)
- Add an **Instagram link/QR** in the footer and on the order confirmation page ("Scan to follow our journey"), matching the card. Instagram handle: `[[@arcane_handle]]`.
- Fully responsive. **The customizer must work well on phones**, because most students will open links from WhatsApp on their phone.
- Accessible: keyboard navigation, focus states, proper contrast, alt text.

## 4. Site map

1. **Home**: hero with the Arcane logo and an animated garment, "Design yours" call to action, the 3 audiences (Seniors / Uniforms / Club Merch), how it works (Design → Share the link with your group → Everyone adds size & name → You pay once → We print & deliver), gallery of past work, testimonials, FAQ.
2. **Customizer / Builder** (`/design`): the core of the site, see Section 5.
3. **Templates** (`/templates`): ready-made starting designs ("Class of 2027", "Senior Squad", club logo layouts) the user can open and edit.
4. **Group Order page** (`/g/[code]`): a shareable link for group members, see Section 7.
5. **Cart & Checkout**
6. **Account**: my designs (saved drafts), my orders, my group orders, order tracking.
7. **Order tracking** (`/track/[orderId]`): status timeline.
8. **Pricing page**: clear tables of base prices and add-on fees, generated from the same pricing data.
9. **Contact / Custom quote request**: for unusual requests. Include a WhatsApp click-to-chat button.
10. **Admin dashboard** (`/admin`): see Section 10.
11. Static pages: About, Size Guide (measurements per product in cm), Print Methods explained, Shipping & Returns, Terms, Privacy.

## 5. The Customizer (most important part, build it carefully)

A step-based builder with a **live 2D preview** (left on desktop, top on mobile) and **option panels** (right on desktop, bottom sheet on mobile). A **live price** is always visible and updates immediately, with an expandable itemized breakdown.

### 5.1 Steps / option groups

**Step 1: Garment type**
- All of these are **enabled and fully built** (each with its own layered SVG mockup and print areas):
  - **Hoodie (pullover)**
  - **T-shirt**
  - **Zip hoodie** (zipper color is an extra colorable part; no front-center print area across the zip, offer left/right chest instead)
  - **Sweatshirt / crewneck**
  - **Polo** (collar + placket colorable, good for uniforms; embroidery suggested for chest logos)
  - **Varsity jacket** (body + sleeves + ribbing colored separately; chenille patches and embroidery suggested)
- Products are data (`Product` table), so new garment types can be added from admin without code changes.

**Step 2: Sleeve & fit**
- Sleeve: **Short sleeve / Long sleeve**. Only show options valid for the garment (hoodie = long sleeve by default, admin can enable short-sleeve hoodie).
- Fit: Regular / Oversized / Boxy (each with a price modifier).

**Step 3: Fabric weight (GSM)**: offer **all** of these, filtered by garment:
- T-shirts: **140, 160, 180, 200, 220, 240, 260, 280 GSM**
- Hoodies / sweatshirts: **260, 280, 300, 320, 350, 380, 400, 450 GSM**
- Each GSM has a price modifier and a short description (e.g. "180: everyday cotton", "240+: heavyweight oversized feel", "400+: ultra-heavy premium"). Optional fabric type per GSM: Cotton 100%, Cotton/Poly blend, Melton, French Terry, Fleece (brushed), Polyester (for sublimation).

**Step 4: Colors**
- Main body color (admin-managed swatches with hex + "in stock" flag)
- Hoodies get **separately colorable parts**: hood lining, drawstrings, cuffs & waistband ribbing, kangaroo pocket. Each is an optional contrast add-on with its own fee.
- T-shirts: optional contrast collar / sleeve hem.
- The preview recolors live. Use **layered SVG mockups** (body, sleeves, hood, hood lining, cuffs, strings, pocket each as its own path) with shading/texture overlays for realism. Views: front, back, left sleeve, right sleeve.

**Step 5: Design & placement**
- Print areas (admin-defined with a bounding box per view, real-world size in cm, and allowed methods): **Front center, Left chest, Right chest, Full front, Back upper, Full back, Left sleeve, Right sleeve, Hood, Back neck / inner label**
- For each area the user can:
  - **Upload artwork** (PNG/SVG/JPG/PDF, max 25MB). Calculate effective DPI for the print size: warn below 150 DPI, block below 100 DPI. Optional "remove background" button.
  - **Add text**: curated fonts incl. varsity/college fonts and Arabic fonts, size, color, outline, **curved/arc text** (for "CLASS OF 2027"), letter spacing.
  - **Clip-art / icon library**: graduation cap, stars, laurels, numbers, mystical/arcane symbols.
  - Drag, resize, rotate, layer order, align, lock, duplicate, delete, snapping guides. Elements are clipped to the print area (dashed box while editing). Undo/redo, zoom.
- **Choose the print method per print area** (5.2). The price updates based on method × area size tier (× number of colors for screen printing).

**Step 6: Personalization**
- **Each person's name** on their own piece: organizer chooses area (back / sleeve / chest), font, color. Members type their names in the group link (or organizer pastes/uploads the list). **Fee per name.**
- **Number** (teams/uniforms): same logic, own fee.
- **Senior names list on the back** (all class names printed on every piece): per-piece fee + one-time layout fee. Organizer pastes/uploads the name list and it auto-arranges into a column/grid. Admin sets a max name count.
- Optional **custom neck label / hem tag** with fee.

**Step 7: Sizes, quantity & delivery**
- Size matrix: XS / S / M / L / XL / 2XL / 3XL (configurable, same price for every size; other sizes on request). Organizer can fill sizes directly **or** start a group order (Section 7) to collect them.
- **Delivery speed:**
  - **Standard** (~14 working days): no fee
  - **Early / Express** (~7 working days): + fee
  - **Rush** (~3–4 working days): + bigger fee, only when admin enables it and the capacity calendar allows
  - Show the estimated delivery date based on Egyptian working days (Sun–Thu, with admin-editable holidays).
- **Shipping:** delivery by governorate (fee table), free pickup from `[[Arcane pickup location]]`, or delivery to the school/university.

**Step 8: Review**
- Mockups of every view, full price breakdown, editable summary. Buttons: Save design, Share design link, Add to cart, Start group order, Request a quote.

### 5.2 Print methods (all offered, admin-editable)
Each method has: name (EN + AR), description, example photo, price model, allowed garments/fabrics/areas, minimum quantity, extra production days.
- **DTF**: full color, any fabric, priced by size tier
- **DTG**: full color, cotton only
- **Screen printing**: per color per area + setup fee per color, minimum quantity
- **Puff print** (raised / "bulged"): priced by size tier + setup
- **Embroidery**: priced by size tier + one-time digitizing fee per design
- **3D / puff embroidery**: premium tier + digitizing
- **Sublimation**: polyester / white & light colors only
- **Vinyl / HTV**: standard, reflective, glitter, glow-in-the-dark variants (good for names/numbers)
- **Patches**: chenille, woven, embroidered

Add a "Compare print methods" helper (durability, feel, best for, price level) in both languages.

### 5.3 Saving & sharing designs
- Autosave to localStorage for guests, to the DB when logged in.
- Shareable read-only preview link + "duplicate & edit".
- Store the design as renderer-agnostic JSON **and** generate high-res PNG mockups + **print-ready files per area** (transparent PNG at 300 DPI, keep originals) for production.

## 6. Pricing engine (correct, tested, data-driven)

### 6.1 Rules
- A **pure TypeScript module** (`/lib/pricing`) used by both client (live preview) and server (source of truth at checkout, so the client can never set the price).
- **No bulk/quantity discounts.** Don't build discount tiers. Only promo codes (admin-created, optional) can reduce the price.
- Prices are shown **VAT-inclusive**. Add an admin toggle for showing 14% VAT separately on invoices, off by default.
- Round each line to the nearest whole EGP.

### 6.2 Formula
```
unit price =
    base price (product + sleeve)
  + fit modifier
  + GSM / fabric modifier
  + contrast color part fees
  + Σ per print area: method price for that size tier (screen: per color)
  + size surcharge (none by default, can be set per size)
  + per-piece personalization (name, number, names-list, custom label)

order total = Σ unit prices
  + one-time setup fees (screen setup per color, embroidery digitizing, puff setup, names-list layout, custom label setup)
  + delivery speed fee (% of subtotal with a minimum)
  + shipping fee (by governorate / pickup free)
  − promo code (if any)
```
Write thorough **Vitest** tests: 1 piece, 300 pieces, mixed sizes, multiple print areas with different methods, rush + names + setup fees, promo code, rounding.

### 6.3 Seed prices (EGP, estimated Egyptian market averages, editable in admin later)

**Base garments (standard GSM, regular fit, blank):**
| Product | Short sleeve | Long sleeve |
|---|---|---|
| T-shirt | **650** | 710 |
| Hoodie (pullover) | — | **850** |
| Zip hoodie | — | 1,000 |
| Sweatshirt / crewneck | — | 750 |
| Polo | 700 | 760 |
| Varsity jacket | — | 1,800 |

**Fit:** Regular +0 · Oversized +40 · Boxy +40

**GSM modifiers:**
- T-shirt: 140 −20 · 160 +0 · 180 +20 · 200 +40 · 220 +60 · 240 +90 · 260 +110 · 280 +130
- Hoodie: 260 −40 · 280 +0 · 300 +30 · 320 +60 · 350 +100 · 380 +130 · 400 +160 · 450 +220

**Contrast color parts (per piece):** hood lining +40 · drawstrings +15 · cuffs & ribbing +30 · kangaroo pocket +25 · tee contrast collar/hem +25 · zipper color +30 · polo collar/placket +30 · varsity sleeves contrast +0 (part of the design) · varsity ribbing stripes +40

**Print methods (per piece, per print area). Size tiers: S ≤ 10×10 cm (chest/sleeve), M ≤ A4, L ≤ A3:**
| Method | S | M | L | One-time setup | Min qty |
|---|---|---|---|---|---|
| DTF | 40 | 80 | 130 | — | 1 |
| DTG | 60 | 110 | 170 | — | 1 |
| Screen print | 20 / color | 30 / color | 40 / color | 300 per color | 24 |
| Puff print | 70 | 120 | 180 | 250 | 10 |
| Embroidery | 60 | 120 | 200 | 300 digitizing | 1 |
| 3D / puff embroidery | 90 | 170 | 260 | 400 digitizing | 1 |
| Sublimation | 50 | 80 | 120 (all-over 250) | — | 1 |
| Vinyl / HTV | 35 | 60 | 90 | — | 1 |
| HTV special (reflective / glitter / glow) | 55 | 85 | 120 | — | 1 |
| Woven patch | 60 | — | — | 200 | 10 |
| Chenille patch | 150 | 220 | — | 300 | 10 |

**Personalization (per piece):** name +35 · number +35 · senior names list on back +50 (+ 300 one-time layout) · custom neck label +25 (+ 400 one-time setup)

**Size surcharge:** none, every size is the same price (a fee per size can still be set in Admin → Prices). Sizes outside XS–3XL go through "Can't find your size? Send it to us".

**Delivery speed:** Standard +0 · Express +20% of subtotal (min 300) · Rush +35% of subtotal (min 600)

**Shipping by governorate:** Cairo & Giza 70 · Alexandria 80 · Delta & Canal 90 · Upper Egypt 110 · Red Sea, Sinai, Matrouh, New Valley 130 · Pickup 0 · Delivery to school/university: same as governorate rate (admin can make it free per order)

## 7. Group orders (key feature: the organizer pays for everyone)

1. Organizer finishes a design → **"Start group order"**.
2. Sets: group name (e.g. "CS Seniors 2027"), **deadline**, whether names / numbers are enabled, allowed sizes, optional max pieces, delivery destination (one address, usually the school/university).
3. Gets a **shareable link + QR code** (`/g/ABC123`) to post in the class WhatsApp group. Generate a nice OG preview image of the design so the WhatsApp link shows the hoodie.
4. Each member opens the link (**no account and no payment**, just name + phone): sees the design, picks **size**, types **their name / number** with a live preview of their own name on the garment, quantity (default 1), then submits. They get a confirmation screen and can edit their entry until the deadline using a private edit link.
5. **Organizer dashboard:** live roster table (name, phone, size, personalization), size totals, **running total price** for the whole group (from the pricing engine), edit/remove entries, add entries manually, **CSV/Excel import & export**, send reminders, close early or extend the deadline, lock the list.
6. Optional: **name whitelist**. The organizer uploads the class list so only those names can join (prevents spam/duplicates). Detect duplicate names/phones.
7. When the deadline passes or the organizer clicks **"Close & checkout"**, the roster becomes one order and **the organizer pays the full amount** at checkout. If the organizer doesn't check out within X days of the deadline (admin setting), send reminders.

## 8. Cart, checkout & payment
- Cart can hold multiple designs and closed group orders.
- Checkout: contact info (name, phone required, email), governorate + city + address (drives shipping fee), delivery speed, payment method, promo code, notes.
- Payment methods: **Paymob** (card / Meeza / mobile wallets), **InstaPay or bank transfer with receipt upload** (admin confirms manually), **Cash on Delivery** (admin can restrict COD by max order value).
- **Deposit option** for large orders (e.g. 50% now, rest before shipping), toggled by admin with a threshold amount.
- Handle webhooks, idempotency and failed payments.
- Confirmation page + email with mockups, breakdown and an invoice PDF (bilingual).

## 9. Order lifecycle & tracking
Statuses: `Pending payment → Paid / Deposit paid → Design review → Proof sent → Proof approved → In production → Quality check → Shipped / Ready for pickup → Delivered`, plus `Cancelled`, `Refunded`.
- **Proof approval:** admin uploads a final proof, the customer approves or requests changes (with comments) from their account. Production can't start before approval.
- Timeline at `/track/[id]`, email on each status change (WhatsApp notifications later via `NotificationProvider`).

## 10. Admin dashboard (`/admin`, role-protected)
- **Orders:** list/filter/search, detail view with mockups, download print-ready files (zip per order), roster export grouped by size, status changes, proof upload, payment confirmation for InstaPay/bank transfers, internal notes.
- **Production sheet / tech pack PDF** per order: garment, GSM, fabric, colors (hex + supplier code), each print area with method, dimensions in cm and position, size breakdown table, names/numbers list per size.
- **Catalog:** products (enable/disable), sleeves, fits, GSM/fabrics, colors (+ stock toggle), sizes, print areas (visual bounding-box editor on the mockup), print methods & pricing, compatibility rules, all names in EN + AR.
- **Pricing:** every fee from Section 6.3 editable, plus a **price simulator** to test a configuration.
- **Templates & clip-art library** management.
- **Promo codes.**
- **Capacity calendar & holidays:** max pieces per week. Disables Express/Rush when full.
- **Customers & group orders** overview.
- **Analytics:** revenue, orders by status, popular colors/GSM/methods, group-order link conversion.
- Roles: Owner, Staff (orders), Designer (proofs).

## 11. Data model (starting point, refine it)
`User, Organization (school/university/club), Product, SleeveOption, FitOption, Fabric/GSM, Color, Size, PrintArea, PrintMethod, PrintMethodPrice (per size tier), CompatibilityRule, Design (JSON), DesignAsset, Template, Cart, CartItem, Order, OrderItem, OrderItemSizeLine, Personalization (name/number per piece), GroupOrder, GroupOrderMember, Payment, PaymentReceipt, Shipment, DeliverySpeed, ShippingZone (governorate), PromoCode, Proof, ProofComment, PricingConfig (versioned, orders snapshot the prices they were charged), CapacitySlot, Holiday, AuditLog.`

Orders must **snapshot** the full design + prices at purchase time so later price changes don't affect old orders.

## 12. Non-functional requirements
- Performance: customizer interactive in under 3s on mid-range Android phones on 4G. Lazy-load fonts and heavy libs.
- Security: server-side price recalculation, upload validation, rate limiting + duplicate detection on group-order joins, admin RBAC, no secrets in the client.
- SEO: metadata in both languages, auto-generated OG images for designs and group links, sitemap.
- i18n: EN default, AR with RTL via the header toggle. Prices and dates are localized (Arabic numerals optional, admin setting).
- Analytics placeholders (GA4, Meta Pixel, TikTok Pixel).
- Seed script with all products, GSMs, colors, print methods, the prices from 6.3, 3 templates and one sample group order.

## 13. Mockup assets
Until I provide real product photos, **create clean layered SVG mockups** for every product: hoodie, zip hoodie, sweatshirt, varsity jacket (front/back/sleeves), t-shirt and polo (short & long sleeve, front/back), with each recolorable part as a separate path plus shading overlays. Keep them swappable for photo-based mockups later, and keep the print-area coordinates in real-world cm so they can map onto a 3D model's UVs later.

## 14. Build phases (stop and show me after each)
1. **Setup:** scaffold, design system with the Arcane logo, layout, header with EN/AR toggle + RTL, home page, DB schema + seed.
2. **Pricing engine** + full unit tests + pricing page.
3. **Customizer core:** garment / sleeve / fit / GSM / colors with live SVG recoloring + live price.
4. **Design editor:** print areas, uploads, text (incl. curved + Arabic), clip-art, print-method choice, DPI checks, save/share.
5. **Personalization, sizes, delivery speed**, review step, cart.
6. **Checkout + Paymob + InstaPay receipt + COD + emails + tracking + proof approval.**
7. **Group orders:** link + QR + OG image, member flow (no payment), organizer dashboard, CSV import/export, reminders, close & checkout.
8. **Admin dashboard:** catalog/pricing editors, orders, production sheet PDF, capacity calendar.
9. **Polish:** animations, accessibility pass, Playwright E2E tests, SEO, deploy guide.
10. **(Later, not now) Immersive 3D customizer** with React Three Fiber, plugged in through the `GarmentRenderer` interface.

## 15. Definition of done
- On my phone I can design a hoodie in under 3 minutes, start a group order, share the link, have 3 friends add their own name and size without paying, close the group, pay once as the organizer, and see the order in admin with a downloadable production sheet.
- The whole site works in English and Arabic (RTL) through the toggle.
- All prices match the pricing engine tests. `npm run dev`, `npm test` and `npm run build` pass. The README explains setup, env vars, seeding and deployment.

Before writing any code, list the questions you still have and propose the final data model + folder structure for my approval.
