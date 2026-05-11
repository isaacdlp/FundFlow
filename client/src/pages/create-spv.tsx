import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useLocalePath, useLocale } from "@/i18n/hooks";
import { ROUTE_PATTERNS } from "@/i18n/routes";
import type { OrganizationWithOrganizers, OrganizerAccount } from "@shared/types";
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
const CURRENCIES = ["USD ($)", "EUR (\u20ac)", "GBP (\u00a3)", "CHF", "JPY (\u00a5)", "CAD ($)", "AUD ($)"];
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

export default function CreateSpv() {
  const [, params] = useRoute(ROUTE_PATTERNS.organizationSpvNew[useLocale()]);
  const orgId = params?.orgId;
  const [, navigate] = useLocation();
  const lp = useLocalePath();
  const { t } = useTranslation();
  const { toast } = useToast();

  const allocationLabel = (m: string) => {
    if (m === "By Commitment") return t("createSpv.allocationByCommitment");
    if (m === "By Capital Invested") return t("createSpv.allocationByCapital");
    if (m === "Custom") return t("createSpv.allocationCustom");
    return m;
  };
  const allocationHelp = (m: string) => {
    if (m === "By Commitment") return t("createSpv.allocationHelpByCommitment");
    if (m === "By Capital Invested") return t("createSpv.allocationHelpByCapital");
    if (m === "Custom") return t("createSpv.allocationHelpCustom");
    return "";
  };

  const { data: org, isLoading: orgLoading } = useQuery<OrganizationWithOrganizers>({
    queryKey: ["/api/organizations", orgId],
    enabled: !!orgId,
  });

  const [form, setForm] = useState({
    legalName: "",
    displayName: "",
    entityType: "LLC",
    stateOfIncorporation: "",
    ein: "",
    dateEstablished: "",
    dateEnded: "",
    allocationMethod: "By Commitment",
    currency: "USD ($)",
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
      const res = await apiRequest("POST", `/api/organizations/${orgId}/spvs`, payload);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId, "spvs"] });
      toast({ title: t("createSpv.successTitle") });
      navigate(lp("spvDetail", { id: data.id }));
    },
    onError: (error: Error) => {
      toast({ title: t("createSpv.errorTitle"), description: error.message, variant: "destructive" });
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
        <p className="text-muted-foreground">{t("createSpv.orgNotFound")}</p>
      </div>
    );
  }

  const organizers = org.organizers || [];

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <Link href={lp("organizationDetail", { id: orgId! })}>
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          {t("createSpv.backToOrg", { name: org.name })}
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{t("createSpv.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("createSpv.subtitleWithOrg", { name: org.name })}</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("createSpv.generalStructure")}</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="legalName">{t("createSpv.legalNameRequired")}</Label>
            <Input
              id="legalName"
              value={form.legalName}
              onChange={e => updateField("legalName", e.target.value)}
              placeholder={t("createSpv.legalNamePlaceholder")}
              data-testid="input-legal-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">{t("createSpv.displayNameRequired")}</Label>
            <Input
              id="displayName"
              value={form.displayName}
              onChange={e => updateField("displayName", e.target.value)}
              placeholder={t("createSpv.displayNamePlaceholder")}
              data-testid="input-display-name"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("createSpv.entityType")}</Label>
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
              <Label>{t("createSpv.stateOfIncorporation")}</Label>
              <Select value={form.stateOfIncorporation || "placeholder"} onValueChange={v => updateField("stateOfIncorporation", v === "placeholder" ? "" : v)}>
                <SelectTrigger data-testid="select-state-incorporation">
                  <SelectValue placeholder={t("createSpv.selectState")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled>{t("createSpv.selectState")}</SelectItem>
                  {US_STATES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ein">{t("createSpv.ein")}</Label>
            <Input
              id="ein"
              value={form.ein}
              onChange={e => updateField("ein", e.target.value)}
              placeholder={t("createSpv.einPlaceholder")}
              data-testid="input-ein"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateEstablished">{t("createSpv.dateEstablished")}</Label>
              <Input
                id="dateEstablished"
                type="date"
                value={form.dateEstablished}
                onChange={e => updateField("dateEstablished", e.target.value)}
                data-testid="input-date-established"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateEnded">{t("createSpv.dateEnded")}</Label>
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
            <Label>{t("createSpv.allocationMethod")}</Label>
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
            <Label>{t("createSpv.currency")}</Label>
            <Select value={form.currency} onValueChange={v => updateField("currency", v)}>
              <SelectTrigger data-testid="select-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="managementFeePercent">{t("createSpv.managementFeePercent")}</Label>
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
              <Label htmlFor="carriedInterestPercent">{t("createSpv.carriedInterestPercent")}</Label>
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
              <Label htmlFor="preferredReturnPercent">{t("createSpv.preferredReturnPercent")}</Label>
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
          <h2 className="text-lg font-semibold">{t("createSpv.addressSection")}</h2>
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
            <Label htmlFor="streetAddress">{t("createSpv.street")}</Label>
            <Input
              id="streetAddress"
              value={form.streetAddress}
              onChange={e => updateField("streetAddress", e.target.value)}
              data-testid="input-street"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="streetAddress2">{t("createSpv.streetAddress2")}</Label>
            <Input
              id="streetAddress2"
              value={form.streetAddress2}
              onChange={e => updateField("streetAddress2", e.target.value)}
              data-testid="input-street2"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="spvCity">{t("common.city")}</Label>
              <Input
                id="spvCity"
                value={form.city}
                onChange={e => updateField("city", e.target.value)}
                data-testid="input-city"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spvStateProvince">{t("common.state")}</Label>
              <Input
                id="spvStateProvince"
                value={form.stateProvince}
                onChange={e => updateField("stateProvince", e.target.value)}
                data-testid="input-state-province"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="zipPostalCode">{t("createSpv.zipPostalCode")}</Label>
              <Input
                id="zipPostalCode"
                value={form.zipPostalCode}
                onChange={e => updateField("zipPostalCode", e.target.value)}
                data-testid="input-zip"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="county">{t("createSpv.county")}</Label>
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
          <h2 className="text-lg font-semibold">{t("createSpv.administration")}</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("createSpv.spvManagerLabel")}</Label>
            <Select value={form.managerId || "none"} onValueChange={v => updateField("managerId", v)}>
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
            <Select value={form.signatoryId || "none"} onValueChange={v => updateField("signatoryId", v)}>
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
          <p className="text-sm text-muted-foreground">{t("createSpv.bankDetailsHelp")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bankName">{t("createSpv.bankName")}</Label>
            <Input id="bankName" value={form.bankName} onChange={e => updateField("bankName", e.target.value)} data-testid="input-bank-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAddress">{t("createSpv.bankAddress")}</Label>
            <Textarea id="bankAddress" value={form.bankAddress} onChange={e => updateField("bankAddress", e.target.value)} data-testid="input-bank-address" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bankRoutingNumber">{t("createSpv.bankRoutingNumber")}</Label>
              <Input id="bankRoutingNumber" value={form.bankRoutingNumber} onChange={e => updateField("bankRoutingNumber", e.target.value)} data-testid="input-routing" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankSwiftCode">{t("createSpv.bankSwiftCode")}</Label>
              <Input id="bankSwiftCode" value={form.bankSwiftCode} onChange={e => updateField("bankSwiftCode", e.target.value)} data-testid="input-swift" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAccountNumber">{t("createSpv.bankAccountNumber")}</Label>
            <Input id="bankAccountNumber" value={form.bankAccountNumber} onChange={e => updateField("bankAccountNumber", e.target.value)} data-testid="input-account-number" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAccountName">{t("createSpv.bankAccountName")}</Label>
            <Input id="bankAccountName" value={form.bankAccountName} onChange={e => updateField("bankAccountName", e.target.value)} data-testid="input-account-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="forFurtherCreditTo">{t("createSpv.forFurtherCreditTo")}</Label>
            <Input id="forFurtherCreditTo" value={form.forFurtherCreditTo} onChange={e => updateField("forFurtherCreditTo", e.target.value)} data-testid="input-ffc" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wiringInstructions">{t("createSpv.wiringInstructions")}</Label>
            <Textarea id="wiringInstructions" value={form.wiringInstructions} onChange={e => updateField("wiringInstructions", e.target.value)} placeholder={t("createSpv.wiringInstructionsPlaceholder")} data-testid="input-wiring" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("createSpv.investmentDetails")}</h2>
          <p className="text-sm text-muted-foreground">{t("createSpv.investmentDetailsHelp")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="investmentCompanyName">{t("createSpv.companyName")}</Label>
            <Input id="investmentCompanyName" value={form.investmentCompanyName} onChange={e => updateField("investmentCompanyName", e.target.value)} data-testid="input-company-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="investmentType">{t("createSpv.typeOfInvestment")}</Label>
            <Input id="investmentType" value={form.investmentType} onChange={e => updateField("investmentType", e.target.value)} data-testid="input-investment-type" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="totalBeingRaised">{t("createSpv.totalBeingRaised")}</Label>
              <Input id="totalBeingRaised" type="number" step="0.01" value={form.totalBeingRaised} onChange={e => updateField("totalBeingRaised", e.target.value)} data-testid="input-total-raised" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minimumInvestment">{t("createSpv.minimumInvestment")}</Label>
              <Input id="minimumInvestment" type="number" step="0.01" value={form.minimumInvestment} onChange={e => updateField("minimumInvestment", e.target.value)} data-testid="input-min-investment" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expectedClosingDate">{t("createSpv.expectedClosingDate")}</Label>
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
          disabled={createMutation.isPending || !form.legalName || !form.displayName}
          data-testid="button-create-spv"
        >
          {createMutation.isPending ? t("common.creating") : t("createSpv.createBtn")}
        </Button>
      </div>
    </div>
  );
}
