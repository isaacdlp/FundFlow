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
import { BanksTab, CredentialsTab } from "@/components/profile-tabs";
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
import { MAX_NAMED_OWNER_PERCENT } from "@shared/schema";

const ENTITY_TYPES = [
  "LLC", "LP", "LLP", "Non-Profit", "Corporation", "C-Corp", "S-Corp",
  "Trust", "IRA", "ROTH IRA", "Plan", "Disregarded Entity", "Other",
];
const CURRENCIES = ["USD ($)", "EUR (\u20ac)", "GBP (\u00a3)", "CHF", "JPY (\u00a5)", "CAD ($)", "AUD ($)"];

const NONE = "none";

function entityToForm(entity: EntityInfo): Record<string, string> {
  return {
    code: entity.code || "",
    name: entity.name || "",
    entityType: entity.entityType || "LLC",
    dateEstablished: entity.dateEstablished || "",
    currency: entity.currency || "USD ($)",
    taxId: entity.taxId || "",
    taxType: entity.taxType || "",
    fatcaType: entity.fatcaType || "",
    jurisdiction: entity.jurisdiction || "",
    phone: entity.phone || "",
    website: entity.website || "",
    signatoryAccountId: entity.signatoryAccountId ? String(entity.signatoryAccountId) : NONE,
    signatoryTitle: entity.signatoryTitle || "",
    disregardedToEntityId: entity.disregardedToEntityId ? String(entity.disregardedToEntityId) : NONE,
    ownershipAllocation: entity.ownershipAllocation || "percent",
    country: entity.country || "",
    streetAddress: entity.streetAddress || "",
    streetAddress2: entity.streetAddress2 || "",
    city: entity.city || "",
    stateProvince: entity.stateProvince || "",
    zipPostalCode: entity.zipPostalCode || "",
    mailingStreetAddress1: entity.mailingStreetAddress1 || "",
    mailingStreetAddress2: entity.mailingStreetAddress2 || "",
    mailingCountry: entity.mailingCountry || "",
    mailingCity: entity.mailingCity || "",
    mailingStateProvince: entity.mailingStateProvince || "",
    mailingZipPostalCode: entity.mailingZipPostalCode || "",
  };
}

