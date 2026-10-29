import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useLocalePath, useLocale } from "@/i18n/hooks";
import { ROUTE_PATTERNS } from "@/i18n/routes";
import type { OrganizationWithOrganizers, OrganizerAccount, CurrencyInfo } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const ENTITY_TYPES = ["LLC", "LP", "Corporation", "Trust", "Other"];
const ALLOCATION_METHODS = ["By Commitment", "By Capital Invested", "Custom"] as const;
const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming",
];

export default function CreateVehicle() {
  const [, params] = useRoute(ROUTE_PATTERNS.organizationVehicleNew[useLocale()]);
  const orgId = params?.orgId;
  const [, navigate] = useLocation();
  const lp = useLocalePath();
  const { t } = useTranslation();
  const { toast } = useToast();

  const allocationLabel = (m: string) => {
    if (m === "By Commitment") return t("createVehicle.allocationByCommitment");
    if (m === "By Capital Invested") return t("createVehicle.allocationByCapital");
    if (m === "Custom") return t("createVehicle.allocationCustom");
    return m;
  };
  const allocationHelp = (m: string) => {
    if (m === "By Commitment") return t("createVehicle.allocationHelpByCommitment");
    if (m === "By Capital Invested") return t("createVehicle.allocationHelpByCapital");
    if (m === "Custom") return t("createVehicle.allocationHelpCustom");
    return "";
  };

  const { data: org, isLoading: orgLoading } = useQuery<OrganizationWithOrganizers>({
    queryKey: ["/api/organizations", orgId],
    enabled: !!orgId,
  });

  const { data: currencies } = useQuery<CurrencyInfo[]>({
    queryKey: ["/api/currencies"],
  });
  const activeCurrencies = (currencies ?? []).filter(c => c.active);

  const [form, setForm] = useState({
    legalName: "",
    displayName: "",
    entityType: "LLC",
    stateOfIncorporation: "",
    ein: "",
    dateEstablished: "",
    dateEnded: "",
    allocationMethod: "By Commitment",
    currency: "USD",
    managementFeePercent: "0",
    carriedInterestPercent: "0",
    preferredReturnPercent: "0",
    country: "United States",
    streetAddress: "",
    streetAddress2: "",
    city: "",
    stateProvince: "",
    zipPostalCode: "",
    county: "",
    managerId: "",
    signatoryId: "",
    bankName: "",
    bankAddress: "",
    bankRoutingNumber: "",
    bankSwiftCode: "",
    bankAccountNumber: "",
    bankAccountName: "",
    forFurtherCreditTo: "",
    wiringInstructions: "",
    investmentCompanyName: "",
    investmentType: "",
    totalBeingRaised: "0",
    minimumInvestment: "0",
    expectedClosingDate: "",
  });

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { ...form };
      if (payload.managerId === "" || payload.managerId === "none") payload.managerId = null;
      else payload.managerId = parseInt(payload.managerId as string);
      if (payload.signatoryId === "" || payload.signatoryId === "none") payload.signatoryId = null;
      else payload.signatoryId = parseInt(payload.signatoryId as string);
      if (!payload.dateEstablished) payload.dateEstablished = null;
      if (!payload.dateEnded) payload.dateEnded = null;
      if (!payload.expectedClosingDate) payload.expectedClosingDate = null;
      const res = await apiRequest("POST", `/api/organizations/${orgId}/vehicles`, payload);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId, "vehicles"] });
      toast({ title: t("createVehicle.successTitle") });
      navigate(lp("vehicleDetail", { id: data.id }));
    },
    onError: (error: Error) => {
      toast({ title: t("createVehicle.errorTitle"), description: error.message, variant: "destructive" });
    },
  });

  if (orgLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("createVehicle.orgNotFound")}</p>
      </div>
    );
  }

  const organizers = org.organizers || [];

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <Link href={lp("organizationDetail", { id: orgId! })}>
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          {t("createVehicle.backToOrg", { name: org.name })}
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{t("createVehicle.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("createVehicle.subtitleWithOrg", { name: org.name })}</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("createVehicle.generalStructure")}</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="legalName">{t("createVehicle.legalNameRequired")}</Label>
            <Input
              id="legalName"
              value={form.legalName}
              onChange={e => updateField("legalName", e.target.value)}
              placeholder={t("createVehicle.legalNamePlaceholder")}
              data-testid="input-legal-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">{t("createVehicle.displayNameRequired")}</Label>
            <Input
              id="displayName"
              value={form.displayName}
              onChange={e => updateField("displayName", e.target.value)}
              placeholder={t("createVehicle.displayNamePlaceholder")}
              data-testid="input-display-name"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("createVehicle.entityType")}</Label>
              <Select value={form.entityType} onValueChange={v => updateField("entityType", v)}>
                <SelectTrigger data-testid="select-entity-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map(et => (
                    <SelectItem key={et} value={et}>{et}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("createVehicle.stateOfIncorporation")}</Label>
              <Select value={form.stateOfIncorporation || "placeholder"} onValueChange={v => updateField("stateOfIncorporation", v === "placeholder" ? "" : v)}>
                <SelectTrigger data-testid="select-state-incorporation">
                  <SelectValue placeholder={t("createVehicle.selectState")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled>{t("createVehicle.selectState")}</SelectItem>
                  {US_STATES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ein">{t("createVehicle.ein")}</Label>
            <Input
              id="ein"
              value={form.ein}
              onChange={e => updateField("ein", e.target.value)}
              placeholder={t("createVehicle.einPlaceholder")}
              data-testid="input-ein"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateEstablished">{t("createVehicle.dateEstablished")} *</Label>
              <Input
                id="dateEstablished"
                type="date"
                value={form.dateEstablished}
                onChange={e => updateField("dateEstablished", e.target.value)}
                data-testid="input-date-established"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateEnded">{t("createVehicle.dateEnded")}</Label>
              <Input
                id="dateEnded"
                type="date"
                value={form.dateEnded}
                onChange={e => updateField("dateEnded", e.target.value)}
                data-testid="input-date-ended"
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{t("createVehicle.allocationMethod")}</Label>
            <Select value={form.allocationMethod} onValueChange={v => updateField("allocationMethod", v)}>
              <SelectTrigger data-testid="select-allocation-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALLOCATION_METHODS.map(m => (
                  <SelectItem key={m} value={m}>{allocationLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground" data-testid="text-allocation-help">
              {allocationHelp(form.allocationMethod)}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t("createVehicle.currency")}</Label>
            <Select value={form.currency} onValueChange={v => updateField("currency", v)}>
              <SelectTrigger data-testid="select-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {activeCurrencies.map(c => (
                  <SelectItem key={c.code} value={c.code}>{c.code} ({c.symbol}) &ndash; {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground" data-testid="text-currency-help">
              {t("createVehicle.currencyHelp")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="managementFeePercent">{t("createVehicle.managementFeePercent")}</Label>
              <Input
                id="managementFeePercent"
                type="number"
                step="0.01"
                value={form.managementFeePercent}
                onChange={e => updateField("managementFeePercent", e.target.value)}
                data-testid="input-mgmt-fee"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="carriedInterestPercent">{t("createVehicle.carriedInterestPercent")}</Label>
              <Input
                id="carriedInterestPercent"
                type="number"
                step="0.01"
                value={form.carriedInterestPercent}
                onChange={e => updateField("carriedInterestPercent", e.target.value)}
                data-testid="input-carry"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferredReturnPercent">{t("createVehicle.preferredReturnPercent")}</Label>
              <Input
                id="preferredReturnPercent"
                type="number"
                step="0.01"
                value={form.preferredReturnPercent}
                onChange={e => updateField("preferredReturnPercent", e.target.value)}
                data-testid="input-pref-return"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("createVehicle.addressSection")}</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="country">{t("common.country")}</Label>
            <Input
              id="country"
              value={form.country}
              onChange={e => updateField("country", e.target.value)}
              data-testid="input-country"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="streetAddress">{t("createVehicle.street")}</Label>
            <Input
              id="streetAddress"
              value={form.streetAddress}
              onChange={e => updateField("streetAddress", e.target.value)}
              data-testid="input-street"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="streetAddress2">{t("createVehicle.streetAddress2")}</Label>
            <Input
              id="streetAddress2"
              value={form.streetAddress2}
              onChange={e => updateField("streetAddress2", e.target.value)}
              data-testid="input-street2"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vehicleCity">{t("common.city")}</Label>
              <Input
                id="vehicleCity"
                value={form.city}
                onChange={e => updateField("city", e.target.value)}
                data-testid="input-city"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicleStateProvince">{t("common.state")}</Label>
              <Input
                id="vehicleStateProvince"
                value={form.stateProvince}
                onChange={e => updateField("stateProvince", e.target.value)}
                data-testid="input-state-province"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="zipPostalCode">{t("createVehicle.zipPostalCode")}</Label>
              <Input
                id="zipPostalCode"
                value={form.zipPostalCode}
                onChange={e => updateField("zipPostalCode", e.target.value)}
                data-testid="input-zip"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="county">{t("createVehicle.county")}</Label>
              <Input
                id="county"
                value={form.county}
                onChange={e => updateField("county", e.target.value)}
                data-testid="input-county"
              />
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
            <Select value={form.managerId || "none"} onValueChange={v => updateField("managerId", v)}>
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
            <Select value={form.signatoryId || "none"} onValueChange={v => updateField("signatoryId", v)}>
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
          <p className="text-sm text-muted-foreground">{t("createVehicle.bankDetailsHelp")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bankName">{t("createVehicle.bankName")}</Label>
            <Input id="bankName" value={form.bankName} onChange={e => updateField("bankName", e.target.value)} data-testid="input-bank-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAddress">{t("createVehicle.bankAddress")}</Label>
            <Textarea id="bankAddress" value={form.bankAddress} onChange={e => updateField("bankAddress", e.target.value)} data-testid="input-bank-address" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bankRoutingNumber">{t("createVehicle.bankRoutingNumber")}</Label>
              <Input id="bankRoutingNumber" value={form.bankRoutingNumber} onChange={e => updateField("bankRoutingNumber", e.target.value)} data-testid="input-routing" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankSwiftCode">{t("createVehicle.bankSwiftCode")}</Label>
              <Input id="bankSwiftCode" value={form.bankSwiftCode} onChange={e => updateField("bankSwiftCode", e.target.value)} data-testid="input-swift" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAccountNumber">{t("createVehicle.bankAccountNumber")}</Label>
            <Input id="bankAccountNumber" value={form.bankAccountNumber} onChange={e => updateField("bankAccountNumber", e.target.value)} data-testid="input-account-number" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAccountName">{t("createVehicle.bankAccountName")}</Label>
            <Input id="bankAccountName" value={form.bankAccountName} onChange={e => updateField("bankAccountName", e.target.value)} data-testid="input-account-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="forFurtherCreditTo">{t("createVehicle.forFurtherCreditTo")}</Label>
            <Input id="forFurtherCreditTo" value={form.forFurtherCreditTo} onChange={e => updateField("forFurtherCreditTo", e.target.value)} data-testid="input-ffc" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wiringInstructions">{t("createVehicle.wiringInstructions")}</Label>
            <Textarea id="wiringInstructions" value={form.wiringInstructions} onChange={e => updateField("wiringInstructions", e.target.value)} placeholder={t("createVehicle.wiringInstructionsPlaceholder")} data-testid="input-wiring" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("createVehicle.investmentDetails")}</h2>
          <p className="text-sm text-muted-foreground">{t("createVehicle.investmentDetailsHelp")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="investmentCompanyName">{t("createVehicle.companyName")}</Label>
            <Input id="investmentCompanyName" value={form.investmentCompanyName} onChange={e => updateField("investmentCompanyName", e.target.value)} data-testid="input-company-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="investmentType">{t("createVehicle.typeOfInvestment")}</Label>
            <Input id="investmentType" value={form.investmentType} onChange={e => updateField("investmentType", e.target.value)} data-testid="input-investment-type" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="totalBeingRaised">{t("createVehicle.totalBeingRaised")}</Label>
              <Input id="totalBeingRaised" type="number" step="0.01" value={form.totalBeingRaised} onChange={e => updateField("totalBeingRaised", e.target.value)} data-testid="input-total-raised" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minimumInvestment">{t("createVehicle.minimumInvestment")}</Label>
              <Input id="minimumInvestment" type="number" step="0.01" value={form.minimumInvestment} onChange={e => updateField("minimumInvestment", e.target.value)} data-testid="input-min-investment" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expectedClosingDate">{t("createVehicle.expectedClosingDate")}</Label>
            <Input id="expectedClosingDate" type="date" value={form.expectedClosingDate} onChange={e => updateField("expectedClosingDate", e.target.value)} data-testid="input-closing-date" />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end pb-6">
        <Link href={lp("organizationDetail", { id: orgId! })}>
          <Button variant="outline" data-testid="button-cancel">{t("common.cancel")}</Button>
        </Link>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !form.legalName || !form.displayName || !form.dateEstablished}
          data-testid="button-create-vehicle"
        >
          {createMutation.isPending ? t("common.creating") : t("createVehicle.createBtn")}
        </Button>
      </div>
    </div>
  );
}
