import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    phone: "",
    birthdate: "",
    tax_id: "",
    street_address_1: "",
    street_address_2: "",
    country: "",
    city: "",
    state_province: "",
    zip_postal_code: "",
    roles: [] as string[],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
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
    if (!formData.email || !formData.first_name || !formData.last_name || !formData.password) {
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
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => updateField("first_name", e.target.value)}
                    required
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name *</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => updateField("last_name", e.target.value)}
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
                <Label htmlFor="tax_id">SSN / Tax ID</Label>
                <Input
                  id="tax_id"
                  value={formData.tax_id}
                  onChange={(e) => updateField("tax_id", e.target.value)}
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
                <Label htmlFor="street_address_1">Street Address 1</Label>
                <Input
                  id="street_address_1"
                  value={formData.street_address_1}
                  onChange={(e) => updateField("street_address_1", e.target.value)}
                  data-testid="input-street-1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="street_address_2">Street Address 2 (Optional)</Label>
                <Input
                  id="street_address_2"
                  value={formData.street_address_2}
                  onChange={(e) => updateField("street_address_2", e.target.value)}
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
                  <Label htmlFor="state_province">State / Province</Label>
                  <Input
                    id="state_province"
                    value={formData.state_province}
                    onChange={(e) => updateField("state_province", e.target.value)}
                    data-testid="input-state"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip_postal_code">Zip / Postal Code</Label>
                  <Input
                    id="zip_postal_code"
                    value={formData.zip_postal_code}
                    onChange={(e) => updateField("zip_postal_code", e.target.value)}
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
              {[
                {
                  name: "admin",
                  label: "Admin",
                  description: "Platform administrator with full access to all features and settings",
                },
                {
                  name: "gp",
                  label: "GP (General Partner)",
                  description: "Fund manager who can create and manage funds, view portfolio companies",
                },
                {
                  name: "lp",
                  label: "LP (Limited Partner)",
                  description: "Investor who can view fund performance, capital calls, and distributions",
                },
              ].map((role) => (
                <div
                  key={role.name}
                  className="flex items-start gap-3 p-4 rounded-md border"
                  data-testid={`role-${role.name}`}
                >
                  <Checkbox
                    id={`role-${role.name}`}
                    checked={formData.roles.includes(role.name)}
                    onCheckedChange={() => toggleRole(role.name)}
                    data-testid={`checkbox-role-${role.name}`}
                  />
                  <div className="space-y-1">
                    <label htmlFor={`role-${role.name}`} className="text-sm font-medium cursor-pointer">
                      {role.label}
                    </label>
                    <p className="text-xs text-muted-foreground">{role.description}</p>
                  </div>
                </div>
              ))}
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
