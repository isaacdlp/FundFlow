import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Trans, useTranslation } from "react-i18next";
import { useLocale, useLocaleFullPath } from "@/i18n/hooks";
import { ROUTE_PATTERNS } from "@/i18n/routes";
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

type TabRouteKey = "settings" | "settingsManagement" | "settingsDocuments" | "settingsApiTokens";

const TABS: { value: TabValue; labelKey: string; icon: typeof SettingsIcon; adminOnly?: boolean; routeKey: TabRouteKey }[] = [
  { value: "general", labelKey: "settings.tabGeneral", icon: SettingsIcon, routeKey: "settings" },
  { value: "management", labelKey: "settings.tabManagement", icon: FolderKanban, adminOnly: true, routeKey: "settingsManagement" },
  { value: "documents", labelKey: "settings.tabDocuments", icon: Files, adminOnly: true, routeKey: "settingsDocuments" },
  { value: "api-tokens", labelKey: "settings.tabApiTokens", icon: Key, adminOnly: true, routeKey: "settingsApiTokens" },
];

function tabFromPath(pathname: string): TabValue {
  // Match against any locale's settings sub-paths.
  for (const loc of ["en", "es", "fr"] as const) {
    if (pathname.startsWith(ROUTE_PATTERNS.settingsApiTokens[loc])) return "api-tokens";
    if (pathname.startsWith(ROUTE_PATTERNS.settingsDocuments[loc])) return "documents";
    if (pathname.startsWith(ROUTE_PATTERNS.settingsManagement[loc])) return "management";
  }
  return "general";
}

function DocumentsStorageSection() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<{ configured: string; effective: string; default: string }>({
    queryKey: ["/api/settings/documents-path"],
  });
  const [value, setValue] = useState("");
  useEffect(() => { if (data && value === "") setValue(data.configured ?? ""); }, [data]); // eslint-disable-line

  const save = useMutation({
    mutationFn: async () => apiRequest("PATCH", "/api/settings/documents-path", { value }),
    onSuccess: () => {
      toast({ title: t("settings.storagePathUpdated") });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/documents-path"] });
    },
    onError: (e: any) => toast({ title: t("settings.updateFailed"), description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.documentsStorageTitle")}</CardTitle>
        <CardDescription>
          {t("settings.documentsStorageDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="docs-path">{t("settings.storagePath")}</Label>
          <Input
            id="docs-path"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={data?.default ?? "./uploads/documents"}
            disabled={isLoading}
            data-testid="input-documents-path"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t("settings.effectivePath")}: <code data-testid="text-effective-path">{data?.effective ?? "—"}</code>
          </p>
          <p className="text-xs text-muted-foreground">
            {t("settings.defaultPath")}: <code>{data?.default ?? "—"}</code>
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-documents-path">
          {save.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { isAdmin, user } = useAuth();
  const [location, setLocation] = useLocation();
  const locale = useLocale();
  const lfp = useLocaleFullPath();
  const { t } = useTranslation();
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
    const targetPath = ROUTE_PATTERNS[target.routeKey][locale];
    if (location !== targetPath) setLocation(targetPath);
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
          <SettingsIcon className="h-6 w-6" /> {t("settings.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("settings.pageSubtitle")}
        </p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          {visibleTabs.map(item => (
            <TabsTrigger key={item.value} value={item.value} data-testid={`tab-${item.value}`}>
              <item.icon className="h-4 w-4 mr-2" />
              {t(item.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.tabGeneral")}</CardTitle>
              <CardDescription>{t("settings.generalDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {user ? (
                <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm" data-testid="list-account-info">
                  <dt className="text-muted-foreground">{t("common.name")}</dt>
                  <dd data-testid="text-account-name">{user.firstName} {user.lastName}</dd>
                  <dt className="text-muted-foreground">{t("common.email")}</dt>
                  <dd data-testid="text-account-email">{user.email}</dd>
                  <dt className="text-muted-foreground">{t("settings.roles")}</dt>
                  <dd data-testid="text-account-roles">{user.roles.map(r => r.name).join(", ") || "—"}</dd>
                </dl>
              ) : null}
              <p className="text-xs text-muted-foreground pt-2">
                <Trans
                  i18nKey="settings.editAccountHint"
                  components={[
                    <a key="0" className="underline" href={user ? lfp("accountDetail", { id: user.id }) : "#"} data-testid="link-account-detail" />,
                  ]}
                />
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="management" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.managementTitle")}</CardTitle>
                <CardDescription>{t("settings.managementSubtitle")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="space-y-2">
                  <li>
                    <a className="underline" href={lfp("accounts")} data-testid="link-mgmt-accounts">{t("settings.manageAccounts")}</a>
                    <span className="text-muted-foreground"> — {t("settings.manageAccountsDescription")}</span>
                  </li>
                  <li>
                    <a className="underline" href={lfp("organizations")} data-testid="link-mgmt-orgs">{t("settings.manageOrganizations")}</a>
                    <span className="text-muted-foreground"> — {t("settings.manageOrganizationsDescription")}</span>
                  </li>
                  <li>
                    <a className="underline" href={lfp("spvs")} data-testid="link-mgmt-spvs">{t("settings.manageSpvs")}</a>
                    <span className="text-muted-foreground"> — {t("settings.manageSpvsDescription")}</span>
                  </li>
                  <li>
                    <a className="underline" href={lfp("entities")} data-testid="link-mgmt-entities">{t("settings.manageEntities")}</a>
                    <span className="text-muted-foreground"> — {t("settings.manageEntitiesDescription")}</span>
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
          <AlertDescription>{t("settings.adminOnly")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
