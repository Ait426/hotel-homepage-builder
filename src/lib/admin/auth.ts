/**
 * Console auth gate — deliberately temporary.
 *
 * Demo mode (no external services): console is open, with a visible banner.
 * Any other mode: HTTP Basic against ADMIN_PASSWORD (set it or the console
 * is closed). Replaced by Supabase Auth + hotel_members roles when the full
 * console lands (decision F). Edge-safe: pure string/env logic only.
 */

export function isDemoMode(): boolean {
  return (
    (process.env.DATA_SOURCE ??
      (process.env.NEXT_PUBLIC_SUPABASE_URL ? "supabase" : "demo")) === "demo"
  );
}

export function checkAdminAuth(req: Request): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return isDemoMode();

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return false;
  try {
    const decoded = atob(encoded);
    // "anyuser:password" — only the password part matters
    return decoded.split(":").slice(1).join(":") === password;
  } catch {
    return false;
  }
}

export function unauthorizedResponse(): Response {
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="console"' },
  });
}
