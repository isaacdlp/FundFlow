import { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import type { PortfolioInvestment, AccountWithRoles, EntityInfo } from "@shared/types";
import { Search, TrendingUp, TrendingDown, ArrowRight, ChevronDown, ChevronRight, Briefcase, ArrowLeft } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer, Legend } from "recharts";

const PIE_GRADIENTS: { id: string; from: string; to: string }[] = [
  { id: "grad-indigo",    from: "#6366f1", to: "#3b3df2" },
  { id: "grad-emerald",   from: "#34d399", to: "#059669" },
  { id: "grad-amber",     from: "#fbbf24", to: "#d97706" },
  { id: "grad-rose",      from: "#fb7185", to: "#e11d48" },
  { id: "grad-violet",    from: "#a78bfa", to: "#7c3aed" },
  { id: "grad-cyan",      from: "#22d3ee", to: "#0891b2" },
  { id: "grad-pink",      from: "#f472b6", to: "#db2777" },
  { id: "grad-lime",      from: "#a3e635", to: "#65a30d" },
  { id: "grad-orange",    from: "#fb923c", to: "#ea580c" },
  { id: "grad-teal",      from: "#2dd4bf", to: "#0d9488" },
  { id: "grad-blue",      from: "#60a5fa", to: "#2563eb" },
  { id: "grad-yellow",    from: "#facc15", to: "#ca8a04" },
  { id: "grad-purple",    from: "#c084fc", to: "#9333ea" },
  { id: "grad-green",     from: "#4ade80", to: "#16a34a" },
  { id: "grad-sky",       from: "#38bdf8", to: "#0284c7" },
  { id: "grad-fuchsia",   from: "#e879f9", to: "#c026d3" },
];

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number): string {
  if (!isFinite(n)) return "0.00%";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US");
  } catch {
    return d;
  }
}

