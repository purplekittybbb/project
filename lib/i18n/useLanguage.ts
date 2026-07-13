"use client";

/**
 * Loads and persists the signed-in user's language preference.
 *
 * Real signed-in user: their own row in `user_settings` (RLS-scoped to
 * auth.uid(), same client-side-query pattern as lib/supabase/user-data.ts).
 * Demo/no-auth: browser localStorage only. Either way the default — for a
 * brand-new user with no row/localStorage value yet — is English, per this
 * being a US-focused product; Turkish is an explicit opt-in from Settings.
 */
import { useCallback, useEffect, useState } from "react";
import i18n, { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from "./config";
import { getSupabaseClient, isAuthConfigured } from "@/lib/supabase/client";

const LOCAL_STORAGE_KEY = "tm_language";

function readLocalLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  return isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

export function useLanguage(demoMode = false) {
  const [language, setLanguageState] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [languageLoaded, setLanguageLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      // /demo must NEVER touch Supabase or a real user's data, even if this
      // same browser happens to have a leftover real session token from
      // signing in elsewhere (localStorage's sb-*-auth-token is global to
      // the origin, not scoped to this page). Without this check, a
      // demo-page visit would silently fetch a *real* signed-in user's
      // language_preference (or, with no row yet, silently reset to English)
      // instead of respecting this browser's local demo language choice —
      // confirmed live: exactly this happened after testing real accounts
      // earlier in the same browser.
      if (!demoMode && isAuthConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data: userData } = await supabase.auth.getUser();
          if (userData.user) {
            const { data } = await supabase
              .from("user_settings")
              .select("language_preference")
              .eq("user_id", userData.user.id)
              .maybeSingle();
            if (!active) return;
            const pref = (data as { language_preference?: string } | null)?.language_preference;
            const lang = isSupportedLanguage(pref) ? pref : DEFAULT_LANGUAGE;
            setLanguageState(lang);
            await i18n.changeLanguage(lang);
            setLanguageLoaded(true);
            return;
          }
        }
      }
      const lang = readLocalLanguage();
      if (!active) return;
      setLanguageState(lang);
      await i18n.changeLanguage(lang);
      setLanguageLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [demoMode]);

  const setLanguage = useCallback(async (lang: SupportedLanguage) => {
    setLanguageState(lang);
    await i18n.changeLanguage(lang);
    if (typeof window !== "undefined") window.localStorage.setItem(LOCAL_STORAGE_KEY, lang);

    if (!demoMode && isAuthConfigured()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          await supabase.from("user_settings").upsert(
            { user_id: userData.user.id, language_preference: lang, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
        }
      }
    }
  }, [demoMode]);

  return { language, setLanguage, languageLoaded };
}
