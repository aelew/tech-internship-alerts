import { env } from './env';
import type { Config } from './types';

export const config: Config = {
  cronPattern: env.CRON_PATTERN,
  updateQueueInterval: 1500,
  maxPostAge: 4 * 24 * 60 * 60 * 1000,
  excludedLocationKeywords: [', Canada', ', UK', 'United Kingdom'],
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
        'https://github.com/vanshb03/Summer2026-Internships',
        'https://github.com/aelew/tech-internship-feed'
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
        'https://github.com/vanshb03/New-Grad-2026',
        'https://github.com/aelew/tech-new-grad-feed'
      ]
    }
  }
};
