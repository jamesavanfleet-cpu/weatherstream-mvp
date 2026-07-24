/*
 * MyCruisingWeather language state.
 * Style reminder: interface language changes are instant, persistent, and unobtrusive; Arabic uses document-level RTL without changing the visual identity.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getLanguageDefinition,
  interpolate,
  LANGUAGE_CODES,
  translations,
  type LanguageCode,
  type TranslationKey,
} from "@/lib/translations";

const STORAGE_KEY = "mycruisingweather.language";

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function isLanguageCode(value: string | null): value is LanguageCode {
  return value !== null && (LANGUAGE_CODES as readonly string[]).includes(value);
}

function getInitialLanguage(): LanguageCode {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguageCode(stored)) return stored;
  } catch {
    // Storage may be unavailable in strict browser privacy modes. English remains the safe default.
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(getInitialLanguage);
  const definition = getLanguageDefinition(language);

  const setLanguage = useCallback((nextLanguage: LanguageCode) => {
    setLanguageState(nextLanguage);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    } catch {
      // The current session remains localized even when persistence is unavailable.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = definition.locale;
    document.documentElement.dir = definition.dir;
    document.body.dir = definition.dir;
    return () => {
      document.documentElement.lang = "en-US";
      document.documentElement.dir = "ltr";
      document.body.dir = "ltr";
    };
  }, [definition.dir, definition.locale]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    t: (key, values) => interpolate(translations[language][key], values),
    formatDate: (date, options) => new Intl.DateTimeFormat(definition.locale, options).format(new Date(date)),
    formatTime: (date, options) => new Intl.DateTimeFormat(definition.locale, options).format(new Date(date)),
  }), [definition.locale, language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
