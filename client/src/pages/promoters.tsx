import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import type { AccountWithRoles, PromoterInfo, IncentiveType } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { normalizeSearch } from "@/lib/utils";
import { INCENTIVE_TYPES, formatPercent, incentiveLabelKey, incentiveShortLabelKey } from "@/lib/promoters";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocalePath } from "@/i18n/hooks";
import { useSort } from "@/hooks/use-sort";
import { SortableTableHead } from "@/components/sortable-table-head";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { SearchPicker } from "@/components/search-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Handshake, Plus, Search } from "lucide-react";
import NotFound from "@/pages/not-found";

const personName = (a: { firstName: string; lastName: string }) => `${a.firstName} ${a.lastName}`;

function AddPromoterDialog({ open, onOpenChange, promoters }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promoters: PromoterInfo[];
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const lp = useLocalePath();
  const [, navigate] = useLocation();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [contractDate, setContractDate] = useState("");
  const [notes, setNotes] = useState("");
  const [percents, setPercents] = useState<Record<IncentiveType, string>>({ management_fee: "", success_fee: "" });

  const { data: accountsList } = useQuery<AccountWithRoles[]>({ queryKey: ["/api/accounts"], enabled: open });
  const options = (accountsList ?? [])
    .filter(a => !promoters.some(c => c.accountId === a.id))
    .map(a => ({ value: String(a.id), label: personName(a), detail: a.email }));
  const selected = accountsList?.find(a => a.id === accountId);

  const reset = () => {
    setAccountId(null);
    setContractDate("");
    setNotes("");
    setPercents({ management_fee: "", success_fee: "" });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const incentives = INCENTIVE_TYPES
        .filter(type => percents[type].trim() !== "")
        .map(type => ({ type, percent: percents[type] }));
      const res = await apiRequest("POST", "/api/promoters", {
        accountId, contractDate: contractDate || null, notes, incentives,
      });
      return res.json() as Promise<PromoterInfo>;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/promoters"] });
      toast({ title: t("promoters.created") });
      onOpenChange(false);
      reset();
      navigate(lp("promoterDetail", { id: created.id }));
    },
    onError: (error: Error) => toast({ title: t("promoters.createFailed"), description: error.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={next => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("promoters.addTitle")}</DialogTitle>
          <DialogDescription>{t("promoters.addDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("promoters.account")}</Label>
            <SearchPicker
              options={options}
              onSelect={v => setAccountId(parseInt(v))}
              placeholder={t("promoters.pickAccount")}
              selectedLabel={selected ? `${personName(selected)} (${selected.email})` : undefined}
              searchPlaceholder={t("introductions.searchPeople")}
              className="w-full justify-between font-normal"
              data-testid="select-promoter-account"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="promoter-contract-date">{t("promoters.contractDate")}</Label>
            <Input id="promoter-contract-date" type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} data-testid="input-promoter-contract-date" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {INCENTIVE_TYPES.map(type => (
              <div key={type} className="space-y-2">
                <Label htmlFor={`promoter-incentive-${type}`}>{t(incentiveLabelKey(type))} (%)</Label>
                <Input
                  id={`promoter-incentive-${type}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder={t("promoters.optional")}
                  value={percents[type]}
                  onChange={e => setPercents(prev => ({ ...prev, [type]: e.target.value }))}
                  data-testid={`input-promoter-incentive-${type}`}
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="promoter-notes">{t("promoters.notes")}</Label>
            <Textarea id="promoter-notes" value={notes} onChange={e => setNotes(e.target.value)} data-testid="input-promoter-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={accountId === null || createMutation.isPending}
            data-testid="button-save-promoter"
          >
            {createMutation.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Promoters() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const lp = useLocalePath();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const { data: promotersList, isLoading } = useQuery<PromoterInfo[]>({
    queryKey: ["/api/promoters"],
    enabled: isAdmin,
  });

  const q = normalizeSearch(search);
  const filtered = promotersList?.filter(c =>
    !q || normalizeSearch(`${personName(c.account)} ${c.account.email}`).includes(q));
  const sort = useSort(filtered, {
    promoter: c => personName(c.account),
    status: c => c.active,
    contractDate: c => c.contractDate,
    incentives: c => c.incentives.map(i => `${t(incentiveShortLabelKey(i.type))} ${formatPercent(i.percent)}`).join(", "),
    introductions: c => c.introductionCount,
  });
  const pagination = usePagination(sort.sorted, [search, sort.sort]);

  if (!isAdmin) return <NotFound />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">{t("promoters.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("promoters.subtitle")}</p>
        </div>
        <Button onClick={() => setAdding(true)} data-testid="button-add-promoter">
          <Plus className="h-4 w-4 mr-2" />
          {t("promoters.addPromoter")}
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("promoters.searchPlaceholder")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtered && filtered.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead control={sort} column="promoter">{t("promoters.promoter")}</SortableTableHead>
                  <SortableTableHead control={sort} column="status">{t("promoters.status")}</SortableTableHead>
                  <SortableTableHead control={sort} column="contractDate">{t("promoters.contractDate")}</SortableTableHead>
                  <SortableTableHead control={sort} column="incentives">{t("promoters.incentives")}</SortableTableHead>
                  <SortableTableHead control={sort} column="introductions" className="text-center">{t("promoters.introductions")}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.items.map(c => (
                  <TableRow key={c.id} data-testid={`promoter-row-${c.id}`}>
                    <TableCell>
                      <Link href={lp("promoterDetail", { id: c.id })} className="font-medium hover:underline">
                        {personName(c.account)}
                      </Link>
                      <p className="text-xs text-muted-foreground">{c.account.email}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.active ? "default" : "secondary"}>
                        {c.active ? t("promoters.active") : t("promoters.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{c.contractDate ?? "—"}</TableCell>
                    <TableCell>
                      {c.incentives.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {c.incentives.map(i => (
                            <Badge key={i.id} variant="outline">
                              {t(incentiveShortLabelKey(i.type))} {formatPercent(i.percent)}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">{t("promoters.noIncentives")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{c.introductionCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPagination control={pagination.control} className="border-t" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Handshake className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {search ? t("promoters.noResultsSearch") : t("promoters.noPromoters")}
            </p>
          </CardContent>
        </Card>
      )}

      <AddPromoterDialog open={adding} onOpenChange={setAdding} promoters={promotersList ?? []} />
    </div>
  );
}
