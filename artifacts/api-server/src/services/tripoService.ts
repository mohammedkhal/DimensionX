/**
 * Tripo3D API Service — Image-to-3D Conversion Pipeline
 * Base OpenAPI Docs: https://platform.tripo3d.ai/docs
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const TRIPO_BASE = "https://api.tripo3d.ai/v2/openapi";
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes timeout
const POLL_INTERVAL_MS = 4000; // Poll status every 4 seconds

// ── Instant Console Logger (bypasses logger buffering) ──────────────────────
const log = {
  info: (msg: string, data?: any) =>
    console.log(`[TRIPO INFO] ${msg}`, data ? JSON.stringify(data) : ""),
  warn: (msg: string, data?: any) =>
    console.warn(`[TRIPO WARN] ${msg}`, data ? JSON.stringify(data) : ""),
  error: (msg: string, data?: any) =>
    console.error(`[TRIPO ERROR] ${msg}`, data ? JSON.stringify(data) : ""),
};

// ── HTTP Helper: Safe Body Inspection Before Parsing JSON ───────────────────
async function safeFetch(url: string, options: RequestInit) {
  log.info(`Requesting ${options.method || "GET"} -> ${url}`);

  const res = await fetch(url, options);
  const rawText = await res.text();

  log.info(`Response Status: HTTP ${res.status} (${res.statusText})`);

  if (!rawText || rawText.trim() === "") {
    throw new Error(
      `[HTTP Error ${res.status}] Tripo API returned an completely EMPTY response body from: ${url}`
    );
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (err) {
    throw new Error(
      `[JSON Parse Failure] Endpoint returned non-JSON response (HTTP ${res.status}): "${rawText.slice(0, 300)}"`
    );
  }

  if (!res.ok || data.code !== 0) {
    throw new Error(
      `[Tripo API Error] Code ${data.code ?? "N/A"}: ${data.message || res.statusText}`
    );
  }

  return data.data;
}

// ── Step 1: Download Image via Curl & Upload to Tripo ───────────────────────
async function uploadImageToTripo(
  imageSource: string,
  outputDir: string,
  apiKey: string
): Promise<{ token: string; fileType: string }> {
  let localFilePath = imageSource;
  let isTempFile = false;

  // 1A. If imageSource is a public URL, download it with system curl to bypass anti-bot/403 blocks
  if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
    const urlObj = new URL(imageSource);
    const referer = `${urlObj.protocol}//${urlObj.hostname}/`;
    localFilePath = path.join(outputDir, `source_temp_${Date.now()}`);
    isTempFile = true;

    log.info(`Downloading external image URL with curl: ${imageSource}`);

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
      log.error(`Curl command execution failed!`, curlErr.message);
      throw new Error(`Failed to download image from ${imageSource}: ${curlErr.message}`);
    }

    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Curl output file missing: ${localFilePath}`);
    }

    const fileSize = fs.statSync(localFilePath).size;
    log.info(`Curl download complete. File size: ${fileSize} bytes`);

    if (fileSize === 0) {
      if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
      throw new Error(`Downloaded image from ${imageSource} was empty (0 bytes).`);
    }
  }

  // 1B. Read local file and construct multipart form data upload
  const fileBuffer = fs.readFileSync(localFilePath);
  const fileType = imageSource.toLowerCase().includes("png")
    ? "png"
    : imageSource.toLowerCase().includes("webp")
      ? "webp"
      : "jpeg";

  log.info(`Preparing FormData file upload to Tripo (/upload)`);

  const blob = new Blob([fileBuffer], { type: `image/${fileType}` });
  const formData = new FormData();
  formData.append("file", blob, `product.${fileType}`);

  // Perform upload
  const uploadRes = await fetch(`${TRIPO_BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  // Clean up temporary image download file
  if (isTempFile && fs.existsSync(localFilePath)) {
    fs.unlinkSync(localFilePath);
    log.info(`Cleaned up temporary image download file`);
  }

  const rawUploadText = await uploadRes.text();
  log.info(`Upload Response Status: HTTP ${uploadRes.status}`);

  if (!rawUploadText || rawUploadText.trim() === "") {
    throw new Error(
      `[Tripo Upload Error] Endpoint returned an empty payload (HTTP ${uploadRes.status})`
    );
  }

  let uploadResult: any;
  try {
    uploadResult = JSON.parse(rawUploadText);
  } catch (e) {
    throw new Error(
      `[Tripo Upload Error] Could not parse upload JSON. Server returned: "${rawUploadText.slice(0, 300)}"`
    );
  }

  if (!uploadRes.ok || uploadResult.code !== 0) {
    throw new Error(
      `[Tripo Upload Failed] Code ${uploadResult.code}: ${uploadResult.message || uploadRes.statusText}`
    );
  }

  const token = uploadResult.data.image_token as string;
  log.info(`Successfully received image_token: ${token}`);
  return { token, fileType };
}

// ── Step 2: Create 3D Task ──────────────────────────────────────────────────
async function createImageToModelTask(
  fileToken: string,
  fileType: string,
  apiKey: string
): Promise<string> {
  log.info(`Creating image_to_model task...`);
  const data = await safeFetch(`${TRIPO_BASE}/task`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "image_to_model",
      file: { type: fileType, file_token: fileToken },
      model_version: "v2.0-20240919",
    }),
  });

  log.info(`3D Generation Task Created. Task ID: ${data.task_id}`);
  return data.task_id as string;
}

// ── Step 3: Format Conversion Task (GLB -> USDZ) ───────────────────────────
async function createConvertFormatTask(
  originalTaskId: string,
  targetFormat: "usdz" | "obj" | "fbx" | "stl",
  apiKey: string
): Promise<string> {
  log.info(`Creating format conversion sub-task (${targetFormat})...`);
  const data = await safeFetch(`${TRIPO_BASE}/task`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "convert_model",
      original_task_id: originalTaskId,
      format: targetFormat,
    }),
  });

  return data.task_id as string;
}

// ── Step 4: Poll Task Status Until Finished ─────────────────────────────────
async function pollTask(taskId: string, apiKey: string): Promise<any> {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const data = await safeFetch(`${TRIPO_BASE}/task/${taskId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const status: string = data.status;
    const progress: number = data.progress ?? 0;

    log.info(`Task Poll -> ID: ${taskId} | Status: ${status} | Progress: ${progress}%`);

    if (status === "success") return data.output;

    if (status === "failed" || status === "cancelled") {
      throw new Error(
        `Tripo task processing failed with status '${status}': ${data.message || "No error details provided."}`
      );
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Tripo task conversion timed out after 5 minutes.`);
}

// ── Step 5: Download Asset File to Local Disk ──────────────────────────────
async function downloadFile(url: string, localPath: string): Promise<void> {
  log.info(`Downloading output asset file: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}): ${url}`);
  const buf = await res.arrayBuffer();
  fs.writeFileSync(localPath, Buffer.from(buf));
  log.info(`File saved to local path: ${localPath} (${buf.byteLength} bytes)`);
}

// ── PUBLIC MAIN EXPORT ───────────────────────────────────────────────────────

export interface ConversionResult {
  glbPath: string;
  usdzPath: string | null;
}

/**
 * Full Pipeline Executer
 * @param productId  Subfolder created in public/models/<productId>
 * @param imagePath  Public Web URL or Local File Path
 */
