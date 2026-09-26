import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { getSupabaseAdmin } = await import("../lib/supabase/server");
  const sb = getSupabaseAdmin();
  const { count } = await sb
    .from("daily_stats")
    .select("*", { count: "exact", head: true });
  console.log("daily_stats count", count);
  const { data } = await sb
    .from("daily_stats")
    .select("*")
    .order("date", { ascending: false })
    .limit(10);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
