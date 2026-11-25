import { z } from "zod";

/** Shapes of everything the browser sends to the server. Limits keep stored data small and safe. */

const id = z.string().min(1).max(64);
const num = z.number().finite();
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const assetIdSchema = z.string().regex(/^[a-zA-Z0-9-]{8,64}$/);

const base = { id, x: num, y: num, rotation: num.min(-360).max(360), locked: z.boolean().optional() };

const element = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("image"),
    assetId: assetIdSchema,
    name: z.string().max(120),
    w: num.positive().max(2000),
    aspect: num.positive().max(100),
    pxW: num.positive().max(100_000),
    pxH: num.positive().max(100_000),
    vector: z.boolean(),
  }),
  z.object({
    ...base,
    type: z.literal("text"),
    text: z.string().max(60),
    fontId: id,
    size: num.positive().max(500),
    color: hex,
    outline: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    outlineColor: hex,
    letterSpacing: num.min(-1).max(2),
    curve: num.min(-100).max(100),
  }),
  z.object({ ...base, type: z.literal("clipart"), clipartId: id, w: num.positive().max(2000), color: hex }),
]);

const style = z.object({ areaId: id, fontId: id, color: hex, sizeMm: num.positive().max(500) });

export const designSchema = z.object({
  productId: id,
  sleeve: z.enum(["short", "long"]),
  fitId: id,
  gsm: z.number().int().positive().max(2000),
  fabricId: id,
  bodyColorId: id,
  customColorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  noCuffs: z.boolean().optional(),
  noWaistband: z.boolean().optional(),
  partColors: z.record(id, id).refine((r) => Object.keys(r).length <= 20),
  prints: z
    .array(
      z.object({
        /** Missing on designs saved before prints could go anywhere; they're converted when read. */
        id: id.optional(),
        areaId: id,
        methodId: id,
        tier: z.enum(["S", "M", "L", "AO"]),
        colorCount: z.number().int().min(1).max(12).optional(),
        elements: z.array(element).max(30).optional(),
      }),
    )
    .max(30),
  personalization: z.object({
    names: z.boolean(),
    numbers: z.boolean(),
    namesList: z.boolean(),
    namesListCount: z.number().int().min(0).max(1000).optional(),
    neckLabel: z.boolean(),
    nameStyle: style.optional(),
    numberStyle: style.optional(),
    namesListStyle: style.optional(),
    namesListNames: z.array(z.string().max(40)).max(300).optional(),
    neckLabelText: z.string().max(24).optional(),
  }),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const groupSettingsSchema = z.object({
  allowedSizes: z.array(id).min(1).max(20),
  allowQuantity: z.boolean(),
  maxPieces: z.number().int().min(1).max(5000).optional(),
  allowedNames: z.array(z.string().trim().min(1).max(40)).max(1000).optional(),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(60),
  organizer: z.object({
    name: z.string().trim().min(2).max(60),
    phone: z.string().max(30),
    email: z.union([z.string().trim().email().max(120), z.literal("")]).optional(),
  }),
  design: designSchema,
  deliverySpeedId: id,
  deadline: isoDate,
  settings: groupSettingsSchema,
});

export const memberSchema = z.object({
  name: z.string().trim().min(2).max(40),
  phone: z.string().max(30),
  number: z.string().max(3).optional(),
  sizeId: id,
  quantity: z.number().int().min(1).max(10).optional(),
});

export const memberPatchSchema = memberSchema.partial();

export const groupPatchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  deadline: isoDate.optional(),
  status: z.enum(["open", "locked", "closed"]).optional(),
  settings: groupSettingsSchema.partial().optional(),
});

export const bulkMembersSchema = z.object({ members: z.array(memberSchema.extend({ phone: z.string().max(30).optional().default("") })).min(1).max(500) });

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type GroupPatch = z.infer<typeof groupPatchSchema>;

/* ---------- Checkout ---------- */

export const orderDraftSchema = z.object({
  sizes: z.record(id, z.number().int().min(0).max(5000)).refine((r) => Object.keys(r).length <= 20),
  roster: z.array(z.object({ id, name: z.string().max(40), number: z.string().max(3), sizeId: z.string().max(64) })).max(1000),
  deliverySpeedId: id,
});

export const checkoutSchema = z.object({
  /** Made by the browser so a retried request can't create a second order. */
  requestId: z.string().uuid(),
  /** The order's private key, made by the browser so it's never lost on a retry. Stored hashed. */
  key: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  locale: z.enum(["en", "ar"]),
  customer: z.object({
    name: z.string().trim().min(2).max(60),
    phone: z.string().max(30),
    email: z.union([z.string().trim().email().max(120), z.literal("")]).default(""),
  }),
  shipping: z.object({
    method: z.enum(["delivery", "school", "pickup"]),
    governorateId: z.string().max(64).default(""),
    city: z.string().trim().max(60).default(""),
    address: z.string().trim().max(300).default(""),
    school: z.string().trim().max(100).default(""),
  }),
  paymentMethod: z.enum(["transfer", "cod"]),
  notes: z.string().trim().max(1000).default(""),
  items: z
    .array(z.object({ design: designSchema, order: orderDraftSchema, groupCode: z.string().regex(/^[A-Z0-9]{4,12}$/).optional() }))
    .min(1)
    .max(20),
});

