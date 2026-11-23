// LifePath Worker: the Mini App's API, the bot's webhook, the setup call and the reminder cron.
// Everything else is the built front end, served as static assets.
import { handlePhoto, handleSetup } from './admin';
import { handleApi } from './api';
import { cleanAppLogins } from './app';
import { cleanUp, runChallengeResults } from './challenges';
import { cleanUpTogether } from './gkhatm';
import { devAuthEnabled } from './auth';
import { runReminders } from './cron';
import type { Env } from './env';
import { cleanErrors } from './errors';
import { describe, errorResponse, json, notFound } from './http';
import { serveStory } from './stories';
import { handleWebhook } from './webhook';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/')) return await handleApi(request, env, url);
      if (path === '/tg/webhook') return await handleWebhook(request, env, url);
      if (path === '/admin/setup') return await handleSetup(request, env, url);
      if (path === '/admin/photo') return await handlePhoto(request, env);
      if (path.startsWith('/s/') && request.method === 'GET') return await serveStory(env, path, Date.now());
      // Local development only (DEV_AUTH=1 on a local host): `wrangler dev` cannot deliver cron
      // events to a Worker that also serves static assets, so tests run the reminders through here.
      if (path === '/admin/dev-cron' && request.method === 'POST' && devAuthEnabled(env, url)) {
        const time = Number(url.searchParams.get('time')) || Date.now();
        await runReminders(env, time);
        await runChallengeResults(env, time);
        return json({ ok: true });
      }
      if (path.startsWith('/tg/') || path.startsWith('/admin/') || path.startsWith('/s/')) throw notFound();
      // Other paths belong to the front end. The asset layer normally answers them before this code runs.
      if (env.ASSETS) return await env.ASSETS.fetch(request);
      throw notFound();
    } catch (e) {
      return errorResponse(e);
    }
  },

  async scheduled(controller, env): Promise<void> {
    const now = controller.scheduledTime;
    await runReminders(env, now);
    try {
      await runChallengeResults(env, now);
    } catch (e) {
      console.error('challenges:', describe(e));
    }
    const at = new Date(now);
    if (at.getUTCMinutes() === 0) {
      await cleanUp(env, now);
      await cleanUpTogether(env, now);
      await cleanAppLogins(env, now);
    }
    // Once a day: forget the errors that have not been reported again for a month.
    if (at.getUTCMinutes() === 0 && at.getUTCHours() === 3) await cleanErrors(env, now);
  },
} satisfies ExportedHandler<Env>;
