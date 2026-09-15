/**
 * i18next setup — client-only, no URL routing (the product has a single
 * settings-driven language toggle, not locale-prefixed routes like /en/...).
 *
 * Scope note: this covers the highest-visibility surface (nav, Settings,
 * Copilot, Financing, History, Cash Flow, Sector Benchmark) — see
 * lib/i18n/locales/en.json for the full key list. The landing page,
 * /connect wizard, /login, /signup, Verilerim, Sellers, Campaign, and
 * Products tabs are NOT yet migrated; anything without a translation key
 * still renders its original hardcoded text.
 *
 * Default is Turkish: this is a Turkish marketplace-seller product (Trendyol /
 * Hepsiburada / N11) — the domain, marketing copy, and every non-migrated
 * surface are already Turkish. Defaulting the migrated surface to English
 * meant every new/guest seller hit an English Financing/Benchmark/Settings
 * tab on an otherwise all-Turkish site. English stays available as an
 * explicit opt-in from Settings.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import tr from "./locales/tr.json";

export const SUPPORTED_LANGUAGES = ["en", "tr"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = "tr";

export function isSupportedLanguage(v: unknown): v is SupportedLanguage {
  return v === "en" || v === "tr";
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, tr: { translation: tr } },
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export default i18n;
