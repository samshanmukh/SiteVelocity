/** Converts a Supabase REST/Auth endpoint URL into the project origin expected by the SDK. */
export function normalizeSupabaseProjectUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported Supabase URL protocol.");
  if (url.username || url.password) throw new Error("Supabase URL cannot contain credentials.");
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
