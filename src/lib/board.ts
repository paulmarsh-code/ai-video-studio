// Browser-side: put the current view images back together as one image board, so a change
// request can attach the board (ChatGPT then keeps the same multi-panel layout).

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load one of the current images."));
    img.src = url;
  });
}

/** Lay images out in a grid (row by row) with thin white dividers; returns a PNG blob. */
export async function composeBoard(assetIds: string[], cols: number, rows: number, cellH = 1024): Promise<Blob> {
  const imgs = await Promise.all(assetIds.map((id) => load(`/api/assets/${id}`)));
  const gap = 8;
  // Each cell keeps its own aspect at the cell height; cells in a column share the widest width.
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.max(...imgs.filter((_, i) => i % cols === c).map((im) => Math.round((im.naturalWidth * cellH) / im.naturalHeight))));
  const W = widths.reduce((a, b) => a + b, 0) + gap * (cols - 1);
  const H = cellH * rows + gap * (rows - 1);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  imgs.forEach((im, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x0 = widths.slice(0, c).reduce((a, b) => a + b, 0) + gap * c;
    const w = Math.round((im.naturalWidth * cellH) / im.naturalHeight);
    ctx.drawImage(im, x0 + Math.floor((widths[c] - w) / 2), r * (cellH + gap), w, cellH);
  });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not build the board."))), "image/png"));
}

export async function downloadBoard(assetIds: string[], cols: number, rows: number, fileName: string) {
  const blob = await composeBoard(assetIds, cols, rows);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
