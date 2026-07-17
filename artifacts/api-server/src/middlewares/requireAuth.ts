import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Extend Request to carry resolved merchant info
declare global {
  namespace Express {
    interface Request {
      merchantId?: string;
      clerkUserId?: string;
    }
  }
}

/**
 * JIT-provisions a merchant row for a new Clerk user, then attaches
 * `req.merchantId` and `req.clerkUserId` for downstream handlers.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const clerkId = auth?.userId;

  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // JIT-provision merchant row on first sign-in
  let merchant = await db.query.merchantsTable.findFirst({
    where: eq(merchantsTable.clerkId, clerkId),
  });

  if (!merchant) {
    const email =
      (auth.sessionClaims?.email as string | undefined) ??
      `${clerkId}@unknown.com`;

    [merchant] = await db
      .insert(merchantsTable)
      .values({ clerkId, email })
      .returning();
  }

  req.merchantId = merchant!.id;
  req.clerkUserId = clerkId;
  next();
}
