import { en } from "./locales/en.js";
import { zhCN } from "./locales/zh-CN.js";

const SUPPORTED_LANGUAGES = ["en", "zh-CN"];
const DEFAULT_LANGUAGE = "en";
const LANGUAGE_PREF_KEY = "language";
const LOCALES = {
  en,
  "zh-CN": zhCN,
};

let currentLanguage = DEFAULT_LANGUAGE;
let prefStorage = null;

const originalText = new WeakMap();
const originalAttributes = new WeakMap();

function normalizeLanguage(language) {
  if (!language) return null;
  const normalized = String(language).replace("_", "-").toLowerCase();
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  return SUPPORTED_LANGUAGES.includes(language) ? language : null;
}

function detectBrowserLanguage() {
  const languages = globalThis.navigator?.languages?.length
    ? globalThis.navigator.languages
    : [globalThis.navigator?.language];

  for (const language of languages) {
    const supported = normalizeLanguage(language);
    if (supported) return supported;
  }

  return DEFAULT_LANGUAGE;
}

function getLocale(language = currentLanguage) {
  return LOCALES[language] || LOCALES[DEFAULT_LANGUAGE];
}

function interpolate(value, params) {
  return String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
    return params[name] ?? match;
  });
}

export function initI18n(prefs) {
  prefStorage = prefs || null;

  return new Promise((resolve) => {
    if (!prefStorage?.get) {
      currentLanguage = detectBrowserLanguage();
      resolve(currentLanguage);
      return;
    }

    prefStorage.get(LANGUAGE_PREF_KEY, (storedLanguage) => {
      currentLanguage = normalizeLanguage(storedLanguage) || detectBrowserLanguage();
      resolve(currentLanguage);
    });
  });
}

export function getLanguage() {
  return currentLanguage;
}

export function setLanguage(language) {
  const normalizedLanguage = normalizeLanguage(language) || DEFAULT_LANGUAGE;
  currentLanguage = normalizedLanguage;

  if (prefStorage?.set) {
    prefStorage.set(LANGUAGE_PREF_KEY, normalizedLanguage);
  }

  if (globalThis.document?.dispatchEvent && globalThis.CustomEvent) {
    globalThis.document.dispatchEvent(
      new CustomEvent("i18n:languageChanged", {
        detail: { language: normalizedLanguage },
      })
    );
  }

  return normalizedLanguage;
}

export function t(key, params = {}) {
  const locale = getLocale();
  const english = LOCALES[DEFAULT_LANGUAGE];
  const value = locale.strings[key] ?? english.strings[key] ?? key;

  if (
    value === key &&
    currentLanguage !== DEFAULT_LANGUAGE &&
    globalThis.location?.hostname === "localhost"
  ) {
    console.warn(`Missing i18n key: ${key}`);
  }

  return interpolate(value, params);
}

function translateExact(value, groupName = "text") {
  if (currentLanguage === DEFAULT_LANGUAGE || value == null) return value;

  const locale = getLocale();
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (!normalized) return value;

  return locale[groupName]?.[normalized] ?? locale.text?.[normalized] ?? null;
}

function translateTerms(value) {
  if (currentLanguage === DEFAULT_LANGUAGE || value == null) return value;

  let translated = String(value);
  const terms = getLocale().fieldTerms || {};
  const sortedTerms = Object.keys(terms).sort((a, b) => b.length - a.length);

  for (const term of sortedTerms) {
    translated = translated.replaceAll(term, terms[term]);
  }

  translated = translated
    .replaceAll("[roll]", "[横滚]")
    .replaceAll("[pitch]", "[俯仰]")
    .replaceAll("[yaw]", "[偏航]")
    .replaceAll("[throttle]", "[油门]")
    .replaceAll("[all]", "[全部]")
    .replaceAll("[X]", "[X]")
    .replaceAll("[Y]", "[Y]")
    .replaceAll("[Z]", "[Z]");

  return translated;
}

