import { BaseLmsProvider } from "@/server/integrations/providers/base-mock";

/**
 * Generic adapter for platforms without a dedicated provider. In mock mode it
 * returns demo data; a real implementation would read a documented JSON feed
 * (`GET {baseUrl}/ai-hub-feed.json`) exposing courses/tasks in NormalizedTask
 * shape, so schools can integrate without a bespoke provider.
 */
export class GenericProvider extends BaseLmsProvider {
  readonly name = "GENERIC" as const;
  readonly label = "Other platform";
  readonly connectionHelp = "For platforms without a dedicated connector. Provide the platform URL; if it publishes an AI Hub-compatible feed, tasks will sync automatically.";
}
