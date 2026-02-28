import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { AccountWithRoles } from "@shared/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, ChevronRight } from "lucide-react";
import { useState } from "react";

export default function Accounts() {
  const [search, setSearch] = useState("");
  const { data: accounts, isLoading } = useQuery<AccountWithRoles[]>({
    queryKey: ["/api/accounts"],
  });

  const filtered = accounts?.filter((account) => {
    return (
      !search ||
      `${account.firstName} ${account.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      account.email.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Accounts</h1>
          <p className="text-muted-foreground mt-1">
            Manage user accounts and permissions
          </p>
        </div>
        <Link href="/accounts/new">
          <Button data-testid="button-create-account">
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered && filtered.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((account) => (
                    <TableRow key={account.id} data-testid={`row-account-${account.id}`}>
                      <TableCell>
                        <Link href={`/accounts/${account.id}`}>
                          <div className="flex items-center gap-3 cursor-pointer" data-testid={`link-account-${account.id}`}>
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
                              {account.firstName[0]}{account.lastName[0]}
                            </div>
                            <span className="font-medium">
                              {account.firstName} {account.lastName}
                            </span>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {account.email}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {account.roles.map((role) => (
                            <Badge
                              key={role.id}
                              variant={role.name === "admin" ? "destructive" : "secondary"}
                            >
                              {role.name.toUpperCase()}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={account.profileComplete ? "default" : "secondary"}>
                          {account.profileComplete ? "Complete" : "Incomplete"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/accounts/${account.id}`}>
                          <Button variant="ghost" size="icon" data-testid={`button-view-account-${account.id}`}>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {search
                  ? "No accounts match your search."
                  : "No accounts yet. Click \"Add Account\" to create one."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
