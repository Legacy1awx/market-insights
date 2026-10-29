import i18n, { type BackendModule } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en, { type Translation } from "./locales/en";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  isSupportedLanguage,
  textDirection,
  type LanguageCode,
} from "./languages";

export const LANGUAGE_STORAGE_KEY = "northstar-language";

// English ships with the main bundle; other languages are fetched on demand.
const loaders: Record<
  Exclude<LanguageCode, "en">,
  () => Promise<{ default: Translation }>
> = {
  es: () => import("./locales/es"),
  fr: () => import("./locales/fr"),
  de: () => import("./locales/de"),
  pt: () => import("./locales/pt"),
  zh: () => import("./locales/zh"),
};

const lazyLocales: BackendModule = {
  type: "backend",
  init() {},
  read(language, _namespace, callback) {
    const load = loaders[language as keyof typeof loaders];
    if (!load) return callback(null, {});
    load()
      .then((module) => callback(null, module.default))
      .catch((error: Error) => callback(error, null));
  },
};

function syncDocument(language: string) {
  document.documentElement.lang = language;
  document.documentElement.dir = textDirection(language);
}

i18n.on("languageChanged", syncDocument);

void i18n
  .use(lazyLocales)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    partialBundledLanguages: true,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: LANGUAGES.map((language) => language.code),
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    interpolation: { escapeValue: false },
    detection: {
      order: ["querystring", "localStorage", "navigator"],
      lookupQuerystring: "lang",
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

/** The active language, narrowed to one the app ships. */
export function currentLanguage(): LanguageCode {
  const language = i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_LANGUAGE;
  return isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;
}

export default i18n;
