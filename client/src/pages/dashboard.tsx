import { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import type { PortfolioInvestment, AccountWithRoles, EntityInfo } from "@shared/types";
import { Search, TrendingUp, TrendingDown, ArrowRight, ChevronDown, ChevronRight, Briefcase, ArrowLeft, Filter } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { useLocale, useLocalePath } from "@/i18n/hooks";

const PIE_GRADIENTS: { id: string; from: string; to: string }[] = [
  { id: "grad-blue",       from: "#93c5fd", to: "#1e40af" },
  { id: "grad-emerald",    from: "#6ee7b7", to: "#065f46" },
  { id: "grad-violet",     from: "#c4b5fd", to: "#4c1d95" },
  { id: "grad-amber",      from: "#fcd34d", to: "#92400e" },
  { id: "grad-rose",       from: "#fda4af", to: "#9f1239" },
  { id: "grad-cyan",       from: "#67e8f9", to: "#164e63" },
  { id: "grad-orange",     from: "#fdba74", to: "#7c2d12" },
  { id: "grad-teal",       from: "#5eead4", to: "#134e4a" },
  { id: "grad-fuchsia",    from: "#f0abfc", to: "#701a75" },
  { id: "grad-lime",       from: "#bef264", to: "#365314" },
  { id: "grad-indigo",     from: "#a5b4fc", to: "#1e1b4b" },
  { id: "grad-yellow",     from: "#fef08a", to: "#713f12" },
  { id: "grad-pink",       from: "#f9a8d4", to: "#831843" },
  { id: "grad-sky",        from: "#7dd3fc", to: "#0c4a6e" },
  { id: "grad-green",      from: "#86efac", to: "#14532d" },
  { id: "grad-red",        from: "#fca5a5", to: "#7f1d1d" },
];

const LOCALE_TO_BCP: Record<string, string> = { en: "en-US", es: "es-ES", fr: "fr-FR" };

function fmtMoney(n: number, locale: string): string {
  return n.toLocaleString(LOCALE_TO_BCP[locale] || locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number): string {
  if (!isFinite(n)) return "0.00%";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtDate(d: string | null, locale: string): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString(LOCALE_TO_BCP[locale] || locale); } catch { return d; }
}

function SpvPieCard({
  title, subtitle, data,
  valueFormatter = (v) => `$${v.toFixed(2)}`,
  legendFormatter,
}: {
  title: string;
  subtitle: string;
  data: { name: string; value: number; gradientId: string }[];
  valueFormatter?: (v: number) => string;
  legendFormatter?: (v: number) => string;
}) {
  const { t } = useTranslation();
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-base font-semibold" data-testid={`text-pie-title-${title.replace(/\s+/g, "-").toLowerCase()}`}>{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="pt-2">
        {data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">{t("dashboard.noData")}</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {PIE_GRADIENTS.map(g => (
                    <radialGradient key={g.id} id={g.id} cx="30%" cy="30%" r="85%" fx="20%" fy="20%">
                      <stop offset="0%" stopColor={g.from} stopOpacity={1} />
                      <stop offset="60%" stopColor={g.to} stopOpacity={1} />
                      <stop offset="100%" stopColor={g.to} stopOpacity={1} />
                    </radialGradient>
                  ))}
                  <filter id="pie-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.2" />
                  </filter>
                </defs>
                <Pie
                  data={data} dataKey="value" nameKey="name"
                  innerRadius={55} outerRadius={95} paddingAngle={2}
                  stroke="hsl(var(--background))" strokeWidth={2}
                  filter="url(#pie-shadow)"
                >
                  {data.map((d, i) => (
                    <Cell key={i} fill={`url(#${d.gradientId})`} />
                  ))}
                </Pie>
                <RTooltip
                  formatter={(v: any, name: any) => {
                    const num = Number(v);
                    const pctSuffix = total > 0 ? ` · ${((num / total) * 100).toFixed(1)}%` : "";
                    const formatted = legendFormatter ? legendFormatter(num) : valueFormatter(num);
                    return [`${formatted}${pctSuffix}`, name];
                  }}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CompanyGroup {
  key: string;
  name: string;
  organizationName: string;
  organizationSlug: string;
  initial: number;
  current: number;
  distributions: number;
  roi: number;
  investments: PortfolioInvestment[];
}

