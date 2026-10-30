/**
 * Default fees for a new investment. Each organization member has default
 * terms (percentages): the management fee becomes an amount on the
 * investment (a share of the commitment) and the success fee its carry %.
 * Shared by the server (applied when an investment omits them) and the
 * client (pre-filled in the form).
 */

export interface MemberFeeTerms {
  managementFeePercent: string | null;
  successFeePercent: string | null;
}

export interface FeeDefaults {
  managementFeePercent: number | null;
  successFeePercent: number | null;
}

/** The lowest of the values that are set, or null when none is. */
function lowest(values: (string | null)[]): number | null {
  const set = values.filter((v): v is string => v !== null && v !== "").map(v => parseFloat(v)).filter(Number.isFinite);
  return set.length > 0 ? Math.min(...set) : null;
}

/**
 * Defaults for an investor from the organization memberships behind it: the
 * account's own membership, or — for an entity — the memberships of its
 * managers, taking the lowest of their defaults for each fee.
 */
export function investorFeeDefaults(memberships: MemberFeeTerms[]): FeeDefaults {
  return {
    managementFeePercent: lowest(memberships.map(m => m.managementFeePercent)),
    successFeePercent: lowest(memberships.map(m => m.successFeePercent)),
  };
}

/** The management fee amount for a commitment, rounded to cents. */
export function managementFeeAmount(committed: number, percent: number): string {
  return (Math.round(committed * percent) / 100).toFixed(2);
}
