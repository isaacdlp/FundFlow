import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { useLocalePath, useLocale } from "@/i18n/hooks";
import { ROUTE_PATTERNS } from "@/i18n/routes";
import type { EntityInfo, EntityOwnerInfo, AccountWithRoles, IntroductionInfo } from "@shared/types";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CountrySelect } from "@/components/country-select";
import { SearchPicker, type SearchPickerOption } from "@/components/search-picker";
import { EntityDelegations } from "@/components/account-delegations";
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
import { ArrowLeft, Pencil, Save, X as XIcon, Plus, Trash2, Building, Users, Briefcase } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

const ENTITY_TYPES = [
  "LLC", "LP", "LLP", "Non-Profit", "C-Corp", "S-Corp",
  "Trust", "IRA", "ROTH IRA", "Disregarded Entity", "Other",
];
const CURRENCIES = ["USD ($)", "EUR (\u20ac)", "GBP (\u00a3)", "CHF", "JPY (\u00a5)", "CAD ($)", "AUD ($)"];

function OwnersSection({ entityId, canEdit }: { entityId: string; canEdit: boolean }) {
  const { t } = useTranslation();
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
    enabled: canEdit,
  });

  const { data: entitiesList } = useQuery<EntityInfo[]>({
    queryKey: ["/api/entities"],
    enabled: canEdit,
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
      toast({ title: t("entityDetail.ownerAdded") });
    },
    onError: (error: Error) => {
      toast({ title: t("entityDetail.ownerAddFailed"), description: error.message, variant: "destructive" });
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
      toast({ title: t("entityDetail.ownerRemoved") });
    },
    onError: (error: Error) => {
      toast({ title: t("entityDetail.ownerRemoveFailed"), description: error.message, variant: "destructive" });
    },
  });

  const ownerOptions: SearchPickerOption[] = ownerType === "account"
    ? (accountsList ?? []).map(a => ({ value: String(a.id), label: `${a.firstName} ${a.lastName}`, detail: a.email }))
    : (entitiesList ?? []).filter(e => String(e.id) !== entityId).map(e => ({ value: String(e.id), label: e.name, detail: e.entityType }));
  const selectedOwnerLabel = ownerOptions.find(o => o.value === selectedOwnerId)?.label;

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
        <div>
          <h3 className="text-lg font-semibold">{t("entityDetail.ownersTitle")}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t("entityDetail.ownersDescription")}
          </p>
        </div>
        {canEdit && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-owner">
              <Plus className="h-4 w-4 mr-2" />
              {t("entityDetail.addOwner")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("entityDetail.addOwner")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>{t("entityDetail.ownerType")}</Label>
                <RadioGroup value={ownerType} onValueChange={v => { setOwnerType(v); setSelectedOwnerId(""); }} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="account" id="owner-account" data-testid="radio-owner-account" />
                    <Label htmlFor="owner-account" className="font-normal">{t("entityDetail.ownerAccountIndividual")}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="entity" id="owner-entity" data-testid="radio-owner-entity" />
                    <Label htmlFor="owner-entity" className="font-normal">{t("entityDetail.ownerEntityOption")}</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>{t("entityDetail.owner")}</Label>
                <SearchPicker
                  options={ownerOptions}
                  onSelect={setSelectedOwnerId}
                  selectedLabel={selectedOwnerLabel}
                  placeholder={ownerType === "account" ? t("entityDetail.selectAccountPlaceholder") : t("entityDetail.selectEntityPlaceholder")}
                  searchPlaceholder={ownerType === "account" ? t("introductions.searchPeople") : t("introductions.searchIntroduced")}
                  className="w-full"
                  data-testid="select-owner"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ownershipPercent">{t("entityDetail.ownershipOverride")}</Label>
                <Input
                  id="ownershipPercent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={ownershipPercent}
                  onChange={e => setOwnershipPercent(e.target.value)}
                  placeholder={t("entityDetail.ownershipPlaceholder")}
                  data-testid="input-ownership-percent"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-close-dialog">{t("common.close")}</Button>
                <Button
                  onClick={() => addMutation.mutate()}
                  disabled={!selectedOwnerId || addMutation.isPending}
                  data-testid="button-confirm-add-owner"
                >
                  {addMutation.isPending ? t("entityDetail.adding") : t("entityDetail.addOwner")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>}
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
                    <p className="text-sm text-muted-foreground">{t("entityDetail.unknownOwner")}</p>
                  )}
                </div>
                <div className="text-right mr-2">
                  <Badge variant="secondary">{parseFloat(owner.ownershipPercent || "0")}%</Badge>
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMutation.mutate(owner.id)}
                    disabled={removeMutation.isPending}
                    data-testid={`button-remove-owner-${owner.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("entityDetail.noOwnersAdded")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Read-only: introductions are edited from the introducer's account page. */
function IntroducersSection({ entityId }: { entityId: string }) {
  const { t } = useTranslation();
  const lp = useLocalePath();
  const { data: intros } = useQuery<IntroductionInfo[]>({
    queryKey: ["/api/entities", entityId, "introductions"],
  });

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold">{t("introductions.introducedByTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("introductions.entityHint")}</p>
      </CardHeader>
      <CardContent>
        {intros && intros.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {intros.map(i => (
              <Link key={i.id} href={`${lp("accountDetail", { id: i.introducerAccountId })}?tab=connections`}>
                <div className="flex items-center gap-2 px-2 py-1 rounded-md border bg-muted text-sm cursor-pointer" data-testid={`introducer-chip-${i.introducerAccountId}`}>
                  <span>{i.introducer ? `${i.introducer.firstName} ${i.introducer.lastName}` : "—"}</span>
                  {i.via && (
                    <span className="text-xs text-muted-foreground">
                      {t("introductions.inheritedVia", { name: `${i.via.firstName} ${i.via.lastName}` })}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("introductions.noIntroducers")}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function EntityDetail() {
  const locale = useLocale();
  const lp = useLocalePath();
  const { t } = useTranslation();
  const [, params] = useRoute(ROUTE_PATTERNS.entityDetail[locale]);
  const entityId = params?.id;
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const requestedTab = new URLSearchParams(search).get("tab") ?? "overview";
  // Owners moved into Connections; keep old ?tab=owners links working.
  const activeTab = requestedTab === "owners" ? "connections" : requestedTab;
  const [editing, setEditing] = useState(false);

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
      toast({ title: t("entityDetail.saved") });
    },
    onError: (error: Error) => {
      toast({ title: t("entityDetail.saveFailed"), description: error.message, variant: "destructive" });
    },
  });

  const deleteEntityMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/entities/${entityId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
      toast({ title: t("entities.deleted") });
      navigate(lp("entities"));
    },
    onError: (error: Error) => {
      toast({ title: t("entities.deleteFailed"), description: error.message, variant: "destructive" });
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
        <p className="text-muted-foreground">{t("entityDetail.entityNotFound")}</p>
      </div>
    );
  }

  // Observers only look; admins and managers change the entity.
  const canEdit = entity.access !== "observer";

  return (
    <div className="p-6 space-y-6">
      <Link href={lp("entities")}>
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          {t("entityDetail.back")}
        </Button>
      </Link>

      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
          <Building className="h-8 w-8" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">{t("entityDetail.entityLabel")}</p>
          <h1 className="text-2xl font-semibold" data-testid="text-entity-name">{entity.name}</h1>
          <div className="flex gap-2 mt-1 flex-wrap">
            <Badge variant="secondary">{entity.entityType}</Badge>
            <Badge variant="outline">{t("entityDetail.ownersCount", { count: entity.ownerCount })}</Badge>
            {(entity.access === "observer" || entity.access === "manager") && (
              <Badge variant="outline" data-testid="badge-delegated-access">
                {t("delegations.yourAccess", { level: t(`delegations.levels.${entity.access}`) })}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`${lp("dashboard")}?entityId=${entity.id}`}>
            <Button variant="outline" className="gap-2" data-testid="button-view-portfolio">
              <Briefcase className="h-4 w-4" />
              {t("entityDetail.viewPortfolio")}
            </Button>
          </Link>
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" data-testid="button-delete-entity">
                  <Trash2 className="h-4 w-4" />
                  {t("entities.deleteTitle")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("entities.deleteTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("entityDetail.deleteEntityConfirm", { name: entity.name })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteEntityMutation.mutate()}
                    data-testid="button-confirm-delete-entity"
                  >
                    {t("common.delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(t) => navigate(`${location}?tab=${t}`, { replace: true })}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">{t("entityDetail.tabOverview")}</TabsTrigger>
          <TabsTrigger value="connections" data-testid="tab-connections">{t("introductions.tab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="flex justify-end">
            {!canEdit ? null : !editing ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="button-edit">
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                {t("common.edit")}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleCancel} data-testid="button-cancel">
                  <XIcon className="h-3.5 w-3.5 mr-1.5" />
                  {t("common.cancel")}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save">
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {updateMutation.isPending ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            )}
          </div>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createEntity.general")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("common.name")}</Label>
                <Input value={formData.name || ""} onChange={e => updateField("name", e.target.value)} disabled={!editing} data-testid="input-name" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("createEntity.dateEstablished")}</Label>
                  <Input type="date" value={formData.dateEstablished || ""} onChange={e => updateField("dateEstablished", e.target.value)} disabled={!editing} data-testid="input-date-established" />
                </div>
                <div className="space-y-2">
                  <Label>{t("common.type")}</Label>
                  <Select value={formData.entityType || "LLC"} onValueChange={v => updateField("entityType", v)} disabled={!editing}>
                    <SelectTrigger data-testid="select-entity-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTITY_TYPES.map(et => <SelectItem key={et} value={et}>{et}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("createEntity.currency")}</Label>
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
                <Label>{t("createEntity.taxId")}</Label>
                <Input value={formData.taxId || ""} onChange={e => updateField("taxId", e.target.value)} disabled={!editing} data-testid="input-tax-id" />
              </div>
              <div className="space-y-2">
                <Label>{t("entityDetail.ownershipAllocation")}</Label>
                <RadioGroup value={formData.ownershipAllocation || "percent"} onValueChange={v => updateField("ownershipAllocation", v)} className="flex gap-4" disabled={!editing}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="capital" id="detail-capital" disabled={!editing} />
                    <Label htmlFor="detail-capital" className="font-normal">{t("createEntity.capital")}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="percent" id="detail-percent" disabled={!editing} />
                    <Label htmlFor="detail-percent" className="font-normal">{t("createEntity.percent")}</Label>
                  </div>
                </RadioGroup>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createEntity.addressSection")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("common.country")}</Label>
                <CountrySelect
                  value={formData.country || ""}
                  onValueChange={(val) => updateField("country", val)}
                  disabled={!editing}
                  data-testid="input-country"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("createEntity.street")}</Label>
                <Input value={formData.streetAddress || ""} onChange={e => updateField("streetAddress", e.target.value)} disabled={!editing} data-testid="input-street" />
              </div>
              <div className="space-y-2">
                <Label>{t("createEntity.streetContinued")}</Label>
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
              <div className="space-y-2">
                <Label>{t("createEntity.zipPostalCode")}</Label>
                <Input value={formData.zipPostalCode || ""} onChange={e => updateField("zipPostalCode", e.target.value)} disabled={!editing} data-testid="input-zip" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createEntity.disbursementPreference")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("entityDetail.disbursementMethod")}</Label>
                <RadioGroup value={formData.disbursementMethod || "wire_transfer"} onValueChange={v => updateField("disbursementMethod", v)} className="flex gap-4" disabled={!editing}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="wire_transfer" id="detail-wire" disabled={!editing} />
                    <Label htmlFor="detail-wire" className="font-normal">{t("createEntity.wireTransfer")}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="check" id="detail-check" disabled={!editing} />
                    <Label htmlFor="detail-check" className="font-normal">{t("createEntity.check")}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="other" id="detail-other" disabled={!editing} />
                    <Label htmlFor="detail-other" className="font-normal">{t("createEntity.other")}</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>{t("createEntity.bankName")}</Label>
                <Input value={formData.bankName || ""} onChange={e => updateField("bankName", e.target.value)} disabled={!editing} data-testid="input-bank-name" />
              </div>
              <div className="space-y-2">
                <Label>{t("createEntity.bankAddress")}</Label>
                <Textarea value={formData.bankAddress || ""} onChange={e => updateField("bankAddress", e.target.value)} disabled={!editing} data-testid="input-bank-address" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("createEntity.bankRoutingNumber")}</Label>
                  <Input value={formData.bankRoutingNumber || ""} onChange={e => updateField("bankRoutingNumber", e.target.value)} disabled={!editing} data-testid="input-routing" />
                </div>
                <div className="space-y-2">
                  <Label>{t("createEntity.bankSwiftCode")}</Label>
                  <Input value={formData.bankSwiftCode || ""} onChange={e => updateField("bankSwiftCode", e.target.value)} disabled={!editing} data-testid="input-swift" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("createEntity.bankAccountNumber")}</Label>
                <Input value={formData.bankAccountNumber || ""} onChange={e => updateField("bankAccountNumber", e.target.value)} disabled={!editing} data-testid="input-account-number" />
              </div>
              <div className="space-y-2">
                <Label>{t("createEntity.bankAccountName")}</Label>
                <Input value={formData.bankAccountName || ""} onChange={e => updateField("bankAccountName", e.target.value)} disabled={!editing} data-testid="input-account-name" />
              </div>
              <div className="space-y-2">
                <Label>{t("createEntity.forFurtherCreditTo")}</Label>
                <Input value={formData.forFurtherCreditTo || ""} onChange={e => updateField("forFurtherCreditTo", e.target.value)} disabled={!editing} data-testid="input-ffc" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="connections" className="mt-6 space-y-10">
          <section className="space-y-4" data-testid="section-delegation">
            <h2 className="text-xl font-semibold">{t("delegations.section")}</h2>
            <EntityDelegations entityId={entity.id} canEdit={canEdit} />
          </section>
          <section className="space-y-4" data-testid="section-owners">
            <h2 className="text-xl font-semibold">{t("entityDetail.tabOwners")}</h2>
            <OwnersSection entityId={entityId!} canEdit={canEdit} />
          </section>
          {isAdmin && (
            <section className="space-y-4" data-testid="section-introductions">
              <h2 className="text-xl font-semibold">{t("introductions.section")}</h2>
              <IntroducersSection entityId={entityId!} />
            </section>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
