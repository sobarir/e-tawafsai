/**
 * Single source of truth for user roles.
 * The Drizzle pgEnum, API guards, and web UI all derive from this tuple.
 */
export const USER_ROLES = ["admin", "staff"] as const;
export type UserRole = (typeof USER_ROLES)[number];
