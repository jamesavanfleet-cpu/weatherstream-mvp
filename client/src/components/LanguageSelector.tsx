/*
 * MyCruisingWeather persistent language selector.
 * Style reminder: dark maritime glass, compact native-language tabs, clear active state, and horizontal touch scrolling on small screens.
 */
import { Languages } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGES } from "@/lib/translations";

export default function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="sticky top-0 z-[80] border-b border-cyan-300/15 bg-[#091328]/94 shadow-[0_10px_32px_rgba(1,8,23,0.28)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:px-5">
        <div className="flex shrink-0 items-center gap-2 text-cyan-100/80" aria-hidden="true">
          <Languages className="h-4 w-4 text-cyan-300" />
          <span className="hidden text-[10px] font-bold uppercase tracking-[0.18em] sm:inline">
            {t("language.selector")}
          </span>
        </div>
        <div
          className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label={t("language.selector")}
        >
          {LANGUAGES.map((option) => {
            const active = language === option.code;
            return (
              <button
                key={option.code}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={t("language.current", { language: option.nativeName })}
                onClick={() => setLanguage(option.code)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold leading-none transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#091328] active:scale-[0.97] ${
                  active
                    ? "border-cyan-200/70 bg-cyan-300 text-[#071224] shadow-[0_0_18px_rgba(103,232,249,0.22)]"
                    : "border-white/10 bg-white/[0.035] text-white/70 hover:border-cyan-100/40 hover:bg-cyan-200/10 hover:text-white"
                }`}
              >
                {option.nativeName}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
