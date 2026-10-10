import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, createZip, uniqueNames } from "./zip.ts";

test("crc32 は既知の値と一致する", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test("uniqueNames は重複に連番を付ける", () => {
  assert.deepEqual(uniqueNames(["a.jpg", "a.jpg", "b.png", "a.jpg"]), ["a.jpg", "a (2).jpg", "b.png", "a (3).jpg"]);
});

// Info-ZIP の unzip は UTF-8 フラグ(bit 11)を見ない版があるため、仕様に忠実な Python の zipfile で検証する
test("createZip の出力を展開できる(CRC 検証・日本語ファイル名含む)", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zip-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const a = new TextEncoder().encode("hello");
  const b = new Uint8Array([0, 1, 2, 3, 255]);
  const zip = createZip([
    { name: "hello.txt", data: a },
    { name: "写真.bin", data: b },
  ]);
  const zipPath = join(dir, "out.zip");
  writeFileSync(zipPath, zip);

  const script = "import sys, zipfile\nz = zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nz.extractall(sys.argv[2])";
  try {
    execFileSync("python3", ["-c", script, zipPath, join(dir, "x")]);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return t.skip("python3 がない環境");
    throw e;
  }
  assert.deepEqual(new Uint8Array(readFileSync(join(dir, "x", "hello.txt"))), a);
  assert.deepEqual(new Uint8Array(readFileSync(join(dir, "x", "写真.bin"))), b);
});
