# Arcane Studios website

Custom apparel site for seniors, clubs and uniforms: a live designer, group orders and checkout.

**See it online:** https://zaid000011.github.io/arcane-website/ (Arabic: https://zaid000011.github.io/arcane-website/ar/), the GitHub Pages copy described below.
The full product spec is in [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # pricing engine and designer logic tests
npm run build      # production build
```

## Admin panel

Open `/admin` (for example http://localhost:3000/admin).
- **First login:** the very first time, it asks you to create the owner login. For safety, that only works on the computer running the site, never through the share link.
- **Team logins:** the owner adds the team's logins under Team. Roles: Owner (everything), Staff (orders), Designer (sees orders, sends proofs, writes notes).
- **Orders:** the order list shows what needs doing. On each order you check payment screenshots, confirm payments, send proofs, move it through production, write team notes, and message the customer on WhatsApp. If a customer loses their link, you can make a new one there.
- **Requests:** designs, colors and custom sizes customers sent with the "send it to us" buttons (on the home page, in the designer, on the pricing page and at `/send`). Each one shows the customer's WhatsApp, their files, the color code with the closest color you stock, or their measurements. Reply on WhatsApp, then mark it contacted or done. The menu shows how many are new.
- **Workshop sheet:** printable from each order, with garment, colors, each print's position and size, a to-scale drawing, size totals and names list.
- **Prices:** changes apply to new orders as soon as you save. Every save is kept as a version you can bring back.
- **Lost owner password:** another owner can set a new one under Team. If there's no other owner, the login has to be reset in the database.

## Share a temporary link

Lets someone else open the site while this computer runs it. No account needed.

```bash
npm run build && npm run start:local   # terminal 1: the site on port 3000, reachable only from this computer
npm run share                          # terminal 2: prints a https://….trycloudflare.com link
```

The link works only while both are running, and it changes every time `npm run share` starts.
`npm run share` uses Cloudflare's free quick tunnel program in `.tools/cloudflared/`, the official 2026.11.2 release checked against its published SHA-256.

## GitHub Pages copy

The site also runs on GitHub Pages at https://zaid000011.github.io/arcane-website/ (Arabic under `/ar/`). GitHub Pages only serves files, so that copy has no server:
- **Works there:** the home page, the 3D designer with its close-ups, prices, the cart and "send it to us".
- **Goes to WhatsApp instead:** the cart's checkout becomes "Order on WhatsApp", and "send it to us" opens WhatsApp. Both go to the number in `src/config/site.ts`.
- **Not there:** online checkout, group order links, order pages and the admin panel. Those need the full site with its server and database.

To update it after changing the site, or prices in the admin panel, run `npm run pages:publish`. It builds both languages and uploads them to the `gh-pages` branch, and the link updates within a minute or two. `npm run pages` only builds it, into `.static-build/site`.

## Where to change things

| What | File |
|---|---|
| Prices, fees, shipping, deposit %, cash on delivery limit, holidays, colors in stock, products on sale, a fee for a size (none by default) | Admin panel → Prices |
| Product names, options, colors, print areas, and the original prices | `src/lib/catalog/seed.ts`. Saved prices from the admin panel are laid over it by id |
| What each fabric type and fabric weight says to customers | `description` of each fabric and GSM option in `src/lib/catalog/seed.ts` |
| How fabrics and print methods look in the close-ups (magnifying glass, print callout, "Print types explained") | `src/lib/closeup/surface.ts` |
| Weekend days (delivery dates) | `calendar.weekend` in `src/lib/catalog/seed.ts`. Holidays and Eid dates: Admin panel → Prices |
| Instagram, WhatsApp number, pickup location | `src/config/site.ts` (empty values stay hidden) |
| Where customers send the deposit (InstaPay address, wallet number, account name) | `payment` in `src/config/site.ts`. While empty, the order page says you'll send the details on WhatsApp |
| English and Arabic text | `src/i18n/dictionaries/en.ts`, `src/i18n/dictionaries/ar.ts` |
| Logo files | `public/brand/` |
| 3D garment shapes (body, sleeves, hood, collars, pocket) | `src/lib/three/shape.ts` (sizes), `src/lib/three/garment.ts` (parts and fabric) |
| Where prints sit on the garment (used by the 3D view and the workshop sheet) | `src/lib/design/placement.ts` |
| How each print method looks in 3D (puff height, thread, shine) | `src/lib/three/print-layers.ts` |

## How it's built

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- `src/lib/pricing/engine.ts`: one pure pricing function used by the live price and, later, by checkout on the server, so customers can't change prices in the browser
- English by default, Arabic with right-to-left layout through the header toggle (saved in a cookie)
- The design in progress is saved in the browser, so it survives a refresh. Uploaded images are kept in the browser's IndexedDB (`src/lib/design/assets.ts`) until checkout uploads them
- Artwork is stored in millimetres inside each print box (`src/lib/design/geometry.ts`), so print files can be produced at real size later
- The designer shows the garment in 3D with three.js (`src/lib/three/`), loaded only on pages that need it. To look like a real garment in a product photo, it has:
  - Folds where fabric gathers and hangs (above the waistband, from the armpits, bunched above the cuffs, creases at the elbows) in `src/lib/three/shape.ts`. Prints and names bend with them.
  - Soft shadows in the creases, sewn seams and dashed stitching (`src/lib/three/garment.ts`).
  - A real knit texture that changes with the fabric (jersey, piqué, felted wool), and a darker inside showing at the neck and openings.
  - Studio lights that turn with the view, so every side is lit.
  - `npm run dev:preview` starts a live-reloading preview on port 3002 that can run next to the site. Each print method has its own finish: puff and 3D embroidery stand up from the fabric, embroidery shows thread, vinyl is glossy, special vinyl is metallic, DTG and sublimation soak into the knit, patches sit on top. Artwork is placed in a flat editor next to the 3D view, and the pictures in the cart, review and group pages are rendered from the same 3D scene
- Group orders are saved on the server in SQLite through Node's built-in `node:sqlite` (`.data/arcane.db`, uploaded images in `.data/assets/`). Organizer and member keys are stored hashed and travel in the link's `#` part, so they never appear in server request logs
- Checkout has no accounts. Each order gets a private link (`/track/CODE#key=…`) where the customer uploads the payment screenshot, approves the design proof and follows progress. The server prices everything again, and orders, screenshots and proofs are only readable with the order key. Design and plan: [docs/checkout-design.md](docs/checkout-design.md)
- "Send it to us" requests (`src/server/requests.ts`): a customer's own design (PNG, JPG, WEBP, SVG, PDF, AI, EPS or PSD, up to 5 files of 20 MB), a color code or a custom size, saved with their WhatsApp number. File types are checked from the file's content, files are private to the team, and design files download instead of opening, so they can't run anything on the site.
- Close-ups (`src/lib/closeup/`): drawn in code like a macro photo, in the garment's real color, in a background worker so the page never stutters. The fabric step shows a magnifying glass over the 3D garment (with the inside for fleece and French terry). The print step pulls the chosen print area out into a big circle with two lines, like textbook detail drawings, using the customer's own artwork when there is some. Methods that only work on some fabrics are shown on one they work on.
- Admin logins (`src/server/auth.ts`):
  - Passwords are stored as salted scrypt hashes.
  - Sessions are random tokens in an HttpOnly cookie, stored hashed and valid for 30 days.
  - Sign-in is rate-limited.
  - Every admin action checks the role on the server and refuses requests coming from other websites.
- The live catalog is the built-in one with the latest saved price version laid on top (`src/server/catalog-store.ts`). Placed orders keep a copy of the prices they were charged.
- `npm audit` still lists warnings for Vitest (the test runner) and the copy of PostCSS inside Next.js. Fixing them needs major-version upgrades, so they're left for phase 9

## Progress

| Phase | Status |
|---|---|
| 1. Brand, layout, home page, English/Arabic | Done |
| 2. Pricing engine, tests, pricing page | Done |
| 3. Designer: garment, sleeve, fit, GSM, fabric, body color, print areas and methods, live price | Done |
| — 3D designer: garments in 3D, each print method shown with its real finish | Done |
| 4. Artwork: image upload (PNG/JPG/WEBP/SVG), background removal, text with curves and Arabic fonts, clip-art, drag/resize/rotate, snapping, undo/redo, zoom, print-quality (DPI) checks | Done, except PDF uploads and share links (they need the server) |
| 5. Names and numbers, class names list, neck label, size grid or list of people (paste from Excel/WhatsApp, CSV), delivery speed with working-day dates, review step, cart | Done |
| 6. Checkout, Paymob, InstaPay receipts, cash on delivery, emails, proof approval | Done: checkout, 50% deposit by InstaPay or wallet with screenshot upload, rest in cash on delivery, private order page with proof approval. Card payments need a Paymob account; emails come with the live site |
| 7. Group orders: share link, QR code, members add their own name and size, organizer dashboard | Done (server tested; a full browser run-through is still to do) |
| 8. Admin dashboard: catalog and price editor, orders, production sheet PDF | Done: orders, payments, proofs, statuses, team notes, workshop sheet (print or save as PDF), price editor with saved versions, team logins with roles. Still to add: promo codes, sales numbers, weekly capacity, clip-art library, print-ready files per area |
| — Customer help: "send it to us" for own designs, colors and custom sizes; fabric magnifying glass; print close-ups; "Print types explained"; HEX color codes; plain-words fabric weights; no extra fee for 2XL and 3XL | Done |
| 9. Polish, end-to-end tests, deployment | |
