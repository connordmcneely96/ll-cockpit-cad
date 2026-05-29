import { NextResponse, type NextRequest } from "next/server";
import { validateToken } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  const publicPaths = ["/api/", "/favicon.ico"];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const queryToken = searchParams.get("token");
  if (queryToken) {
    const nextPath = searchParams.get("next") ?? "/cad";
    const redirectUrl = new URL(nextPath, request.nextUrl.origin);
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set("sb-access-token", queryToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 3600,
      path: "/",
    });
    return response;
  }

  const cookieToken = request.cookies.get("sb-access-token")?.value;
  if (!cookieToken) return redirectToCockpit(request);

  const auth = await validateToken(cookieToken);
  if (!auth) {
    const response = redirectToCockpit(request);
    response.cookies.delete("sb-access-token");
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", auth.userId);
  requestHeaders.set("x-tenant-id", auth.tenantId);
  requestHeaders.set("x-user-email", auth.email);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

function redirectToCockpit(request: NextRequest): NextResponse {
  const cockpitUrl = new URL("https://ll-cockpit.connorpattern.workers.dev/cad");
  cockpitUrl.searchParams.set("redirect", request.url);
  return NextResponse.redirect(cockpitUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
