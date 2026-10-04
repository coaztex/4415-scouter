import "server-only";
import sharp from "sharp";
import { avatarBase64, MAX_AVATAR_BYTES } from "../model";

export async function prepareTbaAvatar(input: unknown): Promise<Buffer | null> {
  const base64 = avatarBase64(input);
  if (!base64) return null;
  try {
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > 200_000) return null;
    const metadata = await sharp(bytes, {
      limitInputPixels: 512 * 512,
    }).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 512 ||
      metadata.height > 512 ||
      !["png", "jpeg", "webp"].includes(metadata.format)
    )
      return null;
    // Trim only the outer canvas. Many TBA avatars are 40 px artwork with
    // non-square marks or text, so a square cover crop loses useful content.
    let cropped: Buffer;
    try {
      cropped = await sharp(bytes, { limitInputPixels: 512 * 512 })
        .rotate()
        .trim({ threshold: 12 })
        .toBuffer();
    } catch {
      cropped = bytes;
    }
    const output = await sharp(cropped, { limitInputPixels: 512 * 512 })
      .rotate()
      .resize(48, 48, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: metadata.format === "png" ? "nearest" : "lanczos3",
      })
      .webp({ lossless: true })
      .toBuffer();
    return output.length <= MAX_AVATAR_BYTES ? output : null;
  } catch {
    return null;
  }
}
