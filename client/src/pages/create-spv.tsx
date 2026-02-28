import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
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
const ALLOCATION_METHODS = ["By capital invested", "Pro rata", "Custom"];
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
  const [, params] = useRoute("/organizations/:orgId/spvs/new");
  const orgId = params?.orgId;
  const [, navigate] = useLocation();
  const { toast } = useToast();

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
    allocationMethod: "By capital invested",
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
      toast({ title: "SPV created successfully" });
      navigate(`/spvs/${data.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create SPV", description: error.message, variant: "destructive" });
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
        <p className="text-muted-foreground">Organization not found.</p>
      </div>
    );
  }

  const organizers = org.organizers || [];

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <Link href={`/organizations/${orgId}`}>
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          Back to {org.name}
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Create SPV</h1>
        <p className="text-muted-foreground mt-1">Create a new Special Purpose Vehicle within {org.name}</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">General Structure</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="legalName">Legal Name *</Label>
            <Input
              id="legalName"
              value={form.legalName}
              onChange={e => updateField("legalName", e.target.value)}
              placeholder="e.g. Acme Corporation A Series of SPV Holdings LLC"
              data-testid="input-legal-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name *</Label>
            <Input
              id="displayName"
              value={form.displayName}
              onChange={e => updateField("displayName", e.target.value)}
              placeholder="e.g. Acme"
              data-testid="input-display-name"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Entity Type</Label>
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
            <div className="space-y-2">
              <Label>State of Incorporation</Label>
              <Select value={form.stateOfIncorporation || "placeholder"} onValueChange={v => updateField("stateOfIncorporation", v === "placeholder" ? "" : v)}>
                <SelectTrigger data-testid="select-state-incorporation">
                  <SelectValue placeholder="Select state..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled>Select state...</SelectItem>
                  {US_STATES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ein">EIN</Label>
            <Input
              id="ein"
              value={form.ein}
              onChange={e => updateField("ein", e.target.value)}
              placeholder="12-3456789"
              data-testid="input-ein"
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
              <Label htmlFor="dateEnded">Date Ended</Label>
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
            <Label>Allocation Method</Label>
            <Select value={form.allocationMethod} onValueChange={v => updateField("allocationMethod", v)}>
              <SelectTrigger data-testid="select-allocation-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALLOCATION_METHODS.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Ownership in the SPV and its assets is calculated by the capital called. This takes into account the fees paid, which might be different for each investor.
            </p>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="managementFeePercent">Management Fee %</Label>
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
              <Label htmlFor="carriedInterestPercent">Carried Interest %</Label>
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
              <Label htmlFor="preferredReturnPercent">Preferred Return %</Label>
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
          <h2 className="text-lg font-semibold">Address</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={form.country}
              onChange={e => updateField("country", e.target.value)}
              data-testid="input-country"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="streetAddress">Street</Label>
            <Input
              id="streetAddress"
              value={form.streetAddress}
              onChange={e => updateField("streetAddress", e.target.value)}
              data-testid="input-street"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="streetAddress2">Apartment, suite, etc.</Label>
            <Input
              id="streetAddress2"
              value={form.streetAddress2}
              onChange={e => updateField("streetAddress2", e.target.value)}
              data-testid="input-street2"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="spvCity">City</Label>
              <Input
                id="spvCity"
                value={form.city}
                onChange={e => updateField("city", e.target.value)}
                data-testid="input-city"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spvStateProvince">State / Province</Label>
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
              <Label htmlFor="zipPostalCode">ZIP / Postal Code</Label>
              <Input
                id="zipPostalCode"
                value={form.zipPostalCode}
                onChange={e => updateField("zipPostalCode", e.target.value)}
                data-testid="input-zip"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="county">County</Label>
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
          <h2 className="text-lg font-semibold">Administration</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Who is the SPV manager?</Label>
            <Select value={form.managerId || "none"} onValueChange={v => updateField("managerId", v)}>
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
            <Select value={form.signatoryId || "none"} onValueChange={v => updateField("signatoryId", v)}>
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
          <p className="text-sm text-muted-foreground">Bank information will automatically be populated in capital calls.</p>
        </CardHeader>
        <CardContent className="space-y-4">
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
          <div className="space-y-2">
            <Label htmlFor="wiringInstructions">Wiring Instructions</Label>
            <Textarea id="wiringInstructions" value={form.wiringInstructions} onChange={e => updateField("wiringInstructions", e.target.value)} placeholder="Copy and paste your wiring instructions here." data-testid="input-wiring" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Investment Details</h2>
          <p className="text-sm text-muted-foreground">Tell us about the company you are funding.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="investmentCompanyName">Company Name</Label>
            <Input id="investmentCompanyName" value={form.investmentCompanyName} onChange={e => updateField("investmentCompanyName", e.target.value)} data-testid="input-company-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="investmentType">Type of Investment</Label>
            <Input id="investmentType" value={form.investmentType} onChange={e => updateField("investmentType", e.target.value)} data-testid="input-investment-type" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="totalBeingRaised">Total Being Raised</Label>
              <Input id="totalBeingRaised" type="number" step="0.01" value={form.totalBeingRaised} onChange={e => updateField("totalBeingRaised", e.target.value)} data-testid="input-total-raised" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minimumInvestment">Minimum Investment</Label>
              <Input id="minimumInvestment" type="number" step="0.01" value={form.minimumInvestment} onChange={e => updateField("minimumInvestment", e.target.value)} data-testid="input-min-investment" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expectedClosingDate">Expected Closing Date</Label>
            <Input id="expectedClosingDate" type="date" value={form.expectedClosingDate} onChange={e => updateField("expectedClosingDate", e.target.value)} data-testid="input-closing-date" />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end pb-6">
        <Link href={`/organizations/${orgId}`}>
          <Button variant="outline" data-testid="button-cancel">Cancel</Button>
        </Link>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !form.legalName || !form.displayName}
          data-testid="button-create-spv"
        >
          {createMutation.isPending ? "Creating..." : "Create SPV"}
        </Button>
      </div>
    </div>
  );
}
