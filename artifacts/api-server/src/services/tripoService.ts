/**
 * Tripo3D API service — image-to-3D-model conversion with step-by-step diagnostic logging.
 * Docs: https://platform.tripo3d.ai/docs
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { logger } from "../lib/logger";

const TRIPO_BASE = "https://api.tripo3d.ai/v2/openapi";
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 4000;

// ── helpers ─────────────────────────────────────────────────────────────────

async function tripoPost(endpoint: string, body: unknown, apiKey: string) {
  const url = `${TRIPO_BASE}${endpoint}`;
  logger.info({ url, body }, "[Tripo API] POST Request initiating");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  logger.info({ status: res.status, statusText: res.statusText, rawText }, "[Tripo API] POST Response received");

  if (!rawText || rawText.trim() === "") {
    throw new Error(`[Tripo Error] Server returned an EMPTY response body (HTTP ${res.status}) on POST ${endpoint}`);
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`[Tripo Error] Failed to parse JSON on POST ${endpoint}. Raw response was: "${rawText.slice(0, 300)}"`);
  }

  if (!res.ok || data.code !== 0) {
    throw new Error(`[Tripo Error] POST ${endpoint} failed (code: ${data.code}): ${data.message ?? res.statusText}`);
  }

  return data.data;
}

async function tripoGet(endpoint: string, apiKey: string) {
  const url = `${TRIPO_BASE}${endpoint}`;
  logger.info({ url }, "[Tripo API] GET Request initiating");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const rawText = await res.text();
  logger.info({ status: res.status, statusText: res.statusText, rawText }, "[Tripo API] GET Response received");

  if (!rawText || rawText.trim() === "") {
    throw new Error(`[Tripo Error] Server returned an EMPTY response body (HTTP ${res.status}) on GET ${endpoint}`);
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`[Tripo Error] Failed to parse JSON on GET ${endpoint}. Raw response was: "${rawText.slice(0, 300)}"`);
  }

  if (!res.ok || data.code !== 0) {
    throw new Error(`[Tripo Error] GET ${endpoint} failed (code: ${data.code}): ${data.message ?? res.statusText}`);
  }

  return data.data;
}

/**
 * Downloads a protected URL using system `curl` (bypasses Cloudflare/Vecteezy 403 TLS blocks)
 * or uses local file path directly, then uploads to Tripo3D.
 */
async function uploadImageToTripo(
  imageSource: string,
  outputDir: string,
  apiKey: string,
): Promise<{ token: string; fileType: string }> {
  let localFilePath = imageSource;
  let isTempFile = false;

  // If source is a web URL, download locally using `curl`
  if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
    const urlObj = new URL(imageSource);
    const referer = `${urlObj.protocol}//${urlObj.hostname}/`;
    localFilePath = path.join(outputDir, `source_temp_${Date.now()}`);
    isTempFile = true;

    logger.info({ imageSource, localFilePath }, "[Image Download] Initiating curl download for protected URL");

    const curlCmd = [
      `curl -sL`,
      `-A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"`,
      `-H "Referer: ${referer}"`,
      `-H "Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"`,
      `"${imageSource}"`,
      `-o "${localFilePath}"`,
    ].join(" ");

    try {
      execSync(curlCmd);
    } catch (curlErr: any) {
      logger.error({ curlErr: curlErr.message }, "[Image Download] curl command failed during execution");
      throw new Error(`curl download failed for ${imageSource}: ${curlErr.message}`);
    }

    if (!fs.existsSync(localFilePath)) {
      throw new Error(`[Image Download] Local file was not created after curl download: ${localFilePath}`);
    }

    const fileSize = fs.statSync(localFilePath).size;
    logger.info({ localFilePath, fileSize }, "[Image Download] Curl completed");

    if (fileSize === 0) {
      if (isTempFile && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
      throw new Error(`[Image Download] Downloaded file is 0 bytes (Empty payload) from: ${imageSource}`);
    }
  }

  // Determine file type
  const fileBuffer = fs.readFileSync(localFilePath);
  const fileType = imageSource.toLowerCase().includes("png")
    ? "png"
    : imageSource.toLowerCase().includes("webp")
      ? "webp"
      : "jpeg";

  logger.info({ localFilePath, fileType, bufferLength: fileBuffer.length }, "[Tripo Upload] Preparing FormData for upload");

  // Upload to Tripo3D
  const blob = new Blob([fileBuffer], { type: `image/${fileType}` });
  const formData = new FormData();
  formData.append("file", blob, `product.${fileType}`);

  const uploadUrl = `${TRIPO_BASE}/upload`;
  logger.info({ uploadUrl }, "[Tripo Upload] POSTing file to Tripo /upload");

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  const rawUploadText = await res.text();
  logger.info({ status: res.status, statusText: res.statusText, rawUploadText }, "[Tripo Upload] Raw response received");

  // Clean up downloaded temp file
  if (isTempFile && fs.existsSync(localFilePath)) {
    fs.unlinkSync(localFilePath);
    logger.info({ localFilePath }, "[Image Download] Cleaned up temp file");
  }

  if (!rawUploadText || rawUploadText.trim() === "") {
    throw new Error(`[Tripo Upload Error] Tripo /upload returned an EMPTY response (HTTP ${res.status})`);
  }

  let result: any;
  try {
    result = JSON.parse(rawUploadText);
  } catch (err) {
    throw new Error(`[Tripo Upload Error] /upload response was not valid JSON. Response body: "${rawUploadText.slice(0, 300)}"`);
  }

  if (!res.ok || result.code !== 0) {
    throw new Error(`[Tripo Upload Error] Upload failed with code ${result.code}: ${result.message ?? res.statusText}`);
  }

  logger.info({ imageToken: result.data.image_token }, "[Tripo Upload] Successfully received image token");
  return { token: result.data.image_token as string, fileType };
}

