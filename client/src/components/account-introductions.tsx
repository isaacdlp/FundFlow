import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import type { AccountWithRoles, AccountIntroductionsInfo, EntityInfo, IntroductionInfo } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocalePath } from "@/i18n/hooks";
import { useToast } from "@/hooks/use-toast";
import { useSort } from "@/hooks/use-sort";
import { SortableTableHead } from "@/components/sortable-table-head";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchPicker, type SearchPickerOption } from "@/components/search-picker";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Trash2 } from "lucide-react";

/** What the dialog is editing: a new introduction (with its parties) or an existing one. */
type DialogState =
  | { mode: "create"; introducerAccountId: number; introducedAccountId?: number; introducedEntityId?: number; label: string }
  | { mode: "edit"; id: number; label: string };

const personName = (a: { firstName: string; lastName: string } | null) =>
  a ? `${a.firstName} ${a.lastName}` : "—";

export function AccountIntroductions({ accountId }: { accountId: number }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const lp = useLocalePath();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");

  const queryKey = ["/api/accounts", String(accountId), "introductions"];
  const { data } = useQuery<AccountIntroductionsInfo>({ queryKey });
  const { data: accountsList } = useQuery<AccountWithRoles[]>({ queryKey: ["/api/accounts"] });
  const { data: entitiesList } = useQuery<EntityInfo[]>({ queryKey: ["/api/entities"] });

  const invalidate = () => {
    // Any introduction can change other accounts' lists and inherited entity rows.
    queryClient.invalidateQueries({
      predicate: q => q.queryKey.includes("introductions"),
    });
  };

  const onError = (title: string) => (error: Error) =>
    toast({ title, description: error.message, variant: "destructive" });

  const saveMutation = useMutation({
    mutationFn: async (state: DialogState) => {
      const details = { date: date || null, notes };
      if (state.mode === "create") {
        const { mode, label, ...parties } = state;
        await apiRequest("POST", "/api/introductions", { ...parties, ...details });
      } else {
        await apiRequest("PATCH", `/api/introductions/${state.id}`, details);
      }
    },
    onSuccess: () => {
      invalidate();
      setDialog(null);
      toast({ title: t("introductions.saved") });
    },
    onError: onError(t("introductions.saveFailed")),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/introductions/${id}`); },
    onSuccess: () => {
      invalidate();
      toast({ title: t("introductions.removed") });
    },
    onError: onError(t("introductions.removeFailed")),
  });

  const openCreate = (state: Extract<DialogState, { mode: "create" }>) => {
    setDate("");
    setNotes("");
    setDialog(state);
  };

  const openEdit = (intro: IntroductionInfo, label: string) => {
    setDate(intro.date ?? "");
    setNotes(intro.notes ?? "");
    setDialog({ mode: "edit", id: intro.id, label });
  };

  const introducedBy = data?.introducedBy ?? [];
  const introduced = data?.introduced ?? [];
  const introducedLabel = (intro: IntroductionInfo) =>
    intro.introducedEntityId !== null ? intro.introducedEntity?.name ?? "—" : personName(intro.introducedAccount);
  const introducedBySort = useSort(introducedBy, {
    name: intro => personName(intro.introducer),
    date: intro => intro.date,
    notes: intro => intro.notes,
  });
  const introducedSort = useSort(introduced, {
    name: introducedLabel,
    date: intro => intro.date,
    notes: intro => intro.notes,
  });
  const introducedByPages = usePagination(introducedBySort.sorted, introducedBySort.sort);
  const introducedPages = usePagination(introducedSort.sorted, introducedSort.sort);
  const unavailable = data?.unavailable;

  const introducerOptions = (accountsList ?? []).filter(a =>
    a.id !== accountId &&
    !introducedBy.some(i => i.introducerAccountId === a.id) &&
    !unavailable?.introducerAccountIds.includes(a.id));
  const accountTargetOptions = (accountsList ?? []).filter(a =>
    a.id !== accountId &&
    !introduced.some(i => i.introducedAccountId === a.id) &&
    !unavailable?.introducedAccountIds.includes(a.id));
  // Entities only credited by inheritance can still be credited directly.
  const entityTargetOptions = (entitiesList ?? []).filter(e =>
    !introduced.some(i => i.introducedEntityId === e.id && i.viaAccountId === null) &&
    !unavailable?.introducedEntityIds.includes(e.id));

  const introducerPickerOptions: SearchPickerOption[] = introducerOptions.map(a => (
    { value: String(a.id), label: personName(a), detail: a.email ?? undefined }));
  // Accounts and entities share one search; values are prefixed to tell them apart.
  const introducedPickerOptions: SearchPickerOption[] = [
    ...accountTargetOptions.map(a => (
      { value: `account-${a.id}`, label: personName(a), detail: a.email ?? undefined, group: t("introductions.account") })),
    ...entityTargetOptions.map(e => (
      { value: `entity-${e.id}`, label: e.name, detail: e.entityType, group: t("introductions.entity") })),
  ];

  const onPickIntroduced = (value: string) => {
    const [kind, rawId] = value.split("-");
    const id = parseInt(rawId);
    if (kind === "account") {
      const a = accountsList?.find(x => x.id === id);
      if (a) openCreate({ mode: "create", introducerAccountId: accountId, introducedAccountId: a.id, label: personName(a) });
    } else {
      const e = entitiesList?.find(x => x.id === id);
      if (e) openCreate({ mode: "create", introducerAccountId: accountId, introducedEntityId: e.id, label: e.name });
    }
  };

  const rowActions = (intro: IntroductionInfo, label: string) => (
    <div className="flex gap-1 justify-end">
      <Button variant="ghost" size="icon" onClick={() => openEdit(intro, label)} data-testid={`button-edit-introduction-${intro.id}`}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => removeMutation.mutate(intro.id)}
        disabled={removeMutation.isPending}
        data-testid={`button-remove-introduction-${intro.id}`}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );

  const detailCells = (intro: IntroductionInfo) => (
    <>
      <TableCell className="text-muted-foreground whitespace-nowrap">{intro.date ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground max-w-xs truncate" title={intro.notes ?? ""}>{intro.notes || "—"}</TableCell>
    </>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold">{t("introductions.introducedByTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("introductions.introducedByHint")}</p>
          </div>
          <SearchPicker
            options={introducerPickerOptions}
            onSelect={v => {
              const a = accountsList?.find(x => x.id === parseInt(v));
              if (a) openCreate({ mode: "create", introducerAccountId: a.id, introducedAccountId: accountId, label: personName(a) });
            }}
            placeholder={t("introductions.addIntroducer")}
            searchPlaceholder={t("introductions.searchPeople")}
            data-testid="select-add-introducer"
          />
        </CardHeader>
        <CardContent>
          {introducedBy.length > 0 ? (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead control={introducedBySort} column="name">{t("introductions.introducer")}</SortableTableHead>
                  <SortableTableHead control={introducedBySort} column="date">{t("introductions.date")}</SortableTableHead>
                  <SortableTableHead control={introducedBySort} column="notes">{t("introductions.notes")}</SortableTableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {introducedByPages.items.map(intro => (
                  <TableRow key={intro.id} data-testid={`row-introducer-${intro.introducerAccountId}`}>
                    <TableCell>
                      <Link href={lp("accountDetail", { id: intro.introducerAccountId })} className="font-medium hover:underline">
                        {personName(intro.introducer)}
                      </Link>
                    </TableCell>
                    {detailCells(intro)}
                    <TableCell>{rowActions(intro, personName(intro.introducer))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPagination control={introducedByPages.control} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("introductions.noIntroducers")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold">{t("introductions.introducedTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("introductions.introducedHint")}</p>
          </div>
          <SearchPicker
            options={introducedPickerOptions}
            onSelect={onPickIntroduced}
            placeholder={t("introductions.addIntroduced")}
            searchPlaceholder={t("introductions.searchIntroduced")}
            data-testid="select-add-introduced"
          />
        </CardHeader>
        <CardContent>
          {introduced.length > 0 ? (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead control={introducedSort} column="name">{t("introductions.introduced")}</SortableTableHead>
                  <SortableTableHead control={introducedSort} column="date">{t("introductions.date")}</SortableTableHead>
                  <SortableTableHead control={introducedSort} column="notes">{t("introductions.notes")}</SortableTableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {introducedPages.items.map(intro => {
                  const isEntity = intro.introducedEntityId !== null;
                  const label = introducedLabel(intro);
                  const href = isEntity
                    ? lp("entityDetail", { id: intro.introducedEntityId! })
                    : lp("accountDetail", { id: intro.introducedAccountId! });
                  return (
                    <TableRow key={intro.id} data-testid={`row-introduced-${intro.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">{isEntity ? t("introductions.entity") : t("introductions.account")}</Badge>
                          <Link href={href} className="font-medium hover:underline">{label}</Link>
                          {intro.via && (
                            <Badge variant="secondary" data-testid={`badge-inherited-${intro.id}`}>
                              {t("introductions.inheritedVia", { name: personName(intro.via) })}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      {detailCells(intro)}
                      <TableCell>{intro.viaAccountId === null && rowActions(intro, label)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <ListPagination control={introducedPages.control} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("introductions.noIntroduced")}</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? t("introductions.editTitle") : t("introductions.addTitle")}</DialogTitle>
            <DialogDescription>{dialog?.label}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="introduction-date">{t("introductions.date")}</Label>
              <Input id="introduction-date" type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-introduction-date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="introduction-notes">{t("introductions.notes")}</Label>
              <Textarea id="introduction-notes" value={notes} onChange={e => setNotes(e.target.value)} data-testid="input-introduction-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => dialog && saveMutation.mutate(dialog)}
              disabled={saveMutation.isPending}
              data-testid="button-save-introduction"
            >
              {saveMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