export async function convertImageToModel(
  productId: string,
  imagePath: string
): Promise<ConversionResult> {
  console.log("=========================================================");
  log.info(`Starting Tripo 3D Conversion Pipeline`, { productId, imagePath });
  console.log("=========================================================");

  const apiKey = process.env.TRIPO_API_KEY;
  if (!apiKey) {
    log.error("TRIPO_API_KEY environment variable is NOT set!");
    throw new Error("TRIPO_API_KEY environment variable is not set");
  }

  const outputDir = path.join(process.cwd(), "public", "models", productId);
  fs.mkdirSync(outputDir, { recursive: true });

  // 1. Upload
  const { token, fileType } = await uploadImageToTripo(imagePath, outputDir, apiKey);

  // 2. Task
  const taskId = await createImageToModelTask(token, fileType, apiKey);

  // 3. Poll
  const output = await pollTask(taskId, apiKey);

  // 4. Download GLB
  const glbLocalPath = path.join(outputDir, "model.glb");
  await downloadFile(output.model as string, glbLocalPath);

  // 5. Convert & Download USDZ
  let usdzPath: string | null = null;
  let usdzUrl: string | undefined = output.model_usdz ?? output.usdz;

  if (!usdzUrl) {
    try {
      log.info(`USDZ not provided in primary output. Requesting format conversion...`);
      const convertTaskId = await createConvertFormatTask(taskId, "usdz", apiKey);
      const convertOutput = await pollTask(convertTaskId, apiKey);
      usdzUrl = convertOutput.model ?? convertOutput.model_usdz;
    } catch (err: any) {
      log.warn(`USDZ format conversion failed, skipping USDZ: ${err.message}`);
    }
  }

  if (usdzUrl) {
    const usdzLocalPath = path.join(outputDir, "model.usdz");
    await downloadFile(usdzUrl, usdzLocalPath);
    usdzPath = `/models/${productId}/model.usdz`;
  }

  log.info(`Pipeline Finished Successfully!`);
  return {
    glbPath: `/models/${productId}/model.glb`,
    usdzPath,
  };
}
