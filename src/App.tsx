import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canvasCompressor, type CompressOptions } from "./lib/compress";
import { FORMAT_LABELS, formatBytes, resolveMime, savingRate, supportsQuality, type OutputFormat } from "./lib/format";
import { createZip, uniqueNames } from "./lib/zip";
import { DropZone } from "./components/DropZone";
import { AdSlot } from "./components/AdSlot";

interface Item {
  id: string;
  file: File;
  previewUrl: string;
  status: "waiting" | "processing" | "done" | "error";
  /** どの設定で処理した結果か。設定が変わったら作り直す */
  settingsKey?: string;
  result?: { blob: Blob; name: string; width: number; height: number; url: string };
  error?: string;
}

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/avif"];
const MAX_EDGE_OPTIONS = [0, 3840, 2560, 1920, 1280, 800];
let seq = 0;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [options, setOptions] = useState<CompressOptions>({ format: "keep", quality: 0.75, maxEdge: 0 });
  const [rejected, setRejected] = useState<string[]>([]);
  const settingsKey = `${options.format}|${options.quality}|${options.maxEdge}`;
  const busy = useRef(false);

  const addFiles = useCallback((files: File[]) => {
    const ok = files.filter((f) => ACCEPT.includes(f.type));
    setRejected(files.filter((f) => !ACCEPT.includes(f.type)).map((f) => f.name));
    setItems((prev) => [
      ...prev,
      ...ok.map((file) => ({ id: `f${++seq}`, file, previewUrl: URL.createObjectURL(file), status: "waiting" as const })),
    ]);
  }, []);

  // 未処理 or 設定が変わった項目を 1 件ずつ順番に処理する(大量投入時にメモリを食い過ぎないため直列)
  useEffect(() => {
    if (busy.current) return;
    const next = items.find((it) => it.status !== "processing" && it.settingsKey !== settingsKey);
    if (!next) return;
    busy.current = true;
    const key = settingsKey;
    setItems((prev) => prev.map((it) => (it.id === next.id ? { ...it, status: "processing" } : it)));
    canvasCompressor(next.file, options)
      .then((r) => ({ status: "done" as const, result: { ...r, url: URL.createObjectURL(r.blob) }, error: undefined }))
      .catch((e: unknown) => ({
        status: "error" as const,
        result: undefined,
        error: e instanceof Error ? e.message : "読み込めない画像です",
      }))
      .then((patch) => {
        busy.current = false;
        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== next.id) return it;
            if (it.result) URL.revokeObjectURL(it.result.url);
            return { ...it, ...patch, settingsKey: key };
          }),
        );
      });
  }, [items, options, settingsKey]);

  const remove = (id: string) =>
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        if (target.result) URL.revokeObjectURL(target.result.url);
      }
      return prev.filter((it) => it.id !== id);
    });

  const clearAll = () => items.forEach((it) => remove(it.id));

  const done = items.filter((it) => it.status === "done" && it.settingsKey === settingsKey && it.result);
  const totals = useMemo(() => {
    const before = done.reduce((s, it) => s + it.file.size, 0);
    const after = done.reduce((s, it) => s + (it.result?.blob.size ?? 0), 0);
    return { before, after };
  }, [done]);
  const processing = items.length - done.length - items.filter((it) => it.status === "error").length;

  const downloadZip = async () => {
    const names = uniqueNames(done.map((it) => it.result!.name));
    const entries = await Promise.all(
      done.map(async (it, i) => ({ name: names[i], data: new Uint8Array(await it.result!.blob.arrayBuffer()) })),
    );
    download(new Blob([createZip(entries)], { type: "application/zip" }), "compressed-images.zip");
  };

  // 品質スライダーは PNG 出力のみの時に無効化(元形式維持で PNG だけのケースも含む)
  const qualityEnabled =
    options.format !== "keep"
      ? supportsQuality(options.format)
      : items.length === 0 || items.some((it) => supportsQuality(resolveMime(it.file.type, "keep")));

  return (
    <div className="page">
      <header className="header">
        <h1>画像まとめて圧縮</h1>
        <p className="lead">
          JPEG・PNG・WebP をまとめて圧縮・形式変換。<strong>画像はアップロードされず、このブラウザの中だけで処理</strong>
          されます。
        </p>
      </header>

      <section className="settings" aria-label="圧縮設定">
        <label>
          出力形式
          <select
            value={options.format}
            onChange={(e) => setOptions({ ...options, format: e.target.value as OutputFormat })}
          >
            {(Object.keys(FORMAT_LABELS) as OutputFormat[]).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
        <label className={qualityEnabled ? "" : "disabled"}>
          品質 <output>{Math.round(options.quality * 100)}</output>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            disabled={!qualityEnabled}
            value={Math.round(options.quality * 100)}
            onChange={(e) => setOptions({ ...options, quality: Number(e.target.value) / 100 })}
          />
          {!qualityEnabled && <small>PNG は可逆形式のため品質指定は効きません</small>}
        </label>
        <label>
          長辺の最大サイズ
          <select
            value={options.maxEdge}
            onChange={(e) => setOptions({ ...options, maxEdge: Number(e.target.value) })}
          >
            {MAX_EDGE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v === 0 ? "元のサイズ" : `${v}px`}
              </option>
            ))}
          </select>
        </label>
      </section>

      <DropZone accept={ACCEPT.join(",")} onFiles={addFiles} />
      {rejected.length > 0 && <p className="warn">対応していない形式のため除外しました: {rejected.join(", ")}</p>}

      {items.length > 0 && (
        <>
          <section className="summary">
            <div>
              {done.length} / {items.length} 枚完了{processing > 0 && "(処理中…)"}
              {done.length > 0 && (
                <>
                  {" "}
                  ・ 合計 {formatBytes(totals.before)} → <strong>{formatBytes(totals.after)}</strong>(
                  {savingRate(totals.before, totals.after)}% 削減)
                </>
              )}
            </div>
            <div className="actions">
              <button className="primary" disabled={done.length === 0} onClick={downloadZip}>
                ZIP でまとめてダウンロード
              </button>
              <button onClick={clearAll}>すべてクリア</button>
            </div>
          </section>

          <ul className="list">
            {items.map((it) => {
              const fresh = it.settingsKey === settingsKey;
              const rate = it.result ? savingRate(it.file.size, it.result.blob.size) : 0;
              return (
                <li key={it.id} className="row">
                  <img className="thumb" src={it.result?.url ?? it.previewUrl} alt="" />
                  <div className="info">
                    <div className="name" title={it.file.name}>
                      {it.file.name}
                    </div>
                    <div className="meta">
                      {formatBytes(it.file.size)}
                      {it.status === "done" && it.result && (
                        <>
                          {" → "}
                          <strong>{formatBytes(it.result.blob.size)}</strong>
                          <span className={rate >= 0 ? "good" : "bad"}>
                            {rate >= 0 ? ` -${rate}%` : ` +${-rate}%`}
                          </span>
                          {` ・ ${it.result.width}×${it.result.height} ・ ${it.result.name}`}
                        </>
                      )}
                      {(it.status === "processing" || (it.status === "done" && !fresh) || it.status === "waiting") &&
                        " ・ 処理中…"}
                      {it.status === "error" && <span className="bad"> ・ {it.error}</span>}
                    </div>
                    {rate < 0 && fresh && (
                      <div className="hint">元より大きくなりました。品質を下げるか、別の形式を試してください</div>
                    )}
                  </div>
                  <div className="row-actions">
                    <button disabled={!it.result || !fresh} onClick={() => it.result && download(it.result.blob, it.result.name)}>
                      保存
                    </button>
                    <button className="ghost" onClick={() => remove(it.id)} aria-label={`${it.file.name} を削除`}>
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <AdSlot />

      <footer className="footer">
        <h2>よくある質問</h2>
        <dl>
          <dt>画像はサーバーに送られますか?</dt>
          <dd>送られません。圧縮・変換はすべてお使いのブラウザ内で行われ、通信は発生しません。</dd>
          <dt>どの形式が一番小さくなりますか?</dt>
          <dd>写真なら WebP が最も小さくなりやすく、次に JPEG です。ロゴや図など色数が少ない画像は PNG が向いています。</dd>
          <dt>位置情報(Exif)は残りますか?</dt>
          <dd>再エンコードの際に Exif 情報は取り除かれます。SNS に載せる前の位置情報削除にも使えます。</dd>
        </dl>
      </footer>
    </div>
  );
}