export function translateText(value, groupName = "text") {
  const exact = translateExact(value, groupName);
  if (exact) return exact;

  return translateTerms(value);
}

export function translateFieldLabel(value) {
  return translateText(value, "fieldTerms");
}

function setElementText(element, value) {
  if ("textContent" in element) {
    element.textContent = value;
  }
}

function setElementAttribute(element, attributeName, value) {
  if (typeof element.setAttribute === "function") {
    element.setAttribute(attributeName, value);
  } else {
    element[attributeName] = value;
  }

  if (attributeName === "title" && typeof element.setAttribute === "function") {
    element.setAttribute("data-original-title", value);
  }
}

function getStoredAttribute(element, attributeName) {
  let attributes = originalAttributes.get(element);
  if (!attributes) {
    attributes = {};
    originalAttributes.set(element, attributes);
  }

  if (attributes[attributeName] == null) {
    attributes[attributeName] =
      element.getAttribute?.(attributeName) ?? element[attributeName] ?? "";
  }

  return attributes[attributeName];
}

function applyKeyedTranslations(root) {
  for (const element of root.querySelectorAll?.("[data-i18n]") || []) {
    setElementText(element, t(element.dataset.i18n));
  }

  for (const element of root.querySelectorAll?.("[data-i18n-html]") || []) {
    element.innerHTML = t(element.dataset.i18nHtml);
  }

  const attributeMap = [
    ["[data-i18n-title]", "i18nTitle", "title"],
    ["[data-i18n-placeholder]", "i18nPlaceholder", "placeholder"],
    ["[data-i18n-aria-label]", "i18nAriaLabel", "aria-label"],
  ];

  for (const [selector, datasetKey, attributeName] of attributeMap) {
    for (const element of root.querySelectorAll?.(selector) || []) {
      setElementAttribute(element, attributeName, t(element.dataset[datasetKey]));
    }
  }
}

function shouldSkipNode(node) {
  const parent = node.parentElement;
  if (!parent) return true;

  const tagName = parent.tagName;
  if (["SCRIPT", "STYLE", "TEXTAREA"].includes(tagName)) return true;

  const closestExternalLink = parent.closest?.("a[href^='http://'], a[href^='https://']");
  return Boolean(closestExternalLink);
}

function applyTextNodeTranslations(root) {
  const ownerDocument = root.ownerDocument || root;
  if (!ownerDocument.createTreeWalker || !globalThis.NodeFilter) return;

  const walker = ownerDocument.createTreeWalker(
    root.body || root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (shouldSkipNode(node) || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!originalText.has(node)) {
      originalText.set(node, node.nodeValue);
    }

    const source = originalText.get(node);
    const leading = source.match(/^\s*/)[0];
    const trailing = source.match(/\s*$/)[0];
    const translated = translateText(source);

    node.nodeValue = `${leading}${String(translated).trim()}${trailing}`;
  }
}

function applyAttributeTranslations(root) {
  const selector = "[title], [placeholder], [aria-label]";
  for (const element of root.querySelectorAll?.(selector) || []) {
    for (const attributeName of ["title", "placeholder", "aria-label"]) {
      if (!element.hasAttribute?.(attributeName)) continue;
      if (element.dataset?.i18nTitle && attributeName === "title") continue;
      if (element.dataset?.i18nPlaceholder && attributeName === "placeholder") continue;
      if (element.dataset?.i18nAriaLabel && attributeName === "aria-label") continue;

      const source = getStoredAttribute(element, attributeName);
      const translated = translateText(source, "attributes");
      setElementAttribute(element, attributeName, translated);
    }
  }
}

export function applyTranslations(root = globalThis.document) {
  if (!root) return;

  const documentElement = root.documentElement || globalThis.document?.documentElement;
  if (documentElement) {
    documentElement.lang = currentLanguage;
  }

  applyKeyedTranslations(root);
  applyTextNodeTranslations(root);
  applyAttributeTranslations(root);
}
