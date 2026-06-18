import assert from "node:assert/strict";

import {
  applyTranslations,
  getLanguage,
  initI18n,
  setLanguage,
  t,
} from "../src/i18n.js";

function createPrefs(initialValue = null) {
  const store = {
    language: initialValue,
  };

  return {
    get(name, onGet) {
      onGet(store[name] ?? null);
    },
    set(name, value) {
      store[name] = value;
    },
    store,
  };
}

function createDocumentStub() {
  const translatedText = { dataset: { i18n: "welcome.openFile" }, textContent: "" };
  const translatedTitle = {
    dataset: { i18nTitle: "tooltip.openFile" },
    setAttribute(name, value) {
      this[name] = value;
    },
  };
  const translatedPlaceholder = {
    dataset: { i18nPlaceholder: "placeholder.jumpTime" },
    setAttribute(name, value) {
      this[name] = value;
    },
  };
  const translatedHtml = {
    dataset: { i18nHtml: "home.blackbox.docs" },
    innerHTML: "",
  };

  return {
    documentElement: {
      lang: "",
    },
    querySelectorAll(selector) {
      if (selector === "[data-i18n]") return [translatedText];
      if (selector === "[data-i18n-title]") return [translatedTitle];
      if (selector === "[data-i18n-placeholder]") return [translatedPlaceholder];
      if (selector === "[data-i18n-aria-label]") return [];
      if (selector === "[data-i18n-html]") return [translatedHtml];
      return [];
    },
    translatedText,
    translatedTitle,
    translatedPlaceholder,
    translatedHtml,
  };
}

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    language: "zh-CN",
    languages: ["zh-CN", "en-US"],
  },
});

const prefs = createPrefs();
await initI18n(prefs);

assert.equal(getLanguage(), "zh-CN");
assert.equal(t("welcome.openFile"), "打开日志/视频");
assert.equal(t("loading.file", { fileName: "flight.bbl" }), "正在读取 flight.bbl...");
assert.equal(t("missing.key"), "missing.key");

setLanguage("en");
assert.equal(getLanguage(), "en");
assert.equal(prefs.store.language, "en");
assert.equal(t("welcome.openFile"), "Open log file/video");

await initI18n(createPrefs("en"));
assert.equal(getLanguage(), "en");
assert.equal(t("welcome.openFile"), "Open log file/video");

setLanguage("zh-CN");
const documentStub = createDocumentStub();
applyTranslations(documentStub);

assert.equal(documentStub.documentElement.lang, "zh-CN");
assert.equal(documentStub.translatedText.textContent, "打开日志/视频");
assert.equal(documentStub.translatedTitle.title, "从打开日志文件或视频开始");
assert.equal(documentStub.translatedPlaceholder.placeholder, "输入时间后跳转");
assert.match(documentStub.translatedHtml.innerHTML, /Betaflight Blackbox 功能文档/);
assert.match(documentStub.translatedHtml.innerHTML, /github\.com\/betaflight/);

console.log("i18n tests pass");
