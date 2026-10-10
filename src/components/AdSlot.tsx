// 広告枠のプレースホルダー。広告タグは入れていない(外部サービス未登録のため)。
// 本番では AdSense 等のタグをここに差し込み、CLS を防ぐため高さを固定しておく。
export function AdSlot() {
  return (
    <aside className="ad-slot" aria-label="広告枠">
      広告枠(プレースホルダー)
    </aside>
  );
}
