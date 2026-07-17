import { Router, type IRouter } from "express";
import { eq, and, count, sql } from "drizzle-orm";
import { db, productsTable, conversionJobsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const mid = req.merchantId!;

  const [totals] = await db
    .select({
      totalProducts: count(),
    })
    .from(productsTable)
    .where(eq(productsTable.merchantId, mid));

  const [completed] = await db
    .select({ completedConversions: count() })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.merchantId, mid),
        eq(productsTable.conversionStatus, "completed"),
      ),
    );

  const [inQueue] = await db
    .select({ conversionsInQueue: count() })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.merchantId, mid),
        eq(productsTable.conversionStatus, "pending"),
      ),
    );

  const [external] = await db
    .select({ externalSyncCount: count() })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.merchantId, mid),
        sql`${productsTable.source} != 'manual'`,
      ),
    );

  const total = Number(totals?.totalProducts ?? 0);
  const externalCount = Number(external?.externalSyncCount ?? 0);

  res.json({
    totalProducts: total,
    completedConversions: Number(completed?.completedConversions ?? 0),
    conversionsInQueue: Number(inQueue?.conversionsInQueue ?? 0),
    externalSyncCount: externalCount,
    externalSyncRatio: total > 0 ? externalCount / total : 0,
  });
});

router.get(
  "/dashboard/conversions-chart",
  requireAuth,
  async (req, res): Promise<void> => {
    const mid = req.merchantId!;
    const months = Math.min(
      Math.max(parseInt(String(req.query.months ?? "6"), 10) || 6, 1),
      24,
    );

    // Generate last N months and count completed jobs
    const rows = await db
      .select({
        month: sql<string>`TO_CHAR(DATE_TRUNC('month', ${conversionJobsTable.completedAt}), 'Mon YYYY')`,
        monthStart: sql<string>`DATE_TRUNC('month', ${conversionJobsTable.completedAt})`,
        count: count(),
      })
      .from(conversionJobsTable)
      .where(
        and(
          eq(conversionJobsTable.merchantId, mid),
          eq(conversionJobsTable.status, "completed"),
          sql`${conversionJobsTable.completedAt} >= NOW() - INTERVAL '${sql.raw(String(months))} months'`,
        ),
      )
      .groupBy(
        sql`DATE_TRUNC('month', ${conversionJobsTable.completedAt})`,
        sql`TO_CHAR(DATE_TRUNC('month', ${conversionJobsTable.completedAt}), 'Mon YYYY')`,
      )
      .orderBy(sql`DATE_TRUNC('month', ${conversionJobsTable.completedAt})`);

    // Fill in missing months with 0
    const result: { month: string; count: number }[] = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
      const found = rows.find((r) => r.month === label);
      result.push({ month: label, count: found ? Number(found.count) : 0 });
    }

    res.json({ data: result });
  },
);

export default router;
