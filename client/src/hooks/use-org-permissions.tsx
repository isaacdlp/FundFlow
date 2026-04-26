import { useQuery } from "@tanstack/react-query";
import type { OrganizationWithOrganizers } from "@shared/types";
import { useAuth } from "@/hooks/use-auth";

export function useOrgPermissions() {
  const { user, isAdmin } = useAuth();

  const { data: orgs } = useQuery<OrganizationWithOrganizers[]>({
    queryKey: ["/api/organizations"],
    enabled: !!user && !isAdmin,
  });

  const organizerOrgIds = new Set<number>(
    !user
      ? []
      : (orgs ?? [])
          .filter((o) => o.organizers.some((org) => org.accountId === user.id))
          .map((o) => o.id),
  );

  function canManageOrg(orgId: number | null | undefined): boolean {
    if (!user) return false;
    if (isAdmin) return true;
    if (orgId == null) return false;
    return organizerOrgIds.has(orgId);
  }

  return { canManageOrg, isAdmin };
}
