export interface Config {
  cronPattern: string;
  updateQueueInterval: number;
  maxPostAge: number;
  roleTypes: Record<string, RoleTypeConfig>;
}

interface RoleTypeConfig {
  integrations: {
    discord: DiscordIntegration;
  };
  repositories: string[];
}

export interface DiscordIntegration {
  webhookUrl: string;
  roleId?: string;
}

export interface AlertData {
  messageId: string;
  payload: Record<string, any>;
}

export type Listing = {
  id: string;
  source: string;
  company_name: string;
  company_url: string;
  title: string;
  locations: string[];
  sponsorship: string;
  active: boolean;
  url: string;
  is_visible: boolean;
  date_posted: number;
  date_updated: number;
} & ({ season: string } | { terms: string[] } | {});
