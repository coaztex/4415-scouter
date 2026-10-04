import "server-only";
import sharp from "sharp";
import { MAX_INPUT_BYTES, MAX_OUTPUT_BYTES } from "../model";

export async function prepareRobotPhoto(file: File): Promise<Buffer> {
  if (
    ![
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ].includes(file.type) ||
    file.size === 0 ||
    file.size > MAX_INPUT_BYTES
  )
    throw new Error("Choose a JPEG, PNG, WebP, or HEIC image under 12 MB.");
  const source = Buffer.from(await file.arrayBuffer());
  try {
    const image = sharp(source, { limitInputPixels: 40_000_000 });
    const info = await image.metadata();
    if (
      !["jpeg", "png", "webp", "heif"].includes(info.format ?? "") ||
      !info.width ||
      !info.height
    )
      throw new Error();
    for (const quality of [82, 72, 62]) {
      const result = await sharp(source, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (result.length <= MAX_OUTPUT_BYTES) return result;
    }
  } catch {
    throw new Error("This image could not be read. Try a JPEG or PNG photo.");
  }
  throw new Error("This photo is too complex to resize below 2 MB.");
}
