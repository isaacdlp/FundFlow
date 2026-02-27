import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import type { User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, Save, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

const COUNTRIES = [
  "United States", "United Kingdom", "Spain", "Germany", "France",
  "Italy", "Canada", "Australia", "Japan", "South Korea",
  "Brazil", "Mexico", "India", "China", "Singapore",
  "Switzerland", "Netherlands", "Sweden", "Ireland", "Portugal",
];

const ACCOUNT_TABS = [
  { value: "personal", label: "Personal Information" },
  { value: "login", label: "Login Information" },
  { value: "permissions", label: "Permissions" },
];

export default function AccountDetail() {
  const [, params] = useRoute("/accounts/:id");
  const userId = params?.id;
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");

  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/users", userId],
    enabled: !!userId,
  });

  const [formData, setFormData] = useState<Record<string, string | string[]>>({});

  useEffect(() => {
    if (user) {
      setFormData({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        email: user.email || "",
        phone: user.phone || "",
        birthdate: user.birthdate || "",
        tax_id: user.tax_id || "",
        street_address_1: user.street_address_1 || "",
        street_address_2: user.street_address_2 || "",
        country: user.country || "",
        city: user.city || "",
        state_province: user.state_province || "",
        zip_postal_code: user.zip_postal_code || "",
        roles: user.roles.map((r) => r.name),
      });
    }
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditing(false);
      toast({ title: "Profile updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update profile", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleCancel = () => {
    if (user) {
      setFormData({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        email: user.email || "",
        phone: user.phone || "",
        birthdate: user.birthdate || "",
        tax_id: user.tax_id || "",
        street_address_1: user.street_address_1 || "",
        street_address_2: user.street_address_2 || "",
        country: user.country || "",
        city: user.city || "",
        state_province: user.state_province || "",
        zip_postal_code: user.zip_postal_code || "",
        roles: user.roles.map((r) => r.name),
      });
    }
    setEditing(false);
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleRole = (roleName: string) => {
    setFormData((prev) => {
      const currentRoles = (prev.roles as string[]) || [];
      const newRoles = currentRoles.includes(roleName)
        ? currentRoles.filter((r) => r !== roleName)
        : [...currentRoles, roleName];
      return { ...prev, roles: newRoles };
    });
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

  if (!user) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">User not found.</p>
      </div>
    );
  }

  const initials = `${user.first_name[0]}${user.last_name[0]}`;

  return (
    <div className="p-6 space-y-6">
      <Link href="/accounts">
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          Back to all Accounts
        </Button>
      </Link>

      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-semibold flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold" data-testid="text-user-name">
            {user.first_name} {user.last_name}
          </h1>
          <p className="text-muted-foreground" data-testid="text-user-email">{user.email}</p>
          <div className="flex gap-2 mt-1 flex-wrap">
            <Badge variant={user.profile_complete ? "default" : "secondary"}>
              {user.profile_complete ? "Profile Complete" : "Profile Incomplete"}
            </Badge>
            {user.roles.map((role) => (
              <Badge
                key={role.id}
                variant={
                  role.name === "admin"
                    ? "destructive"
                    : role.name === "gp"
                      ? "default"
                      : "secondary"
                }
              >
                {role.name.toUpperCase()}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {ACCOUNT_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} data-testid={`tab-${tab.value}`}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="personal" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
              <h2 className="text-lg font-semibold">Personal Information</h2>
              {!editing ? (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="button-edit">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCancel} data-testid="button-cancel">
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    data-testid="button-save"
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    {updateMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input
                    id="first_name"
                    value={(formData.first_name as string) || ""}
                    onChange={(e) => updateField("first_name", e.target.value)}
                    disabled={!editing}
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name *</Label>
                  <Input
                    id="last_name"
                    value={(formData.last_name as string) || ""}
                    onChange={(e) => updateField("last_name", e.target.value)}
                    disabled={!editing}
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthdate">Birthdate</Label>
                <Input
                  id="birthdate"
                  type="date"
                  value={(formData.birthdate as string) || ""}
                  onChange={(e) => updateField("birthdate", e.target.value)}
                  disabled={!editing}
                  data-testid="input-birthdate"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={(formData.email as string) || ""}
                    onChange={(e) => updateField("email", e.target.value)}
                    disabled={!editing}
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={(formData.phone as string) || ""}
                    onChange={(e) => updateField("phone", e.target.value)}
                    disabled={!editing}
                    data-testid="input-phone"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax_id">SSN / Tax ID</Label>
                <Input
                  id="tax_id"
                  value={(formData.tax_id as string) || ""}
                  onChange={(e) => updateField("tax_id", e.target.value)}
                  disabled={!editing}
                  data-testid="input-tax-id"
                />
                <p className="text-xs text-muted-foreground">SSN / Tax ID is an encrypted attribute</p>
              </div>

              <Separator />

              <h3 className="text-base font-semibold">Residential Address</h3>

              <div className="space-y-2">
                <Label htmlFor="street_address_1">Street Address 1 *</Label>
                <Input
                  id="street_address_1"
                  value={(formData.street_address_1 as string) || ""}
                  onChange={(e) => updateField("street_address_1", e.target.value)}
                  disabled={!editing}
                  data-testid="input-street-1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="street_address_2">Street Address 2 (Optional)</Label>
                <Input
                  id="street_address_2"
                  value={(formData.street_address_2 as string) || ""}
                  onChange={(e) => updateField("street_address_2", e.target.value)}
                  disabled={!editing}
                  data-testid="input-street-2"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="country">Country *</Label>
                  {editing ? (
                    <Select
                      value={(formData.country as string) || ""}
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
                  ) : (
                    <Input
                      value={(formData.country as string) || ""}
                      disabled
                      data-testid="input-country"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    value={(formData.city as string) || ""}
                    onChange={(e) => updateField("city", e.target.value)}
                    disabled={!editing}
                    data-testid="input-city"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="state_province">State / Province *</Label>
                  <Input
                    id="state_province"
                    value={(formData.state_province as string) || ""}
                    onChange={(e) => updateField("state_province", e.target.value)}
                    disabled={!editing}
                    data-testid="input-state"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip_postal_code">Zip / Postal Code *</Label>
                  <Input
                    id="zip_postal_code"
                    value={(formData.zip_postal_code as string) || ""}
                    onChange={(e) => updateField("zip_postal_code", e.target.value)}
                    disabled={!editing}
                    data-testid="input-zip"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="login" className="mt-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Login Information</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input value={user.email} disabled data-testid="input-login-email" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value="••••••••••••" disabled />
                <p className="text-xs text-muted-foreground">
                  Password management will be available in a future update.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Account Created</Label>
                <Input
                  value={new Date(user.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  disabled
                  data-testid="input-created-at"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
              <h2 className="text-lg font-semibold">Roles & Permissions</h2>
              {!editing ? (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="button-edit-roles">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCancel} data-testid="button-cancel-roles">
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    data-testid="button-save-roles"
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    {updateMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
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
              ].map((role) => {
                const isChecked = ((formData.roles as string[]) || []).includes(role.name);
                return (
                  <div
                    key={role.name}
                    className="flex items-start gap-3 p-4 rounded-md border"
                    data-testid={`role-${role.name}`}
                  >
                    <Checkbox
                      id={`role-${role.name}`}
                      checked={isChecked}
                      onCheckedChange={() => editing && toggleRole(role.name)}
                      disabled={!editing}
                      data-testid={`checkbox-role-${role.name}`}
                    />
                    <div className="space-y-1">
                      <label
                        htmlFor={`role-${role.name}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {role.label}
                      </label>
                      <p className="text-xs text-muted-foreground">{role.description}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
