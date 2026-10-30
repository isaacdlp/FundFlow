import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import type { AccountWithRoles, AccountDelegationsInfo, DelegationInfo, DelegationLevel, EntityInfo } from "@shared/types";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchPicker, type SearchPickerOption } from "@/components/search-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Pencil, Trash2 } from "lucide-react";

const LEVELS: DelegationLevel[] = ["observer", "manager"];

type Principal = { principalAccountId: number } | { principalEntityId: number };

/** What the dialog is editing: a new delegation (with its parties) or an existing one. */
type DialogState =
  | { mode: "create"; principal: Principal; delegateAccountId: number; label: string }
  | { mode: "edit"; id: number; label: string };

/** The party shown in a row: the account or entity on the other side from the page. */
interface Party { label: string; href: string; isEntity: boolean }

const personName = (a: { firstName: string; lastName: string } | null) =>
  a ? `${a.firstName} ${a.lastName}` : "—";

/** Create/edit dialog and mutations shared by the account and entity views. */
function useDelegationEditor() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [level, setLevel] = useState<DelegationLevel>("observer");
  const [notes, setNotes] = useState("");

  const invalidate = () => queryClient.invalidateQueries({
    // A delegation shows on both sides; an entity's managers also list on the
    // entity itself and pass their introducers on to it.
    predicate: q => q.queryKey.includes("delegations") || q.queryKey.includes("introductions") || q.queryKey[0] === "/api/entities",
  });
  const onError = (title: string) => (error: Error) =>
    toast({ title, description: error.message, variant: "destructive" });

  const saveMutation = useMutation({
    mutationFn: async (state: DialogState) => {
      if (state.mode === "create") {
        await apiRequest("POST", "/api/delegations", { ...state.principal, delegateAccountId: state.delegateAccountId, level, notes });
      } else {
        await apiRequest("PATCH", `/api/delegations/${state.id}`, { level, notes });
      }
    },
    onSuccess: () => {
      invalidate();
      setDialog(null);
      toast({ title: t("delegations.saved") });
    },
    onError: onError(t("delegations.saveFailed")),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/delegations/${id}`); },
    onSuccess: () => {
      invalidate();
      toast({ title: t("delegations.removed") });
    },
    onError: onError(t("delegations.removeFailed")),
  });

  const openCreate = (state: Omit<Extract<DialogState, { mode: "create" }>, "mode">, initialLevel: DelegationLevel = "observer") => {
    setLevel(initialLevel);
    setNotes("");
    setDialog({ mode: "create", ...state });
  };

  const openEdit = (d: DelegationInfo, label: string) => {
    setLevel(d.level);
    setNotes(d.notes ?? "");
    setDialog({ mode: "edit", id: d.id, label });
  };

  const dialogElement = (
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialog?.mode === "edit" ? t("delegations.editTitle") : t("delegations.addTitle")}</DialogTitle>
          <DialogDescription>{dialog?.label}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delegation-level">{t("delegations.level")}</Label>
            <Select value={level} onValueChange={v => setLevel(v as DelegationLevel)}>
              <SelectTrigger id="delegation-level" data-testid="select-delegation-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map(l => <SelectItem key={l} value={l}>{t(`delegations.levels.${l}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t(`delegations.levelHints.${level}`)}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="delegation-notes">{t("introductions.notes")}</Label>
            <Textarea
              id="delegation-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t("delegations.notesPlaceholder")}
              data-testid="input-delegation-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDialog(null)}>{t("common.cancel")}</Button>
          <Button
            onClick={() => dialog && saveMutation.mutate(dialog)}
            disabled={saveMutation.isPending}
            data-testid="button-save-delegation"
          >
            {saveMutation.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { openCreate, openEdit, remove: (id: number) => removeMutation.mutate(id), removing: removeMutation.isPending, dialogElement };
}

export function AccountDelegations({ accountId }: { accountId: number }) {
  const { t } = useTranslation();
  const lp = useLocalePath();
  const editor = useDelegationEditor();

  const { data } = useQuery<AccountDelegationsInfo>({ queryKey: ["/api/accounts", String(accountId), "delegations"] });
  const { data: accountsList } = useQuery<AccountWithRoles[]>({ queryKey: ["/api/accounts"] });
  const { data: entitiesList } = useQuery<EntityInfo[]>({ queryKey: ["/api/entities"] });

  const delegatedIn = data?.delegatedIn ?? [];
  const delegatedOut = data?.delegatedOut ?? [];
  const accountOptions = (exclude: number[]): SearchPickerOption[] => (accountsList ?? [])
    .filter(a => a.id !== accountId && !exclude.includes(a.id))
    .map(a => ({ value: `account-${a.id}`, label: personName(a), detail: a.email ?? undefined, group: t("introductions.account") }));
  const findAccount = (id: number) => accountsList?.find(a => a.id === id);

  // Accounts and entities share one search; values are prefixed to tell them apart.
  const inOptions: SearchPickerOption[] = [
    ...accountOptions(delegatedIn.flatMap(d => d.principalAccountId ?? [])),
    ...(entitiesList ?? [])
      .filter(e => !delegatedIn.some(d => d.principalEntityId === e.id))
      .map(e => ({ value: `entity-${e.id}`, label: e.name, detail: e.entityType, group: t("introductions.entity") })),
  ];
  const onPickIn = (value: string) => {
    const [kind, rawId] = value.split("-");
    const id = parseInt(rawId);
    if (kind === "account") {
      const a = findAccount(id);
      if (a) editor.openCreate({ principal: { principalAccountId: a.id }, delegateAccountId: accountId, label: t("delegations.actsFor", { name: personName(a) }) });
    } else {
      const e = entitiesList?.find(x => x.id === id);
      if (e) editor.openCreate({ principal: { principalEntityId: e.id }, delegateAccountId: accountId, label: t("delegations.actsFor", { name: e.name }) });
    }
  };

  const principalParty = (d: DelegationInfo): Party => d.principalEntityId !== null
    ? { label: d.principalEntity?.name ?? "—", href: lp("entityDetail", { id: d.principalEntityId }), isEntity: true }
    : { label: personName(d.principal), href: lp("accountDetail", { id: d.principalAccountId! }), isEntity: false };
  const delegateParty = (d: DelegationInfo): Party =>
    ({ label: personName(d.delegate), href: lp("accountDetail", { id: d.delegateAccountId }), isEntity: false });

  return (
    <div className="space-y-6">
      <DelegationCard
        title={t("delegations.inTitle")}
        hint={t("delegations.inHint")}
        rows={delegatedIn}
        party={principalParty}
        empty={t("delegations.noIn")}
        nameColumn={t("delegations.principal")}
        picker={
          <SearchPicker
            options={inOptions}
            onSelect={onPickIn}
            placeholder={t("delegations.addIn")}
            searchPlaceholder={t("introductions.searchIntroduced")}
            data-testid="select-add-delegated-in"
          />
        }
        editor={editor}
        testId="in"
      />

      <DelegationCard
        title={t("delegations.outTitle")}
        hint={t("delegations.outHint")}
        rows={delegatedOut}
        party={delegateParty}
        empty={t("delegations.noOut")}
        nameColumn={t("delegations.delegate")}
        picker={
          <SearchPicker
            options={accountOptions(delegatedOut.map(d => d.delegateAccountId))}
            onSelect={v => {
              const a = findAccount(parseInt(v.split("-")[1]));
              if (a) editor.openCreate({ principal: { principalAccountId: accountId }, delegateAccountId: a.id, label: t("delegations.delegateIs", { name: personName(a) }) });
            }}
            placeholder={t("delegations.addOut")}
            searchPlaceholder={t("introductions.searchPeople")}
            data-testid="select-add-delegated-out"
          />
        }
        editor={editor}
        testId="out"
      />

      {editor.dialogElement}
    </div>
  );
}

/**
 * Who acts for an entity. Entities can't act by themselves (so they have no
 * "acts on behalf of" side) and need at least one manager.
 */
export function EntityDelegations({ entityId, canEdit }: { entityId: number; canEdit: boolean }) {
  const { t } = useTranslation();
  const lp = useLocalePath();
  const editor = useDelegationEditor();

  const { data: rows = [] } = useQuery<DelegationInfo[]>({ queryKey: ["/api/entities", String(entityId), "delegations"] });
  const { data: accountsList } = useQuery<AccountWithRoles[]>({ queryKey: ["/api/accounts"], enabled: canEdit });

  const options: SearchPickerOption[] = (accountsList ?? [])
    .filter(a => !rows.some(d => d.delegateAccountId === a.id))
    .map(a => ({ value: String(a.id), label: personName(a), detail: a.email ?? undefined }));
  const hasManager = rows.some(d => d.level === "manager");

  return (
    <>
      <DelegationCard
        title={t("delegations.outTitle")}
        hint={t("delegations.entityHint")}
        rows={rows}
        party={d => ({ label: personName(d.delegate), href: lp("accountDetail", { id: d.delegateAccountId }), isEntity: false })}
        empty={t("delegations.noOut")}
        nameColumn={t("delegations.delegate")}
        warning={!hasManager ? t("delegations.entityNeedsManager") : undefined}
        picker={canEdit ? (
          <SearchPicker
            options={options}
            onSelect={v => {
              const a = accountsList?.find(x => x.id === parseInt(v));
              // Most accounts added to an entity run it.
              if (a) editor.openCreate({ principal: { principalEntityId: entityId }, delegateAccountId: a.id, label: t("delegations.delegateIsEntity", { name: personName(a) }) }, "manager");
            }}
            placeholder={t("delegations.addOut")}
            searchPlaceholder={t("introductions.searchPeople")}
            data-testid="select-add-entity-delegate"
          />
        ) : null}
        editor={canEdit ? editor : null}
        testId="entity"
      />
      {editor.dialogElement}
    </>
  );
}

interface DelegationCardProps {
  title: string;
  hint: string;
  rows: DelegationInfo[];
  party: (d: DelegationInfo) => Party;
  empty: string;
  nameColumn: string;
  picker: React.ReactNode;
  /** Null hides the row actions (read-only). */
  editor: ReturnType<typeof useDelegationEditor> | null;
  warning?: string;
  testId: string;
}

function DelegationCard({ title, hint, rows, party, empty, nameColumn, picker, editor, warning, testId }: DelegationCardProps) {
  const { t } = useTranslation();
  const sort = useSort(rows, {
    name: d => party(d).label,
    level: d => d.level,
    notes: d => d.notes,
  });
  const pages = usePagination(sort.sorted, sort.sort);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        {picker}
      </CardHeader>
      <CardContent className="space-y-4">
        {warning && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/50 p-3 text-sm text-destructive" data-testid={`warning-delegations-${testId}`}>
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {warning}
          </div>
        )}
        {rows.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead control={sort} column="name">{nameColumn}</SortableTableHead>
                  <SortableTableHead control={sort} column="level">{t("delegations.level")}</SortableTableHead>
                  <SortableTableHead control={sort} column="notes">{t("introductions.notes")}</SortableTableHead>
                  {editor && <TableHead className="w-[100px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.items.map(d => {
                  const p = party(d);
                  return (
                    <TableRow key={d.id} data-testid={`row-delegation-${testId}-${d.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.isEntity && <Badge variant="outline">{t("introductions.entity")}</Badge>}
                          <Link href={p.href} className="font-medium hover:underline">{p.label}</Link>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={d.level === "manager" ? "default" : "secondary"}>{t(`delegations.levels.${d.level}`)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate" title={d.notes ?? ""}>{d.notes || "—"}</TableCell>
                      {editor && (
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" onClick={() => editor.openEdit(d, p.label)} data-testid={`button-edit-delegation-${d.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => editor.remove(d.id)} disabled={editor.removing} data-testid={`button-remove-delegation-${d.id}`}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <ListPagination control={pages.control} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}
