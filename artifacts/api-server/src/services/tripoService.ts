/**
 * Tripo3D API Service
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const TRIPO_BASE = "https://api.tripo3d.ai/v2/openapi";
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 4000;

async function safeTripoPost(endpoint: string, body: unknown, apiKey: string) {
  const res = await fetch(`${TRIPO_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on POST ${endpoint}: ${text}`);
  }

  const data = JSON.parse(text);
  if (data.code !== 0) {
    throw new Error(`Tripo Error (${endpoint}): ${data.message ?? "Unknown error"}`);
  }
  return data.data;
}

async function safeTripoGet(endpoint: string, apiKey: string) {
  const res = await fetch(`${TRIPO_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on GET ${endpoint}: ${text}`);
  }

  const data = JSON.parse(text);
  if (data.code !== 0) {
    throw new Error(`Tripo Error (${endpoint}): ${data.message ?? "Unknown error"}`);
  }
  return data.data;
}

/** Downloads image locally using curl to pass hotlink/bot protection, then uploads to Tripo3D */
async function uploadImageToTripo(
  imageSource: string,
  outputDir: string,
  apiKey: string
): Promise<{ token: string; fileType: string }> {
  let localFilePath = imageSource;
  let isTempFile = false;

  if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
    const urlObj = new URL(imageSource);
    const referer = `${urlObj.protocol}//${urlObj.hostname}/`;
    localFilePath = path.join(outputDir, `temp_${Date.now()}.png`);
    isTempFile = true;

    const curlCmd = [
      `curl -sL`,
      `-A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"`,
      `-H "Referer: ${referer}"`,
      `"${imageSource}"`,
      `-o "${localFilePath}"`,
    ].join(" ");

    execSync(curlCmd);

    if (!fs.existsSync(localFilePath) || fs.statSync(localFilePath).size === 0) {
      if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
      throw new Error(`Failed to download image from URL: ${imageSource}`);
    }
  }

  const fileBuffer = fs.readFileSync(localFilePath);
  const fileType = imageSource.toLowerCase().includes("png") ? "png" : "jpeg";

  const blob = new Blob([fileBuffer], { type: `image/${fileType}` });
  const formData = new FormData();
  formData.append("file", blob, `product.${fileType}`);

  const uploadRes = await fetch(`${TRIPO_BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (isTempFile && fs.existsSync(localFilePath)) {
    fs.unlinkSync(localFilePath);
  }

  const uploadText = await uploadRes.text();
  if (!uploadRes.ok) {
    throw new Error(`Upload HTTP ${uploadRes.status}: ${uploadText}`);
  }

  const result = JSON.parse(uploadText);
  if (result.code !== 0) {
    throw new Error(`Tripo Upload Error: ${result.message}`);
  }

  return { token: result.data.image_token as string, fileType };
}

async function pollTask(taskId: string, apiKey: string): Promise<any> {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const data = await safeTripoGet(`/task/${taskId}`, apiKey);
    const status: string = data.status;

    if (status === "success") return data.output;
    if (status === "failed" || status === "cancelled") {
      throw new Error(`Tripo task failed: ${data.message ?? "No details"}`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error("Tripo task conversion timed out.");
}

async function downloadFile(url: string, localPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const buf = await res.arrayBuffer();
  fs.writeFileSync(localPath, Buffer.from(buf));
}

export interface ConversionResult {
  glbPath: string;
  usdzPath: string | null;
}

export async function convertImageToModel(
  productId: string,
  imagePath: string
): Promise<ConversionResult> {
  const apiKey = process.env.TRIPO_API_KEY;
  if (!apiKey) throw new Error("TRIPO_API_KEY environment variable is missing");

  const outputDir = path.join(process.cwd(), "public", "models", productId);
  fs.mkdirSync(outputDir, { recursive: true });

  // 1. Upload
  const { token, fileType } = await uploadImageToTripo(imagePath, outputDir, apiKey);

  // 2. Task
  const taskData = await safeTripoPost(
    "/task",
    {
      type: "image_to_model",
      file: { type: fileType, file_token: token },
      model_version: "v2.0-20240919",
    },
    apiKey
  );

  // 3. Poll
  const output = await pollTask(taskData.task_id, apiKey);

  // 4. Download GLB
  const glbLocalPath = path.join(outputDir, "model.glb");
  await downloadFile(output.model as string, glbLocalPath);

  // 5. Convert & Download USDZ
  let usdzPath: string | null = null;
  let usdzUrl: string | undefined = output.model_usdz ?? output.usdz;

  if (!usdzUrl) {
    try {
      const convertTask = await safeTripoPost(
        "/task",
        {
          type: "convert_model",
          original_task_id: taskData.task_id,
          format: "usdz",
        },
        apiKey
      );
      const convertOutput = await pollTask(convertTask.task_id, apiKey);
      usdzUrl = convertOutput.model ?? convertOutput.model_usdz;
    } catch {
      // USDZ creation failed gracefully
    }
  }

  if (usdzUrl) {
    const usdzLocalPath = path.join(outputDir, "model.usdz");
    await downloadFile(usdzUrl, usdzLocalPath);
    usdzPath = `/models/${productId}/model.usdz`;
  }

  return {
    glbPath: `/models/${productId}/model.glb`,
    usdzPath,
  };
}
