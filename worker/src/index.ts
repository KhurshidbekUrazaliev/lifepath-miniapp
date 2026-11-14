// LifePath Worker: the Mini App's API, the bot's webhook, the setup call and the reminder cron.
// Everything else is the built front end, served as static assets.
import { handlePhoto, handleSetup } from './admin';
import { handleApi } from './api';
import { devAuthEnabled } from './auth';
import { runReminders } from './cron';
import type { Env } from './env';
import { errorResponse, json, notFound } from './http';
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
      // Local development only (DEV_AUTH=1 on a local host): `wrangler dev` cannot deliver cron
      // events to a Worker that also serves static assets, so tests run the reminders through here.
      if (path === '/admin/dev-cron' && request.method === 'POST' && devAuthEnabled(env, url)) {
        await runReminders(env, Number(url.searchParams.get('time')) || Date.now());
        return json({ ok: true });
      }
      if (path.startsWith('/tg/') || path.startsWith('/admin/')) throw notFound();
      // Other paths belong to the front end. The asset layer normally answers them before this code runs.
      if (env.ASSETS) return await env.ASSETS.fetch(request);
      throw notFound();
    } catch (e) {
      return errorResponse(e);
    }
  },

  async scheduled(controller, env): Promise<void> {
    await runReminders(env, controller.scheduledTime);
  },
} satisfies ExportedHandler<Env>;
