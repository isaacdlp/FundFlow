export interface Role {
  id: number;
  name: string;
  description: string | null;
}

export interface OrganizerAccount {
  id: number;
  accountId: number;
  organizationId: number;
  createdAt: string;
  account: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface OrganizationWithOrganizers {
  id: number;
  name: string;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  country: string | null;
  city: string | null;
  stateProvince: string | null;
  createdAt: string;
  updatedAt: string;
  organizers: OrganizerAccount[];
}

export interface AccountWithRoles {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  birthdate: string | null;
  taxId: string | null;
  streetAddress1: string | null;
  streetAddress2: string | null;
  country: string | null;
  city: string | null;
  stateProvince: string | null;
  zipPostalCode: string | null;
  profileComplete: boolean | null;
  createdAt: string;
  updatedAt: string;
  roles: Role[];
}