/** Create an image-to-model task and return the task_id. */
async function createImageToModelTask(
  fileToken: string,
  fileType: string,
  apiKey: string,
): Promise<string> {
  logger.info({ fileToken, fileType }, "[Tripo Task] Creating image_to_model task");
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
  logger.info({ originalTaskId, targetFormat }, "[Tripo Task] Creating convert_model task");
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

    logger.info({ taskId, status, progress }, "[Tripo Poll] Task progress update");

    if (status === "success") return data.output;

    if (status === "failed" || status === "cancelled") {
      throw new Error(
        `[Tripo Task Error] Task status marked as '${status}': ${data.message ?? "No additional details"}`,
      );
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error("[Tripo Poll] Task conversion timed out after 5 minutes");
}

/** Download a remote file and write it to localPath. */
async function downloadFile(url: string, localPath: string): Promise<void> {
  logger.info({ url, localPath }, "[Model Download] Downloading generated 3D asset file");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[Model Download Error] Download failed (HTTP ${res.status}): ${url}`);
  const buf = await res.arrayBuffer();
  fs.writeFileSync(localPath, Buffer.from(buf));
  logger.info({ localPath, bytes: buf.byteLength }, "[Model Download] Saved file to disk");
}

// ── public API ───────────────────────────────────────────────────────────────

export interface ConversionResult {
  glbPath: string;
  usdzPath: string | null;
}

/**
 * Full pipeline: download image locally via curl -> upload -> create task -> poll -> download GLB (+ USDZ).
 * @param productId  Used to create the output directory `public/models/<id>/`.
 * @param imagePath  Public URL or local file path of the product image.
 */
export async function convertImageToModel(
  productId: string,
  imagePath: string,
): Promise<ConversionResult> {
  const apiKey = process.env.TRIPO_API_KEY;
  if (!apiKey) {
    logger.error("TRIPO_API_KEY environment variable is NOT set!");
    throw new Error("TRIPO_API_KEY environment variable is not set");
  }

  const outputDir = path.join(process.cwd(), "public", "models", productId);
  fs.mkdirSync(outputDir, { recursive: true });

  logger.info({ productId, imagePath, outputDir }, "[Pipeline Start] Starting Tripo 3D Conversion");

  // 1. Download image locally via curl & upload to Tripo
  const { token, fileType } = await uploadImageToTripo(imagePath, outputDir, apiKey);
  logger.info({ productId, fileType, token }, "[Pipeline Step 1] Image successfully uploaded to Tripo");

  // 2. Create primary 3D task
  const taskId = await createImageToModelTask(token, fileType, apiKey);
  logger.info({ productId, taskId }, "[Pipeline Step 2] Primary 3D task created");

  // 3. Poll primary task
  const output = await pollTask(taskId, apiKey);
  logger.info({ productId, taskId, output }, "[Pipeline Step 3] Primary 3D task completed");

  // 4. Download primary GLB model
  const glbLocalPath = path.join(outputDir, "model.glb");
  await downloadFile(output.model as string, glbLocalPath);
  logger.info({ productId, glbLocalPath }, "[Pipeline Step 4] GLB model saved");

  // 5. Handle USDZ output
  let usdzPath: string | null = null;
  let usdzUrl: string | undefined = output.model_usdz ?? output.usdz;

  if (!usdzUrl) {
    try {
      logger.info({ productId, taskId }, "[Pipeline Step 5] USDZ not in output. Requesting USDZ format conversion task");
      const convertTaskId = await createConvertFormatTask(taskId, "usdz", apiKey);
      const convertOutput = await pollTask(convertTaskId, apiKey);
      usdzUrl = convertOutput.model ?? convertOutput.model_usdz;
    } catch (err: any) {
      logger.warn({ productId, err: err.message }, "[Pipeline Step 5] USDZ conversion failed, skipping USDZ model");
    }
  }

  // Download USDZ if available
  if (usdzUrl) {
    const usdzLocalPath = path.join(outputDir, "model.usdz");
    await downloadFile(usdzUrl, usdzLocalPath);
    usdzPath = `/models/${productId}/model.usdz`;
    logger.info({ productId, usdzPath }, "[Pipeline Step 5] USDZ model saved");
  }

  return {
    glbPath: `/models/${productId}/model.glb`,
    usdzPath,
  };
}
