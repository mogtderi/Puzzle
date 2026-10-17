import test from "node:test";
import assert from "node:assert/strict";
import { STRINGS, detectLanguage, setLanguage, t } from "../js/i18n.js";

test("English and Spanish define exactly the same keys", () => {
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.es).sort());
});

test("placeholders match between languages", () => {
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
  for (const key of Object.keys(STRINGS.en)) {
    assert.equal(ph(STRINGS.en[key]), ph(STRINGS.es[key]), `placeholder mismatch in "${key}"`);
  }
});

test("language detection: stored choice wins, then browser language, default English", () => {
  assert.equal(detectLanguage("en-US", "es"), "es");
  assert.equal(detectLanguage("es-MX", null), "es");
  assert.equal(detectLanguage("fa-IR", null), "en");
  assert.equal(detectLanguage(undefined, "xx"), "en");
});

test("t() interpolates params and falls back to the key", () => {
  setLanguage("en");
  assert.equal(t("progress", { placed: 4, total: 9 }), "4 / 9 pieces placed");
  assert.equal(t("does.not.exist"), "does.not.exist");
  setLanguage("es");
  assert.equal(t("progress", { placed: 4, total: 9 }), "4 / 9 piezas colocadas");
});