interface BeneficiaryGroup {
  key: string;
  name: string;
  investorType: "account" | "entity";
  investorId: number;
  initial: number;
  current: number;
  distributions: number;
  roi: number;
  investments: PortfolioInvestment[];
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [groupBy, setGroupBy] = useState<"spv" | "beneficiary">("spv");
  const [selectedBeneficiaryKeys, setSelectedBeneficiaryKeys] = useState<Set<string> | null>(null);
  const { t } = useTranslation();
  const locale = useLocale();
  const lp = useLocalePath();

  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const accountIdParam = params.get("accountId");
  const entityIdParam = params.get("entityId");

  const portfolioPath = accountIdParam
    ? `/api/portfolio?accountId=${accountIdParam}`
    : entityIdParam
      ? `/api/portfolio?entityId=${entityIdParam}`
      : "/api/portfolio";

  const { data: investments, isLoading } = useQuery<PortfolioInvestment[]>({
    queryKey: [portfolioPath],
  });

  const { data: contextAccount } = useQuery<AccountWithRoles>({
    queryKey: ["/api/accounts", accountIdParam],
    enabled: !!accountIdParam,
  });

  const { data: contextEntity } = useQuery<EntityInfo>({
    queryKey: ["/api/entities", entityIdParam],
    enabled: !!entityIdParam,
  });

