import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "@/i18n/languages";
import { currentLanguage } from "@/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  return (
    <label className={cn("language-switcher", className)}>
      <Languages size={15} aria-hidden="true" />
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={currentLanguage()}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
      >
        {LANGUAGES.map((language) => (
          <option key={language.code} value={language.code} lang={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}
