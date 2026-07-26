import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/persistence/supabase/admin";
import { requestContextErrorResponse, resolveRequestContext } from "@/lib/security/request-context";

export const dynamic = "force-dynamic";

const RoleUpdateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["owner", "admin", "member", "viewer"]),
}).strict();

export async function GET(request: Request) {
  let context;
  try {
    context = await resolveRequestContext(request, "read");
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  if (context.demoMode) {
    return NextResponse.json([{ userId: context.userId, email: "demo@sitevelocity.local", role: context.role, current: true }]);
  }
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("organization_memberships").select("user_id,role,created_at")
      .eq("organization_id", context.organizationId).order("created_at", { ascending: true });
    if (error) throw error;
    const members = await Promise.all((data ?? []).map(async (membership) => {
      const user = await admin.auth.admin.getUserById(membership.user_id);
      return {
        userId: membership.user_id,
        email: user.data.user?.email ?? "Email unavailable",
        role: membership.role,
        current: membership.user_id === context.userId,
      };
    }));
    return NextResponse.json(members, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: "Team membership could not be loaded." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  let context;
  try {
    context = await resolveRequestContext(request, "admin");
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  if (context.demoMode || context.role !== "owner") return NextResponse.json({ error: "Only an organization owner can change roles." }, { status: 403 });
  const payload = RoleUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return NextResponse.json({ error: "Invalid role change." }, { status: 422 });
  try {
    const admin = createSupabaseAdminClient();
    if (payload.data.userId === context.userId && payload.data.role !== "owner") {
      const { count } = await admin.from("organization_memberships").select("user_id", { count: "exact", head: true })
        .eq("organization_id", context.organizationId).eq("role", "owner");
      if ((count ?? 0) <= 1) return NextResponse.json({ error: "The last owner cannot be demoted." }, { status: 409 });
    }
    const { data, error } = await admin.from("organization_memberships").update({ role: payload.data.role })
      .eq("organization_id", context.organizationId).eq("user_id", payload.data.userId).select("user_id,role").single();
    if (error || !data) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    return NextResponse.json({ userId: data.user_id, role: data.role });
  } catch {
    return NextResponse.json({ error: "The role could not be changed." }, { status: 503 });
  }
}
