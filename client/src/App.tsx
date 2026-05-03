import { Switch, Route, Link } from "wouter";
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
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

function AdminRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/accounts" component={Accounts} />
      <Route path="/accounts/new" component={CreateAccount} />
      <Route path="/accounts/:id" component={AccountDetail} />
      <Route path="/organizations" component={Organizations} />
      <Route path="/organizations/new" component={CreateOrganization} />
      <Route path="/organizations/:orgId/spvs/new" component={CreateSpv} />
      <Route path="/organizations/:id" component={OrganizationDetail} />
      <Route path="/spvs" component={Spvs} />
      <Route path="/spvs/:id" component={SpvDetail} />
      <Route path="/entities" component={Entities} />
      <Route path="/entities/new" component={CreateEntity} />
      <Route path="/entities/:id" component={EntityDetail} />
      <Route path="/settings" component={Settings} />
      <Route path="/settings/management" component={Settings} />
      <Route path="/settings/api-tokens" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function AdminLayout() {
  const { user, logoutMutation } = useAuth();

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 p-3 border-b bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1" />
            {user && (
              <div className="flex items-center gap-3">
                <Link href={`/accounts/${user.id}`}>
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
                  Sign Out
                </Button>
              </div>
            )}
          </header>
          <main className="flex-1 overflow-auto">
            <AdminRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function ProtectedApp() {
  const { user, isLoading } = useAuth();

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
      <Route path="/org/:slug" component={OrgLanding} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route>
        {user ? <AdminLayout /> : <Login />}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ProtectedApp />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
