import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import type { SpvInfo, SpvMemberInfo, MemberInfo, OrganizerAccount, EntityInfo } from "@shared/types";
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
import { ArrowLeft, Pencil, Save, X, UserPlus, Trash2, FileText, Users } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useOrgPermissions } from "@/hooks/use-org-permissions";

const ENTITY_TYPES = ["LLC", "LP", "Corporation", "Trust", "Other"];
const ALLOCATION_METHODS = ["By Commitment", "By Capital Invested", "Custom"] as const;
const ALLOCATION_HELP: Record<string, string> = {
  "By Commitment": "Each investor's ownership equals their share of total capital called (commitments). Fees do not affect ownership.",
  "By Capital Invested": "Each investor's ownership equals their share of capital called minus fees paid. Fees can differ per investor, so two investors with the same commitment may end up with different ownership.",
  "Custom": "Ownership is set explicitly per investor. Assign each investor an exact ownership percentage in the Members tab.",
};

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
  const [investorType, setInvestorType] = useState<"account" | "entity">("account");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newCommitted, setNewCommitted] = useState("");
  const [newManagementFee, setNewManagementFee] = useState("");
  const [newOtherFee, setNewOtherFee] = useState("");
  const [newTotalCalled, setNewTotalCalled] = useState("");
  const [newDistributed, setNewDistributed] = useState("");
  const [newCurrentValue, setNewCurrentValue] = useState("");
  const [newOwnershipPercent, setNewOwnershipPercent] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ date: string; committed: string; managementFee: string; otherFee: string; totalCalled: string; distributed: string; currentValue: string; ownershipPercent: string }>({ date: "", committed: "", managementFee: "", otherFee: "", totalCalled: "", distributed: "", currentValue: "", ownershipPercent: "" });
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
    mutationFn: async (payload: { accountId?: number; entityId?: number; date: string | null; committed: string; managementFee: string; otherFee: string; totalCalled: string; distributed: string; currentValue: string; ownershipPercent: string | null }) => {
      const res = await apiRequest("POST", `/api/spvs/${spvId}/members`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      setSelectedAccountId(""); setSelectedEntityId("");
      setNewDate(""); setNewCommitted(""); setNewManagementFee(""); setNewOtherFee(""); setNewTotalCalled(""); setNewDistributed(""); setNewCurrentValue(""); setNewOwnershipPercent("");
      toast({ title: "Investment added to SPV" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add investment", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { memberId: number; date: string | null; committed: string; managementFee: string; otherFee: string; totalCalled: string; distributed: string; currentValue: string; ownershipPercent: string | null }) => {
      const { memberId, ...rest } = payload;
      const res = await apiRequest("PATCH", `/api/spvs/${spvId}/members/${memberId}`, rest);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "members"] });
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
      setEditingMemberId(null);
      toast({ title: "Investment updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update investment", description: error.message, variant: "destructive" });
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
      toast({ title: "Investment removed from SPV" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove investment", description: error.message, variant: "destructive" });
    },
  });

  const startEdit = (m: SpvMemberInfo) => {
    setEditingMemberId(m.id);
    setEditValues({
      date: m.date || "",
      committed: m.committed || "0",
      managementFee: m.managementFee || "0",
      otherFee: m.otherFee || "0",
      totalCalled: m.totalCalled || "0",
      distributed: m.distributed || "0",
      currentValue: m.currentValue || "0",
      ownershipPercent: m.ownershipPercent != null ? String(parseFloat(m.ownershipPercent)) : "",
    });
  };

  const canSubmit = investorType === "account" ? !!selectedAccountId : !!selectedEntityId;

  const ownershipPercentsMap = computeOwnershipPercents(spvMembers || [], allocationMethod);

  if (membersLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
        <div>
          <h2 className="text-lg font-semibold">SPV Investments</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add accounts (approved organization members) or entities as investors
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {canEdit && (
        <div className="space-y-3 p-4 rounded-md border bg-muted/30">
          <div className="space-y-2">
            <Label>Investor Type</Label>
            <Select value={investorType} onValueChange={v => { setInvestorType(v as "account" | "entity"); setSelectedAccountId(""); setSelectedEntityId(""); }}>
              <SelectTrigger data-testid="select-investor-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="account">Account (Individual)</SelectItem>
                <SelectItem value="entity">Entity</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Investor</Label>
            {investorType === "account" ? (
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger data-testid="select-spv-account">
                  <SelectValue placeholder="Select an approved organization member..." />
                </SelectTrigger>
                <SelectContent>
                  {availableAccounts.length > 0 ? (
                    availableAccounts.map(m => (
                      <SelectItem key={m.accountId} value={String(m.accountId)}>
                        {m.account.firstName} {m.account.lastName} ({m.account.email})
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>No available accounts</SelectItem>
                  )}
                </SelectContent>
              </Select>
            ) : (
              <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
                <SelectTrigger data-testid="select-spv-entity">
                  <SelectValue placeholder="Select an entity..." />
                </SelectTrigger>
                <SelectContent>
                  {availableEntities.length > 0 ? (
                    availableEntities.map(e => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.name} ({e.entityType})
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>No available entities</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} data-testid="input-new-date" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Committed</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newCommitted} onChange={e => setNewCommitted(e.target.value)} data-testid="input-new-committed" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Management Fee</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newManagementFee} onChange={e => setNewManagementFee(e.target.value)} data-testid="input-new-management-fee" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Other Fee</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newOtherFee} onChange={e => setNewOtherFee(e.target.value)} data-testid="input-new-other-fee" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Total Called</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newTotalCalled} onChange={e => setNewTotalCalled(e.target.value)} data-testid="input-new-total-called" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Distributed</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newDistributed} onChange={e => setNewDistributed(e.target.value)} data-testid="input-new-distributed" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Current Value</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newCurrentValue} onChange={e => setNewCurrentValue(e.target.value)} data-testid="input-new-current-value" />
            </div>
            {showOwnership && (
              <div className="space-y-1">
                <Label className="text-xs">Ownership %</Label>
                <Input type="number" step="0.0001" min="0" max="100" placeholder="0.00" value={newOwnershipPercent} onChange={e => setNewOwnershipPercent(e.target.value)} data-testid="input-new-ownership-percent" />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Capital = Committed − (Management Fee + Other Fee). Commitment Remaining = Capital − Total Called. Both are derived automatically.
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
                  totalCalled: newTotalCalled || "0",
                  distributed: newDistributed || "0",
                  currentValue: newCurrentValue || newCommitted || "0",
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
              {addMutation.isPending ? "Adding..." : "Add Investment"}
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
                : "Unknown";
              const subText = isAccount
                ? member.account!.email
                : isEntity
                ? member.entity!.entityType
                : "";
              const profileHref = isAccount ? `/accounts/${member.account!.id}` : isEntity ? `/entities/${member.entity!.id}` : null;
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
                        {isEntity && <Badge variant="secondary" className="mr-2 text-[10px]">Entity</Badge>}
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
                          <Label className="text-xs">Date</Label>
                          <Input type="date" value={editValues.date} onChange={e => setEditValues(v => ({ ...v, date: e.target.value }))} data-testid={`input-edit-date-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Committed</Label>
                          <Input type="number" step="0.01" value={editValues.committed} onChange={e => setEditValues(v => ({ ...v, committed: e.target.value }))} data-testid={`input-edit-committed-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Management Fee</Label>
                          <Input type="number" step="0.01" value={editValues.managementFee} onChange={e => setEditValues(v => ({ ...v, managementFee: e.target.value }))} data-testid={`input-edit-management-fee-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Other Fee</Label>
                          <Input type="number" step="0.01" value={editValues.otherFee} onChange={e => setEditValues(v => ({ ...v, otherFee: e.target.value }))} data-testid={`input-edit-other-fee-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Total Called</Label>
                          <Input type="number" step="0.01" value={editValues.totalCalled} onChange={e => setEditValues(v => ({ ...v, totalCalled: e.target.value }))} data-testid={`input-edit-total-called-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Distributed</Label>
                          <Input type="number" step="0.01" value={editValues.distributed} onChange={e => setEditValues(v => ({ ...v, distributed: e.target.value }))} data-testid={`input-edit-distributed-${member.id}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Current Value</Label>
                          <Input type="number" step="0.01" value={editValues.currentValue} onChange={e => setEditValues(v => ({ ...v, currentValue: e.target.value }))} data-testid={`input-edit-current-${member.id}`} />
                        </div>
                        {showOwnership && (
                          <div className="space-y-1">
                            <Label className="text-xs">Ownership %</Label>
                            <Input type="number" step="0.0001" min="0" max="100" value={editValues.ownershipPercent} onChange={e => setEditValues(v => ({ ...v, ownershipPercent: e.target.value }))} data-testid={`input-edit-ownership-${member.id}`} />
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingMemberId(null)} data-testid={`button-cancel-edit-${member.id}`}>
                          <X className="h-4 w-4 mr-1" /> Cancel
                        </Button>
                        <Button size="sm" onClick={() => updateMutation.mutate({
                          memberId: member.id,
                          date: editValues.date || null,
                          committed: editValues.committed,
                          managementFee: editValues.managementFee,
                          otherFee: editValues.otherFee,
                          totalCalled: editValues.totalCalled,
                          distributed: editValues.distributed,
                          currentValue: editValues.currentValue,
                          ownershipPercent: showOwnership ? (editValues.ownershipPercent === "" ? null : editValues.ownershipPercent) : null,
                        })} disabled={updateMutation.isPending} data-testid={`button-save-edit-${member.id}`}>
                          <Save className="h-4 w-4 mr-1" /> {updateMutation.isPending ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">Date</p>
                        <p className="font-medium" data-testid={`text-date-${member.id}`}>{member.date || "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Committed</p>
                        <p className="font-medium" data-testid={`text-committed-${member.id}`}>${formatCurrency(member.committed)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Management Fee</p>
                        <p className="font-medium" data-testid={`text-management-fee-${member.id}`}>${formatCurrency(member.managementFee)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Other Fee</p>
                        <p className="font-medium" data-testid={`text-other-fee-${member.id}`}>${formatCurrency(member.otherFee)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Capital</p>
                        <p className="font-medium" data-testid={`text-capital-${member.id}`}>${capital.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Called</p>
                        <p className="font-medium" data-testid={`text-total-called-${member.id}`}>${formatCurrency(member.totalCalled)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Commitment Remaining</p>
                        <p className="font-medium" data-testid={`text-commitment-remaining-${member.id}`}>${commitmentRemaining.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Distributed</p>
                        <p className="font-medium" data-testid={`text-distributed-${member.id}`}>${formatCurrency(member.distributed)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Current Value</p>
                        <p className="font-medium" data-testid={`text-current-${member.id}`}>${formatCurrency(member.currentValue)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Ownership</p>
                        <p className="font-medium" data-testid={`text-ownership-${member.id}`}>
                          {ownership != null ? `${ownership.toFixed(2)}%` : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">ROI</p>
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
              No investments yet. Add an account or entity above.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SpvDetail() {
  const [, params] = useRoute("/spvs/:id");
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
      toast({ title: "SPV updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update SPV", description: error.message, variant: "destructive" });
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
        <p className="text-muted-foreground">SPV not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Link href={`/organizations/${spv.organizationId}`}>
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          Back to Organization
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
            <Badge variant="outline">{spv.memberCount} Member{spv.memberCount !== 1 ? "s" : ""}</Badge>
            {spv.manager && (
              <Badge variant="outline">Manager: {spv.manager.firstName} {spv.manager.lastName}</Badge>
            )}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="configuration" data-testid="tab-configuration">Configuration</TabsTrigger>
          <TabsTrigger value="members" data-testid="tab-spv-members">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="configuration" className="mt-6 space-y-6">
          {canManageOrg(spv.organizationId) && (
            <div className="flex justify-end">
              {!editing ? (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="button-edit">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCancel} data-testid="button-cancel">
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save">
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    {updateMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </div>
          )}

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">General Structure</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Legal Name</Label>
                  <Input value={formData.legalName || ""} onChange={e => updateField("legalName", e.target.value)} disabled={!editing} data-testid="input-legal-name" />
                </div>
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input value={formData.displayName || ""} onChange={e => updateField("displayName", e.target.value)} disabled={!editing} data-testid="input-display-name" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Entity Type</Label>
                  <Select value={formData.entityType || "LLC"} onValueChange={v => updateField("entityType", v)} disabled={!editing}>
                    <SelectTrigger data-testid="select-entity-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>State of Incorporation</Label>
                  <Input value={formData.stateOfIncorporation || ""} onChange={e => updateField("stateOfIncorporation", e.target.value)} disabled={!editing} data-testid="input-state-incorporation" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>EIN</Label>
                <Input value={formData.ein || ""} onChange={e => updateField("ein", e.target.value)} disabled={!editing} data-testid="input-ein" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date Established</Label>
                  <Input type="date" value={formData.dateEstablished || ""} onChange={e => updateField("dateEstablished", e.target.value)} disabled={!editing} data-testid="input-date-established" />
                </div>
                <div className="space-y-2">
                  <Label>Date Ended</Label>
                  <Input type="date" value={formData.dateEnded || ""} onChange={e => updateField("dateEnded", e.target.value)} disabled={!editing} data-testid="input-date-ended" />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Allocation Method</Label>
                <Select value={formData.allocationMethod || "By Commitment"} onValueChange={v => updateField("allocationMethod", v)} disabled={!editing}>
                  <SelectTrigger data-testid="select-allocation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALLOCATION_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground" data-testid="text-allocation-help">
                  {ALLOCATION_HELP[formData.allocationMethod || "By Commitment"]}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
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
                  <Label>Management Fee %</Label>
                  <Input type="number" step="0.01" value={formData.managementFeePercent || "0"} onChange={e => updateField("managementFeePercent", e.target.value)} disabled={!editing} data-testid="input-mgmt-fee" />
                </div>
                <div className="space-y-2">
                  <Label>Carried Interest %</Label>
                  <Input type="number" step="0.01" value={formData.carriedInterestPercent || "0"} onChange={e => updateField("carriedInterestPercent", e.target.value)} disabled={!editing} data-testid="input-carry" />
                </div>
                <div className="space-y-2">
                  <Label>Preferred Return %</Label>
                  <Input type="number" step="0.01" value={formData.preferredReturnPercent || "0"} onChange={e => updateField("preferredReturnPercent", e.target.value)} disabled={!editing} data-testid="input-pref-return" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Address</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Country</Label>
                <Input value={formData.country || ""} onChange={e => updateField("country", e.target.value)} disabled={!editing} data-testid="input-country" />
              </div>
              <div className="space-y-2">
                <Label>Street</Label>
                <Input value={formData.streetAddress || ""} onChange={e => updateField("streetAddress", e.target.value)} disabled={!editing} data-testid="input-street" />
              </div>
              <div className="space-y-2">
                <Label>Apartment, suite, etc.</Label>
                <Input value={formData.streetAddress2 || ""} onChange={e => updateField("streetAddress2", e.target.value)} disabled={!editing} data-testid="input-street2" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={formData.city || ""} onChange={e => updateField("city", e.target.value)} disabled={!editing} data-testid="input-city" />
                </div>
                <div className="space-y-2">
                  <Label>State / Province</Label>
                  <Input value={formData.stateProvince || ""} onChange={e => updateField("stateProvince", e.target.value)} disabled={!editing} data-testid="input-state-province" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ZIP / Postal Code</Label>
                  <Input value={formData.zipPostalCode || ""} onChange={e => updateField("zipPostalCode", e.target.value)} disabled={!editing} data-testid="input-zip" />
                </div>
                <div className="space-y-2">
                  <Label>County</Label>
                  <Input value={formData.county || ""} onChange={e => updateField("county", e.target.value)} disabled={!editing} data-testid="input-county" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Administration</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Who is the SPV manager?</Label>
                <Select value={formData.managerId || "none"} onValueChange={v => updateField("managerId", v)} disabled={!editing}>
                  <SelectTrigger data-testid="select-manager">
                    <SelectValue placeholder="Select manager..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not assigned</SelectItem>
                    {organizers.map((o: OrganizerAccount) => (
                      <SelectItem key={o.accountId} value={String(o.accountId)}>
                        {o.account.firstName} {o.account.lastName} ({o.account.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Who should sign documents?</Label>
                <Select value={formData.signatoryId || "none"} onValueChange={v => updateField("signatoryId", v)} disabled={!editing}>
                  <SelectTrigger data-testid="select-signatory">
                    <SelectValue placeholder="Select signatory..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not assigned</SelectItem>
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
              <h2 className="text-lg font-semibold">Bank Details</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Input value={formData.bankName || ""} onChange={e => updateField("bankName", e.target.value)} disabled={!editing} data-testid="input-bank-name" />
              </div>
              <div className="space-y-2">
                <Label>Bank Address</Label>
                <Textarea value={formData.bankAddress || ""} onChange={e => updateField("bankAddress", e.target.value)} disabled={!editing} data-testid="input-bank-address" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Bank Routing Number</Label>
                  <Input value={formData.bankRoutingNumber || ""} onChange={e => updateField("bankRoutingNumber", e.target.value)} disabled={!editing} data-testid="input-routing" />
                </div>
                <div className="space-y-2">
                  <Label>Bank Swift Code</Label>
                  <Input value={formData.bankSwiftCode || ""} onChange={e => updateField("bankSwiftCode", e.target.value)} disabled={!editing} data-testid="input-swift" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Bank Account Number</Label>
                <Input value={formData.bankAccountNumber || ""} onChange={e => updateField("bankAccountNumber", e.target.value)} disabled={!editing} data-testid="input-account-number" />
              </div>
              <div className="space-y-2">
                <Label>Bank Account Name</Label>
                <Input value={formData.bankAccountName || ""} onChange={e => updateField("bankAccountName", e.target.value)} disabled={!editing} data-testid="input-account-name" />
              </div>
              <div className="space-y-2">
                <Label>For Further Credit To</Label>
                <Input value={formData.forFurtherCreditTo || ""} onChange={e => updateField("forFurtherCreditTo", e.target.value)} disabled={!editing} data-testid="input-ffc" />
              </div>
              <div className="space-y-2">
                <Label>Wiring Instructions</Label>
                <Textarea value={formData.wiringInstructions || ""} onChange={e => updateField("wiringInstructions", e.target.value)} disabled={!editing} data-testid="input-wiring" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Investment Details</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input value={formData.investmentCompanyName || ""} onChange={e => updateField("investmentCompanyName", e.target.value)} disabled={!editing} data-testid="input-company-name" />
              </div>
              <div className="space-y-2">
                <Label>Type of Investment</Label>
                <Input value={formData.investmentType || ""} onChange={e => updateField("investmentType", e.target.value)} disabled={!editing} data-testid="input-investment-type" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Total Being Raised</Label>
                  <Input type="number" step="0.01" value={formData.totalBeingRaised || "0"} onChange={e => updateField("totalBeingRaised", e.target.value)} disabled={!editing} data-testid="input-total-raised" />
                </div>
                <div className="space-y-2">
                  <Label>Minimum Investment</Label>
                  <Input type="number" step="0.01" value={formData.minimumInvestment || "0"} onChange={e => updateField("minimumInvestment", e.target.value)} disabled={!editing} data-testid="input-min-investment" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Expected Closing Date</Label>
                <Input type="date" value={formData.expectedClosingDate || ""} onChange={e => updateField("expectedClosingDate", e.target.value)} disabled={!editing} data-testid="input-closing-date" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="mt-6">
          <SpvMembersTab spvId={spvId!} orgId={spv.organizationId} canEdit={canManageOrg(spv.organizationId)} allocationMethod={spv.allocationMethod || "By Commitment"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
