// Tiny i18n layer: Spanish (original UI language) + English.

export const SUPPORTED = ["en", "es"];

export const STRINGS = {
  en: {
    "status.starting": "starting camera…",
    "status.ready": "ready",
    "status.searching": "looking for hands…",
    "status.tracking": "hands tracked",
    "status.hold": "hold the pinch…",
    "status.countdown": "capturing in {n}…",
    "status.assemble": "assemble the puzzle with a pinch",
    "status.solved": "puzzle complete! make a fist to save it",
    "status.savingFist": "saving… keep the fist ({pct}%)",
    "status.saving": "saving…",
    "status.saved": "saved to the strip!",
    "status.resetAll": "everything reset",
    "status.resetFist": "reset (fist)",
    "status.resetKey": "reset (R key)",
    "status.stripFull": "strip complete — download or reset",
    "loader.loading": "loading HandLandmarker model…",
    "loader.retry": "retry",
    "error.noCameraApi": "This browser does not support getUserMedia.",
    "error.cameraDenied": "Camera permission denied. Enable it in the browser settings and press retry.",
    "error.cameraNotFound": "No webcam was found.",
    "error.generic": "Error starting the app.",
    "error.tooSlow": "Loading is taking too long. Press retry or check your connection.",
    "error.wasmTimeout": "Timed out loading the MediaPipe runtime (WASM). Check your connection or whether cdn.jsdelivr.net is blocked.",
    "error.modelTimeoutGpu": "Timed out downloading the HandLandmarker model (~10MB) with GPU.",
    "error.modelTimeoutCpu": "Timed out downloading the HandLandmarker model (~10MB) even with CPU. Check your connection or whether storage.googleapis.com is blocked.",
    "error.detect": "Hand detection failed. See the browser console for details.",
    "progress": "{placed} / {total} pieces placed",
    "canvas.solved": "COMPLETE! — fist to save",
    "gallery.title": "Strip",
    "gallery.empty": "Your completed puzzles\nwill appear here.",
    "gallery.complete": "strip complete — download or reset to keep going",
    "gallery.download": "download strip",
    "gallery.reset": "reset all",
    "gallery.confirmReset": "Delete the whole photo strip and start over?",
    "legend.pinch": "both hands pinch: capture",
    "legend.drag": "pinch + move: drag a piece",
    "legend.fist": "hold a fist: save / reset",
    "grid.label": "Grid size",
    "lang.toggle": "Change language",
  },
  es: {
    "status.starting": "iniciando cámara…",
    "status.ready": "listo",
    "status.searching": "buscando manos…",
    "status.tracking": "manos en seguimiento",
    "status.hold": "sostén el pinch…",
    "status.countdown": "capturando en {n}…",
    "status.assemble": "arma el rompecabezas con pinch",
    "status.solved": "¡rompecabezas completo! cierra el puño para guardarlo",
    "status.savingFist": "guardando… sostén el puño ({pct}%)",
    "status.saving": "guardando…",
    "status.saved": "¡guardado en la tira!",
    "status.resetAll": "todo reiniciado",
    "status.resetFist": "reiniciado (puño)",
    "status.resetKey": "reiniciado (tecla R)",
    "status.stripFull": "tira completa — descarga o reinicia",
    "loader.loading": "cargando modelo HandLandmarker…",
    "loader.retry": "reintentar",
    "error.noCameraApi": "Este navegador no soporta getUserMedia.",
    "error.cameraDenied": "Permiso de cámara denegado. Habilítalo en la configuración del navegador y pulsa reintentar.",
    "error.cameraNotFound": "No se encontró ninguna webcam disponible.",
    "error.generic": "Error iniciando la app.",
    "error.tooSlow": "La carga está tardando demasiado. Pulsa reintentar o revisa tu conexión.",
    "error.wasmTimeout": "Tiempo de espera agotado cargando el runtime de MediaPipe (WASM). Revisa tu conexión a internet o si cdn.jsdelivr.net está bloqueado.",
    "error.modelTimeoutGpu": "Tiempo de espera agotado descargando el modelo HandLandmarker (~10MB) con GPU.",
    "error.modelTimeoutCpu": "Tiempo de espera agotado descargando el modelo HandLandmarker (~10MB) incluso con CPU. Revisa tu conexión o si storage.googleapis.com está bloqueado en tu red.",
    "error.detect": "Falló la detección de manos. Revisa la consola del navegador.",
    "progress": "{placed} / {total} piezas colocadas",
    "canvas.solved": "¡COMPLETO! — puño para guardar",
    "gallery.title": "Tira",
    "gallery.empty": "Tus rompecabezas completados\naparecerán aquí.",
    "gallery.complete": "tira completa — descarga o reinicia para seguir",
    "gallery.download": "descargar tira",
    "gallery.reset": "reiniciar todo",
    "gallery.confirmReset": "¿Seguro que quieres borrar toda la tira de fotos y empezar de nuevo?",
    "legend.pinch": "pinch con ambas manos: capturar",
    "legend.drag": "pinch + mover: arrastrar pieza",
    "legend.fist": "mantener puño: guardar / reiniciar",
    "grid.label": "Tamaño de la cuadrícula",
    "lang.toggle": "Cambiar idioma",
  },
};

const STORAGE_KEY = "puzzlecam.lang";
let currentLang = "en";

export function detectLanguage(navigatorLang, storedLang) {
  if (SUPPORTED.includes(storedLang)) return storedLang;
  if (typeof navigatorLang === "string" && navigatorLang.toLowerCase().startsWith("es")) return "es";
  return "en";
}

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getLanguage() {
  return currentLang;
}

export function setLanguage(lang) {
  if (!SUPPORTED.includes(lang)) return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage may be unavailable (private mode) */
  }
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

export function initLanguage() {
  const nav = typeof navigator !== "undefined" ? navigator.language : "en";
  currentLang = detectLanguage(nav, readStored());
  if (typeof document !== "undefined") document.documentElement.lang = currentLang;
  return currentLang;
}

export function t(key, params = {}) {
  const template = STRINGS[currentLang][key] ?? STRINGS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => (name in params ? String(params[name]) : `{${name}}`));
}

export function translatePage(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const text = t(el.dataset.i18nTitle);
    el.title = text;
    el.setAttribute("aria-label", text);
  });
}
