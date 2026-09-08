import type { IntegrationProvider as ProviderName } from "@/generated/prisma/enums";
import { env } from "@/lib/env";
import { BlackboardProvider } from "@/server/integrations/providers/blackboard";
import { CanvasProvider } from "@/server/integrations/providers/canvas";
import { GenericProvider } from "@/server/integrations/providers/generic";
import { MoodleProvider } from "@/server/integrations/providers/moodle";
import type { LmsProvider } from "@/server/integrations/types";

let cache: Map<ProviderName, LmsProvider> | undefined;

export function getLmsProvider(name: ProviderName): LmsProvider {
  if (!cache) {
    const mock = env.LMS_MOCK_MODE;
    cache = new Map<ProviderName, LmsProvider>([
      ["CANVAS", new CanvasProvider(mock)],
      ["MOODLE", new MoodleProvider(mock)],
      ["BLACKBOARD", new BlackboardProvider(mock)],
      ["GENERIC", new GenericProvider(mock)],
    ]);
  }
  return cache.get(name)!;
}

export function listLmsProviders() {
  return (["CANVAS", "MOODLE", "BLACKBOARD", "GENERIC"] as ProviderName[]).map((n) => {
    const p = getLmsProvider(n);
    return { name: p.name, label: p.label, connectionHelp: p.connectionHelp, supportsOAuth: p.supportsOAuth, mock: env.LMS_MOCK_MODE };
  });
}

export function resetLmsProviders() {
  cache = undefined;
}
