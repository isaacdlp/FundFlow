import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useLocalePath, useLocale } from "@/i18n/hooks";
import { ROUTE_PATTERNS } from "@/i18n/routes";
import type { SpvInfo, SpvMemberInfo, MemberInfo, OrganizerAccount, EntityInfo, SpvAssetInfo, SpvAssetValuationInfo } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Pencil, Save, X, UserPlus, Trash2, FileText, Users, Plus, TrendingUp, Wallet, Briefcase, Star } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useOrgPermissions } from "@/hooks/use-org-permissions";

const ENTITY_TYPES = ["LLC", "LP", "Corporation", "Trust", "Other"];
const ALLOCATION_METHODS = ["By Commitment", "By Capital Invested", "Custom"] as const;
const INSTRUMENT_TYPES = ["Equity", "Convertible Note", "SAFE", "Preferred Stock", "Common Stock", "Warrant", "Debt", "Other"] as const;

function capitalOf(m: { committed: string | null; managementFee: string | null; otherFee: string | null }): number {
  return Math.max(0, parseFloat(m.committed || "0") - parseFloat(m.managementFee || "0") - parseFloat(m.otherFee || "0"));
}

function computeOwnershipPercents(
  members: SpvMemberInfo[],
  method: string | null | undefined,
): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  if (method === "Custom") {
    for (const m of members) {
      const p = m.ownershipPercent != null ? parseFloat(m.ownershipPercent) : null;
      out[m.id] = p != null && isFinite(p) ? p : null;
    }
    return out;
  }
  if (method === "By Capital Invested") {
    const nets = members.map(capitalOf);
    const total = nets.reduce((a, b) => a + b, 0);
    members.forEach((m, i) => { out[m.id] = total > 0 ? (nets[i] / total) * 100 : null; });
    return out;
  }
  // Default: By Commitment
  const committeds = members.map(m => Math.max(0, parseFloat(m.committed || "0")));
  const total = committeds.reduce((a, b) => a + b, 0);
  members.forEach((m, i) => { out[m.id] = total > 0 ? (committeds[i] / total) * 100 : null; });
  return out;
}
const CURRENCIES = ["USD ($)", "EUR (\u20ac)", "GBP (\u00a3)", "CHF", "JPY (\u00a5)", "CAD ($)", "AUD ($)"];

