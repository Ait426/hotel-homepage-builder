/**
 * Data source factory.
 *
 * DATA_SOURCE=demo     → in-memory demo tenant (default; no external services)
 * DATA_SOURCE=supabase → live Supabase project
 *
 * When DATA_SOURCE is unset, presence of NEXT_PUBLIC_SUPABASE_URL flips the
 * default to supabase so a configured deployment "just works".
 */

import type { HotelDataSource } from "@/lib/data/types";
import { demoDataSource } from "@/lib/data/demo";
import { getSupabaseDataSource } from "@/lib/data/supabase";

export function getDataSource(): HotelDataSource {
  const mode =
    process.env.DATA_SOURCE ??
    (process.env.NEXT_PUBLIC_SUPABASE_URL ? "supabase" : "demo");

  if (mode === "supabase") return getSupabaseDataSource();
  return demoDataSource;
}
