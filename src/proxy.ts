import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/auth/api";
import { AUTH_COOKIES, AUTH_COOKIE_OPTIONS } from "@/lib/auth/constants";

const REFRESH_WINDOW_SECONDS = 90;

export async function proxy(request: NextRequest) {
  const accessToken = request.cookies.get(AUTH_COOKIES.access)?.value;
  const refreshToken = request.cookies.get(AUTH_COOKIES.refresh)?.value;
  const expiresAt = Number(request.cookies.get(AUTH_COOKIES.expiresAt)?.value ?? 0);
  const now = Math.floor(Date.now() / 1000);

  if (!accessToken || !refreshToken || expiresAt - now > REFRESH_WINDOW_SECONDS) {
    return NextResponse.next({ request });
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken);
    const response = NextResponse.next({ request });
    const nextExpiresAt = refreshed.expires_at ?? now + refreshed.expires_in;
    response.cookies.set(AUTH_COOKIES.access, refreshed.access_token, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: refreshed.expires_in,
    });
    response.cookies.set(AUTH_COOKIES.refresh, refreshed.refresh_token, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 30,
    });
    response.cookies.set(AUTH_COOKIES.expiresAt, String(nextExpiresAt), {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: refreshed.expires_in,
    });
    return response;
  } catch {
    const response = NextResponse.next({ request });
    response.cookies.delete(AUTH_COOKIES.access);
    response.cookies.delete(AUTH_COOKIES.refresh);
    response.cookies.delete(AUTH_COOKIES.expiresAt);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
