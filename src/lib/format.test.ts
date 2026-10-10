import { test } from "node:test";
import assert from "node:assert/strict";
import { fitSize, outputName, resolveMime, savingRate } from "./format.ts";

test("fitSize は長辺を上限に収め、拡大はしない", () => {
  assert.deepEqual(fitSize(4000, 3000, 1920), { width: 1920, height: 1440 });
  assert.deepEqual(fitSize(3000, 4000, 1920), { width: 1440, height: 1920 });
  assert.deepEqual(fitSize(800, 600, 1920), { width: 800, height: 600 });
  assert.deepEqual(fitSize(4000, 3000, 0), { width: 4000, height: 3000 });
});

test("resolveMime は書き出せない形式を JPEG にする", () => {
  assert.equal(resolveMime("image/png", "keep"), "image/png");
  assert.equal(resolveMime("image/gif", "keep"), "image/jpeg");
  assert.equal(resolveMime("image/png", "image/webp"), "image/webp");
});

test("outputName は拡張子を差し替える", () => {
  assert.equal(outputName("IMG_0001.HEIC.png", "image/webp"), "IMG_0001.HEIC.webp");
  assert.equal(outputName("noext", "image/jpeg"), "noext.jpg");
});

test("savingRate", () => {
  assert.equal(savingRate(1000, 250), 75);
  assert.equal(savingRate(1000, 1200), -20);
  assert.equal(savingRate(0, 10), 0);
});
