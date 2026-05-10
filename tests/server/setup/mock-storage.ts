import { vi } from "vitest";

/**
 * Builds a mock implementation of the IStorage interface used by server/routes.ts.
 *
 * Every method is a `vi.fn()` returning a sensible empty default. Tests should
 * override only the methods they care about via
 * `mocked(storage.someMethod).mockResolvedValue(...)`.
 *
 * Pass `overrides` to set initial behavior at construction time.
 *
 * Usage in tests:
 *   const mockStorage = makeMockStorage();
 *   vi.mock("../../server/storage", () => ({ storage: mockStorage }));
 *   beforeEach(() => Object.assign(mockStorage, makeMockStorage()));
 */
export function makeMockStorage(overrides: Partial<Record<string, any>> = {}) {
  const defaults = {
    seedData: vi.fn().mockResolvedValue(undefined),

    // Accounts
    getAccount: vi.fn().mockResolvedValue(null),
    getAccountByEmail: vi.fn().mockResolvedValue(null),
    getAccounts: vi.fn().mockResolvedValue([]),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn().mockResolvedValue(true),
    verifyPassword: vi.fn().mockResolvedValue(false),
    updatePassword: vi.fn().mockResolvedValue(undefined),

    // Password reset
    createPasswordResetToken: vi.fn().mockResolvedValue("test-token"),
    getPasswordResetToken: vi.fn().mockResolvedValue(null),
    usePasswordResetToken: vi.fn().mockResolvedValue(undefined),

    // Roles
    getRoles: vi.fn().mockResolvedValue([]),

    // Organizations
    getOrganizations: vi.fn().mockResolvedValue([]),
    getOrganization: vi.fn().mockResolvedValue(null),
    getOrganizationBySlug: vi.fn().mockResolvedValue(null),
    createOrganization: vi.fn(),
    updateOrganization: vi.fn(),
    deleteOrganization: vi.fn().mockResolvedValue(true),
    getOrganizationIdsForAccount: vi.fn().mockResolvedValue([]),

    // Organizers
    addOrganizer: vi.fn().mockResolvedValue(undefined),
    removeOrganizer: vi.fn().mockResolvedValue(true),

    // Members
    getMember: vi.fn().mockResolvedValue(null),
    getMembers: vi.fn().mockResolvedValue([]),
    createMemberRequest: vi.fn(),
    updateMemberStatus: vi.fn(),
    removeMember: vi.fn().mockResolvedValue(true),

    // Invites
    getInvites: vi.fn().mockResolvedValue([]),
    getInviteByToken: vi.fn().mockResolvedValue(null),
    createInvite: vi.fn(),
    useInvite: vi.fn().mockResolvedValue(undefined),

    // SPVs
    getAllSpvs: vi.fn().mockResolvedValue([]),
    getSpvs: vi.fn().mockResolvedValue([]),
    getSpv: vi.fn().mockResolvedValue(null),
    createSpv: vi.fn(),
    updateSpv: vi.fn(),
    deleteSpv: vi.fn().mockResolvedValue(true),
    getSpvMembers: vi.fn().mockResolvedValue([]),
    addSpvMember: vi.fn(),
    updateSpvMemberById: vi.fn(),
    removeSpvMemberById: vi.fn().mockResolvedValue(true),
    getSpvIdsForAccount: vi.fn().mockResolvedValue([]),

    // SPV Assets
    getSpvAssets: vi.fn().mockResolvedValue([]),
    getSpvAsset: vi.fn().mockResolvedValue(null),
    createSpvAsset: vi.fn(),
    updateSpvAsset: vi.fn(),
    deleteSpvAsset: vi.fn().mockResolvedValue(true),
    getAssetValuations: vi.fn().mockResolvedValue([]),
    addAssetValuation: vi.fn(),
    removeAssetValuation: vi.fn().mockResolvedValue(true),

    // Entities
    getAllEntities: vi.fn().mockResolvedValue([]),
    getEntity: vi.fn().mockResolvedValue(null),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn().mockResolvedValue(true),
    getEntityIdsForAccount: vi.fn().mockResolvedValue([]),
    getEntityIdsOwnedByAccount: vi.fn().mockResolvedValue([]),

    // Entity owners
    getEntityOwners: vi.fn().mockResolvedValue([]),
    addEntityOwner: vi.fn(),
    removeEntityOwner: vi.fn().mockResolvedValue(true),

    // Entity managers
    getEntityManagers: vi.fn().mockResolvedValue([]),
    addEntityManager: vi.fn(),
    removeEntityManager: vi.fn().mockResolvedValue(true),

    // Portfolio
    getPortfolio: vi.fn().mockResolvedValue([]),

    // API tokens
    createApiToken: vi.fn(),
    getApiTokenByHash: vi.fn().mockResolvedValue(null),
    listApiTokensForAccount: vi.fn().mockResolvedValue([]),
    revokeApiToken: vi.fn().mockResolvedValue(true),
    touchApiTokenLastUsed: vi.fn().mockResolvedValue(undefined),
  };

  return { ...defaults, ...overrides } as any;
}

