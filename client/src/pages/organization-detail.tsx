import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useLocalePath, useLocale } from "@/i18n/hooks";
import { ROUTE_PATTERNS } from "@/i18n/routes";
import type { OrganizationWithOrganizers, AccountWithRoles, MemberInfo, InviteInfo, SpvInfo } from "@shared/types";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Pencil, Save, X, UserPlus, UserMinus, Building2, Check, Ban, Copy, Link2, Trash2, Plus, FileText } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useOrgPermissions } from "@/hooks/use-org-permissions";

function MembersTab({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const { toast } = useToast();

  const { data: members, isLoading } = useQuery<MemberInfo[]>({
    queryKey: ["/api/organizations", orgId, "members"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ accountId, status }: { accountId: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/organizations/${orgId}/members/${accountId}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId, "members"] });
      toast({ title: "Member status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update member", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const res = await apiRequest("DELETE", `/api/organizations/${orgId}/members/${accountId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId, "members"] });
      toast({ title: "Member removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove member", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const pending = members?.filter(m => m.status === "pending") || [];
  const approved = members?.filter(m => m.status === "approved") || [];
  const rejected = members?.filter(m => m.status === "rejected") || [];

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Pending Requests</h2>
              <Badge variant="secondary">{pending.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.map(member => (
              <div key={member.id} className="flex items-center gap-3 p-3 rounded-md border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950" data-testid={`member-pending-${member.accountId}`}>
                <div className="h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center text-yellow-700 dark:text-yellow-300 text-sm font-semibold flex-shrink-0">
                  {member.account.firstName[0]}{member.account.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{member.account.firstName} {member.account.lastName}</p>
                  <p className="text-xs text-muted-foreground truncate">{member.account.email}</p>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 border-green-300 hover:bg-green-50"
                      onClick={() => updateStatusMutation.mutate({ accountId: member.accountId, status: "approved" })}
                      disabled={updateStatusMutation.isPending}
                      data-testid={`button-approve-${member.accountId}`}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => updateStatusMutation.mutate({ accountId: member.accountId, status: "rejected" })}
                      disabled={updateStatusMutation.isPending}
                      data-testid={`button-reject-${member.accountId}`}
                    >
                      <Ban className="h-3.5 w-3.5 mr-1" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Approved Members</h2>
            <Badge variant="secondary">{approved.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {approved.length > 0 ? (
            <div className="space-y-3">
              {approved.map(member => (
                <div key={member.id} className="flex items-center gap-3 p-3 rounded-md border" data-testid={`member-approved-${member.accountId}`}>
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-green-700 dark:text-green-300 text-sm font-semibold flex-shrink-0">
                    {member.account.firstName[0]}{member.account.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{member.account.firstName} {member.account.lastName}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.account.email}</p>
                  </div>
                  {member.inviteId && <Badge variant="outline" className="text-xs">Via Invite</Badge>}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMutation.mutate(member.accountId)}
                      disabled={removeMutation.isPending}
                      data-testid={`button-remove-member-${member.accountId}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No approved members yet.</p>
          )}
        </CardContent>
      </Card>

      {rejected.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Rejected</h2>
              <Badge variant="secondary">{rejected.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {rejected.map(member => (
              <div key={member.id} className="flex items-center gap-3 p-3 rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950" data-testid={`member-rejected-${member.accountId}`}>
                <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center text-red-700 dark:text-red-300 text-sm font-semibold flex-shrink-0">
                  {member.account.firstName[0]}{member.account.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{member.account.firstName} {member.account.lastName}</p>
                  <p className="text-xs text-muted-foreground truncate">{member.account.email}</p>
                </div>
                {canEdit && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatusMutation.mutate({ accountId: member.accountId, status: "approved" })}
                      disabled={updateStatusMutation.isPending}
                      data-testid={`button-reapprove-${member.accountId}`}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Re-approve
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMutation.mutate(member.accountId)}
                      disabled={removeMutation.isPending}
                      data-testid={`button-remove-rejected-${member.accountId}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(!members || members.length === 0) && (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">No membership requests yet. Share the organization's landing page or invite link to get started.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SpvsTab({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const lpSpv = useLocalePath();

  const { data: spvsList, isLoading } = useQuery<SpvInfo[]>({
    queryKey: ["/api/organizations", orgId, "spvs"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (spvId: number) => {
      const res = await apiRequest("DELETE", `/api/spvs/${spvId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId, "spvs"] });
      toast({ title: "SPV deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete SPV", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
          <div>
            <h2 className="text-lg font-semibold">Special Purpose Vehicles</h2>
            <p className="text-sm text-muted-foreground mt-1">
              SPVs created within this organization
            </p>
          </div>
          {canEdit && (
            <Link href={lpSpv("organizationSpvNew", { orgId })}>
              <Button data-testid="button-add-spv">
                <Plus className="h-4 w-4 mr-2" />
                Add SPV
              </Button>
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {spvsList && spvsList.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Entity Type</TableHead>
                    <TableHead className="text-center">Members</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Total Being Raised</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spvsList.map(spv => (
                    <TableRow key={spv.id} data-testid={`spv-row-${spv.id}`}>
                      <TableCell>
                        <Link href={lpSpv("spvDetail", { id: spv.id })}>
                          <div className="cursor-pointer">
                            <p className="text-sm font-medium hover:underline" data-testid={`text-spv-name-${spv.id}`}>
                              {spv.displayName}
                            </p>
                            <p className="text-xs text-muted-foreground">{spv.legalName}</p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{spv.entityType || "LLC"}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{spv.memberCount}</TableCell>
                      <TableCell>
                        {spv.manager ? (
                          <span className="text-sm">{spv.manager.firstName} {spv.manager.lastName}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not assigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {parseFloat(spv.totalBeingRaised || "0") > 0 ? (
                          <span className="text-sm font-medium">
                            ${parseFloat(spv.totalBeingRaised || "0").toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">$0.00</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => navigate(lpSpv("spvDetail", { id: spv.id }))} data-testid={`button-view-spv-${spv.id}`}>
                            <FileText className="h-4 w-4" />
                          </Button>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(spv.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-spv-${spv.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No SPVs created yet. Click "Add SPV" to create one.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InvitesTab({ orgId, slug, canEdit }: { orgId: string; slug: string; canEdit: boolean }) {
  const { toast } = useToast();

  const { data: invites, isLoading } = useQuery<InviteInfo[]>({
    queryKey: ["/api/organizations", orgId, "invites"],
  });

  const createInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/organizations/${orgId}/invites`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId, "invites"] });
      toast({ title: "Invite link generated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate invite", description: error.message, variant: "destructive" });
    },
  });

  const copyInviteUrl = (token: string) => {
    const url = `${window.location.origin}/org/${slug}?invite=${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Invite link copied to clipboard" });
  };

  const copyLandingUrl = () => {
    const url = `${window.location.origin}/org/${slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Landing page URL copied to clipboard" });
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
          <div>
            <h2 className="text-lg font-semibold">Landing Page</h2>
            <p className="text-sm text-muted-foreground mt-1">Share this URL for users to request access</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={`${window.location.origin}/org/${slug}`}
              className="font-mono text-sm"
              data-testid="input-landing-url"
            />
            <Button variant="outline" size="icon" onClick={copyLandingUrl} data-testid="button-copy-landing-url">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
          <div>
            <h2 className="text-lg font-semibold">Invite Links</h2>
            <p className="text-sm text-muted-foreground mt-1">Single-use links that grant pre-approved access</p>
          </div>
          {canEdit && (
            <Button
              onClick={() => createInviteMutation.mutate()}
              disabled={createInviteMutation.isPending}
              data-testid="button-generate-invite"
            >
              <Link2 className="h-4 w-4 mr-2" />
              {createInviteMutation.isPending ? "Generating..." : "Generate Invite"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {invites && invites.length > 0 ? (
            <div className="space-y-3">
              {invites.map(invite => (
                <div key={invite.id} className="flex items-center gap-3 p-3 rounded-md border" data-testid={`invite-${invite.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-muted-foreground truncate max-w-[200px]" data-testid={`text-invite-token-${invite.id}`}>
                        {invite.token.substring(0, 16)}...
                      </code>
                      {invite.used ? (
                        <Badge variant="secondary">Used</Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-600 border-green-300">Available</Badge>
                      )}
                    </div>
                    {invite.usedByAccount && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Used by {invite.usedByAccount.firstName} {invite.usedByAccount.lastName} ({invite.usedByAccount.email})
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Created {new Date(invite.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {!invite.used && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyInviteUrl(invite.token)}
                      data-testid={`button-copy-invite-${invite.id}`}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copy Link
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              No invite links generated yet. Click "Generate Invite" to create one.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function OrganizationDetail() {
  const locale = useLocale();
  const lp = useLocalePath();
  const { t } = useTranslation();
  const [, params] = useRoute(ROUTE_PATTERNS.organizationDetail[locale]);
  const orgId = params?.id;
  const { toast } = useToast();
  const { canManageOrg } = useOrgPermissions();
  const canEdit = canManageOrg(orgId ? parseInt(orgId) : null);
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
      <Link href={lp("organizations")}>
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          {t("organizationDetail.back", "Back to organizations")}
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
          {canEdit && <TabsTrigger value="spvs" data-testid="tab-spvs">SPVs</TabsTrigger>}
          {canEdit && <TabsTrigger value="members" data-testid="tab-members">Members</TabsTrigger>}
          {canEdit && <TabsTrigger value="invites" data-testid="tab-invites">Invites</TabsTrigger>}
        </TabsList>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
              <h2 className="text-lg font-semibold">Organization Settings</h2>
              {canEdit && (!editing ? (
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
              ))}
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
                <Label htmlFor="slug">Slug (URL identifier)</Label>
                <Input
                  id="slug"
                  value={org.slug}
                  disabled
                  className="font-mono text-sm"
                  data-testid="input-slug"
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
              {canEdit && (
                <>
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
                </>
              )}

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
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeOrganizerMutation.mutate(organizer.accountId)}
                          disabled={removeOrganizerMutation.isPending}
                          data-testid={`button-remove-organizer-${organizer.accountId}`}
                        >
                          <UserMinus className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
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

        <TabsContent value="spvs" className="mt-6">
          <SpvsTab orgId={orgId!} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="members" className="mt-6">
          <MembersTab orgId={orgId!} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="invites" className="mt-6">
          <InvitesTab orgId={orgId!} slug={org.slug} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
