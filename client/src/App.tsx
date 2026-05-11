import { useEffect } from "react";
import { Switch, Route, Link, Router as WouterRouter } from "wouter";
import { useTranslation } from "react-i18next";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Accounts from "@/pages/accounts";
import AccountDetail from "@/pages/account-detail";
import CreateAccount from "@/pages/create-account";
import Organizations from "@/pages/organizations";
import OrganizationDetail from "@/pages/organization-detail";
import CreateOrganization from "@/pages/create-organization";
import OrgLanding from "@/pages/org-landing";
import Spvs from "@/pages/spvs";
import CreateSpv from "@/pages/create-spv";
import SpvDetail from "@/pages/spv-detail";
import Entities from "@/pages/entities";
import CreateEntity from "@/pages/create-entity";
import EntityDetail from "@/pages/entity-detail";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Settings from "@/pages/settings";
import Documents from "@/pages/documents";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  ROUTE_PATTERNS,
  LOCALES,
  DEFAULT_LOCALE,
  getLocaleFromPath,
  type Locale,
} from "@/i18n/routes";
import { useLocalePath, useLocale } from "@/i18n/hooks";

function AdminRouter({ locale }: { locale: Locale }) {
  const r = ROUTE_PATTERNS;
  return (
    <Switch>
      <Route path={r.accountNew[locale]} component={CreateAccount} />
      <Route path={r.accountDetail[locale]} component={AccountDetail} />
      <Route path={r.accounts[locale]} component={Accounts} />
      <Route path={r.organizationNew[locale]} component={CreateOrganization} />
      <Route path={r.organizationSpvNew[locale]} component={CreateSpv} />
      <Route path={r.organizationDetail[locale]} component={OrganizationDetail} />
      <Route path={r.organizations[locale]} component={Organizations} />
      <Route path={r.spvDetail[locale]} component={SpvDetail} />
      <Route path={r.spvs[locale]} component={Spvs} />
      <Route path={r.entityNew[locale]} component={CreateEntity} />
      <Route path={r.entityDetail[locale]} component={EntityDetail} />
      <Route path={r.entities[locale]} component={Entities} />
      <Route path={r.documents[locale]} component={Documents} />
      <Route path={r.settingsDocuments[locale]} component={Settings} />
      <Route path={r.settingsManagement[locale]} component={Settings} />
      <Route path={r.settingsApiTokens[locale]} component={Settings} />
      <Route path={r.settings[locale]} component={Settings} />
      <Route path={r.dashboard[locale]} component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function AdminLayout({ locale }: { locale: Locale }) {
  const { user, logoutMutation } = useAuth();
  const lp = useLocalePath();
  const { t } = useTranslation();

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 p-3 border-b bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1" />
            <LanguageSwitcher />
            {user && (
              <div className="flex items-center gap-3">
                <Link href={lp("accountDetail", { id: user.id })}>
                  <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors" data-testid="text-user-name">
                    {user.firstName} {user.lastName}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  {t("common.signOut")}
                </Button>
              </div>
            )}
          </header>
          <main className="flex-1 overflow-auto">
            <AdminRouter locale={locale} />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function ProtectedApp() {
  const { user, isLoading } = useAuth();
  const locale = useLocale();
  const r = ROUTE_PATTERNS;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path={r.orgLanding[locale]} component={OrgLanding} />
      <Route path={r.forgotPassword[locale]} component={ForgotPassword} />
      <Route path={r.resetPassword[locale]} component={ResetPassword} />
      <Route>{user ? <AdminLayout locale={locale} /> : <Login />}</Route>
    </Switch>
  );
}

/** Detect target locale on bare paths and redirect to /<lang>/... once at startup. */
function LocalePrefixGuard({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();

  useEffect(() => {
    const path = window.location.pathname;
    const fromUrl = getLocaleFromPath(path);
    if (fromUrl) {
      // URL is authoritative — sync i18n if it disagrees so strings render correctly.
      if (i18n.language !== fromUrl) i18n.changeLanguage(fromUrl);
      return;
    }

    // Determine preferred locale: localStorage → navigator → DEFAULT_LOCALE
    let target: Locale = DEFAULT_LOCALE;
    try {
      const stored = window.localStorage.getItem("fundflow:lang");
      if (stored && (LOCALES as readonly string[]).includes(stored)) {
        target = stored as Locale;
      } else if (typeof navigator !== "undefined") {
        const nav = navigator.language?.slice(0, 2);
        if (nav && (LOCALES as readonly string[]).includes(nav)) target = nav as Locale;
      }
    } catch {
      // ignore
    }

    const search = window.location.search;
    const newPath = path === "/" ? `/${target}` : `/${target}${path}`;
    window.history.replaceState({}, "", newPath + search);
    if (i18n.language !== target) i18n.changeLanguage(target);
    // Trigger wouter to pick up the new path.
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [i18n]);

  return <>{children}</>;
}

function LocalizedRouter() {
  const locale = useLocale();
  // wouter base is the URL prefix wouter strips before matching routes.
  return (
    <WouterRouter base={`/${locale}`} key={locale}>
      <ProtectedApp />
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <LocalePrefixGuard>
            <LocalizedRouter />
          </LocalePrefixGuard>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
