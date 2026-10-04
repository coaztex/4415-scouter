import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  avatarBase64,
  teamAvatarPath,
  MAX_AVATAR_BYTES,
} from "../src/features/team-avatar/model";
import { prepareTbaAvatar } from "../src/features/team-avatar/server/image";

test("only explicit TBA avatar data is accepted, never a robot image", async () => {
  const png = await sharp({
    create: {
      width: 40,
      height: 40,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  const avatar = {
    type: "avatar",
    details: { base64Image: png.toString("base64") },
  };
  assert.equal(avatarBase64(avatar), png.toString("base64"));
  assert.equal(avatarBase64({ ...avatar, type: "imgur" }), null);
  assert.equal(
    avatarBase64({ type: "avatar", details: { base64Image: "not base64" } }),
    null,
  );
  const output = await prepareTbaAvatar(avatar);
  assert.ok(output);
  assert.ok(output.length <= MAX_AVATAR_BYTES);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.ok(metadata.width! <= 96 && metadata.height! <= 96);
  assert.equal(
    await prepareTbaAvatar({
      type: "avatar",
      details: { base64Image: Buffer.from("fake").toString("base64") },
    }),
    null,
  );
});

test("avatar paths are isolated by event and team", () => {
  const event = "10000000-0000-4000-8000-000000000081";
  const hash = "a".repeat(64);
  assert.equal(teamAvatarPath(event, 4415, hash), `${event}/4415/${hash}.webp`);
  assert.throws(() => teamAvatarPath(event, -1, hash));
});

test("outer padding is trimmed while square artwork fills the avatar", async () => {
  for (const transparent of [true, false]) {
    const pixels = Buffer.alloc(40 * 40 * 4);
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 40; x++) {
        const index = (y * 40 + x) * 4;
        const mark = x >= 15 && x < 25 && y >= 15 && y < 25;
        pixels[index] = mark ? 220 : 255;
        pixels[index + 1] = mark ? 20 : 255;
        pixels[index + 2] = mark ? 20 : 255;
        pixels[index + 3] = mark || !transparent ? 255 : 0;
      }
    const png = await sharp(pixels, {
      raw: { width: 40, height: 40, channels: 4 },
    })
      .png()
      .toBuffer();
    const output = await prepareTbaAvatar({
      type: "avatar",
      details: { base64Image: png.toString("base64") },
    });
    assert.ok(output);
    const { data, info } = await sharp(output)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 48);
    assert.equal(info.height, 48);
    const corner = Array.from(data.subarray(0, 4));
    assert.ok(
      corner[0] > 150 && corner[1] < 100 && corner[2] < 100 && corner[3] > 200,
    );
  }
});

test("wide logos keep their full shape instead of losing the ends", async () => {
  const pixels = Buffer.alloc(40 * 40 * 4);
  for (let y = 15; y < 25; y++)
    for (let x = 3; x < 37; x++) {
      const index = (y * 40 + x) * 4;
      pixels[index] = 20;
      pixels[index + 1] = 120;
      pixels[index + 2] = 220;
      pixels[index + 3] = 255;
    }
  const png = await sharp(pixels, {
    raw: { width: 40, height: 40, channels: 4 },
  })
    .png()
    .toBuffer();
  const output = await prepareTbaAvatar({
    type: "avatar",
    details: { base64Image: png.toString("base64") },
  });
  assert.ok(output);
  const { data, info } = await sharp(output)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 48);
  assert.equal(info.height, 48);
  const pixel = (x: number, y: number) =>
    Array.from(data.subarray((y * 48 + x) * 4, (y * 48 + x) * 4 + 4));
  assert.ok(pixel(0, 24)[3] > 200);
  assert.ok(pixel(47, 24)[3] > 200);
  assert.equal(pixel(24, 0)[3], 0);
});
