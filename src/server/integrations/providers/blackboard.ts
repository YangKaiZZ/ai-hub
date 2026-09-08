import { BaseLmsProvider } from "@/server/integrations/providers/base-mock";

/**
 * Blackboard Learn (REST API, three-legged OAuth). Live sync requires an
 * institution-registered application (developer.blackboard.com), so the MVP
 * ships the mock adapter and the OAuth-ready interface. Implement `real*`
 * methods once the application key/secret are available.
 */
export class BlackboardProvider extends BaseLmsProvider {
  readonly name = "BLACKBOARD" as const;
  readonly label = "Blackboard";
  readonly connectionHelp = "Blackboard connections use your institution’s OAuth application. Until your school registers AI Hub, you can explore with demo data.";
  override readonly supportsOAuth = true;
}
