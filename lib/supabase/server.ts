import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the secret/service role key.
 * Never import this module into client components.
 */
export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
    );
  }

  if (!adminClient) {
    adminClient = createClient(url, secret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return adminClient;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
  );
}

export async function checkDatabaseConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    if (!isSupabaseConfigured()) {
      return { ok: false, error: "Supabase is not configured." };
    }
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("sync_state")
      .select("sync_key")
      .limit(1);
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Database unreachable",
    };
  }
}
