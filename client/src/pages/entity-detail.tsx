import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import type { EntityInfo, EntityOwnerInfo, EntityManagerInfo, AccountWithRoles } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, Pencil, Save, X as XIcon, Plus, Trash2, Building, Users, UserPlus, Briefcase } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

const ENTITY_TYPES = [
  "LLC", "LP", "LLP", "Non-Profit", "C-Corp", "S-Corp",
  "Trust", "IRA", "ROTH IRA", "Disregarded Entity", "Other",
];
const CURRENCIES = ["USD ($)", "EUR (\u20ac)", "GBP (\u00a3)", "CHF", "JPY (\u00a5)", "CAD ($)", "AUD ($)"];

function OwnersTab({ entityId }: { entityId: string }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ownerType, setOwnerType] = useState("account");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [ownershipPercent, setOwnershipPercent] = useState("0");

  const { data: owners, isLoading } = useQuery<EntityOwnerInfo[]>({
    queryKey: ["/api/entities", entityId, "owners"],
  });

  const { data: accountsList } = useQuery<AccountWithRoles[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: entitiesList } = useQuery<EntityInfo[]>({
    queryKey: ["/api/entities"],
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        ownerType,
        ownershipPercent,
      };
      if (ownerType === "account") {
        payload.ownerAccountId = parseInt(selectedOwnerId);
      } else {
        payload.ownerEntityId = parseInt(selectedOwnerId);
      }
      const res = await apiRequest("POST", `/api/entities/${entityId}/owners`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId, "owners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId] });
      setDialogOpen(false);
      setSelectedOwnerId("");
      setOwnershipPercent("0");
      toast({ title: "Owner added" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add owner", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (ownerId: number) => {
      const res = await apiRequest("DELETE", `/api/entities/${entityId}/owners/${ownerId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId, "owners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId] });
      toast({ title: "Owner removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove owner", description: error.message, variant: "destructive" });
    },
  });

  const otherEntities = entitiesList?.filter(e => String(e.id) !== entityId) || [];

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
        <div>
          <h2 className="text-lg font-semibold">Owners</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Accounts or entities that own a share of this entity
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-owner">
              <Plus className="h-4 w-4 mr-2" />
              Add Owner
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Owner</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Owner Type</Label>
                <RadioGroup value={ownerType} onValueChange={v => { setOwnerType(v); setSelectedOwnerId(""); }} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="account" id="owner-account" data-testid="radio-owner-account" />
                    <Label htmlFor="owner-account" className="font-normal">Account (Individual)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="entity" id="owner-entity" data-testid="radio-owner-entity" />
                    <Label htmlFor="owner-entity" className="font-normal">Entity</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Owner</Label>
                <Select value={selectedOwnerId} onValueChange={setSelectedOwnerId}>
                  <SelectTrigger data-testid="select-owner">
                    <SelectValue placeholder={ownerType === "account" ? "Select an account..." : "Select an entity..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {ownerType === "account" ? (
                      accountsList?.map(a => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.firstName} {a.lastName} ({a.email})
                        </SelectItem>
                      ))
                    ) : (
                      otherEntities.map(e => (
                        <SelectItem key={e.id} value={String(e.id)}>
                          {e.name} ({e.entityType})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ownershipPercent">Ownership Override</Label>
                <Input
                  id="ownershipPercent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={ownershipPercent}
                  onChange={e => setOwnershipPercent(e.target.value)}
                  placeholder="0%"
                  data-testid="input-ownership-percent"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-close-dialog">Close</Button>
                <Button
                  onClick={() => addMutation.mutate()}
                  disabled={!selectedOwnerId || addMutation.isPending}
                  data-testid="button-confirm-add-owner"
                >
                  {addMutation.isPending ? "Adding..." : "Add Owner"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {owners && owners.length > 0 ? (
          <div className="space-y-3">
            {owners.map(owner => (
              <div key={owner.id} className="flex items-center gap-3 p-3 rounded-md border" data-testid={`owner-row-${owner.id}`}>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                  {owner.ownerType === "account" ? (
                    <span className="text-sm font-semibold">
                      {owner.ownerAccount ? `${owner.ownerAccount.firstName[0]}${owner.ownerAccount.lastName[0]}` : "?"}
                    </span>
                  ) : (
                    <Building className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {owner.ownerType === "account" && owner.ownerAccount ? (
                    <>
                      <p className="text-sm font-medium truncate">
                        {owner.ownerAccount.firstName} {owner.ownerAccount.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{owner.ownerAccount.email}</p>
                    </>
                  ) : owner.ownerType === "entity" && owner.ownerEntity ? (
                    <>
                      <p className="text-sm font-medium truncate">{owner.ownerEntity.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{owner.ownerEntity.entityType}</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Unknown owner</p>
                  )}
                </div>
                <div className="text-right mr-2">
                  <Badge variant="secondary">{parseFloat(owner.ownershipPercent || "0")}%</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeMutation.mutate(owner.id)}
                  disabled={removeMutation.isPending}
                  data-testid={`button-remove-owner-${owner.id}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No owners added yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ManagersSection({ entityId, editing }: { entityId: string; editing: boolean }) {
  const { toast } = useToast();

  const { data: managers } = useQuery<EntityManagerInfo[]>({
    queryKey: ["/api/entities", entityId, "managers"],
  });

  const { data: accountsList } = useQuery<AccountWithRoles[]>({
    queryKey: ["/api/accounts"],
  });

  const addMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const res = await apiRequest("POST", `/api/entities/${entityId}/managers`, { accountId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId, "managers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId] });
      toast({ title: "Manager added" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add manager", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const res = await apiRequest("DELETE", `/api/entities/${entityId}/managers/${accountId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId, "managers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId] });
      toast({ title: "Manager removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove manager", description: error.message, variant: "destructive" });
    },
  });

  const availableAccounts = accountsList?.filter(a => !managers?.some(m => m.accountId === a.id)) || [];

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Administration</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Managers</Label>
          {editing && (
            <Select onValueChange={v => addMutation.mutate(parseInt(v))}>
              <SelectTrigger data-testid="select-add-manager">
                <SelectValue placeholder="Add a manager..." />
              </SelectTrigger>
              <SelectContent>
                {availableAccounts.map(a => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.firstName} {a.lastName} ({a.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {managers && managers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {managers.map(m => (
              <div key={m.id} className="flex items-center gap-1 px-2 py-1 rounded-md border bg-muted text-sm" data-testid={`manager-chip-${m.accountId}`}>
                <span>{m.account.firstName} {m.account.lastName}</span>
                {editing && (
                  <button onClick={() => removeMutation.mutate(m.accountId)} className="ml-1 hover:text-destructive" data-testid={`button-remove-manager-${m.accountId}`}>
                    <XIcon className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No managers assigned</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function EntityDetail() {
  const [, params] = useRoute("/entities/:id");
  const entityId = params?.id;
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: entity, isLoading } = useQuery<EntityInfo>({
    queryKey: ["/api/entities", entityId],
    enabled: !!entityId,
  });

  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    if (entity) {
      setFormData({
        name: entity.name || "",
        entityType: entity.entityType || "LLC",
        dateEstablished: entity.dateEstablished || "",
        currency: entity.currency || "USD ($)",
        taxId: entity.taxId || "",
        ownershipAllocation: entity.ownershipAllocation || "percent",
        country: entity.country || "",
        streetAddress: entity.streetAddress || "",
        streetAddress2: entity.streetAddress2 || "",
        city: entity.city || "",
        stateProvince: entity.stateProvince || "",
        zipPostalCode: entity.zipPostalCode || "",
        disbursementMethod: entity.disbursementMethod || "wire_transfer",
        bankName: entity.bankName || "",
        bankAddress: entity.bankAddress || "",
        bankRoutingNumber: entity.bankRoutingNumber || "",
        bankSwiftCode: entity.bankSwiftCode || "",
        bankAccountNumber: entity.bankAccountNumber || "",
        bankAccountName: entity.bankAccountName || "",
        forFurtherCreditTo: entity.forFurtherCreditTo || "",
      });
    }
  }, [entity]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/entities/${entityId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId] });
      setEditing(false);
      toast({ title: "Entity updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update entity", description: error.message, variant: "destructive" });
    },
  });

  const deleteEntityMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/entities/${entityId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
      toast({ title: "Entity deleted" });
      navigate("/entities");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete entity", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const payload: Record<string, unknown> = { ...formData };
    if (!payload.dateEstablished) payload.dateEstablished = null;
    updateMutation.mutate(payload);
  };

  const handleCancel = () => {
    if (entity) {
      setFormData({
        name: entity.name || "",
        entityType: entity.entityType || "LLC",
        dateEstablished: entity.dateEstablished || "",
        currency: entity.currency || "USD ($)",
        taxId: entity.taxId || "",
        ownershipAllocation: entity.ownershipAllocation || "percent",
        country: entity.country || "",
        streetAddress: entity.streetAddress || "",
        streetAddress2: entity.streetAddress2 || "",
        city: entity.city || "",
        stateProvince: entity.stateProvince || "",
        zipPostalCode: entity.zipPostalCode || "",
        disbursementMethod: entity.disbursementMethod || "wire_transfer",
        bankName: entity.bankName || "",
        bankAddress: entity.bankAddress || "",
        bankRoutingNumber: entity.bankRoutingNumber || "",
        bankSwiftCode: entity.bankSwiftCode || "",
        bankAccountNumber: entity.bankAccountNumber || "",
        bankAccountName: entity.bankAccountName || "",
        forFurtherCreditTo: entity.forFurtherCreditTo || "",
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

  if (!entity) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Entity not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Link href="/entities">
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          Back to Entities
        </Button>
      </Link>

      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
          <Building className="h-8 w-8" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">Entity</p>
          <h1 className="text-2xl font-semibold" data-testid="text-entity-name">{entity.name}</h1>
          <div className="flex gap-2 mt-1 flex-wrap">
            <Badge variant="secondary">{entity.entityType}</Badge>
            <Badge variant="outline">{entity.ownerCount} Owner{entity.ownerCount !== 1 ? "s" : ""}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/?entityId=${entity.id}`}>
            <Button variant="outline" className="gap-2" data-testid="button-view-portfolio">
              <Briefcase className="h-4 w-4" />
              View Portfolio
            </Button>
          </Link>
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" data-testid="button-delete-entity">
                  <Trash2 className="h-4 w-4" />
                  Delete Entity
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Entity</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete <strong>{entity.name}</strong>? This will also remove all owner and manager records associated with it. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteEntityMutation.mutate()}
                    data-testid="button-confirm-delete-entity"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="owners" data-testid="tab-owners">Owners</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="flex justify-end">
            {!editing ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="button-edit">
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleCancel} data-testid="button-cancel">
                  <XIcon className="h-3.5 w-3.5 mr-1.5" />
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
              <h2 className="text-lg font-semibold">General Information</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={formData.name || ""} onChange={e => updateField("name", e.target.value)} disabled={!editing} data-testid="input-name" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date Established</Label>
                  <Input type="date" value={formData.dateEstablished || ""} onChange={e => updateField("dateEstablished", e.target.value)} disabled={!editing} data-testid="input-date-established" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={formData.entityType || "LLC"} onValueChange={v => updateField("entityType", v)} disabled={!editing}>
                    <SelectTrigger data-testid="select-entity-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
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
              <div className="space-y-2">
                <Label>Tax ID</Label>
                <Input value={formData.taxId || ""} onChange={e => updateField("taxId", e.target.value)} disabled={!editing} data-testid="input-tax-id" />
              </div>
              <div className="space-y-2">
                <Label>Ownership Allocation</Label>
                <RadioGroup value={formData.ownershipAllocation || "percent"} onValueChange={v => updateField("ownershipAllocation", v)} className="flex gap-4" disabled={!editing}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="capital" id="detail-capital" disabled={!editing} />
                    <Label htmlFor="detail-capital" className="font-normal">Capital</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="percent" id="detail-percent" disabled={!editing} />
                    <Label htmlFor="detail-percent" className="font-normal">Percent</Label>
                  </div>
                </RadioGroup>
              </div>
            </CardContent>
          </Card>

          <ManagersSection entityId={entityId!} editing={editing} />

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
                <Label>Street (continued)</Label>
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
              <div className="space-y-2">
                <Label>Zip / Postal Code</Label>
                <Input value={formData.zipPostalCode || ""} onChange={e => updateField("zipPostalCode", e.target.value)} disabled={!editing} data-testid="input-zip" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Disbursement Preference</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Disbursement Method</Label>
                <RadioGroup value={formData.disbursementMethod || "wire_transfer"} onValueChange={v => updateField("disbursementMethod", v)} className="flex gap-4" disabled={!editing}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="wire_transfer" id="detail-wire" disabled={!editing} />
                    <Label htmlFor="detail-wire" className="font-normal">Wire Transfer</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="check" id="detail-check" disabled={!editing} />
                    <Label htmlFor="detail-check" className="font-normal">Check</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="other" id="detail-other" disabled={!editing} />
                    <Label htmlFor="detail-other" className="font-normal">Other</Label>
                  </div>
                </RadioGroup>
              </div>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="owners" className="mt-6">
          <OwnersTab entityId={entityId!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
