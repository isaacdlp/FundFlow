import type { IncentiveType } from "@shared/types";

export const INCENTIVE_TYPES: IncentiveType[] = ["management_fee", "success_fee"];

/** i18n key of each incentive type's label (full and short). */
export const incentiveLabelKey = (type: IncentiveType) => `promoters.incentiveTypes.${type}`;
export const incentiveShortLabelKey = (type: IncentiveType) => `promoters.incentiveTypesShort.${type}`;

/** "20.00" → "20%", "12.50" → "12.5%". */
export const formatPercent = (percent: string) => `${Number(percent)}%`;
