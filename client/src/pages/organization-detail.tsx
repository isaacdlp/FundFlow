import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import type { OrganizationWithOrganizers, AccountWithRoles } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Pencil, Save, X, UserPlus, UserMinus, Building2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export default function OrganizationDetail() {
  const [, params] = useRoute("/organizations/:id");
  const orgId = params?.id;
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("settings");
  const [selectedAccountId, setSelectedAccountId] = useState("");

  const { data: org, isLoading } = useQuery<OrganizationWithOrganizers>({
    queryKey: ["/api/organizations", orgId],
    enabled: !!orgId,
  });

  const { data: allAccounts } = useQuery<AccountWithRoles[]>({
    queryKey: ["/api/accounts"],
  });

  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    if (org) {
      setFormData({
        name: org.name || "",
        description: org.description || "",
        website: org.website || "",
        country: org.country || "",
        city: org.city || "",
        stateProvince: org.stateProvince || "",
      });
    }
  }, [org]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await apiRequest("PATCH", `/api/organizations/${orgId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      setEditing(false);
      toast({ title: "Organization updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update organization", description: error.message, variant: "destructive" });
    },
  });

  const addOrganizerMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const res = await apiRequest("POST", `/api/organizations/${orgId}/organizers`, { accountId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      setSelectedAccountId("");
      toast({ title: "Organizer added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add organizer", description: error.message, variant: "destructive" });
    },
  });

  const removeOrganizerMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const res = await apiRequest("DELETE", `/api/organizations/${orgId}/organizers/${accountId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      toast({ title: "Organizer removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove organizer", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleCancel = () => {
    if (org) {
      setFormData({
        name: org.name || "",
        description: org.description || "",
        website: org.website || "",
        country: org.country || "",
        city: org.city || "",
        stateProvince: org.stateProvince || "",
      });
    }
    setEditing(false);
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const availableAccounts = allAccounts?.filter(
    (a) => !org?.organizers.some((o) => o.accountId === a.id)
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
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

  return (
    <div className="p-6 space-y-6">
      <Link href="/organizations">
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          Back to Organizations
        </Button>
      </Link>

      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
          <Building2 className="h-8 w-8" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold" data-testid="text-org-name">{org.name}</h1>
          {org.description && (
            <p className="text-muted-foreground mt-0.5" data-testid="text-org-description">{org.description}</p>
          )}
          <div className="flex gap-2 mt-1 flex-wrap">
            <Badge variant="secondary">
              {org.organizers.length} Organizer{org.organizers.length !== 1 ? "s" : ""}
            </Badge>
            {org.country && (
              <Badge variant="outline">
                {[org.city, org.country].filter(Boolean).join(", ")}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
          <TabsTrigger value="organizers" data-testid="tab-organizers">Organizers</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
              <h2 className="text-lg font-semibold">Organization Settings</h2>
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
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Organization Name *</Label>
                <Input
                  id="name"
                  value={formData.name || ""}
                  onChange={(e) => updateField("name", e.target.value)}
                  disabled={!editing}
                  data-testid="input-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => updateField("description", e.target.value)}
                  disabled={!editing}
                  data-testid="input-description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={formData.website || ""}
                  onChange={(e) => updateField("website", e.target.value)}
                  disabled={!editing}
                  placeholder="https://..."
                  data-testid="input-website"
                />
              </div>

              <Separator />

              <h3 className="text-base font-semibold">Location</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city || ""}
                    onChange={(e) => updateField("city", e.target.value)}
                    disabled={!editing}
                    data-testid="input-city"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stateProvince">State / Province</Label>
                  <Input
                    id="stateProvince"
                    value={formData.stateProvince || ""}
                    onChange={(e) => updateField("stateProvince", e.target.value)}
                    disabled={!editing}
                    data-testid="input-state"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={formData.country || ""}
                    onChange={(e) => updateField("country", e.target.value)}
                    disabled={!editing}
                    data-testid="input-country"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Created: {new Date(org.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </p>
                <p className="text-sm text-muted-foreground">
                  Last updated: {new Date(org.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="organizers" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
              <div>
                <h2 className="text-lg font-semibold">Organizers</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Organizers can manage this organization's settings, funds, and SPVs
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-2">
                  <Label>Add Organizer</Label>
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger data-testid="select-organizer">
                      <SelectValue placeholder="Select an account..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAccounts && availableAccounts.length > 0 ? (
                        availableAccounts.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.firstName} {a.lastName} ({a.email})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>No accounts available</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => selectedAccountId && addOrganizerMutation.mutate(parseInt(selectedAccountId))}
                  disabled={!selectedAccountId || addOrganizerMutation.isPending}
                  data-testid="button-add-organizer"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  {addOrganizerMutation.isPending ? "Adding..." : "Add"}
                </Button>
              </div>

              <Separator />

              {org.organizers.length > 0 ? (
                <div className="space-y-3">
                  {org.organizers.map((organizer) => (
                    <div
                      key={organizer.id}
                      className="flex items-center gap-3 p-3 rounded-md border"
                      data-testid={`organizer-${organizer.accountId}`}
                    >
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
                        {organizer.account.firstName[0]}{organizer.account.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {organizer.account.firstName} {organizer.account.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{organizer.account.email}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOrganizerMutation.mutate(organizer.accountId)}
                        disabled={removeOrganizerMutation.isPending}
                        data-testid={`button-remove-organizer-${organizer.accountId}`}
                      >
                        <UserMinus className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    No organizers assigned yet. Add an account as an organizer above.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
