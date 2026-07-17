import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, merchantsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateMeBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const merchant = await db.query.merchantsTable.findFirst({
    where: eq(merchantsTable.id, req.merchantId!),
  });

  if (!merchant) {
    res.status(404).json({ error: "Merchant not found" });
    return;
  }

  res.json({
    id: merchant.id,
    clerkId: merchant.clerkId,
    email: merchant.email,
    displayName: merchant.displayName ?? undefined,
    locale: merchant.locale,
    createdAt: merchant.createdAt.toISOString(),
  });
});

router.put("/me", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof merchantsTable.$inferInsert> = {};
  if (parsed.data.displayName !== undefined)
    updates.displayName = parsed.data.displayName;
  if (parsed.data.locale !== undefined) updates.locale = parsed.data.locale;

  const [updated] = await db
    .update(merchantsTable)
    .set(updates)
    .where(eq(merchantsTable.id, req.merchantId!))
    .returning();

  res.json({
    id: updated.id,
    clerkId: updated.clerkId,
    email: updated.email,
    displayName: updated.displayName ?? undefined,
    locale: updated.locale,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;
