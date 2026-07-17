import { Router, type IRouter } from "express";
import { eq, and, ilike, sql, count } from "drizzle-orm";
import { db, productsTable, conversionJobsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreateProductBody,
  UpdateProductBody,
  ListProductsQueryParams,
} from "@workspace/api-zod";
import { convertImageToModel } from "../services/tripoService";

const router: IRouter = Router();

function serializeProduct(p: typeof productsTable.$inferSelect) {
  return {
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
  };
}

// List products
router.get("/products", requireAuth, async (req, res): Promise<void> => {
  const mid = req.merchantId!;
  const qp = ListProductsQueryParams.safeParse(req.query);
  if (!qp.success) {
    res.status(400).json({ error: qp.error.message });
    return;
  }
  const { page, limit, search, conversionStatus, source } = qp.data;

  const conditions = [eq(productsTable.merchantId, mid)];
  if (search) conditions.push(ilike(sql`(${productsTable.name}->>'en')`, `%${search}%`));
  if (conversionStatus) conditions.push(eq(productsTable.conversionStatus, conversionStatus));
  if (source) conditions.push(eq(productsTable.source, source));

  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(productsTable)
    .where(where);

  const rows = await db
    .select()
    .from(productsTable)
    .where(where)
    .orderBy(sql`${productsTable.createdAt} DESC`)
    .limit(limit)
    .offset((page - 1) * limit);

  res.json({
    data: rows.map(serializeProduct),
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  });
});

// Create product
router.post("/products", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, description, price, currency, imagePath } = parsed.data;

  const [product] = await db
    .insert(productsTable)
    .values({
      merchantId: req.merchantId!,
      name,
      description: description ?? null,
      price: String(price),
      currency: currency ?? "USD",
      imagePath: imagePath ?? null,
      conversionStatus: "idle",
      source: "manual",
    })
    .returning();

  res.status(201).json(serializeProduct(product!));
});

// Get product
router.get("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!;
  const product = await db.query.productsTable.findFirst({
    where: and(eq(productsTable.id, id), eq(productsTable.merchantId, req.merchantId!)),
  });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(serializeProduct(product));
});

// Update product
router.put("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!;
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db.query.productsTable.findFirst({
    where: and(eq(productsTable.id, id), eq(productsTable.merchantId, req.merchantId!)),
  });
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const updates: Partial<typeof productsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.price !== undefined) updates.price = String(parsed.data.price);
  if (parsed.data.currency !== undefined) updates.currency = parsed.data.currency;
  if (parsed.data.imagePath !== undefined) updates.imagePath = parsed.data.imagePath;

  const [updated] = await db
    .update(productsTable)
    .set(updates)
    .where(eq(productsTable.id, id))
    .returning();

  res.json(serializeProduct(updated!));
});

// Delete product
router.delete("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!;
  const existing = await db.query.productsTable.findFirst({
    where: and(eq(productsTable.id, id), eq(productsTable.merchantId, req.merchantId!)),
  });
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.status(204).send();
});

// Trigger 3D conversion (mock: 10s delay, generates placeholder .glb/.usdz)
router.post("/products/:id/convert", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!;
  const product = await db.query.productsTable.findFirst({
    where: and(eq(productsTable.id, id), eq(productsTable.merchantId, req.merchantId!)),
  });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  if (product.conversionStatus === "pending") {
    res.status(400).json({ error: "Conversion already in progress" });
    return;
  }

  // Mark as pending and record job
  await db.update(productsTable).set({ conversionStatus: "pending" }).where(eq(productsTable.id, id));
  const [job] = await db
    .insert(conversionJobsTable)
    .values({ productId: id, merchantId: req.merchantId!, status: "pending" })
    .returning();

  res.status(202).json({ productId: id, conversionStatus: "pending", message: "Conversion queued" });

  // Run Tripo conversion asynchronously — does not block the HTTP response
  (async () => {
    try {
      if (!product.imagePath) {
        throw new Error("Product has no image URL — cannot convert without a source image");
      }

      const { glbPath, usdzPath } = await convertImageToModel(id, product.imagePath);

      await db.update(productsTable).set({
        conversionStatus: "completed",
        glbPath,
        usdzPath,
      }).where(eq(productsTable.id, id));

      await db.update(conversionJobsTable).set({
        status: "completed",
        completedAt: new Date(),
      }).where(eq(conversionJobsTable.id, job!.id));
    } catch (err: any) {
      const errorMessage = err?.message ?? "Tripo conversion failed";
      await db.update(productsTable).set({ conversionStatus: "failed" }).where(eq(productsTable.id, id));
      await db.update(conversionJobsTable).set({
        status: "failed",
        errorMessage,
      }).where(eq(conversionJobsTable.id, job!.id));
    }
  })();
});

// Generate embed code
router.get("/products/:id/embed-code", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!;
  const product = await db.query.productsTable.findFirst({
    where: and(eq(productsTable.id, id), eq(productsTable.merchantId, req.merchantId!)),
  });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  if (product.conversionStatus !== "completed" || !product.glbPath) {
    res.status(400).json({ error: "3D conversion not completed for this product" });
    return;
  }

  const host = `${req.protocol}://${req.get("host")}`;
  const glbUrl = `${host}/api${product.glbPath}`;
  const usdzUrl = `${host}/api${product.usdzPath}`;
  const productName =
    (typeof product.name === "object" && product.name !== null
      ? (product.name as Record<string, string>).en
      : String(product.name)) ?? "Product";

  const html = `<!-- AR Product Viewer: ${productName} -->
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"></script>
<model-viewer
  src="${glbUrl}"
  ios-src="${usdzUrl}"
  alt="${productName} 3D model"
  ar
  ar-modes="webxr scene-viewer quick-look"
  camera-controls
  auto-rotate
  style="width: 100%; height: 400px;"
></model-viewer>`;

  res.json({ productId: id, productName, glbUrl, usdzUrl, html });
});

export default router;
