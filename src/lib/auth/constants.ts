export const AUTH_COOKIES = {
  access: "tyama_access_token",
  refresh: "tyama_refresh_token",
  expiresAt: "tyama_expires_at",
} as const;

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
