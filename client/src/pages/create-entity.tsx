import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useLocalePath } from "@/i18n/hooks";
import type { AccountWithRoles } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, X } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const ENTITY_TYPES = [
  "LLC", "LP", "LLP", "Non-Profit", "C-Corp", "S-Corp",
  "Trust", "IRA", "ROTH IRA", "Disregarded Entity", "Other",
];

const CURRENCIES = ["USD ($)", "EUR (\u20ac)", "GBP (\u00a3)", "CHF", "JPY (\u00a5)", "CAD ($)", "AUD ($)"];

export default function CreateEntity() {
  const [, navigate] = useLocation();
  const lp = useLocalePath();
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: accountsList } = useQuery<AccountWithRoles[]>({
    queryKey: ["/api/accounts"],
  });

  const [form, setForm] = useState({
    name: "",
    entityType: "LLC",
    dateEstablished: "",
    currency: "USD ($)",
    taxId: "",
    ownershipAllocation: "percent",
    country: "United States",
    streetAddress: "",
    streetAddress2: "",
    city: "",
    stateProvince: "",
    zipPostalCode: "",
    disbursementMethod: "wire_transfer",
    bankName: "",
    bankAddress: "",
    bankRoutingNumber: "",
    bankSwiftCode: "",
    bankAccountNumber: "",
    bankAccountName: "",
    forFurtherCreditTo: "",
  });

  const [selectedManagers, setSelectedManagers] = useState<number[]>([]);

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.dateEstablished) payload.dateEstablished = null;
      const res = await apiRequest("POST", "/api/entities", payload);
      return res.json();
    },
    onSuccess: async (entity) => {
      for (const accountId of selectedManagers) {
        await apiRequest("POST", `/api/entities/${entity.id}/managers`, { accountId });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
      toast({ title: t("createEntity.successTitle") });
      navigate(lp("entityDetail", { id: entity.id }));
    },
    onError: (error: Error) => {
      toast({ title: t("createEntity.errorTitle"), description: error.message, variant: "destructive" });
    },
  });

  const addManager = (accountId: number) => {
    if (!selectedManagers.includes(accountId)) {
      setSelectedManagers(prev => [...prev, accountId]);
    }
  };

  const removeManager = (accountId: number) => {
    setSelectedManagers(prev => prev.filter(id => id !== accountId));
  };

  const availableAccounts = accountsList?.filter(a => !selectedManagers.includes(a.id)) || [];

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <Link href={lp("entities")}>
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          {t("entityDetail.back")}
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{t("createEntity.title")}</h1>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("createEntity.general")}</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("createEntity.nameRequired")}</Label>
            <Input
              id="name"
              value={form.name}
              onChange={e => updateField("name", e.target.value)}
              placeholder={t("createEntity.namePlaceholder")}
              data-testid="input-name"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateEstablished">{t("createEntity.dateEstablished")}</Label>
              <Input
                id="dateEstablished"
                type="date"
                value={form.dateEstablished}
                onChange={e => updateField("dateEstablished", e.target.value)}
                data-testid="input-date-established"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("common.type")}</Label>
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
          </div>

          <div className="space-y-2">
            <Label>{t("createEntity.currency")}</Label>
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

          <div className="space-y-2">
            <Label htmlFor="taxId">{t("createEntity.taxId")}</Label>
            <Input
              id="taxId"
              value={form.taxId}
              onChange={e => updateField("taxId", e.target.value)}
              placeholder={t("createEntity.taxIdPlaceholder")}
              data-testid="input-tax-id"
            />
            <p className="text-xs text-muted-foreground">{t("createEntity.taxIdHelper")}</p>
          </div>

          <div className="space-y-2">
            <Label>{t("createEntity.ownershipQuestion")}</Label>
            <RadioGroup value={form.ownershipAllocation} onValueChange={v => updateField("ownershipAllocation", v)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="capital" id="capital" data-testid="radio-capital" />
                <Label htmlFor="capital" className="font-normal">{t("createEntity.capital")}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="percent" id="percent" data-testid="radio-percent" />
                <Label htmlFor="percent" className="font-normal">{t("createEntity.percent")}</Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("createEntity.administration")}</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("createEntity.managers")}</Label>
            <Select onValueChange={v => addManager(parseInt(v))}>
              <SelectTrigger data-testid="select-manager">
                <SelectValue placeholder={t("createEntity.selectManagersPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {availableAccounts.map(a => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.firstName} {a.lastName} ({a.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedManagers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedManagers.map(id => {
                  const acct = accountsList?.find(a => a.id === id);
                  if (!acct) return null;
                  return (
                    <div key={id} className="flex items-center gap-1 px-2 py-1 rounded-md border bg-muted text-sm" data-testid={`manager-chip-${id}`}>
                      <span>{acct.firstName} {acct.lastName}</span>
                      <button onClick={() => removeManager(id)} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("createEntity.addressSection")}</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="country">{t("common.country")}</Label>
            <Input id="country" value={form.country} onChange={e => updateField("country", e.target.value)} data-testid="input-country" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="streetAddress">{t("createEntity.street")}</Label>
            <Input id="streetAddress" value={form.streetAddress} onChange={e => updateField("streetAddress", e.target.value)} data-testid="input-street" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="streetAddress2">{t("createEntity.streetContinued")}</Label>
            <Input id="streetAddress2" value={form.streetAddress2} onChange={e => updateField("streetAddress2", e.target.value)} data-testid="input-street2" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entityCity">{t("common.city")}</Label>
              <Input id="entityCity" value={form.city} onChange={e => updateField("city", e.target.value)} data-testid="input-city" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entityStateProvince">{t("common.state")}</Label>
              <Input id="entityStateProvince" value={form.stateProvince} onChange={e => updateField("stateProvince", e.target.value)} data-testid="input-state-province" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="zipPostalCode">{t("createEntity.zipPostalCode")}</Label>
            <Input id="zipPostalCode" value={form.zipPostalCode} onChange={e => updateField("zipPostalCode", e.target.value)} data-testid="input-zip" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("createEntity.disbursementPreference")}</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("createEntity.disbursementQuestion")}</Label>
            <RadioGroup value={form.disbursementMethod} onValueChange={v => updateField("disbursementMethod", v)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="wire_transfer" id="wire" data-testid="radio-wire" />
                <Label htmlFor="wire" className="font-normal">{t("createEntity.wireTransfer")}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="check" id="check" data-testid="radio-check" />
                <Label htmlFor="check" className="font-normal">{t("createEntity.check")}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="other" id="other" data-testid="radio-other" />
                <Label htmlFor="other" className="font-normal">{t("createEntity.other")}</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bankName">{t("createEntity.bankName")}</Label>
            <Input id="bankName" value={form.bankName} onChange={e => updateField("bankName", e.target.value)} data-testid="input-bank-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAddress">{t("createEntity.bankAddress")}</Label>
            <Textarea id="bankAddress" value={form.bankAddress} onChange={e => updateField("bankAddress", e.target.value)} data-testid="input-bank-address" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bankRoutingNumber">{t("createEntity.bankRoutingNumber")}</Label>
              <Input id="bankRoutingNumber" value={form.bankRoutingNumber} onChange={e => updateField("bankRoutingNumber", e.target.value)} data-testid="input-routing" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankSwiftCode">{t("createEntity.bankSwiftCode")}</Label>
              <Input id="bankSwiftCode" value={form.bankSwiftCode} onChange={e => updateField("bankSwiftCode", e.target.value)} data-testid="input-swift" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAccountNumber">{t("createEntity.bankAccountNumber")}</Label>
            <Input id="bankAccountNumber" value={form.bankAccountNumber} onChange={e => updateField("bankAccountNumber", e.target.value)} data-testid="input-account-number" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAccountName">{t("createEntity.bankAccountName")}</Label>
            <Input id="bankAccountName" value={form.bankAccountName} onChange={e => updateField("bankAccountName", e.target.value)} data-testid="input-account-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="forFurtherCreditTo">{t("createEntity.forFurtherCreditTo")}</Label>
            <Input id="forFurtherCreditTo" value={form.forFurtherCreditTo} onChange={e => updateField("forFurtherCreditTo", e.target.value)} data-testid="input-ffc" />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end pb-6">
        <Link href={lp("entities")}>
          <Button variant="outline" data-testid="button-cancel">{t("common.cancel")}</Button>
        </Link>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !form.name}
          data-testid="button-create-entity"
        >
          {createMutation.isPending ? t("common.creating") : t("createEntity.confirmChanges")}
        </Button>
      </div>
    </div>
  );
}
