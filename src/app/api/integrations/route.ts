import { ok, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { listLmsProviders } from "@/server/integrations/registry";
import { connectIntegration, connectIntegrationSchema, listIntegrations } from "@/server/integrations/service";

export const GET = route(async () => {
  const user = await requireUser();
  const [integrations, providers] = await Promise.all([listIntegrations(user.id), listLmsProviders()]);
  return ok({ integrations, providers });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, connectIntegrationSchema);
  const integration = await connectIntegration(user.id, input);
  return ok({ integration }, { status: 201 });
});
