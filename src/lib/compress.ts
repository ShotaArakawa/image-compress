// ブラウザの Canvas で画像を再エンコードする。サーバーには一切送らない。
// 将来 WASM エンコーダ(MozJPEG / OxiPNG 等)に差し替える場合は Compressor を実装し直す。

import { fitSize, resolveMime, outputName, supportsQuality, type OutputFormat } from "./format";

export interface CompressOptions {
  format: OutputFormat;
  /** 0.1〜1.0。JPEG / WebP のみ有効 */
  quality: number;
  /** 長辺の上限 px。0 で元サイズ */
  maxEdge: number;
}

export interface CompressResult {
  blob: Blob;
  name: string;
  width: number;
  height: number;
}

export type Compressor = (file: File, options: CompressOptions) => Promise<CompressResult>;

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("画像の書き出しに失敗しました"))), mime, quality);
  });
}

export const canvasCompressor: Compressor = async (file, options) => {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const mime = resolveMime(file.type, options.format);
  const { width, height } = fitSize(bitmap.width, bitmap.height, options.maxEdge);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas を利用できません");
  if (mime === "image/jpeg") {
    // JPEG は透過を持てないので、透過部分が黒くならないよう白で塗る
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvasToBlob(canvas, mime, supportsQuality(mime) ? options.quality : undefined);
  return { blob, name: outputName(file.name, mime), width, height };
};
