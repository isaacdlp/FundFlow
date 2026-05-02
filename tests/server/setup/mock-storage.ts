import { vi } from "vitest";

/**
 * Builds a mock implementation of the storage interface used by server/routes.ts.
 *
 * Every method is a `vi.fn()` returning a sensible empty default. Tests should
 * override only the methods they care about via `mocked(...).mockResolvedValue(...)`.
 *
 * Pass `overrides` to set initial behavior at construction time.
 */
export function makeMockStorage(overrides: Partial<Record<string, any>> = {}) {
  const defaults = {
    seedData: vi.fn().mockResolvedValue(undefined),

    getAccount: vi.fn().mockResolvedValue(null),
    getAccountByEmail: vi.fn().mockResolvedValue(null),
    getAccounts: vi.fn().mockResolvedValue([]),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    verifyPassword: vi.fn().mockResolvedValue(false),
    updatePassword: vi.fn().mockResolvedValue(undefined),

    createPasswordResetToken: vi.fn(),
    getPasswordResetToken: vi.fn().mockResolvedValue(null),
    usePasswordResetToken: vi.fn(),

    getRoles: vi.fn().mockResolvedValue([]),

    getOrganizations: vi.fn().mockResolvedValue([]),
    getOrganization: vi.fn().mockResolvedValue(null),
    getOrganizationBySlug: vi.fn().mockResolvedValue(null),
    createOrganization: vi.fn(),
    updateOrganization: vi.fn(),
    deleteOrganization: vi.fn(),
    getOrganizationIdsForAccount: vi.fn().mockResolvedValue([]),

    addOrganizer: vi.fn(),
    removeOrganizer: vi.fn(),

    getMember: vi.fn().mockResolvedValue(null),
    getMembers: vi.fn().mockResolvedValue([]),
    createMemberRequest: vi.fn(),
    updateMemberStatus: vi.fn(),
    removeMember: vi.fn(),

    getInvites: vi.fn().mockResolvedValue([]),
    getInviteByToken: vi.fn().mockResolvedValue(null),
    createInvite: vi.fn(),
    useInvite: vi.fn(),

    getSpvs: vi.fn().mockResolvedValue([]),
    getSpv: vi.fn().mockResolvedValue(null),
    createSpv: vi.fn(),
    updateSpv: vi.fn(),
    deleteSpv: vi.fn(),

    getSpvMembers: vi.fn().mockResolvedValue([]),
    addSpvMember: vi.fn(),
    updateSpvMember: vi.fn(),
    removeSpvMember: vi.fn(),
    getSpvIdsForAccount: vi.fn().mockResolvedValue([]),

    getEntities: vi.fn().mockResolvedValue([]),
    getEntity: vi.fn().mockResolvedValue(null),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
    getEntityIdsForAccount: vi.fn().mockResolvedValue([]),
    getEntityIdsOwnedByAccount: vi.fn().mockResolvedValue([]),

    getPortfolio: vi.fn().mockResolvedValue([]),
  };

  return { ...defaults, ...overrides } as any;
}

/**
 * Sample fixtures used across tests. Adjust shapes as needed.
 */
export const fixtures = {
  adminAccount: {
    id: 1,
    email: "admin@test.local",
    firstName: "Admin",
    lastName: "User",
    passwordHash: "hashed",
    roles: [{ id: 1, name: "admin", description: "Administrator" }],
  },
  memberAccount: {
    id: 2,
    email: "member@test.local",
    firstName: "Member",
    lastName: "User",
    passwordHash: "hashed",
    roles: [],
  },
  organizerAccount: {
    id: 3,
    email: "organizer@test.local",
    firstName: "Org",
    lastName: "Anizer",
    passwordHash: "hashed",
    roles: [],
  },
  organization: (overrides: Record<string, any> = {}) => ({
    id: 10,
    name: "Test Org",
    slug: "test-org",
    description: "",
    website: "",
    country: "",
    city: "",
    stateProvince: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    organizers: [],
    ...overrides,
  }),
};
