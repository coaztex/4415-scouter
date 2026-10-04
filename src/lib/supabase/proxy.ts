import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getOptionalShellSupabaseEnvironment } from "@/lib/server/env";
import type { Database } from "@/types/database";
import { isAuthPage } from "@/lib/auth/account-access";
import { accountAccess } from "@/lib/auth/account-access";

export async function updateSession(request: NextRequest) {
  const environment = getOptionalShellSupabaseEnvironment();
  let response = NextResponse.next({ request });
  if (!environment) return response;

  // Request-scoped: never share a user's client between requests.
  const supabase = createServerClient<Database>(
    environment.url,
    environment.publishableKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet)
            request.cookies.set(name, value);
          const previous = response;
          response = NextResponse.next({ request });
          for (const cookie of previous.cookies.getAll())
            response.cookies.set(cookie);
          for (const { name, value, options } of cookiesToSet)
            response.cookies.set(name, value, options);
          for (const [name, value] of Object.entries(headers))
            response.headers.set(name, value);
          response.headers.set(
            "Cache-Control",
            "private, no-cache, no-store, must-revalidate, max-age=0",
          );
          response.headers.set("Expires", "0");
          response.headers.set("Pragma", "no-cache");
        },
      },
    },
  );
  const { data } = await supabase.auth.getClaims();
  const pathname = request.nextUrl.pathname;
  if (
    data?.claims.sub &&
    !isAuthPage(pathname) &&
    !pathname.startsWith("/auth/") &&
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/") &&
    !pathname.includes(".")
  ) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("active,approval_pending,must_change_password")
      .eq("id", data.claims.sub)
      .single();
    const access = profile && accountAccess(profile);
    if (access === "pending" || access === "password_change") {
      const destination = request.nextUrl.clone();
      destination.pathname =
        access === "pending" ? "/pending-approval" : "/change-password";
      destination.search = "";
      const redirect = NextResponse.redirect(destination);
      for (const cookie of response.cookies.getAll())
        redirect.cookies.set(cookie);
      redirect.headers.set("Cache-Control", "private, no-store, max-age=0");
      return redirect;
    }
  }
  // Refresh here; protected pages/actions use getUser plus active profile/role.
  return response;
}
