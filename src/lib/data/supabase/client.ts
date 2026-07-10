import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase clients. The public site renders on the server only,
 * so no browser client exists in this layer.
 *
 *  - reads:  anon key (goes through the public RLS policies / views)
 *  - writes: service role key (booking + inbox API routes; RPCs are revoked
 *    from anon on purpose — see supabase/migrations/0004_booking.sql)
 */

let anonClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

function url(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return value;
}

export function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
    anonClient = createClient(url(), key, {
      auth: { persistSession: false },
    });
  }
  return anonClient;
}

export function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    serviceClient = createClient(url(), key, {
      auth: { persistSession: false },
    });
  }
  return serviceClient;
}
