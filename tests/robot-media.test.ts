import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  MAX_OUTPUT_BYTES,
  primaryRobotMedia,
  robotMediaPath,
  tbaRobotImage,
} from "../src/features/robot-media/model";
import { prepareRobotPhoto } from "../src/features/robot-media/server/images";

test("paths are server-generated from event, team, and photo identities", () => {
  const event = "10000000-0000-4000-8000-000000000081";
  const id = "20000000-0000-4000-8000-000000000081";
  assert.equal(robotMediaPath(event, 4415, id), `${event}/4415/${id}.jpg`);
  assert.throws(() => robotMediaPath(event, -1, id));
  assert.throws(() => robotMediaPath("../event", 4415, id));
});

test("only usable TBA image URLs qualify; pit photos take priority", () => {
  assert.equal(
    tbaRobotImage({
      type: "imgur",
      direct_url: "https://i.imgur.com/AB12cd.jpeg",
    }),
    "https://i.imgur.com/AB12cd.jpeg",
  );
  assert.equal(
    tbaRobotImage({
      type: "avatar",
      direct_url: "https://i.imgur.com/AB12cd.jpeg",
    }),
    null,
  );
  assert.equal(
    tbaRobotImage({
      type: "imgur",
      direct_url: "https://evil.example/robot.jpg",
    }),
    null,
  );
  assert.equal(
    tbaRobotImage({
      type: "imgur",
      direct_url: "https://i.imgur.com/AB12cd.jpg?track=1",
    }),
    null,
  );
  const rows = [
    { source: "tba", is_primary: true, created_at: "2026-04-11" },
    { source: "pit_upload", is_primary: false, created_at: "2026-04-10" },
  ];
  assert.equal(primaryRobotMedia(rows), rows[1]);
});

test("server verifies image contents and resizes to a bounded JPEG", async () => {
  const png = await sharp({
    create: { width: 3200, height: 2400, channels: 3, background: "#ee3322" },
  })
    .png()
    .toBuffer();
  const output = await prepareRobotPhoto(
    new File([new Uint8Array(png)], "robot.png", { type: "image/png" }),
  );
  const info = await sharp(output).metadata();
  assert.equal(info.format, "jpeg");
  assert.equal(info.width, 1600);
  assert.equal(info.height, 1200);
  assert.ok(output.length <= MAX_OUTPUT_BYTES);
  await assert.rejects(() =>
    prepareRobotPhoto(
      new File(["not an image"], "robot.jpg", { type: "image/jpeg" }),
    ),
  );
  await assert.rejects(() =>
    prepareRobotPhoto(new File([png], "robot.svg", { type: "image/svg+xml" })),
  );
});
