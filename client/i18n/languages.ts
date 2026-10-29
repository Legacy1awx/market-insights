export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "zh", label: "中文" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

// Right-to-left scripts. Add a code here when adding e.g. Arabic or Hebrew.
const RTL_LANGUAGES = new Set<string>(["ar", "he", "fa", "ur"]);

export function isSupportedLanguage(code: string): code is LanguageCode {
  return LANGUAGES.some((language) => language.code === code);
}

export function textDirection(code: string): "ltr" | "rtl" {
  return RTL_LANGUAGES.has(code.split("-")[0]) ? "rtl" : "ltr";
}