function formatCurrency(value: string | null): string {
  const num = parseFloat(value || "0");
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SpvMembersTab({ spvId, orgId, canEdit, allocationMethod }: { spvId: string; orgId: number; canEdit: boolean; allocationMethod: string }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const lp = useLocalePath();
  const [investorType, setInvestorType] = useState<"account" | "entity">("account");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newCommitted, setNewCommitted] = useState("");
  const [newManagementFee, setNewManagementFee] = useState("");
  const [newOtherFee, setNewOtherFee] = useState("");
  const [newCarry, setNewCarry] = useState("");
  const [newTotalCalled, setNewTotalCalled] = useState("");
  const [newDistributed, setNewDistributed] = useState("");
  const [newOwnershipPercent, setNewOwnershipPercent] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ date: string; committed: string; managementFee: string; otherFee: string; carry: string; totalCalled: string; distributed: string; ownershipPercent: string }>({ date: "", committed: "", managementFee: "", otherFee: "", carry: "", totalCalled: "", distributed: "", ownershipPercent: "" });
  const showOwnership = allocationMethod === "Custom";

  const { data: spvMembers, isLoading: membersLoading } = useQuery<SpvMemberInfo[]>({
    queryKey: ["/api/spvs", spvId, "members"],
  });

  const { data: orgMembers } = useQuery<MemberInfo[]>({
    queryKey: ["/api/organizations", String(orgId), "members"],
  });

  const { data: entitiesList } = useQuery<EntityInfo[]>({
    queryKey: ["/api/entities"],
  });

  const approvedOrgMembers = orgMembers?.filter(m => m.status === "approved") || [];
  // Investors can hold multiple positions ("tranches") in the same SPV — do not filter out existing members.
  const availableAccounts = approvedOrgMembers;
  const availableEntities = entitiesList || [];

  const addMutation = useMutation({
    mutationFn: async (payload: { accountId?: number; entityId?: number; date: string | null; committed: string; managementFee: string; otherFee: string; carry: string; totalCalled: string; distributed: string; ownershipPercent: string | null }) => {
      const res = await apiRequest("POST", `/api/spvs/${spvId}/members`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      setSelectedAccountId(""); setSelectedEntityId("");
      setNewDate(""); setNewCommitted(""); setNewManagementFee(""); setNewOtherFee(""); setNewCarry(""); setNewTotalCalled(""); setNewDistributed(""); setNewOwnershipPercent("");
      toast({ title: t("spvDetail.investmentAdded") });
    },
    onError: (error: Error) => {
      toast({ title: t("spvDetail.investmentAddFailed"), description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { memberId: number; date: string | null; committed: string; managementFee: string; otherFee: string; carry: string; totalCalled: string; distributed: string; ownershipPercent: string | null }) => {
      const { memberId, ...rest } = payload;
      const res = await apiRequest("PATCH", `/api/spvs/${spvId}/members/${memberId}`, rest);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "members"] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      setEditingMemberId(null);
      toast({ title: t("spvDetail.investmentUpdated") });
    },
    onError: (error: Error) => {
      toast({ title: t("spvDetail.investmentUpdateFailed"), description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: number) => {
      const res = await apiRequest("DELETE", `/api/spvs/${spvId}/members/${memberId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      toast({ title: t("spvDetail.investmentRemoved") });
    },
    onError: (error: Error) => {
      toast({ title: t("spvDetail.investmentRemoveFailed"), description: error.message, variant: "destructive" });
    },
  });

  const startEdit = (m: SpvMemberInfo) => {
    setEditingMemberId(m.id);
    setEditValues({
      date: m.date || "",
      committed: m.committed || "0",
      managementFee: m.managementFee || "0",
      otherFee: m.otherFee || "0",
      carry: m.carry || "0",
      totalCalled: m.totalCalled || "0",
      distributed: m.distributed || "0",
      ownershipPercent: m.ownershipPercent != null ? String(parseFloat(m.ownershipPercent)) : "",
    });
  };

  const canSubmit = (investorType === "account" ? !!selectedAccountId : !!selectedEntityId) && !!newDate;

  const ownershipPercentsMap = computeOwnershipPercents(spvMembers || [], allocationMethod);

  if (membersLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
        <div>
          <h2 className="text-lg font-semibold">{t("spvDetail.spvInvestmentsTitle")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("spvDetail.spvInvestmentsSubtitle")}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {canEdit && (
        <div className="space-y-3 p-4 rounded-md border bg-muted/30">
          <div className="space-y-2">
            <Label>{t("spvDetail.investorType")}</Label>
            <Select value={investorType} onValueChange={v => { setInvestorType(v as "account" | "entity"); setSelectedAccountId(""); setSelectedEntityId(""); }}>
              <SelectTrigger data-testid="select-investor-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="account">{t("spvDetail.investorTypeAccount")}</SelectItem>
                <SelectItem value="entity">{t("spvDetail.investorTypeEntity")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("spvDetail.investor")}</Label>
            {investorType === "account" ? (
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger data-testid="select-spv-account">
                  <SelectValue placeholder={t("spvDetail.selectApprovedMember")} />
                </SelectTrigger>
                <SelectContent>
                  {availableAccounts.length > 0 ? (
                    availableAccounts.map(m => (
                      <SelectItem key={m.accountId} value={String(m.accountId)}>
                        {m.account.firstName} {m.account.lastName} ({m.account.email})
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>{t("spvDetail.noAvailableAccounts")}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            ) : (
              <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
                <SelectTrigger data-testid="select-spv-entity">
                  <SelectValue placeholder={t("spvDetail.selectEntityPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {availableEntities.length > 0 ? (
                    availableEntities.map(e => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.name} ({e.entityType})
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>{t("spvDetail.noAvailableEntities")}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("common.date")} *</Label>
              <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} data-testid="input-new-date" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("spvDetail.committed")}</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newCommitted} onChange={e => setNewCommitted(e.target.value)} data-testid="input-new-committed" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("spvDetail.managementFee")}</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newManagementFee} onChange={e => setNewManagementFee(e.target.value)} data-testid="input-new-management-fee" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("spvDetail.otherFee")}</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newOtherFee} onChange={e => setNewOtherFee(e.target.value)} data-testid="input-new-other-fee" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("spvDetail.carrySuccessFee")}</Label>
              <Input type="number" step="0.01" min="0" max="100" placeholder="0.00" value={newCarry} onChange={e => setNewCarry(e.target.value)} data-testid="input-new-carry" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("spvDetail.totalCalled")}</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newTotalCalled} onChange={e => setNewTotalCalled(e.target.value)} data-testid="input-new-total-called" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("spvDetail.distributed")}</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newDistributed} onChange={e => setNewDistributed(e.target.value)} data-testid="input-new-distributed" />
            </div>
            {showOwnership && (
              <div className="space-y-1">
                <Label className="text-xs">{t("spvDetail.ownershipPercent")}</Label>
                <Input type="number" step="0.0001" min="0" max="100" placeholder="0.00" value={newOwnershipPercent} onChange={e => setNewOwnershipPercent(e.target.value)} data-testid="input-new-ownership-percent" />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("spvDetail.capitalHelper")}
          </p>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                if (!canSubmit) return;
                const base = {
                  date: newDate || null,
                  committed: newCommitted || "0",
                  managementFee: newManagementFee || "0",
                  otherFee: newOtherFee || "0",
                  carry: newCarry || "0",
                  totalCalled: newTotalCalled || "0",
                  distributed: newDistributed || "0",
                  ownershipPercent: showOwnership && newOwnershipPercent !== "" ? newOwnershipPercent : null,
                };
                if (investorType === "account") {
                  addMutation.mutate({ accountId: parseInt(selectedAccountId), ...base });
                } else {
                  addMutation.mutate({ entityId: parseInt(selectedEntityId), ...base });
                }
              }}
              disabled={!canSubmit || addMutation.isPending}
              data-testid="button-add-spv-member"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {addMutation.isPending ? t("spvDetail.adding") : t("spvDetail.addInvestment")}
            </Button>
          </div>
        </div>
        )}

        {canEdit && <Separator />}

        {spvMembers && spvMembers.length > 0 ? (
          <div className="space-y-3">
            {spvMembers.map(member => {
              const isEditing = editingMemberId === member.id;
              const committed = parseFloat(member.committed || "0");
              const mgmtFee = parseFloat(member.managementFee || "0");
              const otherFee = parseFloat(member.otherFee || "0");
              const capital = Math.max(0, committed - mgmtFee - otherFee);
              const totalCalled = parseFloat(member.totalCalled || "0");
              const commitmentRemaining = capital - totalCalled;
              const current = parseFloat(member.currentValue || "0");
              const dist = parseFloat(member.distributed || "0");
              const roi = totalCalled > 0 ? ((current + dist - totalCalled) / totalCalled) * 100 : 0;
              const ownership = ownershipPercentsMap[member.id];
              const isAccount = member.investorType === "account" && member.account;
              const isEntity = member.investorType === "entity" && member.entity;
              const initials = isAccount
                ? `${member.account!.firstName[0] || ""}${member.account!.lastName[0] || ""}`
                : isEntity
                ? member.entity!.name.slice(0, 2).toUpperCase()
                : "??";
              const displayName = isAccount
                ? `${member.account!.firstName} ${member.account!.lastName}`
                : isEntity
                ? member.entity!.name
                : t("common.unknown");
              const subText = isAccount
                ? member.account!.email
                : isEntity
                ? member.entity!.entityType
                : "";
              const profileHref = isAccount
                ? lp("accountDetail", { id: member.account!.id })
                : isEntity
                ? lp("entityDetail", { id: member.entity!.id })
                : null;
              return (
                <div key={member.id} className="p-3 rounded-md border" data-testid={`spv-member-${member.id}`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full ${isEntity ? "bg-blue-500/10 text-blue-600" : "bg-primary/10 text-primary"} flex items-center justify-center text-sm font-semibold flex-shrink-0`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      {profileHref ? (
                        <Link href={profileHref}>
                          <a className="text-sm font-medium truncate hover:underline" data-testid={`link-investor-${member.id}`}>{displayName}</a>
                        </Link>
                      ) : (
                        <p className="text-sm font-medium truncate">{displayName}</p>
                      )}
                      <p className="text-xs text-muted-foreground truncate">
                        {isEntity && <Badge variant="secondary" className="mr-2 text-[10px]">{t("spvDetail.entityBadge")}</Badge>}
                        {subText}
                      </p>
                    </div>
                    {canEdit && !isEditing && (
                      <Button variant="ghost" size="icon" onClick={() => startEdit(member)} data-testid={`button-edit-spv-member-${member.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMutation.mutate(member.id)}
                        disabled={removeMutation.isPending}
                        data-testid={`button-remove-spv-member-${member.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  {isEditing && canEdit ? (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">{t("common.date")}</Label>
                          <Input type="date" value={editValues.date} onChange={e => setEditValues(v => ({ ...v, date: e.target.value }))} data-testid={`input-edit-date-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("spvDetail.committed")}</Label>
                          <Input type="number" step="0.01" value={editValues.committed} onChange={e => setEditValues(v => ({ ...v, committed: e.target.value }))} data-testid={`input-edit-committed-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("spvDetail.managementFee")}</Label>
                          <Input type="number" step="0.01" value={editValues.managementFee} onChange={e => setEditValues(v => ({ ...v, managementFee: e.target.value }))} data-testid={`input-edit-management-fee-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("spvDetail.otherFee")}</Label>
                          <Input type="number" step="0.01" value={editValues.otherFee} onChange={e => setEditValues(v => ({ ...v, otherFee: e.target.value }))} data-testid={`input-edit-other-fee-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("spvDetail.carryPercentSuccessFee")}</Label>
                          <Input type="number" step="0.01" min="0" max="100" value={editValues.carry} onChange={e => setEditValues(v => ({ ...v, carry: e.target.value }))} data-testid={`input-edit-carry-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("spvDetail.totalCalled")}</Label>
                          <Input type="number" step="0.01" value={editValues.totalCalled} onChange={e => setEditValues(v => ({ ...v, totalCalled: e.target.value }))} data-testid={`input-edit-total-called-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("spvDetail.distributed")}</Label>
                          <Input type="number" step="0.01" value={editValues.distributed} onChange={e => setEditValues(v => ({ ...v, distributed: e.target.value }))} data-testid={`input-edit-distributed-${member.id}`} />
                        </div>
                        {showOwnership && (
                          <div className="space-y-1">
                            <Label className="text-xs">{t("spvDetail.ownershipPercent")}</Label>
                            <Input type="number" step="0.0001" min="0" max="100" value={editValues.ownershipPercent} onChange={e => setEditValues(v => ({ ...v, ownershipPercent: e.target.value }))} data-testid={`input-edit-ownership-${member.id}`} />
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingMemberId(null)} data-testid={`button-cancel-edit-${member.id}`}>
                          <X className="h-4 w-4 mr-1" /> {t("common.cancel")}
                        </Button>
                        <Button size="sm" onClick={() => updateMutation.mutate({
                          memberId: member.id,
                          date: editValues.date || null,
                          committed: editValues.committed,
                          managementFee: editValues.managementFee,
                          otherFee: editValues.otherFee,
                          carry: editValues.carry,
                          totalCalled: editValues.totalCalled,
                          distributed: editValues.distributed,
                          ownershipPercent: showOwnership ? (editValues.ownershipPercent === "" ? null : editValues.ownershipPercent) : null,
                        })} disabled={updateMutation.isPending} data-testid={`button-save-edit-${member.id}`}>
                          <Save className="h-4 w-4 mr-1" /> {updateMutation.isPending ? t("common.saving") : t("common.save")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">{t("common.date")}</p>
                        <p className="font-medium" data-testid={`text-date-${member.id}`}>{member.date || "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("spvDetail.committed")}</p>
                        <p className="font-medium" data-testid={`text-committed-${member.id}`}>${formatCurrency(member.committed)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("spvDetail.managementFee")}</p>
                        <p className="font-medium" data-testid={`text-management-fee-${member.id}`}>${formatCurrency(member.managementFee)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("spvDetail.otherFee")}</p>
                        <p className="font-medium" data-testid={`text-other-fee-${member.id}`}>${formatCurrency(member.otherFee)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("spvDetail.carryPercent")}</p>
                        <p className="font-medium" data-testid={`text-carry-${member.id}`}>{parseFloat(member.carry || "0").toFixed(2)}%</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("spvDetail.capital")}</p>
                        <p className="font-medium" data-testid={`text-capital-${member.id}`}>${capital.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("spvDetail.totalCalled")}</p>
                        <p className="font-medium" data-testid={`text-total-called-${member.id}`}>${formatCurrency(member.totalCalled)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("spvDetail.commitmentRemaining")}</p>
                        <p className="font-medium" data-testid={`text-commitment-remaining-${member.id}`}>${commitmentRemaining.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("spvDetail.distributed")}</p>
                        <p className="font-medium" data-testid={`text-distributed-${member.id}`}>${formatCurrency(member.distributed)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("spvDetail.currentValue")}</p>
                        <p className="font-medium" data-testid={`text-current-${member.id}`}>${formatCurrency(member.currentValue)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("spvDetail.ownership")}</p>
                        <p className="font-medium" data-testid={`text-ownership-${member.id}`}>
                          {ownership != null ? `${ownership.toFixed(2)}%` : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("spvDetail.roi")}</p>
                        <p className={`font-medium ${roi >= 0 ? "text-emerald-600" : "text-red-600"}`}>{roi.toFixed(2)}%</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              {t("spvDetail.noInvestmentsYet")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SpvAssetsTab({ spvId, canEdit, spvCash }: { spvId: string; canEdit: boolean; spvCash: string }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const instrumentLabel = (it: string) => {
    const map: Record<string, string> = {
      "Equity": t("spvDetail.instrumentEquity"),
      "Convertible Note": t("spvDetail.instrumentConvertibleNote"),
      "SAFE": t("spvDetail.instrumentSafe"),
      "Preferred Stock": t("spvDetail.instrumentPreferredStock"),
      "Common Stock": t("spvDetail.instrumentCommonStock"),
      "Warrant": t("spvDetail.instrumentWarrant"),
      "Debt": t("spvDetail.instrumentDebt"),
      "Other": t("spvDetail.instrumentOther"),
    };
    return map[it] || it;
  };
  const [companyName, setCompanyName] = useState("");
  const [instrumentType, setInstrumentType] = useState("Equity");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [expandedAssetId, setExpandedAssetId] = useState<number | null>(null);
  const [valDate, setValDate] = useState("");
  const [valValue, setValValue] = useState("");
  const [valNote, setValNote] = useState("");

  const { data: assets, isLoading } = useQuery<SpvAssetInfo[]>({
    queryKey: ["/api/spvs", spvId, "assets"],
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", `/api/spvs/${spvId}/assets`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "members"] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      setCompanyName(""); setInstrumentType("Equity"); setPurchaseDate(""); setCost(""); setNotes(""); setIsDefault(false);
      toast({ title: t("spvDetail.assetAdded") });
    },
    onError: (e: Error) => toast({ title: t("spvDetail.assetAddFailed"), description: e.message, variant: "destructive" }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (assetId: number) => {
      const res = await apiRequest("PATCH", `/api/spvs/${spvId}/assets/${assetId}`, { isDefault: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "assets"] });
      toast({ title: t("spvDetail.defaultAssetUpdated") });
    },
    onError: (e: Error) => toast({ title: t("spvDetail.setDefaultFailed"), description: e.message, variant: "destructive" }),
  });

  const deleteAssetMutation = useMutation({
    mutationFn: async (assetId: number) => {
      const res = await apiRequest("DELETE", `/api/spvs/${spvId}/assets/${assetId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "members"] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      toast({ title: t("spvDetail.assetRemoved") });
    },
    onError: (e: Error) => toast({ title: t("spvDetail.assetRemoveFailed"), description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">{t("spvDetail.financialInstruments")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("spvDetail.financialInstrumentsHelp")}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {canEdit && (
          <div className="space-y-3 p-4 rounded-md border bg-muted/30">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("spvDetail.companyIssuerName")}</Label>
                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder={t("spvDetail.companyIssuerPlaceholder")} data-testid="input-asset-company" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("spvDetail.instrumentType")}</Label>
                <Select value={instrumentType} onValueChange={setInstrumentType}>
                  <SelectTrigger data-testid="select-asset-instrument"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INSTRUMENT_TYPES.map(it => (
                      <SelectItem key={it} value={it}>{instrumentLabel(it)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("spvDetail.purchaseDate")}</Label>
                <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} data-testid="input-asset-date" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("spvDetail.costUsd")}</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={cost} onChange={e => setCost(e.target.value)} data-testid="input-asset-cost" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("common.notes")}</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("spvDetail.notesPlaceholder")} data-testid="input-asset-notes" />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="asset-is-default"
                type="checkbox"
                checked={isDefault}
                onChange={e => setIsDefault(e.target.checked)}
                data-testid="checkbox-asset-default"
              />
              <Label htmlFor="asset-is-default" className="text-xs cursor-pointer">
                {t("spvDetail.setAsDefaultLabel")}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">{t("spvDetail.spvCashAvailable", { cash: formatCurrency(spvCash) })}</p>
            <div className="flex justify-end">
              <Button
                onClick={() => createMutation.mutate({
                  companyName: companyName.trim(),
                  instrumentType,
                  purchaseDate: purchaseDate || null,
                  cost: cost || "0",
                  notes,
                  isDefault,
                })}
                disabled={!companyName.trim() || createMutation.isPending}
                data-testid="button-add-asset"
              >
                <Plus className="h-4 w-4 mr-2" />
                {createMutation.isPending ? t("spvDetail.adding") : t("spvDetail.addAsset")}
              </Button>
            </div>
          </div>
        )}

        {canEdit && <Separator />}

        {assets && assets.length > 0 ? (
          <div className="space-y-3">
            {assets.map(a => {
              const isOpen = expandedAssetId === a.id;
              const cv = parseFloat(a.currentValue || "0");
              const c = parseFloat(a.cost || "0");
              const change = c > 0 ? ((cv - c) / c) * 100 : 0;
              return (
                <div
                  key={a.id}
                  className={`p-3 rounded-md border ${a.isDefault ? "border-amber-400 ring-2 ring-amber-300/60 bg-amber-50/40 dark:bg-amber-500/5" : ""}`}
                  data-testid={`asset-${a.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-md flex items-center justify-center flex-shrink-0 ${a.isDefault ? "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400" : "bg-primary/10 text-primary"}`}>
                      {a.isDefault ? <Star className="h-5 w-5 fill-current" /> : <Briefcase className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate flex items-center gap-2" data-testid={`text-asset-name-${a.id}`}>
                        {a.companyName}
                        {a.isDefault && (
                          <Badge
                            className="text-[10px] gap-1 bg-amber-500 hover:bg-amber-500 text-white border-transparent"
                            data-testid={`badge-default-${a.id}`}
                          >
                            <Star className="h-3 w-3 fill-current" /> {t("spvDetail.defaultBadge")}
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <Badge variant="secondary" className="mr-2 text-[10px]">{instrumentLabel(a.instrumentType)}</Badge>
                        {a.purchaseDate && <>{t("spvDetail.purchasedOn", { date: a.purchaseDate })} </>}
                        {t("spvDetail.costLabel", { cost: formatCurrency(a.cost) })} · {t("spvDetail.currentLabel", { value: formatCurrency(a.currentValue) })}
                        {c > 0 && (
                          <span className={change >= 0 ? "ml-2 text-emerald-600" : "ml-2 text-red-600"}>
                            {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                          </span>
                        )}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setExpandedAssetId(isOpen ? null : a.id); setValDate(""); setValValue(""); setValNote(""); }} data-testid={`button-toggle-valuations-${a.id}`}>
                      <TrendingUp className="h-4 w-4 mr-1" />
                      {isOpen ? t("spvDetail.hide") : t("spvDetail.valuations")}
                    </Button>
                    {canEdit && !a.isDefault && (
                      <Button variant="ghost" size="sm" onClick={() => setDefaultMutation.mutate(a.id)} disabled={setDefaultMutation.isPending} data-testid={`button-set-default-${a.id}`}>
                        {t("spvDetail.setDefaultBtn")}
                      </Button>
                    )}
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={() => deleteAssetMutation.mutate(a.id)} disabled={deleteAssetMutation.isPending} data-testid={`button-delete-asset-${a.id}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  {isOpen && <AssetValuations spvId={spvId} assetId={a.id} canEdit={canEdit} valDate={valDate} setValDate={setValDate} valValue={valValue} setValValue={setValValue} valNote={valNote} setValNote={setValNote} />}
                  {a.notes && <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">{a.notes}</p>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">{t("spvDetail.noAssets")} {canEdit && t("spvDetail.noAssetsAddFirst")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AssetValuations({ spvId, assetId, canEdit, valDate, setValDate, valValue, setValValue, valNote, setValNote }: {
  spvId: string; assetId: number; canEdit: boolean;
  valDate: string; setValDate: (s: string) => void;
  valValue: string; setValValue: (s: string) => void;
  valNote: string; setValNote: (s: string) => void;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { data: vals, isLoading } = useQuery<SpvAssetValuationInfo[]>({
    queryKey: ["/api/spvs", spvId, "assets", assetId, "valuations"],
  });

  const addMutation = useMutation({
    mutationFn: async (payload: { date: string; value: string; note?: string }) => {
      const res = await apiRequest("POST", `/api/spvs/${spvId}/assets/${assetId}/valuations`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "assets", assetId, "valuations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "members"] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      setValDate(""); setValValue(""); setValNote("");
      toast({ title: t("spvDetail.valuationAdded") });
    },
    onError: (e: Error) => toast({ title: t("spvDetail.valuationAddFailed"), description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (valuationId: number) => {
      const res = await apiRequest("DELETE", `/api/spvs/${spvId}/assets/${assetId}/valuations/${valuationId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "assets", assetId, "valuations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "members"] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
    },
  });

  return (
    <div className="mt-3 ml-13 pl-0 space-y-2">
      {canEdit && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">{t("common.date")}</Label>
            <Input type="date" value={valDate} onChange={e => setValDate(e.target.value)} data-testid={`input-valuation-date-${assetId}`} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("spvDetail.valueUsd")}</Label>
            <Input type="number" step="0.01" placeholder="0.00" value={valValue} onChange={e => setValValue(e.target.value)} data-testid={`input-valuation-value-${assetId}`} />
          </div>
          <div className="space-y-1 md:col-span-1">
            <Label className="text-xs">{t("spvDetail.note")}</Label>
            <Input value={valNote} onChange={e => setValNote(e.target.value)} placeholder={t("spvDetail.optional")} data-testid={`input-valuation-note-${assetId}`} />
          </div>
          <Button
            size="sm"
            onClick={() => addMutation.mutate({ date: valDate, value: valValue, note: valNote })}
            disabled={!valDate || !valValue || addMutation.isPending}
            data-testid={`button-add-valuation-${assetId}`}
          >
            <Plus className="h-4 w-4 mr-1" /> {addMutation.isPending ? t("spvDetail.adding") : t("common.add")}
          </Button>
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : vals && vals.length > 0 ? (
        <div className="text-xs space-y-1">
          {vals.map(v => (
            <div key={v.id} className="flex items-center gap-3 py-1 border-t" data-testid={`valuation-${v.id}`}>
              <span className="font-mono w-24">{v.date}</span>
              <span className="font-medium">${formatCurrency(v.value)}</span>
              {v.note && <span className="text-muted-foreground truncate flex-1">{v.note}</span>}
              {canEdit && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeMutation.mutate(v.id)} data-testid={`button-remove-valuation-${v.id}`}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("spvDetail.noValuations")}</p>
      )}
    </div>
  );
}

export default function SpvDetail() {
  const locale = useLocale();
  const lp = useLocalePath();
  const { t } = useTranslation();
  const [, params] = useRoute(ROUTE_PATTERNS.spvDetail[locale]);
  const spvId = params?.id;
  const { toast } = useToast();
  const { canManageOrg } = useOrgPermissions();
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("configuration");

  const { data: spv, isLoading } = useQuery<SpvInfo>({
    queryKey: ["/api/spvs", spvId],
    enabled: !!spvId,
  });

  const orgId = spv?.organizationId;

  const { data: org } = useQuery<{ organizers: OrganizerAccount[] }>({
    queryKey: ["/api/organizations", String(orgId)],
    enabled: !!orgId,
  });

  const organizers = org?.organizers || [];

  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    if (spv) {
      setFormData({
        legalName: spv.legalName || "",
        displayName: spv.displayName || "",
        entityType: spv.entityType || "LLC",
        stateOfIncorporation: spv.stateOfIncorporation || "",
        ein: spv.ein || "",
        dateEstablished: spv.dateEstablished || "",
        dateEnded: spv.dateEnded || "",
        allocationMethod: spv.allocationMethod || "By Commitment",
        autoDeploy: !!spv.autoDeploy,
        currency: spv.currency || "USD ($)",
        managementFeePercent: spv.managementFeePercent || "0",
        carriedInterestPercent: spv.carriedInterestPercent || "0",
        preferredReturnPercent: spv.preferredReturnPercent || "0",
        country: spv.country || "",
        streetAddress: spv.streetAddress || "",
        streetAddress2: spv.streetAddress2 || "",
        city: spv.city || "",
        stateProvince: spv.stateProvince || "",
        zipPostalCode: spv.zipPostalCode || "",
        county: spv.county || "",
        managerId: spv.managerId ? String(spv.managerId) : "",
        signatoryId: spv.signatoryId ? String(spv.signatoryId) : "",
        bankName: spv.bankName || "",
        bankAddress: spv.bankAddress || "",
        bankRoutingNumber: spv.bankRoutingNumber || "",
        bankSwiftCode: spv.bankSwiftCode || "",
        bankAccountNumber: spv.bankAccountNumber || "",
        bankAccountName: spv.bankAccountName || "",
        forFurtherCreditTo: spv.forFurtherCreditTo || "",
        wiringInstructions: spv.wiringInstructions || "",
        investmentCompanyName: spv.investmentCompanyName || "",
        investmentType: spv.investmentType || "",
        totalBeingRaised: spv.totalBeingRaised || "0",
        minimumInvestment: spv.minimumInvestment || "0",
        expectedClosingDate: spv.expectedClosingDate || "",
      });
    }
  }, [spv]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/spvs/${spvId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId] });
      setEditing(false);
      toast({ title: t("spvDetail.spvUpdated") });
    },
    onError: (error: Error) => {
      toast({ title: t("spvDetail.spvUpdateFailed"), description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const payload: Record<string, unknown> = { ...formData };
    if (payload.managerId === "" || payload.managerId === "none") payload.managerId = null;
    else payload.managerId = parseInt(payload.managerId as string);
    if (payload.signatoryId === "" || payload.signatoryId === "none") payload.signatoryId = null;
    else payload.signatoryId = parseInt(payload.signatoryId as string);
    if (!payload.dateEstablished) payload.dateEstablished = null;
    if (!payload.dateEnded) payload.dateEnded = null;
    if (!payload.expectedClosingDate) payload.expectedClosingDate = null;
    updateMutation.mutate(payload);
  };

  const handleCancel = () => {
    if (spv) {
      setFormData({
        legalName: spv.legalName || "",
        displayName: spv.displayName || "",
        entityType: spv.entityType || "LLC",
        stateOfIncorporation: spv.stateOfIncorporation || "",
        ein: spv.ein || "",
        dateEstablished: spv.dateEstablished || "",
        dateEnded: spv.dateEnded || "",
        allocationMethod: spv.allocationMethod || "By Commitment",
        autoDeploy: !!spv.autoDeploy,
        currency: spv.currency || "USD ($)",
        managementFeePercent: spv.managementFeePercent || "0",
        carriedInterestPercent: spv.carriedInterestPercent || "0",
        preferredReturnPercent: spv.preferredReturnPercent || "0",
        country: spv.country || "",
        streetAddress: spv.streetAddress || "",
        streetAddress2: spv.streetAddress2 || "",
        city: spv.city || "",
        stateProvince: spv.stateProvince || "",
        zipPostalCode: spv.zipPostalCode || "",
        county: spv.county || "",
        managerId: spv.managerId ? String(spv.managerId) : "",
        signatoryId: spv.signatoryId ? String(spv.signatoryId) : "",
        bankName: spv.bankName || "",
        bankAddress: spv.bankAddress || "",
        bankRoutingNumber: spv.bankRoutingNumber || "",
        bankSwiftCode: spv.bankSwiftCode || "",
        bankAccountNumber: spv.bankAccountNumber || "",
        bankAccountName: spv.bankAccountName || "",
        forFurtherCreditTo: spv.forFurtherCreditTo || "",
        wiringInstructions: spv.wiringInstructions || "",
        investmentCompanyName: spv.investmentCompanyName || "",
        investmentType: spv.investmentType || "",
        totalBeingRaised: spv.totalBeingRaised || "0",
        minimumInvestment: spv.minimumInvestment || "0",
        expectedClosingDate: spv.expectedClosingDate || "",
      });
    }
    setEditing(false);
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!spv) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("spvDetail.notFound")}</p>
      </div>
    );
  }

  const allocationHelpKey = (m: string) => {
    if (m === "By Commitment") return t("createSpv.allocationHelpByCommitment");
    if (m === "By Capital Invested") return t("createSpv.allocationHelpByCapital");
    if (m === "Custom") return t("createSpv.allocationHelpCustom");
    return "";
  };
  const allocationLabel = (m: string) => {
    if (m === "By Commitment") return t("createSpv.allocationByCommitment");
    if (m === "By Capital Invested") return t("createSpv.allocationByCapital");
    if (m === "Custom") return t("createSpv.allocationCustom");
    return m;
  };

  return (
    <div className="p-6 space-y-6">
      <Link href={lp("organizationDetail", { id: spv.organizationId })}>
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          {t("spvDetail.backToOrg")}
        </Button>
      </Link>

      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
          <FileText className="h-8 w-8" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold" data-testid="text-spv-name">{spv.displayName}</h1>
          <p className="text-muted-foreground mt-0.5" data-testid="text-spv-legal-name">{spv.legalName}</p>
          <div className="flex gap-2 mt-1 flex-wrap">
            <Badge variant="secondary">{spv.entityType || "LLC"}</Badge>
            <Badge variant="outline">{t("spvDetail.memberCount", { count: spv.memberCount })}</Badge>
            {spv.manager && (
              <Badge variant="outline">{t("spvDetail.managerLabel", { name: `${spv.manager.firstName} ${spv.manager.lastName}` })}</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{t("spvDetail.cash")}</p>
              <p className="text-lg font-semibold" data-testid="text-spv-cash">${formatCurrency(spv.cash)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Briefcase className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{t("spvDetail.assetValue")}</p>
              <p className="text-lg font-semibold" data-testid="text-spv-asset-value">${formatCurrency(spv.assetValue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{t("spvDetail.currentValue")}</p>
              <p className="text-lg font-semibold" data-testid="text-spv-current-value">${formatCurrency(spv.currentValue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="configuration" data-testid="tab-configuration">{t("spvDetail.configuration")}</TabsTrigger>
          <TabsTrigger value="assets" data-testid="tab-spv-assets">{t("spvDetail.assets")}</TabsTrigger>
          <TabsTrigger value="members" data-testid="tab-spv-members">{t("spvDetail.members")}</TabsTrigger>
        </TabsList>

        <TabsContent value="configuration" className="mt-6 space-y-6">
          {canManageOrg(spv.organizationId) && (
            <div className="flex justify-end">
              {!editing ? (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="button-edit">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  {t("common.edit")}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCancel} data-testid="button-cancel">
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    {t("common.cancel")}
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save">
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    {updateMutation.isPending ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
              )}
            </div>
          )}

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createSpv.generalStructure")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("createSpv.legalName")}</Label>
                  <Input value={formData.legalName || ""} onChange={e => updateField("legalName", e.target.value)} disabled={!editing} data-testid="input-legal-name" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createSpv.displayName")}</Label>
                  <Input value={formData.displayName || ""} onChange={e => updateField("displayName", e.target.value)} disabled={!editing} data-testid="input-display-name" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("createSpv.entityType")}</Label>
                  <Select value={formData.entityType || "LLC"} onValueChange={v => updateField("entityType", v)} disabled={!editing}>
                    <SelectTrigger data-testid="select-entity-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTITY_TYPES.map(et => <SelectItem key={et} value={et}>{et}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("createSpv.stateOfIncorporation")}</Label>
                  <Input value={formData.stateOfIncorporation || ""} onChange={e => updateField("stateOfIncorporation", e.target.value)} disabled={!editing} data-testid="input-state-incorporation" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("createSpv.ein")}</Label>
                <Input value={formData.ein || ""} onChange={e => updateField("ein", e.target.value)} disabled={!editing} data-testid="input-ein" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("createSpv.dateEstablished")}</Label>
                  <Input type="date" value={formData.dateEstablished || ""} onChange={e => updateField("dateEstablished", e.target.value)} disabled={!editing} data-testid="input-date-established" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createSpv.dateEnded")}</Label>
                  <Input type="date" value={formData.dateEnded || ""} onChange={e => updateField("dateEnded", e.target.value)} disabled={!editing} data-testid="input-date-ended" />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>{t("createSpv.allocationMethod")}</Label>
                <Select value={formData.allocationMethod || "By Commitment"} onValueChange={v => updateField("allocationMethod", v)} disabled={!editing}>
                  <SelectTrigger data-testid="select-allocation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALLOCATION_METHODS.map(m => <SelectItem key={m} value={m}>{allocationLabel(m)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground" data-testid="text-allocation-help">
                  {allocationHelpKey(formData.allocationMethod || "By Commitment")}
                </p>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-md border bg-muted/30">
                <input
                  id="autoDeploy"
                  type="checkbox"
                  className="mt-1"
                  checked={!!formData.autoDeploy}
                  disabled={!editing}
                  onChange={e => updateField("autoDeploy", e.target.checked)}
                  data-testid="checkbox-auto-deploy"
                />
                <div className="space-y-1">
                  <Label htmlFor="autoDeploy" className="cursor-pointer">{t("spvDetail.autoDeploy")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("spvDetail.autoDeployHelp")}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("createSpv.currency")}</Label>
                <Select value={formData.currency || "USD ($)"} onValueChange={v => updateField("currency", v)} disabled={!editing}>
                  <SelectTrigger data-testid="select-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t("createSpv.managementFeePercent")}</Label>
                  <Input type="number" step="0.01" value={formData.managementFeePercent || "0"} onChange={e => updateField("managementFeePercent", e.target.value)} disabled={!editing} data-testid="input-mgmt-fee" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createSpv.carriedInterestPercent")}</Label>
                  <Input type="number" step="0.01" value={formData.carriedInterestPercent || "0"} onChange={e => updateField("carriedInterestPercent", e.target.value)} disabled={!editing} data-testid="input-carry" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createSpv.preferredReturnPercent")}</Label>
                  <Input type="number" step="0.01" value={formData.preferredReturnPercent || "0"} onChange={e => updateField("preferredReturnPercent", e.target.value)} disabled={!editing} data-testid="input-pref-return" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("spvDetail.address")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("common.country")}</Label>
                <Input value={formData.country || ""} onChange={e => updateField("country", e.target.value)} disabled={!editing} data-testid="input-country" />
              </div>
              <div className="space-y-2">
                <Label>{t("createSpv.street")}</Label>
                <Input value={formData.streetAddress || ""} onChange={e => updateField("streetAddress", e.target.value)} disabled={!editing} data-testid="input-street" />
              </div>
              <div className="space-y-2">
                <Label>{t("createSpv.streetAddress2")}</Label>
                <Input value={formData.streetAddress2 || ""} onChange={e => updateField("streetAddress2", e.target.value)} disabled={!editing} data-testid="input-street2" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("common.city")}</Label>
                  <Input value={formData.city || ""} onChange={e => updateField("city", e.target.value)} disabled={!editing} data-testid="input-city" />
                </div>
                <div className="space-y-2">
                  <Label>{t("common.state")}</Label>
                  <Input value={formData.stateProvince || ""} onChange={e => updateField("stateProvince", e.target.value)} disabled={!editing} data-testid="input-state-province" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("createSpv.zipPostalCode")}</Label>
                  <Input value={formData.zipPostalCode || ""} onChange={e => updateField("zipPostalCode", e.target.value)} disabled={!editing} data-testid="input-zip" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createSpv.county")}</Label>
                  <Input value={formData.county || ""} onChange={e => updateField("county", e.target.value)} disabled={!editing} data-testid="input-county" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createSpv.administration")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("createSpv.spvManagerLabel")}</Label>
                <Select value={formData.managerId || "none"} onValueChange={v => updateField("managerId", v)} disabled={!editing}>
                  <SelectTrigger data-testid="select-manager">
                    <SelectValue placeholder={t("createSpv.selectManager")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("createSpv.notAssigned")}</SelectItem>
                    {organizers.map((o: OrganizerAccount) => (
                      <SelectItem key={o.accountId} value={String(o.accountId)}>
                        {o.account.firstName} {o.account.lastName} ({o.account.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("createSpv.signatoryLabel")}</Label>
                <Select value={formData.signatoryId || "none"} onValueChange={v => updateField("signatoryId", v)} disabled={!editing}>
                  <SelectTrigger data-testid="select-signatory">
                    <SelectValue placeholder={t("createSpv.selectSignatory")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("createSpv.notAssigned")}</SelectItem>
                    {organizers.map((o: OrganizerAccount) => (
                      <SelectItem key={o.accountId} value={String(o.accountId)}>
                        {o.account.firstName} {o.account.lastName} ({o.account.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createSpv.bankDetails")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("createSpv.bankName")}</Label>
                <Input value={formData.bankName || ""} onChange={e => updateField("bankName", e.target.value)} disabled={!editing} data-testid="input-bank-name" />
              </div>
              <div className="space-y-2">
                <Label>{t("createSpv.bankAddress")}</Label>
                <Textarea value={formData.bankAddress || ""} onChange={e => updateField("bankAddress", e.target.value)} disabled={!editing} data-testid="input-bank-address" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("createSpv.bankRoutingNumber")}</Label>
                  <Input value={formData.bankRoutingNumber || ""} onChange={e => updateField("bankRoutingNumber", e.target.value)} disabled={!editing} data-testid="input-routing" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createSpv.bankSwiftCode")}</Label>
                  <Input value={formData.bankSwiftCode || ""} onChange={e => updateField("bankSwiftCode", e.target.value)} disabled={!editing} data-testid="input-swift" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("createSpv.bankAccountNumber")}</Label>
                <Input value={formData.bankAccountNumber || ""} onChange={e => updateField("bankAccountNumber", e.target.value)} disabled={!editing} data-testid="input-account-number" />
              </div>
              <div className="space-y-2">
                <Label>{t("createSpv.bankAccountName")}</Label>
                <Input value={formData.bankAccountName || ""} onChange={e => updateField("bankAccountName", e.target.value)} disabled={!editing} data-testid="input-account-name" />
              </div>
              <div className="space-y-2">
                <Label>{t("createSpv.forFurtherCreditTo")}</Label>
                <Input value={formData.forFurtherCreditTo || ""} onChange={e => updateField("forFurtherCreditTo", e.target.value)} disabled={!editing} data-testid="input-ffc" />
              </div>
              <div className="space-y-2">
                <Label>{t("createSpv.wiringInstructions")}</Label>
                <Textarea value={formData.wiringInstructions || ""} onChange={e => updateField("wiringInstructions", e.target.value)} disabled={!editing} data-testid="input-wiring" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createSpv.investmentDetails")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("createSpv.companyName")}</Label>
                <Input value={formData.investmentCompanyName || ""} onChange={e => updateField("investmentCompanyName", e.target.value)} disabled={!editing} data-testid="input-company-name" />
              </div>
              <div className="space-y-2">
                <Label>{t("createSpv.typeOfInvestment")}</Label>
                <Input value={formData.investmentType || ""} onChange={e => updateField("investmentType", e.target.value)} disabled={!editing} data-testid="input-investment-type" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("createSpv.totalBeingRaised")}</Label>
                  <Input type="number" step="0.01" value={formData.totalBeingRaised || "0"} onChange={e => updateField("totalBeingRaised", e.target.value)} disabled={!editing} data-testid="input-total-raised" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createSpv.minimumInvestment")}</Label>
                  <Input type="number" step="0.01" value={formData.minimumInvestment || "0"} onChange={e => updateField("minimumInvestment", e.target.value)} disabled={!editing} data-testid="input-min-investment" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("createSpv.expectedClosingDate")}</Label>
                <Input type="date" value={formData.expectedClosingDate || ""} onChange={e => updateField("expectedClosingDate", e.target.value)} disabled={!editing} data-testid="input-closing-date" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets" className="mt-6">
          <SpvAssetsTab spvId={spvId!} canEdit={canManageOrg(spv.organizationId)} spvCash={spv.cash} />
        </TabsContent>

        <TabsContent value="members" className="mt-6">
          <SpvMembersTab spvId={spvId!} orgId={spv.organizationId} canEdit={canManageOrg(spv.organizationId)} allocationMethod={spv.allocationMethod || "By Commitment"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
