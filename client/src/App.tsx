import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
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
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function AdminLayout() {
  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 p-3 border-b bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
            <AdminRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Switch>
          <Route path="/org/:slug" component={OrgLanding} />
          <Route>
            <AdminLayout />
          </Route>
        </Switch>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
