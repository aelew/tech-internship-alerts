import { env } from './env';
import type { Config } from './types';

export const config: Config = {
  cronPattern: env.CRON_PATTERN,
  roleTypes: {
    internship: {
      integrations: {
        discord: {
          webhookUrl: env.INTERNSHIP_WEBHOOK_URL,
          roleId: env.INTERNSHIP_ROLE_ID
        }
      },
      repositories: [
        'https://github.com/SimplifyJobs/Summer2026-Internships',
        'https://github.com/vanshb03/Summer2026-Internships'
      ]
    },
    newGrad: {
      integrations: {
        discord: {
          webhookUrl: env.NEW_GRAD_WEBHOOK_URL,
          roleId: env.NEW_GRAD_ROLE_ID
        }
      },
      repositories: [
        'https://github.com/SimplifyJobs/New-Grad-Positions',
        'https://github.com/vanshb03/New-Grad-2025'
      ]
    }
  }
};
