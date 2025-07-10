import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  isServer: true,
  server: {
    CRON_PATTERN: z.string(),

    INTERNSHIP_WEBHOOK_URL: z.url(),
    INTERNSHIP_ROLE_ID: z.string().optional(),

    NEW_GRAD_WEBHOOK_URL: z.url(),
    NEW_GRAD_ROLE_ID: z.string().optional()
  }
});
