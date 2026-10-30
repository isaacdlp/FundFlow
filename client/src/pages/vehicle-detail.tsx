import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { useLocalePath, useLocale } from "@/i18n/hooks";
import { fmtMoney } from "@/lib/format";
import { ROUTE_PATTERNS } from "@/i18n/routes";
import type { VehicleInfo, VehicleMemberInfo, MemberInfo, OrganizerAccount, EntityInfo, VehicleAssetInfo, VehicleAssetValuationInfo, VehicleClassInfo, CurrencyInfo } from "@shared/types";
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
import { ArrowLeft, Pencil, Save, X, UserPlus, Trash2, FileText, Users, Plus, TrendingUp, Wallet, Briefcase, Star, Lock } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useOrgPermissions } from "@/hooks/use-org-permissions";
import { SearchPicker, type SearchPickerOption } from "@/components/search-picker";
import { investorFeeDefaults, managementFeeAmount } from "@shared/fees";
import { useAuth } from "@/hooks/use-auth";
import { memberShares, showsClasses } from "@shared/vehicle-classes";
import { VehicleClassesTab, ClassSelect } from "@/components/vehicle-classes";

const ENTITY_TYPES = ["LLC", "LP", "Corporation", "Trust", "Other"];
const ALLOCATION_METHODS = ["By Commitment", "By Capital Invested", "Custom"] as const;
const INSTRUMENT_TYPES = ["Equity", "Convertible Note", "SAFE", "Preferred Stock", "Common Stock", "Warrant", "Debt", "Other"] as const;

/** Each position's ownership % of its share class (of the Vehicle when it has no classes). */
function computeOwnershipPercents(
  members: VehicleMemberInfo[],
  method: string | null | undefined,
): Record<number, number | null> {
  const shares = memberShares(members, method);
  const out: Record<number, number | null> = {};
  for (const m of members) out[m.id] = shares[m.id] != null ? shares[m.id]! * 100 : null;
  return out;
}
function formatCurrency(value: string | number | null, symbol: string, locale: string): string {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  return symbol + fmtMoney(num, locale);
}

