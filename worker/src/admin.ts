// POST /admin/setup: one call that points the bot at this Worker and fills in its profile.
// POST /admin/photo: sets the bot's profile photo. Both need the SETUP_KEY secret as a Bearer token.
import { baseUrl, LANGS, type Env, type Lang } from './env';
import { badRequest, HttpError, json, notFound, safeEqual, unauthorized } from './http';
import { TEXT } from './i18n';
import { ALLOWED_UPDATES, tg, type TgUser } from './telegram';

interface Call {
  method: string;
  language_code?: string;
  ok: boolean;
  description?: string;
}

/** English is the bot's default; Uzbek and Russian are set for users of those languages. */
const languageCode = (lang: Lang): string | undefined => (lang === 'en' ? undefined : lang);

/** Only POST, and only with `Authorization: Bearer <SETUP_KEY>`. */
function authorize(request: Request, env: Env): void {
  if (request.method !== 'POST') throw notFound();
  const header = request.headers.get('Authorization') ?? '';
  if (!env.SETUP_KEY || !header.startsWith('Bearer ') || !safeEqual(header.slice(7).trim(), env.SETUP_KEY)) {
    throw unauthorized();
  }
}

/** The body is a JPEG (Telegram takes only JPEG for a static profile photo). Each call adds a photo. */
export async function handlePhoto(request: Request, env: Env): Promise<Response> {
  authorize(request, env);
  if (!env.BOT_TOKEN) throw new HttpError(500, 'server', 'set the BOT_TOKEN secret first');
  if (!(request.headers.get('content-type') ?? '').startsWith('image/jpeg')) throw badRequest('send the photo as image/jpeg');
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) throw badRequest('a JPEG of up to 5 MB expected');

  const form = new FormData();
  form.append('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
  form.append('avatar', new Blob([bytes], { type: 'image/jpeg' }), 'avatar.jpg');
  const res = await tg(env, 'setMyProfilePhoto', form, 20_000);
  return json({ ok: res.ok, ...(!res.ok && { description: res.description ?? `HTTP ${res.status}` }) }, res.ok ? 200 : 502);
}

export async function handleSetup(request: Request, env: Env, url: URL): Promise<Response> {
  authorize(request, env);
  if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) {
    throw new HttpError(500, 'server', 'set the BOT_TOKEN and WEBHOOK_SECRET secrets first');
  }

  const appUrl = baseUrl(env.APP_URL) || url.origin;
  const webhookUrl = `${appUrl}/tg/webhook`;
  const calls: Call[] = [];
  const call = async <T>(method: string, params: Record<string, unknown>, lang?: Lang) => {
    const code = lang && languageCode(lang);
    const res = await tg<T>(env, method, code ? { ...params, language_code: code } : params);
    calls.push({
      method,
      ...(code && { language_code: code }),
      ok: res.ok,
      ...(!res.ok && { description: res.description ?? `HTTP ${res.status}` }),
    });
    return res;
  };

  const me = await call<TgUser>('getMe', {});
  if (!me.ok || !me.result) return json({ ok: false, appUrl, webhookUrl, bot: null, calls }, 502);
  const bot = { id: me.result.id, username: me.result.username ?? null };

  // The API and the cron need the bot's username and the app's address.
  await env.DB.batch([
    env.DB.prepare("INSERT INTO meta (key, value) VALUES ('bot_username', ?1) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(bot.username ?? ''),
    env.DB.prepare("INSERT INTO meta (key, value) VALUES ('app_url', ?1) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(appUrl),
  ]);

  if (/^[A-Za-z0-9_-]{1,256}$/.test(env.WEBHOOK_SECRET)) {
    await call('setWebhook', { url: webhookUrl, secret_token: env.WEBHOOK_SECRET, allowed_updates: ALLOWED_UPDATES });
  } else {
    calls.push({ method: 'setWebhook', ok: false, description: 'WEBHOOK_SECRET must be 1-256 characters of A-Z a-z 0-9 _ -' });
  }
  await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'LifePath', web_app: { url: appUrl } } });
  for (const lang of LANGS) {
    const t = TEXT[lang];
    const commands = (['start', 'help', 'paysupport', 'terms'] as const).map((command) => ({
      command,
      description: t.commands[command],
    }));
    await call('setMyCommands', { commands }, lang);
    await call('setMyDescription', { description: t.description }, lang);
    await call('setMyShortDescription', { short_description: t.shortDescription }, lang);
  }

  const ok = calls.every((c) => c.ok);
  return json({ ok, appUrl, webhookUrl, bot, calls }, ok ? 200 : 502);
}
