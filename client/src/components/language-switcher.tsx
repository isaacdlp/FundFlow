import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/routes";
import { useLocale, useSwitchLanguage } from "@/i18n/hooks";
import { useTranslation } from "react-i18next";

interface Props {
  variant?: "default" | "ghost" | "outline";
  size?: "sm" | "default" | "icon";
  showLabel?: boolean;
}

export function LanguageSwitcher({ variant = "ghost", size = "sm", showLabel = true }: Props) {
  const locale = useLocale();
  const switchLang = useSwitchLanguage();
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} data-testid="button-language-switcher" aria-label={t("common.language")}>
          <Globe className="h-4 w-4 mr-1.5" />
          {showLabel ? LOCALE_LABELS[locale].short : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((l: Locale) => (
          <DropdownMenuItem
            key={l}
            onClick={() => switchLang(l)}
            data-testid={`menuitem-language-${l}`}
            data-active={l === locale ? "true" : undefined}
          >
            <span className="mr-2 text-xs font-medium text-muted-foreground">{LOCALE_LABELS[l].short}</span>
            <span>{LOCALE_LABELS[l].native}</span>
            {l === locale && <span className="ml-auto text-xs text-primary">●</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