  // All unique beneficiaries derived from the raw investment list.
  const allBeneficiaries = useMemo(() => {
    const seen = new Map<string, { key: string; name: string; investorType: string }>();
    for (const inv of investments ?? []) {
      const key = `${inv.investorType}:${inv.investorId}`;
      if (!seen.has(key)) seen.set(key, { key, name: inv.investorName, investorType: inv.investorType });
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [investments]);

  const isMultiBeneficiary = allBeneficiaries.length > 1;

  const isBeneficiarySelected = (key: string) =>
    selectedBeneficiaryKeys === null || selectedBeneficiaryKeys.has(key);

  const toggleBeneficiary = (key: string) => {
    const allKeys = allBeneficiaries.map(b => b.key);
    setSelectedBeneficiaryKeys(prev => {
      const current = prev ?? new Set(allKeys);
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next.size === allKeys.length ? null : next;
    });
  };

  // Apply beneficiary filter first, then search.
  const beneficiaryFiltered = useMemo(() => {
    const items = investments ?? [];
    if (selectedBeneficiaryKeys === null) return items;
    return items.filter(i => selectedBeneficiaryKeys.has(`${i.investorType}:${i.investorId}`));
  }, [investments, selectedBeneficiaryKeys]);

  const filtered = useMemo(() => {
    const items = beneficiaryFiltered;
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.spvName.toLowerCase().includes(q) ||
      i.investmentCompanyName.toLowerCase().includes(q) ||
      i.investmentType.toLowerCase().includes(q) ||
      i.organizationName.toLowerCase().includes(q) ||
      i.investorName.toLowerCase().includes(q) ||
      (i.investorEmail || "").toLowerCase().includes(q)
    );
  }, [beneficiaryFiltered, search]);

  const summary = useMemo(() => {
    const initial = filtered.reduce((s, i) => s + parseFloat(i.totalCalled || "0"), 0);
    const fees = filtered.reduce((s, i) => s + parseFloat(i.managementFee || "0") + parseFloat(i.otherFee || "0"), 0);
    const paidIn = initial + fees;
    const current = filtered.reduce((s, i) => s + parseFloat(i.currentValue || "0"), 0);
    const distributions = filtered.reduce((s, i) => s + parseFloat(i.distributed || "0"), 0);
    const roi = initial > 0 ? ((current + distributions - initial) / initial) * 100 : 0;
    const moic = initial > 0 ? (current + distributions) / initial : 0;
    const tvpi = paidIn > 0 ? (current + distributions) / paidIn : 0;
    const dpi = paidIn > 0 ? distributions / paidIn : 0;
    return { initial, current, distributions, roi, moic, tvpi, dpi, count: filtered.length };
  }, [filtered]);

  const spvBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; initial: number; current: number }>();
    for (const inv of filtered) {
      const key = inv.spvName || t("common.untitled");
      const cur = map.get(key) ?? { name: key, initial: 0, current: 0 };
      cur.initial += parseFloat(inv.totalCalled || "0");
      cur.current += parseFloat(inv.currentValue || "0");
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.current - a.current);
  }, [filtered, t]);

  const spvGradientId = useMemo(() =>
    new Map(spvBreakdown.map((s, i) => [s.name, PIE_GRADIENTS[i % PIE_GRADIENTS.length].id])),
    [spvBreakdown]);

  const initialPie = spvBreakdown.filter(s => s.initial > 0).map(s => ({ name: s.name, value: s.initial, gradientId: spvGradientId.get(s.name)! }));
  const currentPie = spvBreakdown.filter(s => s.current > 0).map(s => ({ name: s.name, value: s.current, gradientId: spvGradientId.get(s.name)! }));
  const growthPie = spvBreakdown
    .filter(s => s.initial > 0 && s.current > s.initial)
    .map(s => ({ name: s.name, value: ((s.current - s.initial) / s.initial) * 100, gradientId: spvGradientId.get(s.name)! }))
    .sort((a, b) => b.value - a.value);

  const groupedByCompany = useMemo<CompanyGroup[]>(() => {
    const map = new Map<string, CompanyGroup>();
    for (const inv of filtered) {
      const key = (inv.investmentCompanyName || inv.spvName).trim() || t("common.untitled");
      if (!map.has(key)) {
        map.set(key, {
          key, name: key,
          organizationName: inv.organizationName,
          organizationSlug: inv.organizationSlug,
          initial: 0, current: 0, distributions: 0, roi: 0,
          investments: [],
        });
      }
      const g = map.get(key)!;
      g.initial += parseFloat(inv.totalCalled || "0");
      g.current += parseFloat(inv.currentValue || "0");
      g.distributions += parseFloat(inv.distributed || "0");
      g.investments.push(inv);
    }
    const arr = Array.from(map.values()).map(g => ({
      ...g,
      roi: g.initial > 0 ? ((g.current + g.distributions - g.initial) / g.initial) * 100 : 0,
    }));
    arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [filtered, t]);

  const groupedByBeneficiary = useMemo<BeneficiaryGroup[]>(() => {
    const map = new Map<string, BeneficiaryGroup>();
    for (const inv of filtered) {
      const key = `${inv.investorType}:${inv.investorId}`;
      if (!map.has(key)) {
        map.set(key, {
          key, name: inv.investorName,
          investorType: inv.investorType as "account" | "entity",
          investorId: inv.investorId,
          initial: 0, current: 0, distributions: 0, roi: 0,
          investments: [],
        });
      }
      const g = map.get(key)!;
      g.initial += parseFloat(inv.totalCalled || "0");
      g.current += parseFloat(inv.currentValue || "0");
      g.distributions += parseFloat(inv.distributed || "0");
      g.investments.push(inv);
    }
    return Array.from(map.values()).map(g => ({
      ...g,
      roi: g.initial > 0 ? ((g.current + g.distributions - g.initial) / g.initial) * 100 : 0,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const toggle = (key: string) => setExpanded(e => ({ ...e, [key]: !e[key] }));

  const titleText =
    accountIdParam && contextAccount
      ? t("dashboard.titleAccount", { name: `${contextAccount.firstName} ${contextAccount.lastName}` })
      : entityIdParam && contextEntity
        ? t("dashboard.titleEntity", { name: contextEntity.name })
        : t("dashboard.title");

  const subtitleText =
    accountIdParam
      ? t("dashboard.subtitleAccount")
      : entityIdParam
        ? t("dashboard.subtitleEntity")
        : isAdmin
          ? t("dashboard.subtitleAdmin")
          : user
            ? t("dashboard.subtitleUser", { name: user.firstName })
            : t("dashboard.subtitleUserAnonymous");

  const activeFilterCount = selectedBeneficiaryKeys?.size ?? null;
  const totalBeneficiaryCount = allBeneficiaries.length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {(accountIdParam || entityIdParam) && (
            <Link href={accountIdParam ? lp("accountDetail", { id: accountIdParam }) : lp("entityDetail", { id: entityIdParam! })}>
              <a className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2" data-testid="link-back-to-context">
                <ArrowLeft className="h-4 w-4 mr-1" />
                {accountIdParam ? t("dashboard.backToContextAccount") : t("dashboard.backToContextEntity")}
              </a>
            </Link>
          )}
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">{titleText}</h1>
          <p className="text-muted-foreground mt-1">{subtitleText}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="md:col-span-2 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("dashboard.totalCalled")}</p>
                {isLoading ? <Skeleton className="h-8 w-32 mt-1" /> : (
                  <p className="text-2xl font-semibold mt-1" data-testid="text-summary-initial">${fmtMoney(summary.initial, locale)}</p>
                )}
              </div>
              <ArrowRight className="h-6 w-6 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("dashboard.currentValue")}</p>
                {isLoading ? <Skeleton className="h-8 w-32 mt-1" /> : (
                  <p className="text-2xl font-semibold mt-1" data-testid="text-summary-current">${fmtMoney(summary.current, locale)}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 md:col-span-2">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("dashboard.roi")}</p>
                {isLoading ? <Skeleton className="h-8 w-20 mt-1" /> : (
                  <p className={`text-2xl font-semibold mt-1 flex items-center gap-1 ${summary.roi >= 0 ? "text-emerald-600" : "text-red-600"}`} data-testid="text-summary-roi">
                    {summary.roi >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    {fmtPct(summary.roi)}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("dashboard.moic")}</p>
                {isLoading ? <Skeleton className="h-8 w-20 mt-1" /> : (
                  <p className="text-2xl font-semibold mt-1" data-testid="text-summary-moic">{summary.moic.toFixed(2)}x</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("dashboard.tvpi")}</p>
                {isLoading ? <Skeleton className="h-8 w-20 mt-1" /> : (
                  <p className="text-2xl font-semibold mt-1" data-testid="text-summary-tvpi">{summary.tvpi.toFixed(2)}x</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("dashboard.dpi")}</p>
                {isLoading ? <Skeleton className="h-8 w-20 mt-1" /> : (
                  <p className="text-2xl font-semibold mt-1" data-testid="text-summary-dpi">{summary.dpi.toFixed(2)}x</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("dashboard.distributions")}</p>
                {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
                  <p className="text-2xl font-semibold mt-1" data-testid="text-summary-distributions">${fmtMoney(summary.distributions, locale)}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("dashboard.investments")}</p>
                {isLoading ? <Skeleton className="h-8 w-12 mt-1" /> : (
                  <p className="text-2xl font-semibold mt-1" data-testid="text-summary-count">{summary.count}</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isLoading && spvBreakdown.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          <SpvPieCard title={t("dashboard.pieInitialTitle")} subtitle={t("dashboard.pieInitialSubtitle")} data={initialPie} valueFormatter={(v) => `$${fmtMoney(v, locale)}`} />
          <SpvPieCard title={t("dashboard.pieCurrentTitle")} subtitle={t("dashboard.pieCurrentSubtitle")} data={currentPie} valueFormatter={(v) => `$${fmtMoney(v, locale)}`} />
          <SpvPieCard title={t("dashboard.pieGrowthTitle")} subtitle={t("dashboard.pieGrowthSubtitle")} data={growthPie} valueFormatter={(v) => fmtPct(v)} legendFormatter={(v) => fmtPct(v)} />
        </div>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold">{t("dashboard.investmentsTitle")}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {isMultiBeneficiary && (
                <>
                  <Select value={groupBy} onValueChange={v => setGroupBy(v as "spv" | "beneficiary")}>
                    <SelectTrigger className="h-9 w-auto gap-1" data-testid="select-group-by">
                      <span className="text-muted-foreground text-xs mr-0.5">{t("dashboard.groupBy")}:</span>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="spv">{t("dashboard.groupBySpv")}</SelectItem>
                      <SelectItem value="beneficiary">{t("dashboard.groupByBeneficiary")}</SelectItem>
                    </SelectContent>
                  </Select>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-9 gap-2" data-testid="button-filter-beneficiaries">
                        <Filter className="h-3.5 w-3.5" />
                        {activeFilterCount !== null
                          ? t("dashboard.filterByActive", { count: activeFilterCount, total: totalBeneficiaryCount })
                          : t("dashboard.filterBy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="end">
                      <div className="space-y-0.5" data-testid="popover-filter-beneficiaries">
                        {allBeneficiaries.map(b => (
                          <div
                            key={b.key}
                            className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                            onClick={() => toggleBeneficiary(b.key)}
                          >
                            <Checkbox
                              checked={isBeneficiarySelected(b.key)}
                              onCheckedChange={() => toggleBeneficiary(b.key)}
                              onClick={e => e.stopPropagation()}
                            />
                            <span className="text-sm flex items-center gap-1.5 min-w-0">
                              {b.investorType === "entity" && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 flex-shrink-0">{t("dashboard.entityBadge")}</Badge>
                              )}
                              <span className="truncate">{b.name}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </>
              )}

              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("dashboard.searchPlaceholder")}
                  className="pl-9"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  data-testid="input-search-portfolio"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (groupBy === "spv" ? groupedByCompany.length : groupedByBeneficiary.length) === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? t("dashboard.noInvestmentsSearch") : isAdmin ? t("dashboard.noInvestmentsAdmin") : t("dashboard.noInvestmentsUser")}
              </p>
            </div>
          ) : groupBy === "spv" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3 font-medium w-8"></th>
                    <th className="py-2 pr-3 font-medium">{t("dashboard.tableName")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("dashboard.tableTotalCalled")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("dashboard.tableCurrentValue")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("dashboard.tableDistributed")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("dashboard.tableRoi")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("dashboard.tableDate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedByCompany.flatMap(group => {
                    const isOpen = expanded[group.key] ?? false;
                    const rows: JSX.Element[] = [];
                    rows.push(
                      <tr
                        key={`group-${group.key}`}
                        className="border-b hover-elevate cursor-pointer"
                        onClick={() => toggle(group.key)}
                        data-testid={`row-company-${group.key}`}
                      >
                        <td className="py-3 pr-3">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold flex-shrink-0">
                              {group.name[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold">{group.name}</p>
                              <p className="text-xs text-muted-foreground">{group.organizationName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-right font-medium">${fmtMoney(group.initial, locale)}</td>
                        <td className="py-3 pr-3 text-right font-medium">${fmtMoney(group.current, locale)}</td>
                        <td className="py-3 pr-3 text-right font-medium">${fmtMoney(group.distributions, locale)}</td>
                        <td className={`py-3 pr-3 text-right font-medium ${group.roi >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {fmtPct(group.roi)}
                        </td>
                        <td className="py-3 pr-3 text-right text-muted-foreground">—</td>
                      </tr>
                    );
                    if (isOpen) {
                      group.investments.forEach(inv => {
                        const initial = parseFloat(inv.totalCalled || "0");
                        const current = parseFloat(inv.currentValue || "0");
                        const distributions = parseFloat(inv.distributed || "0");
                        const roi = initial > 0 ? ((current + distributions - initial) / initial) * 100 : 0;
                        rows.push(
                          <tr
                            key={`inv-${inv.memberId}`}
                            className="border-b bg-muted/20 hover-elevate"
                            data-testid={`row-investment-${inv.memberId}`}
                          >
                            <td className="py-2 pr-3"></td>
                            <td className="py-2 pr-3 pl-10">
                              <Link href={inv.investorType === "entity" ? lp("entityDetail", { id: inv.investorId }) : lp("accountDetail", { id: inv.investorId })}>
                                <span className="text-muted-foreground hover:text-foreground cursor-pointer inline-flex items-center gap-2" data-testid={`text-investor-${inv.memberId}`}>
                                  {inv.investorType === "entity" && <Badge variant="outline" className="text-[10px] px-1 py-0">{t("dashboard.entityBadge")}</Badge>}
                                  {inv.investorName}
                                </span>
                              </Link>
                            </td>
                            <td className="py-2 pr-3 text-right">${fmtMoney(initial, locale)}</td>
                            <td className="py-2 pr-3 text-right">${fmtMoney(current, locale)}</td>
                            <td className="py-2 pr-3 text-right">${fmtMoney(distributions, locale)}</td>
                            <td className={`py-2 pr-3 text-right ${roi >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {fmtPct(roi)}
                            </td>
                            <td className="py-2 pr-3 text-right text-muted-foreground">{fmtDate(inv.date, locale)}</td>
                          </tr>
                        );
                      });
                    }
                    return rows;
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground" data-testid="text-results-count">
                {t("dashboard.showingCompanies", { count: groupedByCompany.length, invCount: filtered.length })}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3 font-medium w-8"></th>
                    <th className="py-2 pr-3 font-medium">{t("dashboard.tableName")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("dashboard.tableTotalCalled")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("dashboard.tableCurrentValue")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("dashboard.tableDistributed")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("dashboard.tableRoi")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("dashboard.tableDate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedByBeneficiary.flatMap(group => {
                    const isOpen = expanded[group.key] ?? false;
                    const rows: JSX.Element[] = [];
                    rows.push(
                      <tr
                        key={`bgroup-${group.key}`}
                        className="border-b hover-elevate cursor-pointer"
                        onClick={() => toggle(group.key)}
                        data-testid={`row-beneficiary-${group.key}`}
                      >
                        <td className="py-3 pr-3">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold flex-shrink-0">
                              {group.name[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold flex items-center gap-1.5">
                                {group.investorType === "entity" && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">{t("dashboard.entityBadge")}</Badge>
                                )}
                                {group.name}
                              </p>
                              <p className="text-xs text-muted-foreground">{group.investments.length} {group.investments.length === 1 ? t("dashboard.investments").toLowerCase().replace(/s$/, "") : t("dashboard.investments").toLowerCase()}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-right font-medium">${fmtMoney(group.initial, locale)}</td>
                        <td className="py-3 pr-3 text-right font-medium">${fmtMoney(group.current, locale)}</td>
                        <td className="py-3 pr-3 text-right font-medium">${fmtMoney(group.distributions, locale)}</td>
                        <td className={`py-3 pr-3 text-right font-medium ${group.roi >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {fmtPct(group.roi)}
                        </td>
                        <td className="py-3 pr-3 text-right text-muted-foreground">—</td>
                      </tr>
                    );
                    if (isOpen) {
                      group.investments.forEach(inv => {
                        const initial = parseFloat(inv.totalCalled || "0");
                        const current = parseFloat(inv.currentValue || "0");
                        const distributions = parseFloat(inv.distributed || "0");
                        const roi = initial > 0 ? ((current + distributions - initial) / initial) * 100 : 0;
                        rows.push(
                          <tr
                            key={`binv-${inv.memberId}`}
                            className="border-b bg-muted/20 hover-elevate"
                            data-testid={`row-investment-${inv.memberId}`}
                          >
                            <td className="py-2 pr-3"></td>
                            <td className="py-2 pr-3 pl-10">
                              <Link href={lp("spvDetail", { id: inv.spvId })}>
                                <span className="text-muted-foreground hover:text-foreground cursor-pointer" data-testid={`text-spv-${inv.memberId}`}>
                                  {inv.spvName}
                                  <span className="ml-1.5 text-xs opacity-60">{inv.organizationName}</span>
                                </span>
                              </Link>
                            </td>
                            <td className="py-2 pr-3 text-right">${fmtMoney(initial, locale)}</td>
                            <td className="py-2 pr-3 text-right">${fmtMoney(current, locale)}</td>
                            <td className="py-2 pr-3 text-right">${fmtMoney(distributions, locale)}</td>
                            <td className={`py-2 pr-3 text-right ${roi >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {fmtPct(roi)}
                            </td>
                            <td className="py-2 pr-3 text-right text-muted-foreground">{fmtDate(inv.date, locale)}</td>
                          </tr>
                        );
                      });
                    }
                    return rows;
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground" data-testid="text-results-count">
                {t("dashboard.showingBeneficiaries", { count: groupedByBeneficiary.length, invCount: filtered.length })}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
