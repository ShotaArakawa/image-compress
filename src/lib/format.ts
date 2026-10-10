export type OutputFormat = "keep" | "image/jpeg" | "image/webp" | "image/png";

export const FORMAT_LABELS: Record<OutputFormat, string> = {
  keep: "元の形式のまま",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "image/png": "PNG",
};

const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/png": ".png",
};

/** 出力する MIME を決める。元形式維持でも、ブラウザが書き出せない形式(GIF 等)は JPEG にする */
export function resolveMime(inputMime: string, format: OutputFormat): string {
  if (format !== "keep") return format;
  return inputMime in EXT ? inputMime : "image/jpeg";
}

/** PNG は品質指定が効かない(可逆)ので UI で品質スライダーを無効表示にするために使う */
export function supportsQuality(mime: string): boolean {
  return mime === "image/jpeg" || mime === "image/webp";
}

export function outputName(inputName: string, mime: string): string {
  const dot = inputName.lastIndexOf(".");
  const base = dot > 0 ? inputName.slice(0, dot) : inputName;
  return base + (EXT[mime] ?? ".jpg");
}

/** 長辺を maxEdge 以下に収める(0 ならリサイズしない)。拡大はしない */
export function fitSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  if (!maxEdge || Math.max(width, height) <= maxEdge) return { width, height };
  const scale = maxEdge / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 削減率(%)。増えた場合は負の値 */
export function savingRate(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round((1 - after / before) * 1000) / 10;
}
