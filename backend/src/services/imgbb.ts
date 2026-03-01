import type { Express } from "express";

/**
 * Upload a single image buffer to ImgBB.
 *
 * @param buffer   Raw image bytes
 * @param filename Human-readable filename (stored on ImgBB for reference)
 * @returns        Permanent image URL
 */
export async function uploadToImgBB(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    throw new Error("[imgbb] IMGBB_API_KEY env var is not set");
  }

  const base64 = buffer.toString("base64");

  const params = new URLSearchParams();
  params.append("key", apiKey);
  params.append("image", base64);
  params.append("name", filename);

  const response = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    body: params,
  });

  if (!response.ok) {
    throw new Error(
      `[imgbb] upload failed for ${filename}: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const json = (await response.json()) as {
    data?: { url?: string };
    success?: boolean;
  };

  if (!json.success || !json.data?.url) {
    throw new Error(
      `[imgbb] upload failed for ${filename}: unexpected response shape`,
    );
  }

  return json.data.url;
}

/**
 * Upload multiple screenshots to ImgBB with graceful degradation.
 *
 * One failed upload does NOT abort the batch — a placeholder is used instead
 * so the bug report still goes through.
 *
 * @param files  Array of Multer file objects (buffers in memory)
 * @returns      Array of image URLs or "[screenshot unavailable]" placeholders
 */
export async function uploadScreenshots(
  files: Express.Multer.File[],
): Promise<string[]> {
  const results = await Promise.allSettled(
    files.map((file) => uploadToImgBB(file.buffer, file.originalname)),
  );

  return results.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      const filename = files[i]?.originalname ?? `screenshot-${i}`;
      console.warn(
        `[imgbb] upload failed for ${filename}: ${result.reason}`,
      );
      return "[screenshot unavailable]";
    }
  });
}