export const proofResponseSchema = z.object({
  approve: z.boolean(),
  comment: z.string().trim().max(1000).default(""),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/* ---------- Admin panel ---------- */

const roleSchema = z.enum(["owner", "staff", "designer"]);
const password = z.string().min(8).max(200);

export const loginSchema = z.object({ username: z.string().max(60), password: z.string().max(200) });
export const setupSchema = z.object({ name: z.string().max(60), username: z.string().max(30), password });
export const userCreateSchema = z.object({ name: z.string().max(60), username: z.string().max(30), password, role: roleSchema });
export const userPatchSchema = z.object({ name: z.string().max(60).optional(), role: roleSchema.optional(), active: z.boolean().optional(), password: password.optional() });
export const passwordChangeSchema = z.object({ current: z.string().max(200), next: password });

export const adminPaymentSchema = z.object({ amount: z.number().int().min(1).max(10_000_000) });
export const adminStatusSchema = z.object({
  status: z.enum(["placed", "designReview", "proofSent", "proofApproved", "inProduction", "qualityCheck", "shipped", "readyForPickup", "delivered", "cancelled"]),
});
export const adminNoteSchema = z.object({ text: z.string().max(2000) });

const money = z.number().int().min(0).max(1_000_000);
const delta = z.number().int().min(-100_000).max(100_000);
/** A garment measurement for the size chart, in cm. */
const garmentCm = z.number().finite().min(5).max(250);

export const priceSheetSchema = z.object({
  products: z
    .array(
      z.object({
        id,
        enabled: z.boolean(),
        basePrice: z.object({ short: money.optional(), long: money.optional() }),
        gsm: z.array(z.object({ gsm: z.number().int().min(1).max(2000), priceDelta: delta })).max(30),
        fabrics: z.array(z.object({ id, priceDelta: delta })).max(30),
      }),
    )
    .max(50),
  fits: z.array(z.object({ id, priceDelta: delta })).max(20),
  colors: z.array(z.object({ id, inStock: z.boolean() })).max(200),
  printMethods: z
    .array(
      z.object({
        id,
        prices: z.object({ S: money.optional(), M: money.optional(), L: money.optional(), AO: money.optional() }),
        setupFee: money,
        minQty: z.number().int().min(1).max(10_000),
        extraDays: z.number().int().min(0).max(60),
      }),
    )
    .max(40),
  personalization: z.object({
    name: z.object({ perPiece: money }),
    number: z.object({ perPiece: money }),
    namesList: z.object({ perPiece: money, setupFee: money, maxNames: z.number().int().min(1).max(1000) }),
    neckLabel: z.object({ perPiece: money, setupFee: money }),
  }),
  sizes: z.array(z.object({ id, surcharge: money })).max(20),
  deliverySpeeds: z.array(z.object({ id, percent: z.number().int().min(0).max(100), minFee: money, workingDays: z.number().int().min(1).max(120), enabled: z.boolean() })).max(10),
  shippingZones: z.array(z.object({ id, fee: money })).max(30),
  pickup: z.object({ enabled: z.boolean(), fee: money }),
  payments: z.object({ depositPercent: z.number().int().min(0).max(100), codFullMaxTotal: money }),
  holidays: z.array(z.string().regex(/^(\d{4}-)?\d{2}-\d{2}$/)).max(200),
  sizeCharts: z
    .array(
      z.object({
        productId: id,
        fitId: id,
        rows: z
          .array(z.object({ sizeId: id, chest: garmentCm, length: garmentCm, sleeve: z.object({ short: garmentCm.optional(), long: garmentCm.optional() }) }))
          .max(20),
      }),
    )
    .max(100)
    .optional(),
});

export const restoreSchema = z.object({ id: z.union([z.number().int().positive(), z.literal("original")]) });

/* ---------- "Send it to us" requests ---------- */

const cm = (min: number, max: number) => z.number().finite().min(min).max(max);

export const customRequestSchema = z
  .object({
    kind: z.enum(["design", "color", "size"]),
    locale: z.enum(["en", "ar"]),
    name: z.string().trim().min(2).max(60),
    phone: z.string().max(30),
    /** The garment they have in mind ("" = not sure yet). */
    productId: z.string().max(64).default(""),
    quantity: z.number().int().min(1).max(100_000).optional(),
    color: z.object({ hex, name: z.string().trim().max(80).default("") }).optional(),
    size: z
      .object({
        chest: cm(20, 120),
        length: cm(30, 150),
        sleeve: cm(5, 120).optional(),
        height: cm(50, 250).optional(),
        weight: cm(20, 300).optional(),
        count: z.number().int().min(1).max(1000),
      })
      .optional(),
    message: z.string().trim().max(1000).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "color" && !v.color) ctx.addIssue({ code: "custom", path: ["color"], message: "required" });
    if (v.kind === "size" && !v.size) ctx.addIssue({ code: "custom", path: ["size"], message: "required" });
  });

export type CustomRequestInput = z.infer<typeof customRequestSchema>;

export const adminRequestPatchSchema = z.object({
  status: z.enum(["new", "contacted", "done"]).optional(),
  teamNote: z.string().max(2000).optional(),
});
