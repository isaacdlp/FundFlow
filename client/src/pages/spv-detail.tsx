import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import type { SpvInfo, SpvMemberInfo, MemberInfo, OrganizerAccount } from "@shared/types";
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

const ENTITY_TYPES = ["LLC", "LP", "Corporation", "Trust", "Other"];
const ALLOCATION_METHODS = ["By capital invested", "Pro rata", "Custom"];
const CURRENCIES = ["USD ($)", "EUR (\u20ac)", "GBP (\u00a3)", "CHF", "JPY (\u00a5)", "CAD ($)", "AUD ($)"];

function formatCurrency(value: string | null): string {
  const num = parseFloat(value || "0");
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SpvMembersTab({ spvId, orgId }: { spvId: string; orgId: number }) {
  const { toast } = useToast();
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [newInitialValue, setNewInitialValue] = useState("");
  const [newCurrentValue, setNewCurrentValue] = useState("");
  const [newDistributions, setNewDistributions] = useState("");
  const [newPurchaseDate, setNewPurchaseDate] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ initialValue: string; currentValue: string; distributions: string; purchaseDate: string }>({ initialValue: "", currentValue: "", distributions: "", purchaseDate: "" });

  const { data: spvMembers, isLoading: membersLoading } = useQuery<SpvMemberInfo[]>({
    queryKey: ["/api/spvs", spvId, "members"],
  });

  const { data: orgMembers } = useQuery<MemberInfo[]>({
    queryKey: ["/api/organizations", String(orgId), "members"],
  });

  const approvedOrgMembers = orgMembers?.filter(m => m.status === "approved") || [];
  const availableMembers = approvedOrgMembers.filter(
    om => !spvMembers?.some(sm => sm.accountId === om.accountId)
  );

  const addMutation = useMutation({
    mutationFn: async (payload: { accountId: number; initialValue: string; currentValue: string; distributions: string; purchaseDate: string | null }) => {
      const res = await apiRequest("POST", `/api/spvs/${spvId}/members`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      setSelectedMemberId("");
      setNewInitialValue(""); setNewCurrentValue(""); setNewDistributions(""); setNewPurchaseDate("");
      toast({ title: "Member added to SPV" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add member", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { accountId: number; initialValue: string; currentValue: string; distributions: string; purchaseDate: string | null }) => {
      const { accountId, ...rest } = payload;
      const res = await apiRequest("PATCH", `/api/spvs/${spvId}/members/${accountId}`, rest);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      setEditingMemberId(null);
      toast({ title: "Investment updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update investment", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const res = await apiRequest("DELETE", `/api/spvs/${spvId}/members/${accountId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spvs", spvId] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      toast({ title: "Member removed from SPV" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove member", description: error.message, variant: "destructive" });
    },
  });

  const startEdit = (m: SpvMemberInfo) => {
    setEditingMemberId(m.accountId);
    setEditValues({
      initialValue: m.initialValue || "0",
      currentValue: m.currentValue || "0",
      distributions: m.distributions || "0",
      purchaseDate: m.purchaseDate || "",
    });
  };

  if (membersLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
        <div>
          <h2 className="text-lg font-semibold">SPV Members</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add approved organization members to this SPV
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3 p-4 rounded-md border bg-muted/30">
          <div className="space-y-2">
            <Label>Investor</Label>
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger data-testid="select-spv-member">
                <SelectValue placeholder="Select an approved organization member..." />
              </SelectTrigger>
              <SelectContent>
                {availableMembers.length > 0 ? (
                  availableMembers.map(m => (
                    <SelectItem key={m.accountId} value={String(m.accountId)}>
                      {m.account.firstName} {m.account.lastName} ({m.account.email})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>No available members</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Initial Value</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newInitialValue} onChange={e => setNewInitialValue(e.target.value)} data-testid="input-new-initial-value" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Current Value</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newCurrentValue} onChange={e => setNewCurrentValue(e.target.value)} data-testid="input-new-current-value" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Distributions</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newDistributions} onChange={e => setNewDistributions(e.target.value)} data-testid="input-new-distributions" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Purchase Date</Label>
              <Input type="date" value={newPurchaseDate} onChange={e => setNewPurchaseDate(e.target.value)} data-testid="input-new-purchase-date" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => selectedMemberId && addMutation.mutate({
                accountId: parseInt(selectedMemberId),
                initialValue: newInitialValue || "0",
                currentValue: newCurrentValue || newInitialValue || "0",
                distributions: newDistributions || "0",
                purchaseDate: newPurchaseDate || null,
              })}
              disabled={!selectedMemberId || addMutation.isPending}
              data-testid="button-add-spv-member"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {addMutation.isPending ? "Adding..." : "Add Investment"}
            </Button>
          </div>
        </div>

        <Separator />

        {spvMembers && spvMembers.length > 0 ? (
          <div className="space-y-3">
            {spvMembers.map(member => {
              const isEditing = editingMemberId === member.accountId;
              const initial = parseFloat(member.initialValue || "0");
              const current = parseFloat(member.currentValue || "0");
              const dist = parseFloat(member.distributions || "0");
              const roi = initial > 0 ? ((current + dist - initial) / initial) * 100 : 0;
              return (
                <div key={member.id} className="p-3 rounded-md border" data-testid={`spv-member-${member.accountId}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
                      {member.account.firstName[0]}{member.account.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{member.account.firstName} {member.account.lastName}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.account.email}</p>
                    </div>
                    {!isEditing && (
                      <Button variant="ghost" size="icon" onClick={() => startEdit(member)} data-testid={`button-edit-spv-member-${member.accountId}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMutation.mutate(member.accountId)}
                      disabled={removeMutation.isPending}
                      data-testid={`button-remove-spv-member-${member.accountId}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {isEditing ? (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Initial Value</Label>
                          <Input type="number" step="0.01" value={editValues.initialValue} onChange={e => setEditValues(v => ({ ...v, initialValue: e.target.value }))} data-testid={`input-edit-initial-${member.accountId}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Current Value</Label>
                          <Input type="number" step="0.01" value={editValues.currentValue} onChange={e => setEditValues(v => ({ ...v, currentValue: e.target.value }))} data-testid={`input-edit-current-${member.accountId}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Distributions</Label>
                          <Input type="number" step="0.01" value={editValues.distributions} onChange={e => setEditValues(v => ({ ...v, distributions: e.target.value }))} data-testid={`input-edit-dist-${member.accountId}`} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Purchase Date</Label>
                          <Input type="date" value={editValues.purchaseDate} onChange={e => setEditValues(v => ({ ...v, purchaseDate: e.target.value }))} data-testid={`input-edit-date-${member.accountId}`} />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingMemberId(null)} data-testid={`button-cancel-edit-${member.accountId}`}>
                          <X className="h-4 w-4 mr-1" /> Cancel
                        </Button>
                        <Button size="sm" onClick={() => updateMutation.mutate({ accountId: member.accountId, ...editValues, purchaseDate: editValues.purchaseDate || null })} disabled={updateMutation.isPending} data-testid={`button-save-edit-${member.accountId}`}>
                          <Save className="h-4 w-4 mr-1" /> {updateMutation.isPending ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">Initial</p>
                        <p className="font-medium" data-testid={`text-initial-${member.accountId}`}>${formatCurrency(member.initialValue)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Current</p>
                        <p className="font-medium" data-testid={`text-current-${member.accountId}`}>${formatCurrency(member.currentValue)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Distributions</p>
                        <p className="font-medium">${formatCurrency(member.distributions)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">ROI</p>
                        <p className={`font-medium ${roi >= 0 ? "text-emerald-600" : "text-red-600"}`}>{roi.toFixed(2)}%</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Purchase Date</p>
                        <p className="font-medium">{member.purchaseDate || "—"}</p>
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
              No investments yet. Add an approved organization member above.
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
        allocationMethod: spv.allocationMethod || "By capital invested",
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
        allocationMethod: spv.allocationMethod || "By capital invested",
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
                <Select value={formData.allocationMethod || "By capital invested"} onValueChange={v => updateField("allocationMethod", v)} disabled={!editing}>
                  <SelectTrigger data-testid="select-allocation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALLOCATION_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
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
          <SpvMembersTab spvId={spvId!} orgId={spv.organizationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
