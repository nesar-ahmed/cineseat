/** Login/signup attempts per IP per window — the security checklist asks for this. */
export const AUTH_THROTTLE = { default: { limit: 20, ttl: 60_000 } };