/**
 * Sample fixtures used across tests. Adjust shapes as needed in callers.
 */
export const fixtures = {
  adminAccount: {
    id: 1,
    email: "admin@test.local",
    firstName: "Admin",
    lastName: "User",
    passwordHash: "hashed",
    profileComplete: true,
    roles: [{ id: 1, name: "admin", description: "Administrator" }],
  },
  memberAccount: {
    id: 2,
    email: "member@test.local",
    firstName: "Member",
    lastName: "User",
    passwordHash: "hashed",
    profileComplete: true,
    roles: [],
  },
  organizerAccount: {
    id: 3,
    email: "organizer@test.local",
    firstName: "Org",
    lastName: "Anizer",
    passwordHash: "hashed",
    profileComplete: true,
    roles: [],
  },
  outsiderAccount: {
    id: 4,
    email: "outsider@test.local",
    firstName: "Out",
    lastName: "Sider",
    passwordHash: "hashed",
    profileComplete: true,
    roles: [],
  },
  organization: (overrides: Record<string, any> = {}) => ({
    id: 10,
    name: "Test Org",
    slug: "test-org",
    description: "",
    website: "",
    logoUrl: "",
    country: "",
    city: "",
    stateProvince: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    organizers: [],
    ...overrides,
  }),
  spv: (overrides: Record<string, any> = {}) => ({
    id: 100,
    organizationId: 10,
    legalName: "Test SPV LLC",
    displayName: "Test SPV",
    entityType: "LLC",
    currency: "USD ($)",
    allocationMethod: "By Commitment",
    managementFeePercent: "0",
    carriedInterestPercent: "0",
    preferredReturnPercent: "0",
    totalBeingRaised: "0",
    minimumInvestment: "0",
    autoDeploy: false,
    organizationName: "Test Org",
    members: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),
  entity: (overrides: Record<string, any> = {}) => ({
    id: 200,
    name: "Test Entity",
    entityType: "LLC",
    currency: "USD ($)",
    ownershipAllocation: "percent",
    disbursementMethod: "wire_transfer",
    owners: [],
    managers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),
  invite: (overrides: Record<string, any> = {}) => ({
    id: 50,
    organizationId: 10,
    token: "test-invite-token",
    used: false,
    usedByAccountId: null,
    createdAt: new Date(),
    ...overrides,
  }),
  apiToken: (overrides: Record<string, any> = {}) => ({
    id: 300,
    accountId: 2,
    name: "Test Token",
    prefix: "abcd1234",
    tokenHash: "fake-hash",
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  }),
  member: (overrides: Record<string, any> = {}) => ({
    id: 70,
    organizationId: 10,
    accountId: 2,
    status: "approved",
    inviteId: null,
    createdAt: new Date(),
    account: {
      id: 2,
      email: "member@test.local",
      firstName: "Member",
      lastName: "User",
    },
    ...overrides,
  }),
};
