import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
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
      toast({ title: "Entity created successfully" });
      navigate(`/entities/${entity.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create entity", description: error.message, variant: "destructive" });
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
      <Link href="/entities">
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          Back to Entities
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">New Entity</h1>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">General Information</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={e => updateField("name", e.target.value)}
              placeholder="Entity name"
              data-testid="input-name"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateEstablished">Date Established</Label>
              <Input
                id="dateEstablished"
                type="date"
                value={form.dateEstablished}
                onChange={e => updateField("dateEstablished", e.target.value)}
                data-testid="input-date-established"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.entityType} onValueChange={v => updateField("entityType", v)}>
                <SelectTrigger data-testid="select-entity-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Currency</Label>
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
            <Label htmlFor="taxId">Tax ID</Label>
            <Input
              id="taxId"
              value={form.taxId}
              onChange={e => updateField("taxId", e.target.value)}
              placeholder="12-3456789"
              data-testid="input-tax-id"
            />
            <p className="text-xs text-muted-foreground">EIN / Tax ID is an entity attribute</p>
          </div>

          <div className="space-y-2">
            <Label>How do you like to allocate ownership in this entity?</Label>
            <RadioGroup value={form.ownershipAllocation} onValueChange={v => updateField("ownershipAllocation", v)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="capital" id="capital" data-testid="radio-capital" />
                <Label htmlFor="capital" className="font-normal">Capital</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="percent" id="percent" data-testid="radio-percent" />
                <Label htmlFor="percent" className="font-normal">Percent</Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Administration</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Managers</Label>
            <Select onValueChange={v => addManager(parseInt(v))}>
              <SelectTrigger data-testid="select-manager">
                <SelectValue placeholder="Select accounts to add as managers..." />
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
          <h2 className="text-lg font-semibold">Address</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input id="country" value={form.country} onChange={e => updateField("country", e.target.value)} data-testid="input-country" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="streetAddress">Street</Label>
            <Input id="streetAddress" value={form.streetAddress} onChange={e => updateField("streetAddress", e.target.value)} data-testid="input-street" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="streetAddress2">Street (continued)</Label>
            <Input id="streetAddress2" value={form.streetAddress2} onChange={e => updateField("streetAddress2", e.target.value)} data-testid="input-street2" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entityCity">City</Label>
              <Input id="entityCity" value={form.city} onChange={e => updateField("city", e.target.value)} data-testid="input-city" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entityStateProvince">State / Province</Label>
              <Input id="entityStateProvince" value={form.stateProvince} onChange={e => updateField("stateProvince", e.target.value)} data-testid="input-state-province" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="zipPostalCode">Zip / Postal Code</Label>
            <Input id="zipPostalCode" value={form.zipPostalCode} onChange={e => updateField("zipPostalCode", e.target.value)} data-testid="input-zip" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Disbursement Preference</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>How do you want to receive disbursements?</Label>
            <RadioGroup value={form.disbursementMethod} onValueChange={v => updateField("disbursementMethod", v)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="wire_transfer" id="wire" data-testid="radio-wire" />
                <Label htmlFor="wire" className="font-normal">Wire Transfer</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="check" id="check" data-testid="radio-check" />
                <Label htmlFor="check" className="font-normal">Check</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="other" id="other" data-testid="radio-other" />
                <Label htmlFor="other" className="font-normal">Other</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bankName">Bank Name</Label>
            <Input id="bankName" value={form.bankName} onChange={e => updateField("bankName", e.target.value)} data-testid="input-bank-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAddress">Bank Address</Label>
            <Textarea id="bankAddress" value={form.bankAddress} onChange={e => updateField("bankAddress", e.target.value)} data-testid="input-bank-address" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bankRoutingNumber">Bank Routing Number</Label>
              <Input id="bankRoutingNumber" value={form.bankRoutingNumber} onChange={e => updateField("bankRoutingNumber", e.target.value)} data-testid="input-routing" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankSwiftCode">Bank Swift Code</Label>
              <Input id="bankSwiftCode" value={form.bankSwiftCode} onChange={e => updateField("bankSwiftCode", e.target.value)} data-testid="input-swift" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAccountNumber">Bank Account Number</Label>
            <Input id="bankAccountNumber" value={form.bankAccountNumber} onChange={e => updateField("bankAccountNumber", e.target.value)} data-testid="input-account-number" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAccountName">Bank Account Name</Label>
            <Input id="bankAccountName" value={form.bankAccountName} onChange={e => updateField("bankAccountName", e.target.value)} data-testid="input-account-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="forFurtherCreditTo">For Further Credit To</Label>
            <Input id="forFurtherCreditTo" value={form.forFurtherCreditTo} onChange={e => updateField("forFurtherCreditTo", e.target.value)} data-testid="input-ffc" />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end pb-6">
        <Link href="/entities">
          <Button variant="outline" data-testid="button-cancel">Cancel</Button>
        </Link>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !form.name}
          data-testid="button-create-entity"
        >
          {createMutation.isPending ? "Creating..." : "Confirm Changes"}
        </Button>
      </div>
    </div>
  );
}
