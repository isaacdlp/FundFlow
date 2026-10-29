import { useMemo, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { normalizeSearch } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface SearchPickerOption {
  /** Unique across all groups (e.g. "account-12", "entity-3"). */
  value: string;
  label: string;
  /** Secondary text (email, entity type…); also searched. */
  detail?: string;
  /** Options with the same group are listed under one heading, in first-seen order. */
  group?: string;
}

/** Rendering thousands of rows makes the popover sluggish; typing narrows the rest. */
export const SEARCH_PICKER_MAX_RESULTS = 50;

/** Accent- and case-insensitive match of every search word against label + detail. */
export function filterSearchOptions<T extends SearchPickerOption>(options: T[], search: string): T[] {
  const words = normalizeSearch(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return options;
  return options.filter(o => {
    const haystack = normalizeSearch(`${o.label} ${o.detail ?? ""}`);
    return words.every(w => haystack.includes(w));
  });
}

interface SearchPickerProps {
  options: SearchPickerOption[];
  onSelect: (value: string) => void;
  placeholder: string;
  /** Shown instead of the placeholder when the picker sits in a form and something is chosen. */
  selectedLabel?: string;
  searchPlaceholder?: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * Button that opens a searchable list and fires `onSelect` once per pick (it keeps no value;
 * pass `selectedLabel` to show the caller's current choice).
 * Use instead of a plain Select whenever the list can grow long (accounts, entities…).
 */
export function SearchPicker({ options, onSelect, placeholder, selectedLabel, searchPlaceholder, className, "data-testid": testId }: SearchPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const matches = useMemo(() => filterSearchOptions(options, search), [options, search]);
  const shown = matches.slice(0, SEARCH_PICKER_MAX_RESULTS);
  const groups = useMemo(() => {
    const byGroup = new Map<string, SearchPickerOption[]>();
    for (const o of shown) {
      const key = o.group ?? "";
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(o);
    }
    return Array.from(byGroup);
  }, [shown]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={className ?? "w-64 justify-between font-normal"}
          data-testid={testId}
        >
          <span className={selectedLabel ? "truncate" : "text-muted-foreground truncate"}>{selectedLabel ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-80" align="end">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder ?? t("common.search")}
            value={search}
            onValueChange={setSearch}
            data-testid={testId && `${testId}-search`}
          />
          <CommandList>
            <CommandEmpty>{t("common.noResults")}</CommandEmpty>
            {groups.map(([group, items]) => (
              <CommandGroup key={group} heading={group || undefined}>
                {items.map(o => (
                  <CommandItem
                    key={o.value}
                    value={o.value}
                    onSelect={() => {
                      onSelect(o.value);
                      onOpenChange(false);
                    }}
                    data-testid={testId && `${testId}-option-${o.value}`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{o.label}</span>
                      {o.detail && <span className="text-xs text-muted-foreground truncate">{o.detail}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {matches.length > shown.length && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {t("common.moreResults", { count: matches.length - shown.length })}
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
