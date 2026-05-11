import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert, Settings as SettingsIcon, FolderKanban, Key, Files } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ApiTokensSection } from "./api-tokens";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type TabValue = "general" | "management" | "documents" | "api-tokens";

const TABS: { value: TabValue; label: string; icon: typeof SettingsIcon; adminOnly?: boolean; path: string }[] = [
  { value: "general", label: "General", icon: SettingsIcon, path: "/settings" },
  { value: "management", label: "Management", icon: FolderKanban, adminOnly: true, path: "/settings/management" },
  { value: "documents", label: "Documents", icon: Files, adminOnly: true, path: "/settings/documents" },
  { value: "api-tokens", label: "API Tokens", icon: Key, adminOnly: true, path: "/settings/api-tokens" },
];

function tabFromPath(pathname: string): TabValue {
  if (pathname.startsWith("/settings/api-tokens")) return "api-tokens";
  if (pathname.startsWith("/settings/documents")) return "documents";
  if (pathname.startsWith("/settings/management")) return "management";
  return "general";
}

function DocumentsStorageSection() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ configured: string; effective: string; default: string }>({
    queryKey: ["/api/settings/documents-path"],
  });
  const [value, setValue] = useState("");
  useEffect(() => { if (data && value === "") setValue(data.configured ?? ""); }, [data]); // eslint-disable-line

  const save = useMutation({
    mutationFn: async () => apiRequest("PATCH", "/api/settings/documents-path", { value }),
    onSuccess: () => {
      toast({ title: "Storage path updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/documents-path"] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents Storage</CardTitle>
        <CardDescription>
          Filesystem path where uploaded documents are stored. Leave empty to use the default location.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="docs-path">Storage Path</Label>
          <Input
            id="docs-path"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={data?.default ?? "./uploads/documents"}
            disabled={isLoading}
            data-testid="input-documents-path"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Effective path: <code data-testid="text-effective-path">{data?.effective ?? "—"}</code>
          </p>
          <p className="text-xs text-muted-foreground">
            Default: <code>{data?.default ?? "—"}</code>
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-documents-path">
          {save.isPending ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { isAdmin, user } = useAuth();
  const [location, setLocation] = useLocation();
  const [tab, setTab] = useState<TabValue>(() => tabFromPath(location));

  // Keep tab + URL in sync (handles back/forward + initial deep links)
  useEffect(() => {
    const fromUrl = tabFromPath(location);
    if (fromUrl !== tab) setTab(fromUrl);
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

  const handleTabChange = (next: string) => {
    const target = TABS.find(t => t.value === next);
    if (!target) return;
    setTab(next as TabValue);
    if (location !== target.path) setLocation(target.path);
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
          <SettingsIcon className="h-6 w-6" /> Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account, organization administration, and API access.
        </p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          {visibleTabs.map(t => (
            <TabsTrigger key={t.value} value={t.value} data-testid={`tab-${t.value}`}>
              <t.icon className="h-4 w-4 mr-2" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Your account profile and preferences.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {user ? (
                <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm" data-testid="list-account-info">
                  <dt className="text-muted-foreground">Name</dt>
                  <dd data-testid="text-account-name">{user.firstName} {user.lastName}</dd>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd data-testid="text-account-email">{user.email}</dd>
                  <dt className="text-muted-foreground">Roles</dt>
                  <dd data-testid="text-account-roles">{user.roles.map(r => r.name).join(", ") || "—"}</dd>
                </dl>
              ) : null}
              <p className="text-xs text-muted-foreground pt-2">
                To edit your name, email, or password, open your <a className="underline" href={user ? `/accounts/${user.id}` : "#"} data-testid="link-account-detail">account page</a>.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="management" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Management</CardTitle>
                <CardDescription>Administrative shortcuts for managing the platform.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="space-y-2">
                  <li>
                    <a className="underline" href="/accounts" data-testid="link-mgmt-accounts">Manage accounts</a>
                    <span className="text-muted-foreground"> — view, edit, and delete user accounts.</span>
                  </li>
                  <li>
                    <a className="underline" href="/organizations" data-testid="link-mgmt-orgs">Manage organizations</a>
                    <span className="text-muted-foreground"> — create and configure tenant organizations.</span>
                  </li>
                  <li>
                    <a className="underline" href="/spvs" data-testid="link-mgmt-spvs">Manage SPVs</a>
                    <span className="text-muted-foreground"> — view all special-purpose vehicles.</span>
                  </li>
                  <li>
                    <a className="underline" href="/entities" data-testid="link-mgmt-entities">Manage entities</a>
                    <span className="text-muted-foreground"> — view all legal entities.</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="documents" className="mt-6">
            <DocumentsStorageSection />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="api-tokens" className="mt-6">
            <ApiTokensSection />
          </TabsContent>
        )}
      </Tabs>

      {!isAdmin && tab !== "general" && (
        <Alert variant="destructive" data-testid="alert-admin-required">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>This section is only available to administrators.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