function SpvPieCard({
  title,
  subtitle,
  data,
  valueFormatter = (v) => `$${fmtMoney(v)}`,
  legendFormatter,
}: {
  title: string;
  subtitle: string;
  data: { name: string; value: number }[];
  valueFormatter?: (v: number) => string;
  legendFormatter?: (v: number) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-base font-semibold" data-testid={`text-pie-title-${title.replace(/\s+/g, "-").toLowerCase()}`}>{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="pt-2">
        {data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">No data</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {PIE_GRADIENTS.map(g => (
                    <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={g.from} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={g.to} stopOpacity={1} />
                    </linearGradient>
                  ))}
                  <filter id="pie-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.15" />
                  </filter>
                </defs>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  filter="url(#pie-shadow)"
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={`url(#${PIE_GRADIENTS[i % PIE_GRADIENTS.length].id})`} />
                  ))}
                </Pie>
                <RTooltip
                  formatter={(v: any) => [valueFormatter(Number(v)), "Value"]}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value: string, _entry: any, idx: number) => {
                    const item = data.find(d => d.name === value);
                    const color = PIE_GRADIENTS[idx % PIE_GRADIENTS.length].to;
                    const label = !item
                      ? value
                      : legendFormatter
                        ? `${value} · ${legendFormatter(item.value)}`
                        : `${value} · ${total > 0 ? ((item.value / total) * 100).toFixed(1) : "0"}%`;
                    return <span style={{ color }}>{label}</span>;
                  }}
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

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  const filtered = useMemo(() => {
    const items = investments ?? [];
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
  }, [investments, search]);

  const summary = useMemo(() => {
    const initial = filtered.reduce((s, i) => s + parseFloat(i.totalCalled || "0"), 0);
    const current = filtered.reduce((s, i) => s + parseFloat(i.currentValue || "0"), 0);
    const distributions = filtered.reduce((s, i) => s + parseFloat(i.distributed || "0"), 0);
    const roi = initial > 0 ? ((current + distributions - initial) / initial) * 100 : 0;
    const moic = initial > 0 ? (current + distributions) / initial : 0;
    const tvpi = initial > 0 ? (current + distributions) / initial : 0;
    const dpi = initial > 0 ? distributions / initial : 0;
    return { initial, current, distributions, roi, moic, tvpi, dpi, count: filtered.length };
  }, [filtered]);

  const spvBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; initial: number; current: number }>();
    for (const inv of filtered) {
      const key = inv.spvName || "Untitled SPV";
      const cur = map.get(key) ?? { name: key, initial: 0, current: 0 };
      cur.initial += parseFloat(inv.totalCalled || "0");
      cur.current += parseFloat(inv.currentValue || "0");
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.current - a.current);
  }, [filtered]);

  const initialPie = spvBreakdown.filter(s => s.initial > 0).map(s => ({ name: s.name, value: s.initial }));
  const currentPie = spvBreakdown.filter(s => s.current > 0).map(s => ({ name: s.name, value: s.current }));
  const growthPie = spvBreakdown
    .filter(s => s.initial > 0 && s.current > s.initial)
    .map(s => ({ name: s.name, value: ((s.current - s.initial) / s.initial) * 100 }))
    .sort((a, b) => b.value - a.value);

  const groupedByCompany = useMemo<CompanyGroup[]>(() => {
    const map = new Map<string, CompanyGroup>();
    for (const inv of filtered) {
      const key = (inv.investmentCompanyName || inv.spvName).trim() || "Untitled";
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: key,
          organizationName: inv.organizationName,
          organizationSlug: inv.organizationSlug,
          initial: 0,
          current: 0,
          distributions: 0,
          roi: 0,
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
  }, [filtered]);

  const toggle = (key: string) => setExpanded(e => ({ ...e, [key]: !e[key] }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {(accountIdParam || entityIdParam) && (
            <Link href={accountIdParam ? `/accounts/${accountIdParam}` : `/entities/${entityIdParam}`}>
              <a className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2" data-testid="link-back-to-context">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to {accountIdParam ? "account" : "entity"}
              </a>
            </Link>
          )}
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            {accountIdParam && contextAccount
              ? `${contextAccount.firstName} ${contextAccount.lastName} — Portfolio`
              : entityIdParam && contextEntity
                ? `${contextEntity.name} — Portfolio`
                : "Portfolio Summary"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {accountIdParam
              ? "Direct investments by this account plus investments held by entities it owns."
              : entityIdParam
                ? "All investments held directly by this entity."
                : isAdmin
                  ? "All investments across every account and entity on the platform"
                  : `Welcome${user ? `, ${user.firstName}` : ""}. Here is a breakdown of your investments.`}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="md:col-span-2 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total called</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-32 mt-1" />
                ) : (
                  <p className="text-2xl font-semibold mt-1" data-testid="text-summary-initial">
                    ${fmtMoney(summary.initial)}
                  </p>
                )}
              </div>
              <ArrowRight className="h-6 w-6 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Current value</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-32 mt-1" />
                ) : (
                  <p className="text-2xl font-semibold mt-1" data-testid="text-summary-current">
                    ${fmtMoney(summary.current)}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 md:col-span-2">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">ROI</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-20 mt-1" />
                ) : (
                  <p className={`text-2xl font-semibold mt-1 flex items-center gap-1 ${summary.roi >= 0 ? "text-emerald-600" : "text-red-600"}`} data-testid="text-summary-roi">
                    {summary.roi >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    {fmtPct(summary.roi)}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">MOIC</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-20 mt-1" />
                ) : (
                  <p className="text-2xl font-semibold mt-1" data-testid="text-summary-moic">
                    {summary.moic.toFixed(2)}x
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">TVPI</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-20 mt-1" />
                ) : (
                  <p className="text-2xl font-semibold mt-1" data-testid="text-summary-tvpi">
                    {summary.tvpi.toFixed(2)}x
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">DPI</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-20 mt-1" />
                ) : (
                  <p className="text-2xl font-semibold mt-1" data-testid="text-summary-dpi">
                    {summary.dpi.toFixed(2)}x
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Distributions</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-semibold mt-1" data-testid="text-summary-distributions">
                    ${fmtMoney(summary.distributions)}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Investments</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-semibold mt-1" data-testid="text-summary-count">
                    {summary.count}
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isLoading && spvBreakdown.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          <SpvPieCard title="Initial contribution by SPV" subtitle="Capital called at entry" data={initialPie} valueFormatter={(v) => `$${fmtMoney(v)}`} />
          <SpvPieCard title="Current value by SPV" subtitle="Most recent valuation" data={currentPie} valueFormatter={(v) => `$${fmtMoney(v)}`} />
          <SpvPieCard title="Percentage growth by SPV" subtitle="Positive growth only · (Current − Initial) / Initial" data={growthPie} valueFormatter={(v) => fmtPct(v)} legendFormatter={(v) => fmtPct(v)} />
        </div>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold">Investments</h2>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by company, SPV, fund or investor..."
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-search-portfolio"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : groupedByCompany.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {search
                  ? "No investments match your search."
                  : isAdmin
                    ? "No investments have been recorded yet. Add investors to SPVs to see them here."
                    : "You don't have any investments yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3 font-medium w-8"></th>
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium text-right">Total Called</th>
                    <th className="py-2 pr-3 font-medium text-right">Current Value</th>
                    <th className="py-2 pr-3 font-medium text-right">Distributed</th>
                    <th className="py-2 pr-3 font-medium text-right">ROI</th>
                    <th className="py-2 pr-3 font-medium text-right">Date</th>
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
                          <td className="py-3 pr-3 text-right font-medium">${fmtMoney(group.initial)}</td>
                          <td className="py-3 pr-3 text-right font-medium">${fmtMoney(group.current)}</td>
                          <td className="py-3 pr-3 text-right font-medium">${fmtMoney(group.distributions)}</td>
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
                              <Link href={inv.investorType === "entity" ? `/entities/${inv.investorId}` : `/accounts/${inv.investorId}`}>
                                <span className="text-muted-foreground hover:text-foreground cursor-pointer inline-flex items-center gap-2" data-testid={`text-investor-${inv.memberId}`}>
                                  {inv.investorType === "entity" && <Badge variant="outline" className="text-[10px] px-1 py-0">Entity</Badge>}
                                  {inv.investorName}
                                </span>
                              </Link>
                            </td>
                            <td className="py-2 pr-3 text-right">${fmtMoney(initial)}</td>
                            <td className="py-2 pr-3 text-right">${fmtMoney(current)}</td>
                            <td className="py-2 pr-3 text-right">${fmtMoney(distributions)}</td>
                            <td className={`py-2 pr-3 text-right ${roi >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {fmtPct(roi)}
                            </td>
                            <td className="py-2 pr-3 text-right text-muted-foreground">{fmtDate(inv.date)}</td>
                          </tr>
                        );
                      });
                    }
                    return rows;
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground" data-testid="text-results-count">
                Showing {groupedByCompany.length} {groupedByCompany.length === 1 ? "company" : "companies"} · {filtered.length} {filtered.length === 1 ? "investment" : "investments"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
