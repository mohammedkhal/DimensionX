import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { ImportProductsBody } from "@workspace/api-zod";

const router: IRouter = Router();

// Mock Shopify products
const SHOPIFY_MOCK = [
  { externalId: "sh-001", name: "Leather Messenger Bag", description: "Handcrafted genuine leather", price: 149.99, currency: "USD", imageUrl: null },
  { externalId: "sh-002", name: "Ceramic Pour-Over Set", description: "Minimalist brewing for coffee lovers", price: 64.00, currency: "USD", imageUrl: null },
  { externalId: "sh-003", name: "Wireless Charging Pad", description: "15W fast wireless charging", price: 39.95, currency: "USD", imageUrl: null },
  { externalId: "sh-004", name: "Linen Table Runner", description: "Natural linen, 180cm", price: 28.50, currency: "USD", imageUrl: null },
  { externalId: "sh-005", name: "Walnut Desk Organizer", description: "Solid walnut, three compartments", price: 89.00, currency: "USD", imageUrl: null },
];

// Mock Salla products
const SALLA_MOCK = [
  { externalId: "sa-001", name: "عطر عود كلاسيكي", description: "عطر شرقي فاخر", price: 299.00, currency: "SAR", imageUrl: null },
  { externalId: "sa-002", name: "أباجورة يدوية الصنع", description: "خزف مغربي تقليدي", price: 185.00, currency: "SAR", imageUrl: null },
  { externalId: "sa-003", name: "سجادة بربرية", description: "نسيج يدوي أصيل", price: 1200.00, currency: "SAR", imageUrl: null },
  { externalId: "sa-004", name: "مجموعة قهوة عربية", description: "دلة وفناجين تقليدية", price: 450.00, currency: "SAR", imageUrl: null },
];

function getMockProducts(source: "shopify" | "salla") {
  return source === "shopify" ? SHOPIFY_MOCK : SALLA_MOCK;
}

// Preview import
router.get("/import/preview", requireAuth, async (req, res): Promise<void> => {
  const source = req.query.source as string;
  if (source !== "shopify" && source !== "salla") {
    res.status(400).json({ error: "source must be 'shopify' or 'salla'" });
    return;
  }
  res.json({ source, products: getMockProducts(source) });
});

// Execute import
router.post("/import", requireAuth, async (req, res): Promise<void> => {
  const parsed = ImportProductsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { source, externalIds } = parsed.data;
  const mid = req.merchantId!;

  let candidates = getMockProducts(source);
  if (externalIds && externalIds.length > 0) {
    candidates = candidates.filter((p) => externalIds.includes(p.externalId));
  }

  const imported: (typeof productsTable.$inferSelect)[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    // Skip if already imported (same externalId + source for this merchant)
    const existing = await db.query.productsTable.findFirst({
      where: and(
        eq(productsTable.merchantId, mid),
        eq(productsTable.source, source),
        eq(productsTable.externalId, candidate.externalId),
      ),
    });
    if (existing) {
      skipped++;
      continue;
    }

    const [product] = await db
      .insert(productsTable)
      .values({
        merchantId: mid,
        name: { en: candidate.name },
        description: { en: candidate.description ?? "" },
        price: String(candidate.price),
        currency: candidate.currency,
        imagePath: candidate.imageUrl ?? null,
        conversionStatus: "idle",
        source,
        externalId: candidate.externalId,
      })
      .returning();

    imported.push(product!);
  }

  res.json({
    imported: imported.length,
    skipped,
    products: imported.map((p) => ({
      id: p.id,
      merchantId: p.merchantId,
      name: p.name,
      description: p.description ?? undefined,
      price: parseFloat(String(p.price)),
      currency: p.currency,
      imagePath: p.imagePath ?? null,
      glbPath: p.glbPath ?? null,
      usdzPath: p.usdzPath ?? null,
      conversionStatus: p.conversionStatus,
      source: p.source,
      externalId: p.externalId ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
});

export default router;