function VehicleMembersTab({ vehicleId, orgId, canEdit, allocationMethod, currencySymbol, classes }: { vehicleId: string; orgId: number; canEdit: boolean; allocationMethod: string; currencySymbol: string; classes: VehicleClassInfo[] }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const locale = useLocale();
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
  // Fees follow the investor's defaults until typed over.
  const [managementFeeTouched, setManagementFeeTouched] = useState(false);
  const [carryTouched, setCarryTouched] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ classId: string; date: string; committed: string; managementFee: string; otherFee: string; carry: string; totalCalled: string; distributed: string; ownershipPercent: string }>({ classId: "", date: "", committed: "", managementFee: "", otherFee: "", carry: "", totalCalled: "", distributed: "", ownershipPercent: "" });
  const showOwnership = allocationMethod === "Custom";
  // Classes only show once there are several; a single class is filled in by the server.
  const hasClasses = showsClasses(classes.length);
  const [newClassId, setNewClassId] = useState("");
  const [classFilter, setClassFilter] = useState("all");

  const { data: vehicleMembers, isLoading: membersLoading } = useQuery<VehicleMemberInfo[]>({
    queryKey: ["/api/vehicles", vehicleId, "members"],
  });

  // Only organizers/admins can list org members (used for the add-investor picker).
  const { data: orgMembers } = useQuery<MemberInfo[]>({
    queryKey: ["/api/organizations", String(orgId), "members"],
    enabled: canEdit,
  });

  const { data: entitiesList } = useQuery<EntityInfo[]>({
    queryKey: ["/api/entities"],
  });

  const approvedOrgMembers = orgMembers?.filter(m => m.status === "approved") || [];
  // Investors can hold multiple positions ("tranches") in the same Vehicle — do not filter out existing members.
  const accountOptions: SearchPickerOption[] = approvedOrgMembers.map(m => (
    { value: String(m.accountId), label: `${m.account.firstName} ${m.account.lastName}`, detail: m.account.email }));
  const entityOptions: SearchPickerOption[] = (entitiesList ?? []).map(e => ({ value: String(e.id), label: e.name, detail: e.entityType }));

  // Default fees: the member's own, or for an entity the lowest of its managers' in the organization.
  const selectedEntity = entitiesList?.find(e => String(e.id) === selectedEntityId);
  const investorMemberships = investorType === "account"
    ? (selectedAccountId ? approvedOrgMembers.filter(m => String(m.accountId) === selectedAccountId) : null)
    : (selectedEntity ? (orgMembers ?? []).filter(m => selectedEntity.managers.some(x => x.accountId === m.accountId)) : null);
  const feeDefaults = investorMemberships ? investorFeeDefaults(investorMemberships) : null;
  const defaultManagementPercent = feeDefaults?.managementFeePercent ?? null;
  const defaultSuccessPercent = feeDefaults?.successFeePercent ?? null;
  useEffect(() => {
    if (!managementFeeTouched) {
      setNewManagementFee(defaultManagementPercent !== null && newCommitted
        ? managementFeeAmount(parseFloat(newCommitted) || 0, defaultManagementPercent) : "");
    }
    if (!carryTouched) setNewCarry(defaultSuccessPercent !== null ? defaultSuccessPercent.toFixed(2) : "");
  }, [defaultManagementPercent, defaultSuccessPercent, newCommitted, managementFeeTouched, carryTouched]);
  const pickInvestor = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setManagementFeeTouched(false);
    setCarryTouched(false);
  };

  const addMutation = useMutation({
    mutationFn: async (payload: { accountId?: number; entityId?: number; classId?: number; date: string | null; committed: string; managementFee: string; otherFee: string; carry: string; totalCalled: string; distributed: string; ownershipPercent: string | null }) => {
      const res = await apiRequest("POST", `/api/vehicles/${vehicleId}/members`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      setSelectedAccountId(""); setSelectedEntityId(""); setNewClassId("");
      setNewDate(""); setNewCommitted(""); setNewManagementFee(""); setNewOtherFee(""); setNewCarry(""); setNewTotalCalled(""); setNewDistributed(""); setNewOwnershipPercent("");
      setManagementFeeTouched(false); setCarryTouched(false);
      toast({ title: t("vehicleDetail.investmentAdded") });
    },
    onError: (error: Error) => {
      toast({ title: t("vehicleDetail.investmentAddFailed"), description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { memberId: number; classId?: number; date: string | null; committed: string; managementFee: string; otherFee: string; carry: string; totalCalled: string; distributed: string; ownershipPercent: string | null }) => {
      const { memberId, ...rest } = payload;
      const res = await apiRequest("PATCH", `/api/vehicles/${vehicleId}/members/${memberId}`, rest);
      return res.json();
    },
    onSuccess: () => {
      // Also refreshes the class figures, which a changed or moved investment affects.
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      setEditingMemberId(null);
      toast({ title: t("vehicleDetail.investmentUpdated") });
    },
    onError: (error: Error) => {
      toast({ title: t("vehicleDetail.investmentUpdateFailed"), description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: number) => {
      const res = await apiRequest("DELETE", `/api/vehicles/${vehicleId}/members/${memberId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      toast({ title: t("vehicleDetail.investmentRemoved") });
    },
    onError: (error: Error) => {
      toast({ title: t("vehicleDetail.investmentRemoveFailed"), description: error.message, variant: "destructive" });
    },
  });

  const startEdit = (m: VehicleMemberInfo) => {
    setEditingMemberId(m.id);
    setEditValues({
      classId: m.classId != null ? String(m.classId) : "",
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

  const canSubmit = (investorType === "account" ? !!selectedAccountId : !!selectedEntityId) && !!newDate
    && (!hasClasses || !!newClassId);

  const ownershipPercentsMap = computeOwnershipPercents(vehicleMembers || [], allocationMethod);
  const filterClass = classes.length > 1 && classes.some(c => String(c.id) === classFilter) ? classFilter : "all";
  const shownMembers = (vehicleMembers ?? []).filter(m => filterClass === "all" || String(m.classId) === filterClass);

  if (membersLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
        <div>
          <h2 className="text-lg font-semibold">{t("vehicleDetail.vehicleInvestmentsTitle")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("vehicleDetail.vehicleInvestmentsSubtitle")}
          </p>
        </div>
        {classes.length > 1 && (
          <div className="w-48">
            <ClassSelect classes={classes} value={filterClass} onChange={setClassFilter} testId="select-member-class-filter" includeAll />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {canEdit && (
        <div className="space-y-3 p-4 rounded-md border bg-muted/30">
          {hasClasses && (
            <div className="space-y-2">
              <Label>{t("vehicleDetail.shareClass")} *</Label>
              <ClassSelect classes={classes} value={newClassId} onChange={setNewClassId} testId="select-new-member-class" />
            </div>
          )}
          <div className="space-y-2">
            <Label>{t("vehicleDetail.investorType")}</Label>
            <Select value={investorType} onValueChange={v => { setInvestorType(v as "account" | "entity"); setSelectedAccountId(""); setSelectedEntityId(""); setManagementFeeTouched(false); setCarryTouched(false); }}>
              <SelectTrigger data-testid="select-investor-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="account">{t("vehicleDetail.investorTypeAccount")}</SelectItem>
                <SelectItem value="entity">{t("vehicleDetail.investorTypeEntity")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("vehicleDetail.investor")}</Label>
            {investorType === "account" ? (
              <SearchPicker
                options={accountOptions}
                onSelect={pickInvestor(setSelectedAccountId)}
                selectedLabel={accountOptions.find(o => o.value === selectedAccountId)?.label}
                placeholder={accountOptions.length > 0 ? t("vehicleDetail.selectApprovedMember") : t("vehicleDetail.noAvailableAccounts")}
                searchPlaceholder={t("introductions.searchPeople")}
                className="w-full"
                data-testid="select-vehicle-account"
              />
            ) : (
              <SearchPicker
                options={entityOptions}
                onSelect={pickInvestor(setSelectedEntityId)}
                selectedLabel={entityOptions.find(o => o.value === selectedEntityId)?.label}
                placeholder={entityOptions.length > 0 ? t("vehicleDetail.selectEntityPlaceholder") : t("vehicleDetail.noAvailableEntities")}
                searchPlaceholder={t("introductions.searchIntroduced")}
                className="w-full"
                data-testid="select-vehicle-entity"
              />
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("common.date")} *</Label>
              <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} data-testid="input-new-date" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("vehicleDetail.committed")}</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newCommitted} onChange={e => setNewCommitted(e.target.value)} data-testid="input-new-committed" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("vehicleDetail.managementFee")}</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newManagementFee} onChange={e => { setManagementFeeTouched(true); setNewManagementFee(e.target.value); }} data-testid="input-new-management-fee" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("vehicleDetail.otherFee")}</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newOtherFee} onChange={e => setNewOtherFee(e.target.value)} data-testid="input-new-other-fee" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("vehicleDetail.carrySuccessFee")}</Label>
              <Input type="number" step="0.01" min="0" max="100" placeholder="0.00" value={newCarry} onChange={e => { setCarryTouched(true); setNewCarry(e.target.value); }} data-testid="input-new-carry" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("vehicleDetail.totalCalled")}</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newTotalCalled} onChange={e => setNewTotalCalled(e.target.value)} data-testid="input-new-total-called" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("vehicleDetail.distributed")}</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newDistributed} onChange={e => setNewDistributed(e.target.value)} data-testid="input-new-distributed" />
            </div>
            {showOwnership && (
              <div className="space-y-1">
                <Label className="text-xs">{t("vehicleDetail.ownershipPercent")}</Label>
                <Input type="number" step="0.0001" min="0" max="100" placeholder="0.00" value={newOwnershipPercent} onChange={e => setNewOwnershipPercent(e.target.value)} data-testid="input-new-ownership-percent" />
              </div>
            )}
          </div>
          {feeDefaults && (
            <p className="text-xs text-muted-foreground" data-testid="text-fee-defaults">
              {defaultManagementPercent === null && defaultSuccessPercent === null
                ? t("vehicleDetail.noFeeDefaults")
                : t("vehicleDetail.feeDefaults", {
                    management: defaultManagementPercent === null ? "—" : `${defaultManagementPercent}%`,
                    success: defaultSuccessPercent === null ? "—" : `${defaultSuccessPercent}%`,
                  })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("vehicleDetail.capitalHelper")}
          </p>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                if (!canSubmit) return;
                const base = {
                  ...(hasClasses ? { classId: parseInt(newClassId) } : {}),
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
              data-testid="button-add-vehicle-member"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {addMutation.isPending ? t("vehicleDetail.adding") : t("vehicleDetail.addInvestment")}
            </Button>
          </div>
        </div>
        )}

        {canEdit && <Separator />}

        {shownMembers.length > 0 ? (
          <div className="space-y-3">
            {shownMembers.map(member => {
              const isEditing = editingMemberId === member.id;
              const committed = parseFloat(member.committed || "0");
              const mgmtFee = parseFloat(member.managementFee || "0");
              const capital = Math.max(0, committed - mgmtFee);
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
                <div key={member.id} className="p-3 rounded-md border" data-testid={`vehicle-member-${member.id}`}>
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
                        {member.code && <span className="mr-2 font-mono" data-testid={`text-member-code-${member.id}`}>{member.code}</span>}
                        {hasClasses && <Badge variant="outline" className="mr-2 text-[10px]" data-testid={`badge-member-class-${member.id}`}>{member.className}</Badge>}
                        {isEntity && <Badge variant="secondary" className="mr-2 text-[10px]">{t("vehicleDetail.entityBadge")}</Badge>}
                        {subText}
                      </p>
                    </div>
                    {canEdit && !isEditing && (
                      <Button variant="ghost" size="icon" onClick={() => startEdit(member)} data-testid={`button-edit-vehicle-member-${member.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMutation.mutate(member.id)}
                        disabled={removeMutation.isPending}
                        data-testid={`button-remove-vehicle-member-${member.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  {isEditing && canEdit ? (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {classes.length > 1 && (
                          <div className="space-y-1">
                            <Label className="text-xs">{t("vehicleDetail.shareClass")}</Label>
                            <ClassSelect classes={classes} value={editValues.classId} onChange={v => setEditValues(ev => ({ ...ev, classId: v }))} testId={`select-edit-class-${member.id}`} />
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label className="text-xs">{t("common.date")}</Label>
                          <Input type="date" value={editValues.date} onChange={e => setEditValues(v => ({ ...v, date: e.target.value }))} data-testid={`input-edit-date-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("vehicleDetail.committed")}</Label>
                          <Input type="number" step="0.01" value={editValues.committed} onChange={e => setEditValues(v => ({ ...v, committed: e.target.value }))} data-testid={`input-edit-committed-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("vehicleDetail.managementFee")}</Label>
                          <Input type="number" step="0.01" value={editValues.managementFee} onChange={e => setEditValues(v => ({ ...v, managementFee: e.target.value }))} data-testid={`input-edit-management-fee-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("vehicleDetail.otherFee")}</Label>
                          <Input type="number" step="0.01" value={editValues.otherFee} onChange={e => setEditValues(v => ({ ...v, otherFee: e.target.value }))} data-testid={`input-edit-other-fee-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("vehicleDetail.carryPercentSuccessFee")}</Label>
                          <Input type="number" step="0.01" min="0" max="100" value={editValues.carry} onChange={e => setEditValues(v => ({ ...v, carry: e.target.value }))} data-testid={`input-edit-carry-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("vehicleDetail.totalCalled")}</Label>
                          <Input type="number" step="0.01" value={editValues.totalCalled} onChange={e => setEditValues(v => ({ ...v, totalCalled: e.target.value }))} data-testid={`input-edit-total-called-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("vehicleDetail.distributed")}</Label>
                          <Input type="number" step="0.01" value={editValues.distributed} onChange={e => setEditValues(v => ({ ...v, distributed: e.target.value }))} data-testid={`input-edit-distributed-${member.id}`} />
                        </div>
                        {showOwnership && (
                          <div className="space-y-1">
                            <Label className="text-xs">{t("vehicleDetail.ownershipPercent")}</Label>
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
                          ...(classes.length > 1 && editValues.classId ? { classId: parseInt(editValues.classId) } : {}),
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
                        <p className="text-muted-foreground">{t("vehicleDetail.committed")}</p>
                        <p className="font-medium" data-testid={`text-committed-${member.id}`}>{formatCurrency(member.committed, currencySymbol, locale)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("vehicleDetail.managementFee")}</p>
                        <p className="font-medium" data-testid={`text-management-fee-${member.id}`}>{formatCurrency(member.managementFee, currencySymbol, locale)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("vehicleDetail.otherFee")}</p>
                        <p className="font-medium" data-testid={`text-other-fee-${member.id}`}>{formatCurrency(member.otherFee, currencySymbol, locale)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("vehicleDetail.carryPercent")}</p>
                        <p className="font-medium" data-testid={`text-carry-${member.id}`}>{parseFloat(member.carry || "0").toFixed(2)}%</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("vehicleDetail.capital")}</p>
                        <p className="font-medium" data-testid={`text-capital-${member.id}`}>{formatCurrency(capital, currencySymbol, locale)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("vehicleDetail.totalCalled")}</p>
                        <p className="font-medium" data-testid={`text-total-called-${member.id}`}>{formatCurrency(member.totalCalled, currencySymbol, locale)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("vehicleDetail.commitmentRemaining")}</p>
                        <p className="font-medium" data-testid={`text-commitment-remaining-${member.id}`}>{formatCurrency(commitmentRemaining, currencySymbol, locale)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("vehicleDetail.distributed")}</p>
                        <p className="font-medium" data-testid={`text-distributed-${member.id}`}>{formatCurrency(member.distributed, currencySymbol, locale)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("vehicleDetail.currentValue")}</p>
                        <p className="font-medium" data-testid={`text-current-${member.id}`}>{formatCurrency(member.currentValue, currencySymbol, locale)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("vehicleDetail.ownership")}</p>
                        <p className="font-medium" data-testid={`text-ownership-${member.id}`}>
                          {ownership != null ? `${ownership.toFixed(2)}%` : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("vehicleDetail.roi")}</p>
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
              {t("vehicleDetail.noInvestmentsYet")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VehicleAssetsTab({ vehicleId, canEdit, vehicleCash, currencyCode, currencySymbol, classes }: { vehicleId: string; canEdit: boolean; vehicleCash: string; currencyCode: string; currencySymbol: string; classes: VehicleClassInfo[] }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const locale = useLocale();
  const instrumentLabel = (it: string) => {
    const map: Record<string, string> = {
      "Equity": t("vehicleDetail.instrumentEquity"),
      "Convertible Note": t("vehicleDetail.instrumentConvertibleNote"),
      "SAFE": t("vehicleDetail.instrumentSafe"),
      "Preferred Stock": t("vehicleDetail.instrumentPreferredStock"),
      "Common Stock": t("vehicleDetail.instrumentCommonStock"),
      "Warrant": t("vehicleDetail.instrumentWarrant"),
      "Debt": t("vehicleDetail.instrumentDebt"),
      "Other": t("vehicleDetail.instrumentOther"),
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
  // Classes only show once there are several; a single class is filled in by the server.
  const hasClasses = showsClasses(classes.length);
  const [newClassId, setNewClassId] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const newClass = hasClasses ? classes.find(c => String(c.id) === newClassId) : undefined;
  const classNameOf = (id: number) => classes.find(c => c.id === id)?.name ?? null;

  const { data: assets, isLoading } = useQuery<VehicleAssetInfo[]>({
    queryKey: ["/api/vehicles", vehicleId, "assets"],
  });
  const filterClass = classes.length > 1 && classes.some(c => String(c.id) === classFilter) ? classFilter : "all";
  const shownAssets = (assets ?? []).filter(a => filterClass === "all" || String(a.classId) === filterClass);

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", `/api/vehicles/${vehicleId}/assets`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId, "assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId, "members"] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      setCompanyName(""); setInstrumentType("Equity"); setPurchaseDate(""); setCost(""); setNotes(""); setIsDefault(false); setNewClassId("");
      toast({ title: t("vehicleDetail.assetAdded") });
    },
    onError: (e: Error) => toast({ title: t("vehicleDetail.assetAddFailed"), description: e.message, variant: "destructive" }),
  });

  const moveMutation = useMutation({
    mutationFn: async ({ assetId, classId }: { assetId: number; classId: number }) => {
      const res = await apiRequest("PATCH", `/api/vehicles/${vehicleId}/assets/${assetId}`, { classId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      toast({ title: t("vehicleDetail.assetUpdated") });
    },
    onError: (e: Error) => toast({ title: t("vehicleDetail.assetUpdateFailed"), description: e.message, variant: "destructive" }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (assetId: number) => {
      const res = await apiRequest("PATCH", `/api/vehicles/${vehicleId}/assets/${assetId}`, { isDefault: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId, "assets"] });
      toast({ title: t("vehicleDetail.defaultAssetUpdated") });
    },
    onError: (e: Error) => toast({ title: t("vehicleDetail.setDefaultFailed"), description: e.message, variant: "destructive" }),
  });

  const deleteAssetMutation = useMutation({
    mutationFn: async (assetId: number) => {
      const res = await apiRequest("DELETE", `/api/vehicles/${vehicleId}/assets/${assetId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId, "assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId, "members"] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      toast({ title: t("vehicleDetail.assetRemoved") });
    },
    onError: (e: Error) => toast({ title: t("vehicleDetail.assetRemoveFailed"), description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
        <div>
          <h2 className="text-lg font-semibold">{t("vehicleDetail.financialInstruments")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("vehicleDetail.financialInstrumentsHelp")}
          </p>
        </div>
        {classes.length > 1 && (
          <div className="w-48">
            <ClassSelect classes={classes} value={filterClass} onChange={setClassFilter} testId="select-asset-class-filter" includeAll />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {canEdit && (
          <div className="space-y-3 p-4 rounded-md border bg-muted/30">
            {hasClasses && (
              <div className="space-y-1">
                <Label className="text-xs">{t("vehicleDetail.shareClass")} *</Label>
                <ClassSelect classes={classes} value={newClassId} onChange={setNewClassId} testId="select-asset-class" />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("vehicleDetail.companyIssuerName")}</Label>
                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder={t("vehicleDetail.companyIssuerPlaceholder")} data-testid="input-asset-company" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("vehicleDetail.instrumentType")}</Label>
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
                <Label className="text-xs">{t("vehicleDetail.purchaseDate")}</Label>
                <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} data-testid="input-asset-date" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("vehicleDetail.costIn", { currency: currencyCode })}</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={cost} onChange={e => setCost(e.target.value)} data-testid="input-asset-cost" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("common.notes")}</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("vehicleDetail.notesPlaceholder")} data-testid="input-asset-notes" />
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
                {t("vehicleDetail.setAsDefaultLabel")}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {newClass
                ? t("vehicleDetail.classCashAvailable", { name: newClass.name, cash: formatCurrency(newClass.cash, currencySymbol, locale) })
                : t("vehicleDetail.vehicleCashAvailable", { cash: formatCurrency(vehicleCash, currencySymbol, locale) })}
            </p>
            <div className="flex justify-end">
              <Button
                onClick={() => createMutation.mutate({
                  ...(hasClasses ? { classId: parseInt(newClassId) } : {}),
                  companyName: companyName.trim(),
                  instrumentType,
                  purchaseDate: purchaseDate || null,
                  cost: cost || "0",
                  notes,
                  isDefault,
                })}
                disabled={!companyName.trim() || (hasClasses && !newClassId) || createMutation.isPending}
                data-testid="button-add-asset"
              >
                <Plus className="h-4 w-4 mr-2" />
                {createMutation.isPending ? t("vehicleDetail.adding") : t("vehicleDetail.addAsset")}
              </Button>
            </div>
          </div>
        )}

        {canEdit && <Separator />}

        {shownAssets.length > 0 ? (
          <div className="space-y-3">
            {shownAssets.map(a => {
              const isOpen = expandedAssetId === a.id;
              const cv = parseFloat(a.currentValue || "0");
              const c = parseFloat(a.cost || "0");
              const change = c > 0 ? ((cv - c) / c) * 100 : 0;
              return (
                <div
                  key={a.id}
                  className={`p-3 rounded-md border ${a.isDefault ? "border-primary ring-2 ring-primary/30 bg-primary/5" : ""}`}
                  data-testid={`asset-${a.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-md flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                      {a.isDefault ? <Star className="h-5 w-5 fill-current" /> : <Briefcase className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-asset-name-${a.id}`}>
                        {a.companyName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {hasClasses && <Badge variant="outline" className="mr-2 text-[10px]" data-testid={`badge-asset-class-${a.id}`}>{classNameOf(a.classId)}</Badge>}
                        <Badge variant="secondary" className="mr-2 text-[10px]">{instrumentLabel(a.instrumentType)}</Badge>
                        {a.purchaseDate && <>{t("vehicleDetail.purchasedOn", { date: a.purchaseDate })} </>}
                        {t("vehicleDetail.costLabel", { cost: formatCurrency(a.cost, currencySymbol, locale) })} · {t("vehicleDetail.currentLabel", { value: formatCurrency(a.currentValue, currencySymbol, locale) })}
                        {c > 0 && (
                          <span className={change >= 0 ? "ml-2 text-emerald-600" : "ml-2 text-red-600"}>
                            {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                          </span>
                        )}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setExpandedAssetId(isOpen ? null : a.id); setValDate(""); setValValue(""); setValNote(""); }} data-testid={`button-toggle-valuations-${a.id}`}>
                      <TrendingUp className="h-4 w-4 mr-1" />
                      {isOpen ? t("vehicleDetail.hide") : t("vehicleDetail.valuations")}
                    </Button>
                    {canEdit && classes.length > 1 && (
                      <div className="w-36">
                        <ClassSelect
                          classes={classes}
                          value={a.classId != null ? String(a.classId) : ""}
                          onChange={v => moveMutation.mutate({ assetId: a.id, classId: parseInt(v) })}
                          testId={`select-move-asset-class-${a.id}`}
                        />
                      </div>
                    )}
                    {canEdit && !a.isDefault && (
                      <Button variant="ghost" size="sm" onClick={() => setDefaultMutation.mutate(a.id)} disabled={setDefaultMutation.isPending} data-testid={`button-set-default-${a.id}`}>
                        {t("vehicleDetail.setDefaultBtn")}
                      </Button>
                    )}
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={() => deleteAssetMutation.mutate(a.id)} disabled={deleteAssetMutation.isPending} data-testid={`button-delete-asset-${a.id}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  {isOpen && <AssetValuations vehicleId={vehicleId} assetId={a.id} canEdit={canEdit} currencyCode={currencyCode} currencySymbol={currencySymbol} valDate={valDate} setValDate={setValDate} valValue={valValue} setValValue={setValValue} valNote={valNote} setValNote={setValNote} />}
                  {a.notes && <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">{a.notes}</p>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">{t("vehicleDetail.noAssets")} {canEdit && t("vehicleDetail.noAssetsAddFirst")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AssetValuations({ vehicleId, assetId, canEdit, currencyCode, currencySymbol, valDate, setValDate, valValue, setValValue, valNote, setValNote }: {
  vehicleId: string; assetId: number; canEdit: boolean; currencyCode: string; currencySymbol: string;
  valDate: string; setValDate: (s: string) => void;
  valValue: string; setValValue: (s: string) => void;
  valNote: string; setValNote: (s: string) => void;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const locale = useLocale();
  const { data: vals, isLoading } = useQuery<VehicleAssetValuationInfo[]>({
    queryKey: ["/api/vehicles", vehicleId, "assets", assetId, "valuations"],
  });

  const addMutation = useMutation({
    mutationFn: async (payload: { date: string; value: string; note?: string }) => {
      const res = await apiRequest("POST", `/api/vehicles/${vehicleId}/assets/${assetId}/valuations`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId, "assets", assetId, "valuations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId, "assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId, "members"] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      setValDate(""); setValValue(""); setValNote("");
      toast({ title: t("vehicleDetail.valuationAdded") });
    },
    onError: (e: Error) => toast({ title: t("vehicleDetail.valuationAddFailed"), description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (valuationId: number) => {
      const res = await apiRequest("DELETE", `/api/vehicles/${vehicleId}/assets/${assetId}/valuations/${valuationId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId, "assets", assetId, "valuations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId, "assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId, "members"] });
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
            <Label className="text-xs">{t("vehicleDetail.valueIn", { currency: currencyCode })}</Label>
            <Input type="number" step="0.01" placeholder="0.00" value={valValue} onChange={e => setValValue(e.target.value)} data-testid={`input-valuation-value-${assetId}`} />
          </div>
          <div className="space-y-1 md:col-span-1">
            <Label className="text-xs">{t("vehicleDetail.note")}</Label>
            <Input value={valNote} onChange={e => setValNote(e.target.value)} placeholder={t("vehicleDetail.optional")} data-testid={`input-valuation-note-${assetId}`} />
          </div>
          <Button
            size="sm"
            onClick={() => addMutation.mutate({ date: valDate, value: valValue, note: valNote })}
            disabled={!valDate || !valValue || addMutation.isPending}
            data-testid={`button-add-valuation-${assetId}`}
          >
            <Plus className="h-4 w-4 mr-1" /> {addMutation.isPending ? t("vehicleDetail.adding") : t("common.add")}
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
              <span className="font-medium">{formatCurrency(v.value, currencySymbol, locale)}</span>
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
        <p className="text-xs text-muted-foreground">{t("vehicleDetail.noValuations")}</p>
      )}
    </div>
  );
}

export default function VehicleDetail() {
  const locale = useLocale();
  const lp = useLocalePath();
  const { t } = useTranslation();
  const [, params] = useRoute(ROUTE_PATTERNS.vehicleDetail[locale]);
  const vehicleId = params?.id;
  const { toast } = useToast();
  const { canManageOrg } = useOrgPermissions();
  const { isAdmin } = useAuth();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const activeTab = new URLSearchParams(search).get("tab") ?? "configuration";
  const [editing, setEditing] = useState(false);

  const { data: vehicle, isLoading } = useQuery<VehicleInfo>({
    queryKey: ["/api/vehicles", vehicleId],
    enabled: !!vehicleId,
  });

  const { data: currencies } = useQuery<CurrencyInfo[]>({
    queryKey: ["/api/currencies"],
  });

  const { data: classes, isLoading: classesLoading } = useQuery<VehicleClassInfo[]>({
    queryKey: ["/api/vehicles", vehicleId, "classes"],
    enabled: !!vehicleId,
  });
  const currencyCode = vehicle?.currency || "USD";
  const currencyInfo = currencies?.find(c => c.code === currencyCode);
  // Fall back to the code itself (e.g. "EUR ") rather than a misleading "$".
  const currencySymbol = currencyInfo?.symbol ?? (currencyCode === "USD" ? "$" : `${currencyCode} `);

  const orgId = vehicle?.organizationId;

  const { data: org } = useQuery<{ organizers: OrganizerAccount[] }>({
    queryKey: ["/api/organizations", String(orgId)],
    enabled: !!orgId,
  });

  const organizers = org?.organizers || [];

  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    if (vehicle) {
      setFormData({
        code: vehicle.code || "",
        legalName: vehicle.legalName || "",
        displayName: vehicle.displayName || "",
        entityType: vehicle.entityType || "LLC",
        stateOfIncorporation: vehicle.stateOfIncorporation || "",
        ein: vehicle.ein || "",
        dateEstablished: vehicle.dateEstablished || "",
        dateEnded: vehicle.dateEnded || "",
        allocationMethod: vehicle.allocationMethod || "By Commitment",
        autoDeploy: !!vehicle.autoDeploy,
        managementFeePercent: vehicle.managementFeePercent || "0",
        carriedInterestPercent: vehicle.carriedInterestPercent || "0",
        preferredReturnPercent: vehicle.preferredReturnPercent || "0",
        country: vehicle.country || "",
        streetAddress: vehicle.streetAddress || "",
        streetAddress2: vehicle.streetAddress2 || "",
        city: vehicle.city || "",
        stateProvince: vehicle.stateProvince || "",
        zipPostalCode: vehicle.zipPostalCode || "",
        county: vehicle.county || "",
        managerId: vehicle.managerId ? String(vehicle.managerId) : "",
        signatoryId: vehicle.signatoryId ? String(vehicle.signatoryId) : "",
        bankName: vehicle.bankName || "",
        bankAddress: vehicle.bankAddress || "",
        bankRoutingNumber: vehicle.bankRoutingNumber || "",
        bankSwiftCode: vehicle.bankSwiftCode || "",
        bankAccountNumber: vehicle.bankAccountNumber || "",
        bankAccountName: vehicle.bankAccountName || "",
        forFurtherCreditTo: vehicle.forFurtherCreditTo || "",
        wiringInstructions: vehicle.wiringInstructions || "",
        investmentCompanyName: vehicle.investmentCompanyName || "",
        investmentType: vehicle.investmentType || "",
        totalBeingRaised: vehicle.totalBeingRaised || "0",
        minimumInvestment: vehicle.minimumInvestment || "0",
        expectedClosingDate: vehicle.expectedClosingDate || "",
      });
    }
  }, [vehicle]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/vehicles/${vehicleId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId] });
      setEditing(false);
      toast({ title: t("vehicleDetail.vehicleUpdated") });
    },
    onError: (error: Error) => {
      toast({ title: t("vehicleDetail.vehicleUpdateFailed"), description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const payload: Record<string, unknown> = { ...formData };
    if (!isAdmin || !payload.code) delete payload.code;
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
    if (vehicle) {
      setFormData({
        code: vehicle.code || "",
        legalName: vehicle.legalName || "",
        displayName: vehicle.displayName || "",
        entityType: vehicle.entityType || "LLC",
        stateOfIncorporation: vehicle.stateOfIncorporation || "",
        ein: vehicle.ein || "",
        dateEstablished: vehicle.dateEstablished || "",
        dateEnded: vehicle.dateEnded || "",
        allocationMethod: vehicle.allocationMethod || "By Commitment",
        autoDeploy: !!vehicle.autoDeploy,
        managementFeePercent: vehicle.managementFeePercent || "0",
        carriedInterestPercent: vehicle.carriedInterestPercent || "0",
        preferredReturnPercent: vehicle.preferredReturnPercent || "0",
        country: vehicle.country || "",
        streetAddress: vehicle.streetAddress || "",
        streetAddress2: vehicle.streetAddress2 || "",
        city: vehicle.city || "",
        stateProvince: vehicle.stateProvince || "",
        zipPostalCode: vehicle.zipPostalCode || "",
        county: vehicle.county || "",
        managerId: vehicle.managerId ? String(vehicle.managerId) : "",
        signatoryId: vehicle.signatoryId ? String(vehicle.signatoryId) : "",
        bankName: vehicle.bankName || "",
        bankAddress: vehicle.bankAddress || "",
        bankRoutingNumber: vehicle.bankRoutingNumber || "",
        bankSwiftCode: vehicle.bankSwiftCode || "",
        bankAccountNumber: vehicle.bankAccountNumber || "",
        bankAccountName: vehicle.bankAccountName || "",
        forFurtherCreditTo: vehicle.forFurtherCreditTo || "",
        wiringInstructions: vehicle.wiringInstructions || "",
        investmentCompanyName: vehicle.investmentCompanyName || "",
        investmentType: vehicle.investmentType || "",
        totalBeingRaised: vehicle.totalBeingRaised || "0",
        minimumInvestment: vehicle.minimumInvestment || "0",
        expectedClosingDate: vehicle.expectedClosingDate || "",
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

  if (!vehicle) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("vehicleDetail.notFound")}</p>
      </div>
    );
  }

  const allocationHelpKey = (m: string) => {
    if (m === "By Commitment") return t("createVehicle.allocationHelpByCommitment");
    if (m === "By Capital Invested") return t("createVehicle.allocationHelpByCapital");
    if (m === "Custom") return t("createVehicle.allocationHelpCustom");
    return "";
  };
  const allocationLabel = (m: string) => {
    if (m === "By Commitment") return t("createVehicle.allocationByCommitment");
    if (m === "By Capital Invested") return t("createVehicle.allocationByCapital");
    if (m === "Custom") return t("createVehicle.allocationCustom");
    return m;
  };

  return (
    <div className="p-6 space-y-6">
      <Link href={lp("organizationDetail", { id: vehicle.organizationId })}>
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          {t("vehicleDetail.backToOrg")}
        </Button>
      </Link>

      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
          <FileText className="h-8 w-8" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold" data-testid="text-vehicle-name">{vehicle.displayName}</h1>
          <p className="text-muted-foreground mt-0.5" data-testid="text-vehicle-legal-name">{vehicle.legalName}</p>
          <div className="flex gap-2 mt-1 flex-wrap">
            <Badge variant="secondary">{vehicle.entityType || "LLC"}</Badge>
            <Badge variant="outline">{t("vehicleDetail.memberCount", { count: vehicle.memberCount })}</Badge>
            {showsClasses(vehicle.classCount) && (
              <Badge variant="outline" data-testid="badge-class-count">{t("vehicleDetail.classCount", { count: vehicle.classCount })}</Badge>
            )}
            {vehicle.manager && (
              <Badge variant="outline">{t("vehicleDetail.managerLabel", { name: `${vehicle.manager.firstName} ${vehicle.manager.lastName}` })}</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{t("vehicleDetail.cash")}</p>
              <p className="text-lg font-semibold" data-testid="text-vehicle-cash">{formatCurrency(vehicle.cash, currencySymbol, locale)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Briefcase className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{t("vehicleDetail.assetValue")}</p>
              <p className="text-lg font-semibold" data-testid="text-vehicle-asset-value">{formatCurrency(vehicle.assetValue, currencySymbol, locale)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{t("vehicleDetail.currentValue")}</p>
              <p className="text-lg font-semibold" data-testid="text-vehicle-current-value">{formatCurrency(vehicle.currentValue, currencySymbol, locale)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(t) => navigate(`${location}?tab=${t}`, { replace: true })}>
        <TabsList>
          <TabsTrigger value="configuration" data-testid="tab-configuration">{t("vehicleDetail.configuration")}</TabsTrigger>
          {(canManageOrg(vehicle.organizationId) || showsClasses(classes?.length ?? 0)) && (
            <TabsTrigger value="classes" data-testid="tab-vehicle-classes">{t("vehicleDetail.classes")}</TabsTrigger>
          )}
          <TabsTrigger value="assets" data-testid="tab-vehicle-assets">{t("vehicleDetail.assets")}</TabsTrigger>
          <TabsTrigger value="members" data-testid="tab-vehicle-members">{t("vehicleDetail.members")}</TabsTrigger>
        </TabsList>

        <TabsContent value="configuration" className="mt-6 space-y-6">
          {canManageOrg(vehicle.organizationId) && (
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
              <h2 className="text-lg font-semibold">{t("createVehicle.generalStructure")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("vehicleDetail.code")}</Label>
                  <Input
                    value={formData.code || ""}
                    onChange={e => updateField("code", e.target.value.toUpperCase())}
                    disabled={!editing || !isAdmin}
                    maxLength={4}
                    placeholder={t("vehicleDetail.codeNotAssigned")}
                    className="font-mono"
                    data-testid="input-vehicle-code"
                  />
                  {editing && isAdmin && <p className="text-xs text-muted-foreground">{t("vehicleDetail.codeHelper")}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("createVehicle.legalName")}</Label>
                  <Input value={formData.legalName || ""} onChange={e => updateField("legalName", e.target.value)} disabled={!editing} data-testid="input-legal-name" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createVehicle.displayName")}</Label>
                  <Input value={formData.displayName || ""} onChange={e => updateField("displayName", e.target.value)} disabled={!editing} data-testid="input-display-name" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("createVehicle.entityType")}</Label>
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
                  <Label>{t("createVehicle.stateOfIncorporation")}</Label>
                  <Input value={formData.stateOfIncorporation || ""} onChange={e => updateField("stateOfIncorporation", e.target.value)} disabled={!editing} data-testid="input-state-incorporation" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("createVehicle.ein")}</Label>
                <Input value={formData.ein || ""} onChange={e => updateField("ein", e.target.value)} disabled={!editing} data-testid="input-ein" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("createVehicle.dateEstablished")}</Label>
                  <Input type="date" value={formData.dateEstablished || ""} onChange={e => updateField("dateEstablished", e.target.value)} disabled={!editing} data-testid="input-date-established" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createVehicle.dateEnded")}</Label>
                  <Input type="date" value={formData.dateEnded || ""} onChange={e => updateField("dateEnded", e.target.value)} disabled={!editing} data-testid="input-date-ended" />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>{t("createVehicle.allocationMethod")}</Label>
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
                  <Label htmlFor="autoDeploy" className="cursor-pointer">{t("vehicleDetail.autoDeploy")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("vehicleDetail.autoDeployHelp")}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  {t("createVehicle.currency")}
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </Label>
                <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm" data-testid="text-currency">
                  {vehicle?.currency || "USD"}
                  {currencyInfo ? ` (${currencyInfo.symbol}) – ${currencyInfo.name}` : ""}
                </div>
                <p className="text-xs text-muted-foreground">{t("vehicleDetail.currencyLockedHelp")}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t("createVehicle.managementFeePercent")}</Label>
                  <Input type="number" step="0.01" value={formData.managementFeePercent || "0"} onChange={e => updateField("managementFeePercent", e.target.value)} disabled={!editing} data-testid="input-mgmt-fee" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createVehicle.carriedInterestPercent")}</Label>
                  <Input type="number" step="0.01" value={formData.carriedInterestPercent || "0"} onChange={e => updateField("carriedInterestPercent", e.target.value)} disabled={!editing} data-testid="input-carry" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createVehicle.preferredReturnPercent")}</Label>
                  <Input type="number" step="0.01" value={formData.preferredReturnPercent || "0"} onChange={e => updateField("preferredReturnPercent", e.target.value)} disabled={!editing} data-testid="input-pref-return" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("vehicleDetail.address")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("common.country")}</Label>
                <Input value={formData.country || ""} onChange={e => updateField("country", e.target.value)} disabled={!editing} data-testid="input-country" />
              </div>
              <div className="space-y-2">
                <Label>{t("createVehicle.street")}</Label>
                <Input value={formData.streetAddress || ""} onChange={e => updateField("streetAddress", e.target.value)} disabled={!editing} data-testid="input-street" />
              </div>
              <div className="space-y-2">
                <Label>{t("createVehicle.streetAddress2")}</Label>
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
                  <Label>{t("createVehicle.zipPostalCode")}</Label>
                  <Input value={formData.zipPostalCode || ""} onChange={e => updateField("zipPostalCode", e.target.value)} disabled={!editing} data-testid="input-zip" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createVehicle.county")}</Label>
                  <Input value={formData.county || ""} onChange={e => updateField("county", e.target.value)} disabled={!editing} data-testid="input-county" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createVehicle.administration")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("createVehicle.vehicleManagerLabel")}</Label>
                <Select value={formData.managerId || "none"} onValueChange={v => updateField("managerId", v)} disabled={!editing}>
                  <SelectTrigger data-testid="select-manager">
                    <SelectValue placeholder={t("createVehicle.selectManager")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("createVehicle.notAssigned")}</SelectItem>
                    {organizers.map((o: OrganizerAccount) => (
                      <SelectItem key={o.accountId} value={String(o.accountId)}>
                        {o.account.firstName} {o.account.lastName} ({o.account.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("createVehicle.signatoryLabel")}</Label>
                <Select value={formData.signatoryId || "none"} onValueChange={v => updateField("signatoryId", v)} disabled={!editing}>
                  <SelectTrigger data-testid="select-signatory">
                    <SelectValue placeholder={t("createVehicle.selectSignatory")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("createVehicle.notAssigned")}</SelectItem>
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
              <h2 className="text-lg font-semibold">{t("createVehicle.bankDetails")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("createVehicle.bankName")}</Label>
                <Input value={formData.bankName || ""} onChange={e => updateField("bankName", e.target.value)} disabled={!editing} data-testid="input-bank-name" />
              </div>
              <div className="space-y-2">
                <Label>{t("createVehicle.bankAddress")}</Label>
                <Textarea value={formData.bankAddress || ""} onChange={e => updateField("bankAddress", e.target.value)} disabled={!editing} data-testid="input-bank-address" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("createVehicle.bankRoutingNumber")}</Label>
                  <Input value={formData.bankRoutingNumber || ""} onChange={e => updateField("bankRoutingNumber", e.target.value)} disabled={!editing} data-testid="input-routing" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createVehicle.bankSwiftCode")}</Label>
                  <Input value={formData.bankSwiftCode || ""} onChange={e => updateField("bankSwiftCode", e.target.value)} disabled={!editing} data-testid="input-swift" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("createVehicle.bankAccountNumber")}</Label>
                <Input value={formData.bankAccountNumber || ""} onChange={e => updateField("bankAccountNumber", e.target.value)} disabled={!editing} data-testid="input-account-number" />
              </div>
              <div className="space-y-2">
                <Label>{t("createVehicle.bankAccountName")}</Label>
                <Input value={formData.bankAccountName || ""} onChange={e => updateField("bankAccountName", e.target.value)} disabled={!editing} data-testid="input-account-name" />
              </div>
              <div className="space-y-2">
                <Label>{t("createVehicle.forFurtherCreditTo")}</Label>
                <Input value={formData.forFurtherCreditTo || ""} onChange={e => updateField("forFurtherCreditTo", e.target.value)} disabled={!editing} data-testid="input-ffc" />
              </div>
              <div className="space-y-2">
                <Label>{t("createVehicle.wiringInstructions")}</Label>
                <Textarea value={formData.wiringInstructions || ""} onChange={e => updateField("wiringInstructions", e.target.value)} disabled={!editing} data-testid="input-wiring" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createVehicle.investmentDetails")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("createVehicle.companyName")}</Label>
                <Input value={formData.investmentCompanyName || ""} onChange={e => updateField("investmentCompanyName", e.target.value)} disabled={!editing} data-testid="input-company-name" />
              </div>
              <div className="space-y-2">
                <Label>{t("createVehicle.typeOfInvestment")}</Label>
                <Input value={formData.investmentType || ""} onChange={e => updateField("investmentType", e.target.value)} disabled={!editing} data-testid="input-investment-type" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("createVehicle.totalBeingRaised")}</Label>
                  <Input type="number" step="0.01" value={formData.totalBeingRaised || "0"} onChange={e => updateField("totalBeingRaised", e.target.value)} disabled={!editing} data-testid="input-total-raised" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createVehicle.minimumInvestment")}</Label>
                  <Input type="number" step="0.01" value={formData.minimumInvestment || "0"} onChange={e => updateField("minimumInvestment", e.target.value)} disabled={!editing} data-testid="input-min-investment" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("createVehicle.expectedClosingDate")}</Label>
                <Input type="date" value={formData.expectedClosingDate || ""} onChange={e => updateField("expectedClosingDate", e.target.value)} disabled={!editing} data-testid="input-closing-date" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="classes" className="mt-6">
          <VehicleClassesTab vehicleId={vehicleId!} classes={classes} isLoading={classesLoading} canEdit={canManageOrg(vehicle.organizationId)} currencySymbol={currencySymbol} />
        </TabsContent>

        <TabsContent value="assets" className="mt-6">
          <VehicleAssetsTab vehicleId={vehicleId!} canEdit={canManageOrg(vehicle.organizationId)} vehicleCash={vehicle.cash} currencyCode={currencyCode} currencySymbol={currencySymbol} classes={classes ?? []} />
        </TabsContent>

        <TabsContent value="members" className="mt-6">
          <VehicleMembersTab vehicleId={vehicleId!} orgId={vehicle.organizationId} canEdit={canManageOrg(vehicle.organizationId)} allocationMethod={vehicle.allocationMethod || "By Commitment"} currencySymbol={currencySymbol} classes={classes ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
