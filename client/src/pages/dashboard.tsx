import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountWithRoles } from "@shared/types";
import { Users, Briefcase, TrendingUp, Building2 } from "lucide-react";

export default function Dashboard() {
  const { data: accounts, isLoading } = useQuery<AccountWithRoles[]>({
    queryKey: ["/api/accounts"],
  });

  const stats = [
    {
      label: "Total Users",
      value: accounts?.length ?? 0,
      icon: Users,
      description: "Registered accounts",
    },
    {
      label: "Fund Managers",
      value: accounts?.filter((a) => a.roles.some((r) => r.name === "gp")).length ?? 0,
      icon: Briefcase,
      description: "General Partners",
    },
    {
      label: "Investors",
      value: accounts?.filter((a) => a.roles.some((r) => r.name === "lp")).length ?? 0,
      icon: TrendingUp,
      description: "Limited Partners",
    },
    {
      label: "Active Funds",
      value: 0,
      icon: Building2,
      description: "Coming soon",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Platform overview and key metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold" data-testid={`text-stat-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>
                  {stat.value}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Recent Accounts</h2>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : accounts && accounts.length > 0 ? (
            <div className="space-y-3">
              {accounts.slice(0, 5).map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-3 p-3 rounded-md bg-muted/50"
                  data-testid={`row-account-${account.id}`}
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
                    {account.firstName[0]}{account.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {account.firstName} {account.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{account.email}</p>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {account.roles.map((role) => (
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
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No accounts yet. Create one from the Accounts page.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
