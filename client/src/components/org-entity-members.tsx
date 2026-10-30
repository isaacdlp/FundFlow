import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { EntityInfo, EntityMemberInfo } from "@shared/types";
import { useLocalePath } from "@/i18n/hooks";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSort } from "@/hooks/use-sort";
import { usePagination } from "@/hooks/use-pagination";
import { SortableTableHead } from "@/components/sortable-table-head";
import { ListPagination } from "@/components/list-pagination";
import { SearchPicker } from "@/components/search-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const feeOf = (v: string | null) => (v === null ? null : parseFloat(v));
const formatFee = (v: string | null) => (v === null ? "—" : `${parseFloat(v)}%`);

/** Edits an entity's terms in the organization, or adds the entity when `member` has no id yet. */
function EntityMemberDialog({ orgId, target, onClose }: {
  orgId: string; target: { entityId: number; name: string; member: EntityMemberInfo | null } | null; onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [active, setActive] = useState(true);
  const [memberSince, setMemberSince] = useState("");
  const [managementFee, setManagementFee] = useState("");
  const [successFee, setSuccessFee] = useState("");

  useEffect(() => {
    if (!target) return;
    const m = target.member;
    setActive(m?.active ?? true);
    setMemberSince(m?.memberSince ?? "");
    setManagementFee(m?.managementFeePercent == null ? "" : String(parseFloat(m.managementFeePercent)));
    setSuccessFee(m?.successFeePercent == null ? "" : String(parseFloat(m.successFeePercent)));
  }, [target]);

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/organizations/${orgId}/entity-members/${target!.entityId}`, {
        active,
        memberSince: memberSince || null,
        managementFeePercent: managementFee.trim() === "" ? null : managementFee.trim(),
        successFeePercent: successFee.trim() === "" ? null : successFee.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId, "entity-members"] });
      toast({ title: t("organizationDetail.memberFeesSaved") });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: t("organizationDetail.memberUpdateFailed"), description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={target !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("organizationDetail.entityMember")}</DialogTitle>
          <DialogDescription>{target?.name}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Checkbox id="entity-member-active" checked={active} onCheckedChange={v => setActive(v === true)} data-testid="checkbox-entity-member-active" />
          <Label htmlFor="entity-member-active" className="font-normal">{t("organizationDetail.activeHint")}</Label>
        </div>
        <div className="space-y-2">
          <Label htmlFor="entity-member-since">{t("organizationDetail.memberSince")}</Label>
          <Input id="entity-member-since" type="date" value={memberSince} onChange={e => setMemberSince(e.target.value)} data-testid="input-entity-member-since" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="entity-member-management-fee">{t("organizationDetail.managementFeePercent")}</Label>
            <Input id="entity-member-management-fee" type="number" step="0.01" min="0" max="100" value={managementFee}
              onChange={e => setManagementFee(e.target.value)} placeholder="—" data-testid="input-entity-member-management-fee" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="entity-member-success-fee">{t("organizationDetail.successFeePercent")}</Label>
            <Input id="entity-member-success-fee" type="number" step="0.01" min="0" max="100" value={successFee}
              onChange={e => setSuccessFee(e.target.value)} placeholder="—" data-testid="input-entity-member-success-fee" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("organizationDetail.entityMemberFeesHint")}</p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-entity-member">
            {save.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrgEntityMembers({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const lp = useLocalePath();
  const { data: members } = useQuery<EntityMemberInfo[]>({ queryKey: ["/api/organizations", orgId, "entity-members"] });
  const { data: entities } = useQuery<EntityInfo[]>({ queryKey: ["/api/entities"] });
  const [target, setTarget] = useState<{ entityId: number; name: string; member: EntityMemberInfo | null } | null>(null);

  const sort = useSort(members, {
    name: m => m.entity.name,
    active: m => m.active,
    memberSince: m => m.memberSince,
    managementFee: m => feeOf(m.managementFeePercent),
    successFee: m => feeOf(m.successFeePercent),
  });
  const pages = usePagination(sort.sorted, sort.sort);

  const remove = useMutation({
    mutationFn: async (entityId: number) => {
      await apiRequest("DELETE", `/api/organizations/${orgId}/entity-members/${entityId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId, "entity-members"] });
    },
    onError: (error: Error) => {
      toast({ title: t("organizationDetail.memberUpdateFailed"), description: error.message, variant: "destructive" });
    },
  });

  const available = (entities ?? []).filter(e => !members?.some(m => m.entityId === e.id));

  return (
    <Card data-testid="section-entity-members">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{t("organizationDetail.entityMembers")}</h2>
          <Badge variant="secondary">{members?.length ?? 0}</Badge>
        </div>
        <div className="w-64">
          <SearchPicker
            options={available.map(e => ({ value: String(e.id), label: e.name, detail: e.entityType }))}
            onSelect={v => {
              const entity = available.find(e => String(e.id) === v);
              if (entity) setTarget({ entityId: entity.id, name: entity.name, member: null });
            }}
            placeholder={t("organizationDetail.addEntityMember")}
            searchPlaceholder={t("introductions.searchIntroduced")}
            className="w-full"
            data-testid="select-add-entity-member"
          />
        </div>
      </CardHeader>
      <CardContent>
        {members && members.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead control={sort} column="name">{t("common.name")}</SortableTableHead>
                  <SortableTableHead control={sort} column="active">{t("organizationDetail.active")}</SortableTableHead>
                  <SortableTableHead control={sort} column="memberSince">{t("organizationDetail.memberSince")}</SortableTableHead>
                  <SortableTableHead control={sort} column="managementFee" className="text-right">{t("organizationDetail.managementFee")}</SortableTableHead>
                  <SortableTableHead control={sort} column="successFee" className="text-right">{t("organizationDetail.successFee")}</SortableTableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.items.map(m => (
                  <TableRow key={m.id} data-testid={`entity-member-${m.entityId}`}>
                    <TableCell>
                      <Link href={lp("entityDetail", { id: m.entityId })} className="text-sm font-medium hover:underline">{m.entity.name}</Link>
                    </TableCell>
                    <TableCell className="text-sm">{m.active ? t("organizationDetail.activeYes") : t("organizationDetail.activeNo")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.memberSince ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{formatFee(m.managementFeePercent)}</TableCell>
                    <TableCell className="text-right text-sm">{formatFee(m.successFeePercent)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => setTarget({ entityId: m.entityId, name: m.entity.name, member: m })} data-testid={`button-edit-entity-member-${m.entityId}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove.mutate(m.entityId)} disabled={remove.isPending} data-testid={`button-remove-entity-member-${m.entityId}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPagination control={pages.control} className="border-t" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">{t("organizationDetail.noEntityMembers")}</p>
        )}
      </CardContent>
      <EntityMemberDialog orgId={orgId} target={target} onClose={() => setTarget(null)} />
    </Card>
  );
}
