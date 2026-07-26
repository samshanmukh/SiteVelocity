import { NextResponse } from "next/server";
import { UpdateDevelopmentThesisSchema } from "@/lib/domain/buy-box";
import { thesisRepositoryForOrganization } from "@/lib/persistence/thesis-store";
import { requestContextErrorResponse, resolveRequestContext } from "@/lib/security/request-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await resolveRequestContext(request, "read");
    return NextResponse.json(await thesisRepositoryForOrganization(context.organizationId).getActive(), {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (error) {
    return requestContextErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  let context;
  try {
    context = await resolveRequestContext(request, "write");
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  const payload = UpdateDevelopmentThesisSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return NextResponse.json({ error: "Invalid development thesis.", issues: payload.error.issues }, { status: 422 });
  try {
    return NextResponse.json(await thesisRepositoryForOrganization(context.organizationId).update(payload.data, context.demoMode ? null : context.userId), {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch {
    return NextResponse.json({ error: "The development thesis could not be saved." }, { status: 503 });
  }
}