function OwnersSection({ entityId, canEdit }: { entityId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ownerType, setOwnerType] = useState("account");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const { isAdmin } = useAuth();
  const [linking, setLinking] = useState<number | null>(null);
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
      if (ownerType === "person") {
        payload.ownerName = ownerName;
      } else if (ownerType === "account") {
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
      setOwnerName("");
      setOwnershipPercent("0");
      toast({ title: t("entityDetail.ownerAdded") });
    },
    onError: (error: Error) => {
      toast({ title: t("entityDetail.ownerAddFailed"), description: error.message, variant: "destructive" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ ownerId, accountId }: { ownerId: number; accountId: number }) => {
      const res = await apiRequest("PATCH", `/api/entities/${entityId}/owners/${ownerId}`, { ownerAccountId: accountId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId, "owners"] });
      setLinking(null);
      toast({ title: t("profile.ownerLinked") });
    },
    onError: (error: Error) => {
      toast({ title: t("profile.ownerLinkFailed"), description: error.message, variant: "destructive" });
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
    ? (accountsList ?? []).map(a => ({ value: String(a.id), label: `${a.firstName} ${a.lastName}`, detail: a.email ?? undefined }))
    : (entitiesList ?? []).filter(e => String(e.id) !== entityId).map(e => ({ value: String(e.id), label: e.name, detail: e.entityType }));
  const selectedOwnerLabel = ownerOptions.find(o => o.value === selectedOwnerId)?.label;

  const ownerAccountOptions: SearchPickerOption[] = (accountsList ?? []).map(a => (
    { value: String(a.id), label: `${a.firstName} ${a.lastName}`, detail: a.email ?? undefined }));

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
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="person" id="owner-person" data-testid="radio-owner-person" />
                    <Label htmlFor="owner-person" className="font-normal">{t("profile.ownerNameOnly")}</Label>
                  </div>
                </RadioGroup>
              </div>

              {ownerType === "person" ? (
              <div className="space-y-2">
                <Label htmlFor="ownerName">{t("common.name")}</Label>
                <Input id="ownerName" value={ownerName} onChange={e => setOwnerName(e.target.value)} data-testid="input-owner-name" />
                <p className="text-xs text-muted-foreground">{t("profile.ownerNameLimit", { percent: MAX_NAMED_OWNER_PERCENT })}</p>
              </div>
              ) : (
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
              )}

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
                  disabled={(ownerType === "person" ? !ownerName.trim() || parseFloat(ownershipPercent) > MAX_NAMED_OWNER_PERCENT : !selectedOwnerId) || addMutation.isPending}
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
                  {owner.ownerType === "person" ? (
                    <Users className="h-4 w-4" />
                  ) : owner.ownerType === "account" ? (
                    <span className="text-sm font-semibold">
                      {owner.ownerAccount ? `${owner.ownerAccount.firstName[0]}${owner.ownerAccount.lastName[0]}` : "?"}
                    </span>
                  ) : (
                    <Building className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {owner.ownerType === "person" ? (
                    <>
                      <p className="text-sm font-medium truncate" data-testid={`text-owner-name-${owner.id}`}>{owner.ownerName}</p>
                      <p className="text-xs text-muted-foreground truncate">{t("profile.ownerNotRegistered")}</p>
                      {isAdmin && linking === owner.id && (
                        <SearchPicker
                          options={ownerAccountOptions}
                          onSelect={v => linkMutation.mutate({ ownerId: owner.id, accountId: parseInt(v) })}
                          placeholder={t("entityDetail.selectAccountPlaceholder")}
                          searchPlaceholder={t("introductions.searchPeople")}
                          className="w-full mt-2"
                          data-testid={`select-link-owner-${owner.id}`}
                        />
                      )}
                    </>
                  ) : owner.ownerType === "account" && owner.ownerAccount ? (
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
                {isAdmin && owner.ownerType === "person" && (
                  <Button variant="outline" size="sm" onClick={() => setLinking(linking === owner.id ? null : owner.id)} data-testid={`button-link-owner-${owner.id}`}>
                    {t("profile.linkToAccount")}
                  </Button>
                )}
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
  const { data: otherEntities } = useQuery<EntityInfo[]>({ queryKey: ["/api/entities"], enabled: editing });

  useEffect(() => {
    if (entity) {
      setFormData(entityToForm(entity));
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
    if (!payload.code) delete payload.code;
    payload.signatoryAccountId = formData.signatoryAccountId === NONE ? null : parseInt(formData.signatoryAccountId, 10);
    payload.disregardedToEntityId = formData.disregardedToEntityId === NONE ? null : parseInt(formData.disregardedToEntityId, 10);
    updateMutation.mutate(payload);
  };

  const handleCancel = () => {
    if (entity) {
      setFormData(entityToForm(entity));
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
          <TabsTrigger value="credentials" data-testid="tab-credentials">{t("profile.credentials")}</TabsTrigger>
          <TabsTrigger value="banks" data-testid="tab-banks">{t("profile.banks")}</TabsTrigger>
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
                <Label>{t("profile.accountId")}</Label>
                <Input value={formData.code || ""} onChange={e => updateField("code", e.target.value.toUpperCase())} disabled={!editing || !isAdmin} maxLength={8} data-testid="input-entity-code" />
              </div>
              <div className="space-y-2">
                <Label>{t("createEntity.taxId")}</Label>
                <Input value={formData.taxId || ""} onChange={e => updateField("taxId", e.target.value)} disabled={!editing} data-testid="input-tax-id" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("profile.taxType")}</Label>
                  <Input value={formData.taxType || ""} onChange={e => updateField("taxType", e.target.value)} disabled={!editing} data-testid="input-tax-type" />
                </div>
                <div className="space-y-2">
                  <Label>{t("profile.fatcaType")}</Label>
                  <Input value={formData.fatcaType || ""} onChange={e => updateField("fatcaType", e.target.value)} disabled={!editing} data-testid="input-fatca-type" />
                </div>
                <div className="space-y-2">
                  <Label>{t("profile.jurisdiction")}</Label>
                  <CountrySelect value={formData.jurisdiction || ""} onValueChange={val => updateField("jurisdiction", val)} disabled={!editing} data-testid="input-jurisdiction" />
                </div>
                <div className="space-y-2">
                  <Label>{t("common.phone")}</Label>
                  <Input value={formData.phone || ""} onChange={e => updateField("phone", e.target.value)} disabled={!editing} data-testid="input-entity-phone" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("profile.website")}</Label>
                <Input value={formData.website || ""} onChange={e => updateField("website", e.target.value)} disabled={!editing} data-testid="input-website" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("profile.signatory")}</Label>
                  <Select value={formData.signatoryAccountId || NONE} onValueChange={v => updateField("signatoryAccountId", v)} disabled={!editing}>
                    <SelectTrigger data-testid="select-signatory"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("profile.none")}</SelectItem>
                      {entity.managers.map(m => (
                        <SelectItem key={m.accountId} value={String(m.accountId)}>{m.account.firstName} {m.account.lastName}</SelectItem>
                      ))}
                      {entity.signatory && !entity.managers.some(m => m.accountId === entity.signatory!.id) && (
                        <SelectItem value={String(entity.signatory.id)}>{entity.signatory.firstName} {entity.signatory.lastName}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("profile.signatoryTitle")}</Label>
                  <Input value={formData.signatoryTitle || ""} onChange={e => updateField("signatoryTitle", e.target.value)} disabled={!editing} data-testid="input-signatory-title" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("profile.disregardedTo")}</Label>
                <Select value={formData.disregardedToEntityId || NONE} onValueChange={v => updateField("disregardedToEntityId", v)} disabled={!editing}>
                  <SelectTrigger data-testid="select-disregarded-to"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("profile.none")}</SelectItem>
                    {(otherEntities ?? []).filter(e => e.id !== entity.id).map(e => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                    ))}
                    {!otherEntities && entity.disregardedToEntityId && (
                      <SelectItem value={String(entity.disregardedToEntityId)}>#{entity.disregardedToEntityId}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
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
              <h3 className="font-medium pt-2">{t("profile.mailingAddress")}</h3>
              <div className="space-y-2">
                <Label>{t("common.country")}</Label>
                <CountrySelect value={formData.mailingCountry || ""} onValueChange={val => updateField("mailingCountry", val)} disabled={!editing} data-testid="input-mailing-country" />
              </div>
              {([["mailingStreetAddress1", "createEntity.street"], ["mailingStreetAddress2", "createEntity.streetContinued"], ["mailingCity", "common.city"], ["mailingStateProvince", "common.state"], ["mailingZipPostalCode", "createEntity.zipPostalCode"]] as const).map(([field, label]) => (
                <div key={field} className="space-y-2">
                  <Label>{t(label)}</Label>
                  <Input value={formData[field] || ""} onChange={e => updateField(field, e.target.value)} disabled={!editing} data-testid={`input-${field}`} />
                </div>
              ))}
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="credentials" className="mt-6">
          <CredentialsTab kind="entity" profile={entity} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="banks" className="mt-6">
          <BanksTab kind="entity" profile={entity} canEdit={canEdit} isAdmin={isAdmin} />
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
