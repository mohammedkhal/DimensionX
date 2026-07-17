/**
 * Tripo3D API service — image-to-3D-model conversion.
 * Docs: https://platform.tripo3d.ai/docs
 */
import fs from "fs";
import path from "path";
import { logger } from "../lib/logger";

const TRIPO_BASE = "https://api.tripo3d.ai/v2/openapi";
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 4000;

// ── helpers ─────────────────────────────────────────────────────────────────

async function tripoPost(endpoint: string, body: unknown, apiKey: string) {
  const res = await fetch(`${TRIPO_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { code: number; message?: string; data: any };
  if (!res.ok || data.code !== 0) {
    throw new Error(`Tripo API error (${endpoint}): ${data.message ?? res.statusText}`);
  }
  return data.data;
}

async function tripoGet(endpoint: string, apiKey: string) {
  const res = await fetch(`${TRIPO_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = (await res.json()) as { code: number; message?: string; data: any };
  if (!res.ok || data.code !== 0) {
    throw new Error(`Tripo API error (${endpoint}): ${data.message ?? res.statusText}`);
  }
  return data.data;
}

/** Upload an image from a public URL to Tripo and return the file token + type. */
async function uploadImageFromUrl(
  imageUrl: string,
  apiKey: string,
): Promise<{ token: string; fileType: string }> {
  // Pass a custom browser User-Agent to bypass 403 Forbidden blocks from Vecteezy/PNGTree
  const imageRes = await fetch(imageUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!imageRes.ok) {
    throw new Error(`Could not fetch product image: ${imageRes.status} ${imageUrl}`);
  }

  const contentType = imageRes.headers.get("content-type") ?? "image/jpeg";
  const fileType = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpeg";

  const blob = await imageRes.blob();
  const formData = new FormData();
  formData.append("file", blob, `product.${fileType}`);

  const res = await fetch(`${TRIPO_BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  const result = (await res.json()) as { code: number; message?: string; data: any };
  if (!res.ok || result.code !== 0) {
    throw new Error(`Tripo upload failed: ${result.message ?? res.statusText}`);
  }

  return { token: result.data.image_token as string, fileType };
}

/** Create an image-to-model task and return the task_id. */
async function createImageToModelTask(
  fileToken: string,
  fileType: string,
  apiKey: string,
): Promise<string> {
  const data = await tripoPost(
    "/task",
    {
      type: "image_to_model",
      file: { type: fileType, file_token: fileToken },
      model_version: "v2.0-20240919",
    },
    apiKey,
  );
  return data.task_id as string;
}

/** Create a format conversion task (e.g. convert GLB task output to USDZ). */
async function createConvertFormatTask(
  originalTaskId: string,
  targetFormat: "usdz" | "obj" | "fbx" | "stl",
  apiKey: string,
): Promise<string> {
  const data = await tripoPost(
    "/task",
    {
      type: "convert_model",
      original_task_id: originalTaskId,
      format: targetFormat,
    },
    apiKey,
  );
  return data.task_id as string;
}

/** Poll the task endpoint until it succeeds, fails, or times out. */
async function pollTask(taskId: string, apiKey: string): Promise<any> {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const data = await tripoGet(`/task/${taskId}`, apiKey);
    const status: string = data.status;
    const progress: number = data.progress ?? 0;

    logger.info({ taskId, status, progress }, "Tripo task poll");

    if (status === "success") return data.output;

    if (status === "failed" || status === "cancelled") {
      throw new Error(
        `Tripo task ${status}: ${data.message ?? "no message"}`,
      );
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error("Tripo conversion timed out after 5 minutes");
}

/** Download a remote file and write it to localPath. */
async function downloadFile(url: string, localPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const buf = await res.arrayBuffer();
  fs.writeFileSync(localPath, Buffer.from(buf));
}

// ── public API ───────────────────────────────────────────────────────────────

export interface ConversionResult {
  glbPath: string;
  usdzPath: string | null;
}

/**
 * Full pipeline: upload → create task → poll → download GLB (+ convert and download USDZ).
 * @param productId  Used to create the output directory `public/models/<id>/`.
 * @param imagePath  Public URL of the product image.
 */
export async function convertImageToModel(
  productId: string,
  imagePath: string,
): Promise<ConversionResult> {
  const apiKey = process.env.TRIPO_API_KEY;
  if (!apiKey) throw new Error("TRIPO_API_KEY environment variable is not set");

  const outputDir = path.join(process.cwd(), "public", "models", productId);
  fs.mkdirSync(outputDir, { recursive: true });

  logger.info({ productId, imagePath }, "Starting Tripo conversion");

  // 1. Upload image
  const { token, fileType } = await uploadImageFromUrl(imagePath, apiKey);
  logger.info({ productId, fileType }, "Image uploaded to Tripo");

  // 2. Create primary 3D task
  const taskId = await createImageToModelTask(token, fileType, apiKey);
  logger.info({ productId, taskId }, "Tripo task created");

  // 3. Poll primary task
  const output = await pollTask(taskId, apiKey);
  logger.info({ productId, taskId, output }, "Tripo task succeeded");

  // 4. Download primary GLB model
  const glbLocalPath = path.join(outputDir, "model.glb");
  await downloadFile(output.model as string, glbLocalPath);
  logger.info({ productId }, "GLB downloaded");

  // 5. Handle USDZ output
  let usdzPath: string | null = null;
  let usdzUrl: string | undefined = output.model_usdz ?? output.usdz;

  // If USDZ isn't included in initial task output, request a conversion task
  if (!usdzUrl) {
    try {
      logger.info({ productId, taskId }, "Requesting USDZ model conversion task");
      const convertTaskId = await createConvertFormatTask(taskId, "usdz", apiKey);
      const convertOutput = await pollTask(convertTaskId, apiKey);
      usdzUrl = convertOutput.model ?? convertOutput.model_usdz;
    } catch (err) {
      logger.warn({ productId, err }, "USDZ conversion failed, skipping USDZ model");
    }
  }

  // Download USDZ if available
  if (usdzUrl) {
    const usdzLocalPath = path.join(outputDir, "model.usdz");
    await downloadFile(usdzUrl, usdzLocalPath);
    usdzPath = `/models/${productId}/model.usdz`;
    logger.info({ productId }, "USDZ downloaded");
  }

  return {
    glbPath: `/models/${productId}/model.glb`,
    usdzPath,
  };
}
