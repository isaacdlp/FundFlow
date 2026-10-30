import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import type { AccountWithRoles, RelationshipInfo } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocalePath } from "@/i18n/hooks";
import { useToast } from "@/hooks/use-toast";
import { useSort } from "@/hooks/use-sort";
import { SortableTableHead } from "@/components/sortable-table-head";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchPicker, type SearchPickerOption } from "@/components/search-picker";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeftRight, Pencil, Trash2 } from "lucide-react";

type Person = { id: number; firstName: string; lastName: string };

/** A new relationship (its two sides, swappable) or an existing one (only its description). */
type DialogState =
  | { mode: "create"; from: Person; to: Person }
  | { mode: "edit"; id: number; from: Person | null; to: Person | null };

const personName = (a: { firstName: string; lastName: string } | null) =>
  a ? `${a.firstName} ${a.lastName}` : "—";

export function AccountRelationships({ account }: { account: Person }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const lp = useLocalePath();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [description, setDescription] = useState("");

  const { data: rows = [] } = useQuery<RelationshipInfo[]>({ queryKey: ["/api/accounts", String(account.id), "relationships"] });
  const { data: accountsList } = useQuery<AccountWithRoles[]>({ queryKey: ["/api/accounts"] });

  // A relationship shows on both accounts' pages.
  const invalidate = () => queryClient.invalidateQueries({ predicate: q => q.queryKey.includes("relationships") });
  const onError = (title: string) => (error: Error) =>
    toast({ title, description: error.message, variant: "destructive" });

  const saveMutation = useMutation({
    mutationFn: async (state: DialogState) => {
      if (state.mode === "create") {
        await apiRequest("POST", "/api/relationships", { fromAccountId: state.from.id, toAccountId: state.to.id, description });
      } else {
        await apiRequest("PATCH", `/api/relationships/${state.id}`, { description });
      }
    },
    onSuccess: () => {
      invalidate();
      setDialog(null);
      toast({ title: t("relationships.saved") });
    },
    onError: onError(t("relationships.saveFailed")),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/relationships/${id}`); },
    onSuccess: () => {
      invalidate();
      toast({ title: t("relationships.removed") });
    },
    onError: onError(t("relationships.removeFailed")),
  });

  /** The account on the other side from this page's account. */
  const otherOf = (r: RelationshipInfo) => (r.fromAccountId === account.id ? r.toAccount : r.fromAccount);
  const statement = (r: RelationshipInfo) =>
    t("relationships.statement", { from: personName(r.fromAccount), description: r.description, to: personName(r.toAccount) });

  const sort = useSort(rows, {
    name: r => personName(otherOf(r)),
    relationship: r => statement(r),
  });
  const pages = usePagination(sort.sorted, sort.sort);

  // An account may already be linked in one direction and still get the reverse one (wife / husband).
  const options: SearchPickerOption[] = (accountsList ?? [])
    .filter(a => a.id !== account.id)
    .map(a => ({ value: String(a.id), label: personName(a), detail: a.email ?? undefined }));

  const onPick = (value: string) => {
    const other = accountsList?.find(a => a.id === parseInt(value));
    if (!other) return;
    setDescription("");
    // Read as "<other> is the ___ of <this account>" — swappable in the dialog.
    setDialog({ mode: "create", from: other, to: account });
  };

  const openEdit = (r: RelationshipInfo) => {
    setDescription(r.description);
    setDialog({ mode: "edit", id: r.id, from: r.fromAccount, to: r.toAccount });
  };

  const preview = dialog && t("relationships.statement", {
    from: personName(dialog.from),
    description: description.trim() || "…",
    to: personName(dialog.to),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">{t("relationships.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("relationships.hint")}</p>
        </div>
        <SearchPicker
          options={options}
          onSelect={onPick}
          placeholder={t("relationships.add")}
          searchPlaceholder={t("introductions.searchPeople")}
          data-testid="select-add-relationship"
        />
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead control={sort} column="name">{t("introductions.account")}</SortableTableHead>
                  <SortableTableHead control={sort} column="relationship">{t("relationships.relationship")}</SortableTableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.items.map(r => {
                  const other = otherOf(r);
                  return (
                    <TableRow key={r.id} data-testid={`row-relationship-${r.id}`}>
                      <TableCell>
                        {other ? (
                          <Link href={lp("accountDetail", { id: other.id })} className="font-medium hover:underline">{personName(other)}</Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{statement(r)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(r)} data-testid={`button-edit-relationship-${r.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeMutation.mutate(r.id)}
                            disabled={removeMutation.isPending}
                            data-testid={`button-remove-relationship-${r.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <ListPagination control={pages.control} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("relationships.none")}</p>
        )}
      </CardContent>

      <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? t("relationships.editTitle") : t("relationships.addTitle")}</DialogTitle>
            <DialogDescription data-testid="text-relationship-preview">{preview}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="relationship-description">{t("relationships.relationship")}</Label>
              <Input
                id="relationship-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t("relationships.placeholder")}
                maxLength={100}
                data-testid="input-relationship-description"
              />
            </div>
            {dialog?.mode === "create" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setDialog({ ...dialog, from: dialog.to, to: dialog.from })}
                data-testid="button-swap-relationship"
              >
                <ArrowLeftRight className="h-4 w-4" />
                {t("relationships.swap")}
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => dialog && saveMutation.mutate(dialog)}
              disabled={saveMutation.isPending || !description.trim()}
              data-testid="button-save-relationship"
            >
              {saveMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
