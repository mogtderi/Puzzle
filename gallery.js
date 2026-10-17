// Photo-strip gallery (sidebar thumbnails + PNG strip download).

import { CONFIG } from "./config.js";

export function createGallery({ stripEl, emptyEl, countEl, downloadBtn, completeMsgEl }) {
  const entries = [];
  const max = CONFIG.STRIP_MAX_PHOTOS;

  function refreshUi() {
    countEl.textContent = `${entries.length} / ${max}`;
    downloadBtn.disabled = entries.length === 0;
    completeMsgEl.classList.toggle("visible", entries.length >= max);
    if (emptyEl) emptyEl.style.display = entries.length === 0 ? "block" : "none";
  }

  function renderThumb(snapshotCanvas, index) {
    const print = document.createElement("div");
    print.className = "print";

    const thumb = document.createElement("canvas");
    const scale = CONFIG.THUMB_W / snapshotCanvas.width;
    thumb.width = CONFIG.THUMB_W;
    thumb.height = Math.round(snapshotCanvas.height * scale);
    thumb.getContext("2d").drawImage(snapshotCanvas, 0, 0, thumb.width, thumb.height);

    const label = document.createElement("div");
    label.className = "print-label";
    label.textContent = `#${String(index).padStart(2, "0")}`;

    print.append(thumb, label);
    stripEl.insertBefore(print, stripEl.firstChild);
  }

  function add(snapshotCanvas) {
    if (entries.length >= max) return false;
    entries.push({ canvas: snapshotCanvas, time: Date.now() });
    renderThumb(snapshotCanvas, entries.length);
    refreshUi();
    return true;
  }

  function reset() {
    entries.length = 0;
    stripEl.querySelectorAll(".print").forEach((el) => el.remove());
    refreshUi();
  }

  function download() {
    if (entries.length === 0) return;

    const targetW = entries[0].canvas.width;
    const heights = entries.map((e) => Math.round(e.canvas.height * (targetW / e.canvas.width)));
    const totalH =
      CONFIG.STRIP_BORDER * 2 + heights.reduce((a, b) => a + b, 0) + CONFIG.STRIP_GAP * (entries.length - 1);
    const totalW = targetW + CONFIG.STRIP_BORDER * 2;

    const out = document.createElement("canvas");
    out.width = totalW;
    out.height = totalH;
    const octx = out.getContext("2d");
    octx.fillStyle = CONFIG.STRIP_BG;
    octx.fillRect(0, 0, totalW, totalH);

    let y = CONFIG.STRIP_BORDER;
    entries.forEach((entry, i) => {
      octx.drawImage(entry.canvas, CONFIG.STRIP_BORDER, y, targetW, heights[i]);
      y += heights[i] + CONFIG.STRIP_GAP;
    });

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `puzzlecam_strip_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  }

  refreshUi();

  return {
    add,
    reset,
    download,
    isFull: () => entries.length >= max,
    get size() {
      return entries.length;
    },
  };
}
