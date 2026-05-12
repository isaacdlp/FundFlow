import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Building2,
  Building,
  Users,
  Settings,
  FileText,
  Files,
  TrendingUp,
  ArrowLeftRight,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useLocalePath } from "@/i18n/hooks";
import type { RouteKey } from "@/i18n/routes";

interface NavItem {
  routeKey: RouteKey;
  labelKey: string;
  icon: typeof LayoutDashboard;
  testId: string;
  adminOnly?: boolean;
}

const mainNav: NavItem[] = [
  { routeKey: "dashboard",     labelKey: "nav.dashboard",     icon: LayoutDashboard, testId: "link-dashboard" },
  { routeKey: "organizations", labelKey: "nav.organizations", icon: Building2,       testId: "link-organizations" },
  { routeKey: "spvs",          labelKey: "nav.spvs",          icon: FileText,        testId: "link-spvs" },
  { routeKey: "documents",     labelKey: "nav.documents",     icon: Files,           testId: "link-documents" },
  { routeKey: "accounts",      labelKey: "nav.accounts",      icon: Users,           testId: "link-accounts" },
  { routeKey: "entities",      labelKey: "nav.entities",      icon: Building,        testId: "link-entities" },
];

const managementNav: NavItem[] = [
  { routeKey: "settings", labelKey: "nav.settings", icon: Settings, testId: "link-settings" },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isAdmin, isImpersonating, realAdmin, returnToSelfMutation } = useAuth();
  const { t } = useTranslation();
  const lp = useLocalePath();

  const visibleMainNav = mainNav.filter(item => !item.adminOnly || isAdmin);
  const visibleManagementNav = managementNav.filter(item => !item.adminOnly || isAdmin);

  const initials = user
    ? `${user.firstName[0] || ""}${user.lastName[0] || ""}`.toUpperCase()
    : "??";

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location === path || location.startsWith(path);
  };

  return (
    <Sidebar>
      {isImpersonating && realAdmin && (
        <div className="bg-blue-100 text-blue-900 px-3 py-2 text-xs">
          <p className="font-semibold truncate">
            {t("impersonation.banner", { name: `${user?.firstName} ${user?.lastName}` })}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-6 px-2 text-xs font-medium text-blue-900 hover:bg-blue-200 hover:text-blue-900 w-full justify-start"
            onClick={() => returnToSelfMutation.mutate()}
            disabled={returnToSelfMutation.isPending}
            data-testid="button-return-to-self"
          >
            <ArrowLeftRight className="h-3 w-3 mr-1.5" />
            {t("impersonation.returnToSelf", { name: `${realAdmin.firstName} ${realAdmin.lastName}` })}
          </Button>
        </div>
      )}
      <SidebarHeader className="p-4">
        <Link href={lp("dashboard")} data-testid="link-home">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <span className="text-sm font-semibold">{t("common.appName")}</span>
              <span className="block text-xs text-muted-foreground">{t("common.tagline")}</span>
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.platform")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMainNav.map((item) => {
                const url = lp(item.routeKey);
                return (
                  <SidebarMenuItem key={item.routeKey}>
                    <SidebarMenuButton asChild data-active={isActive(url)}>
                      <Link href={url} data-testid={item.testId}>
                        <item.icon className="h-4 w-4" />
                        <span>{t(item.labelKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.administration")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleManagementNav.map((item) => {
                const url = lp(item.routeKey);
                return (
                  <SidebarMenuItem key={item.routeKey}>
                    <SidebarMenuButton asChild data-active={isActive(url)}>
                      <Link href={url} data-testid={item.testId}>
                        <item.icon className="h-4 w-4" />
                        <span>{t(item.labelKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <Link href={user ? lp("accountDetail", { id: user.id }) : "#"}>
          <div className="flex items-center gap-2 cursor-pointer rounded-md p-1 -m-1 hover:bg-sidebar-accent transition-colors" data-testid="link-sidebar-user">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" data-testid="text-sidebar-user">
                {user ? `${user.firstName} ${user.lastName}` : t("common.loading")}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {isAdmin ? t("common.admin") : user?.roles?.map(r => r.name.toUpperCase()).join(", ") || t("common.user")}
              </p>
            </div>
          </div>
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}
