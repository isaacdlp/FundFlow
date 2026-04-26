import { Fragment, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import type { PortfolioInvestment, AccountWithRoles, EntityInfo } from "@shared/types";
import { Search, TrendingUp, TrendingDown, ArrowRight, ChevronDown, ChevronRight, Briefcase, ArrowLeft } from "lucide-react";

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
    const initial = filtered.reduce((s, i) => s + parseFloat(i.initialValue || "0"), 0);
    const current = filtered.reduce((s, i) => s + parseFloat(i.currentValue || "0"), 0);
    const distributions = filtered.reduce((s, i) => s + parseFloat(i.distributions || "0"), 0);
    const roi = initial > 0 ? ((current + distributions - initial) / initial) * 100 : 0;
    const moic = initial > 0 ? (current + distributions) / initial : 0;
    return { initial, current, distributions, roi, moic, count: filtered.length };
  }, [filtered]);

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
      g.initial += parseFloat(inv.initialValue || "0");
      g.current += parseFloat(inv.currentValue || "0");
      g.distributions += parseFloat(inv.distributions || "0");
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
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Initial value</p>
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

            <div className="grid grid-cols-2 gap-6 md:col-span-2">
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
                    {isAdmin && <th className="py-2 pr-3 font-medium">Investor</th>}
                    <th className="py-2 pr-3 font-medium text-right">Initial Value</th>
                    <th className="py-2 pr-3 font-medium text-right">Current Value</th>
                    <th className="py-2 pr-3 font-medium text-right">Distribution</th>
                    <th className="py-2 pr-3 font-medium text-right">ROI</th>
                    <th className="py-2 pr-3 font-medium text-right">Purchase Date</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedByCompany.map(group => {
                    const isOpen = expanded[group.key] ?? true;
                    return (
                      <Fragment key={`group-${group.key}`}>
                        <tr
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
                          {isAdmin && (
                            <td className="py-3 pr-3 text-muted-foreground">
                              {group.investments.length} {group.investments.length === 1 ? "investor" : "investors"}
                            </td>
                          )}
                          <td className="py-3 pr-3 text-right font-medium">${fmtMoney(group.initial)}</td>
                          <td className="py-3 pr-3 text-right font-medium">${fmtMoney(group.current)}</td>
                          <td className="py-3 pr-3 text-right font-medium">${fmtMoney(group.distributions)}</td>
                          <td className={`py-3 pr-3 text-right font-medium ${group.roi >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {fmtPct(group.roi)}
                          </td>
                          <td className="py-3 pr-3 text-right text-muted-foreground">—</td>
                        </tr>
                        {isOpen && group.investments.map(inv => {
                          const initial = parseFloat(inv.initialValue || "0");
                          const current = parseFloat(inv.currentValue || "0");
                          const distributions = parseFloat(inv.distributions || "0");
                          const roi = initial > 0 ? ((current + distributions - initial) / initial) * 100 : 0;
                          return (
                            <tr
                              key={`inv-${inv.memberId}`}
                              className="border-b bg-muted/20 hover-elevate"
                              data-testid={`row-investment-${inv.memberId}`}
                            >
                              <td className="py-2 pr-3"></td>
                              <td className="py-2 pr-3 pl-10">
                                <Link href={`/spvs/${inv.spvId}`}>
                                  <div className="flex items-center gap-2 cursor-pointer">
                                    <Badge variant="secondary" className="font-normal">
                                      {inv.investmentType || "SPV"}
                                    </Badge>
                                    <span className="text-muted-foreground hover:text-foreground">
                                      RS {inv.spvName}
                                    </span>
                                  </div>
                                </Link>
                              </td>
                              {isAdmin && (
                                <td className="py-2 pr-3">
                                  <Link href={inv.investorType === "entity" ? `/entities/${inv.investorId}` : `/accounts/${inv.investorId}`}>
                                    <span className="text-muted-foreground hover:text-foreground cursor-pointer inline-flex items-center gap-1" data-testid={`text-investor-${inv.memberId}`}>
                                      {inv.investorType === "entity" && <Badge variant="outline" className="text-[10px] px-1 py-0">Entity</Badge>}
                                      {inv.investorName}
                                    </span>
                                  </Link>
                                </td>
                              )}
                              <td className="py-2 pr-3 text-right">${fmtMoney(initial)}</td>
                              <td className="py-2 pr-3 text-right">${fmtMoney(current)}</td>
                              <td className="py-2 pr-3 text-right">${fmtMoney(distributions)}</td>
                              <td className={`py-2 pr-3 text-right ${roi >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {fmtPct(roi)}
                              </td>
                              <td className="py-2 pr-3 text-right text-muted-foreground">{fmtDate(inv.purchaseDate)}</td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
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
