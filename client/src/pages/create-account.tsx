import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const COUNTRIES = [
  "United States", "United Kingdom", "Spain", "Germany", "France",
  "Italy", "Canada", "Australia", "Japan", "South Korea",
  "Brazil", "Mexico", "India", "China", "Singapore",
  "Switzerland", "Netherlands", "Sweden", "Ireland", "Portugal",
];

export default function CreateAccount() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phone: "",
    birthdate: "",
    taxId: "",
    streetAddress1: "",
    streetAddress2: "",
    country: "",
    city: "",
    stateProvince: "",
    zipPostalCode: "",
    roles: [] as string[],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/accounts", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: "Account created successfully" });
      navigate(`/accounts/${data.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create account",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleRole = (roleName: string) => {
    setFormData((prev) => ({
      ...prev,
      roles: prev.roles.includes(roleName)
        ? prev.roles.filter((r) => r !== roleName)
        : [...prev.roles, roleName],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.firstName || !formData.lastName || !formData.password) {
      toast({
        title: "Missing required fields",
        description: "Please fill in first name, last name, email, and password.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(formData);
  };

  return (
    <div className="p-6 space-y-6">
      <Link href="/accounts">
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          Back to Accounts
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Create Account</h1>
        <p className="text-muted-foreground mt-1">
          Add a new user to the platform
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Personal Information</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => updateField("firstName", e.target.value)}
                    required
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => updateField("lastName", e.target.value)}
                    required
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthdate">Birthdate</Label>
                <Input
                  id="birthdate"
                  type="date"
                  value={formData.birthdate}
                  onChange={(e) => updateField("birthdate", e.target.value)}
                  data-testid="input-birthdate"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    required
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    data-testid="input-phone"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="taxId">SSN / Tax ID</Label>
                <Input
                  id="taxId"
                  value={formData.taxId}
                  onChange={(e) => updateField("taxId", e.target.value)}
                  data-testid="input-tax-id"
                />
                <p className="text-xs text-muted-foreground">SSN / Tax ID is an encrypted attribute</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Login Credentials</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  required
                  data-testid="input-password"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Residential Address</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="streetAddress1">Street Address 1</Label>
                <Input
                  id="streetAddress1"
                  value={formData.streetAddress1}
                  onChange={(e) => updateField("streetAddress1", e.target.value)}
                  data-testid="input-street-1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="streetAddress2">Street Address 2 (Optional)</Label>
                <Input
                  id="streetAddress2"
                  value={formData.streetAddress2}
                  onChange={(e) => updateField("streetAddress2", e.target.value)}
                  data-testid="input-street-2"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Select
                    value={formData.country}
                    onValueChange={(val) => updateField("country", val)}
                  >
                    <SelectTrigger data-testid="select-country">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    data-testid="input-city"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stateProvince">State / Province</Label>
                  <Input
                    id="stateProvince"
                    value={formData.stateProvince}
                    onChange={(e) => updateField("stateProvince", e.target.value)}
                    data-testid="input-state"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zipPostalCode">Zip / Postal Code</Label>
                  <Input
                    id="zipPostalCode"
                    value={formData.zipPostalCode}
                    onChange={(e) => updateField("zipPostalCode", e.target.value)}
                    data-testid="input-zip"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Roles</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="flex items-start gap-3 p-4 rounded-md border"
                data-testid="role-admin"
              >
                <Checkbox
                  id="role-admin"
                  checked={formData.roles.includes("admin")}
                  onCheckedChange={() => toggleRole("admin")}
                  data-testid="checkbox-role-admin"
                />
                <div className="space-y-1">
                  <label htmlFor="role-admin" className="text-sm font-medium cursor-pointer">
                    Admin
                  </label>
                  <p className="text-xs text-muted-foreground">Platform administrator with full access to all features and settings</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="button-submit"
            >
              <Save className="h-4 w-4 mr-2" />
              {createMutation.isPending ? "Creating..." : "Create Account"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
