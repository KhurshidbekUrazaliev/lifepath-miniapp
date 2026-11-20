// End-to-end test of the Worker: `wrangler dev` on a fresh local database, talking to the mock
// Telegram API. Covers the API, the webhook, the setup call, payments and the reminder cron.
//   npm run build   (once: the Worker serves ./dist)
//   npm run test:worker
// The Worker listens on a port picked at random; E2E_PORT=8792 names one when others are in use.
import { execFileSync, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { startMock, tgError } from './mock-telegram.mjs';

const adhan = createRequire(import.meta.url)('adhan');

const TOKEN = '123456:e2e-test-token';
const WEBHOOK_SECRET = 'e2e-webhook-secret';
const SETUP_KEY = 'e2e-setup-key';
const APP_URL = 'https://lifepath.example.test';
const DAY = 86_400_000;

if (!existsSync('dist/index.html')) {
  console.error('Build the front end first: npm run build');
  process.exit(1);
}

let failures = 0;
function check(ok, what, detail) {
  console.log(`${ok ? '✓' : '✗'} ${what}${!ok && detail !== undefined ? `\n    got: ${JSON.stringify(detail)}` : ''}`);
  if (!ok) failures++;
}

/** Mini App initData signed the way Telegram signs it. */
function initData(user, { authDate = Math.floor(Date.now() / 1000), token = TOKEN } = {}) {
  const params = new URLSearchParams({ query_id: 'AAE-e2e', user: JSON.stringify(user), auth_date: String(authDate) });
  const text = [...params].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(text).digest('hex'));
  return params.toString();
}

const alice = { id: 111, first_name: 'Alice', username: 'alice', language_code: 'en', allows_write_to_pm: true };
const bob = { id: 222, first_name: 'Bobur', language_code: 'uz', allows_write_to_pm: true };
const carol = { id: 333, first_name: 'Carol', language_code: 'ru' };

// ---------- servers ----------

const mock = await startMock({ token: TOKEN });
const dir = mkdtempSync(join(tmpdir(), 'lifepath-e2e-'));
const port = Number(process.env.E2E_PORT) || 8790 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${port}`;
const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };

execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'lifepath', '--local', '--persist-to', dir], { env, stdio: 'pipe' });

// The owners of the test bot: Alice by her username, Carol by her id.
const vars = { BOT_TOKEN: TOKEN, WEBHOOK_SECRET, SETUP_KEY, DEV_AUTH: '1', TELEGRAM_API: mock.url, APP_URL, PLUS_STARS: '150', ADMINS: '@alice,333' };
const dev = spawn(
  'npx',
  [
    'wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', dir,
    '--show-interactive-dev-session=false',
    ...Object.entries(vars).flatMap(([key, value]) => ['--var', `${key}:${value}`]),
  ],
  { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
);
let devLog = '';
dev.stdout.on('data', (d) => (devLog += d));
dev.stderr.on('data', (d) => (devLog += d));

async function stop(code) {
  try {
    process.kill(-dev.pid, 'SIGTERM');
  } catch {
    // already gone
  }
  await mock.close();
  rmSync(dir, { recursive: true, force: true });
  process.exit(code);
}

for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${BASE}/api/ping`)).status === 404) break;
  } catch {
    // not up yet
  }
  if (i > 120) {
    console.error(`wrangler dev did not start:\n${devLog.slice(-3000)}`);
    await stop(1);
  }
  await new Promise((r) => setTimeout(r, 500));
}

// ---------- helpers ----------

async function call(method, path, { user, auth, body, raw } = {}) {
  const headers = {};
  if (auth !== undefined) headers.Authorization = auth;
  else if (user) headers.Authorization = `tma ${initData(user)}`;
  if (body !== undefined || raw !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, type: res.headers.get('content-type') ?? '', json };
}

let updateId = 0;
const webhook = (update, secret = WEBHOOK_SECRET) =>
  fetch(`${BASE}/tg/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify({ update_id: ++updateId, ...update }),
  });

const message = (from, fields) => ({
  message: { message_id: ++updateId, date: Math.floor(Date.now() / 1000), chat: { id: from.id, type: 'private' }, from: { is_bot: false, ...from }, ...fields },
});

// wrangler dev cannot send cron events to a Worker with static assets; the Worker offers this
// local-only route instead (DEV_AUTH=1 on a local host).
async function cron(time) {
  const res = await fetch(`${BASE}/admin/dev-cron?time=${time}`, { method: 'POST' });
  if (res.status !== 200) check(false, `cron run at ${new Date(time).toISOString()}`, { status: res.status, body: await res.text() });
}

const sentTo = (from, chatId) => mock.since(from, 'sendMessage').filter((c) => c.params.chat_id === chatId);
const button = (call) => call?.params.reply_markup?.inline_keyboard?.[0]?.[0];

try {
  // ---------- auth ----------
  console.log('\nauth');
  check((await call('POST', '/api/hello', { body: { tz: 'UTC', lang: 'en' } })).status === 401, 'no Authorization header: 401');
  check(
    (await call('POST', '/api/hello', { auth: `tma ${initData(alice, { token: '999:other-bot' })}`, body: { tz: 'UTC', lang: 'en' } })).status === 401,
    'initData signed with another token: 401',
  );
  const stale = Math.floor(Date.now() / 1000) - 4 * 86400;
  check(
    (await call('POST', '/api/hello', { auth: `tma ${initData(alice, { authDate: stale })}`, body: { tz: 'UTC', lang: 'en' } })).status === 401,
    'initData older than three days: 401',
  );
  const tampered = initData(alice).replace('Alice', 'Mallory');
  check((await call('POST', '/api/hello', { auth: `tma ${tampered}`, body: { tz: 'UTC', lang: 'en' } })).status === 401, 'tampered initData: 401');
  check((await call('GET', '/api/hello', { user: alice })).status === 404, 'wrong method: 404');

  const hello = await call('POST', '/api/hello', { user: alice, body: { tz: 'Asia/Tashkent', lang: 'en' } });
  check(
    hello.status === 200 && hello.json.user.id === 111 && hello.json.user.firstName === 'Alice' && hello.json.plus.active === false &&
      hello.json.plus.priceStars === 150 && hello.json.rank.optedIn === false && hello.json.reminders.canMessage === true &&
      hello.json.bot.username === null,
    'hello creates the user and returns its state',
    hello.json,
  );
  check((await call('POST', '/api/hello', { user: alice, body: { tz: 'Mars/Base', lang: 'en' } })).status === 400, 'unknown time zone: 400');
  check((await call('POST', '/api/hello', { user: alice, body: { tz: 'UTC', lang: 'de' } })).status === 400, 'unsupported language: 400');
  const devUser = Buffer.from(JSON.stringify({ id: 1001, first_name: 'Dev' })).toString('base64url');
  check((await call('POST', '/api/hello', { auth: `dev ${devUser}`, body: { tz: 'UTC', lang: 'en' } })).status === 200, 'dev scheme works on a local host');

  // ---------- setup ----------
  console.log('\nsetup');
  let from = mock.calls.length;
  check((await fetch(`${BASE}/admin/setup`, { method: 'POST', headers: { Authorization: 'Bearer wrong' } })).status === 401, 'wrong setup key: 401');
  const setup = await fetch(`${BASE}/admin/setup`, { method: 'POST', headers: { Authorization: `Bearer ${SETUP_KEY}` } });
  const setupJson = await setup.json();
  check(setup.status === 200 && setupJson.ok === true, 'setup succeeds', setupJson);
  const hook = mock.since(from, 'setWebhook')[0]?.params;
  check(
    hook?.url === `${APP_URL}/tg/webhook` && hook.secret_token === WEBHOOK_SECRET && hook.allowed_updates.includes('pre_checkout_query'),
    'setWebhook points at /tg/webhook with the secret',
    hook,
  );
  const commands = mock.since(from, 'setMyCommands');
  check(
    commands.length === 3 && commands.map((c) => c.params.language_code ?? 'default').sort().join() === 'default,ru,uz',
    'commands set for default, uz and ru',
    commands.map((c) => c.params.language_code),
  );
  const menu = mock.since(from, 'setChatMenuButton')[0]?.params.menu_button;
  check(menu?.type === 'web_app' && menu.web_app.url === APP_URL, 'menu button opens the app', menu);
  check(mock.since(from, 'setMyDescription').length === 3 && mock.since(from, 'setMyShortDescription').length === 3, 'descriptions set in three languages');
  check((await call('POST', '/api/hello', { user: alice, body: { tz: 'UTC', lang: 'en' } })).json?.bot.username === 'lifepath_test_bot', 'hello now names the bot');

  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const photo = (key, type = 'image/jpeg') =>
    fetch(`${BASE}/admin/photo`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': type }, body: jpeg });
  check((await photo('wrong')).status === 401, 'the photo upload needs the setup key');
  check((await photo(SETUP_KEY, 'text/plain')).status === 400, 'the photo must be a JPEG');
  from = mock.calls.length;
  const photoRes = await photo(SETUP_KEY);
  const upload = mock.since(from, 'setMyProfilePhoto')[0]?.params;
  check(
    photoRes.status === 200 && upload?.multipart && upload.body.includes('"photo":"attach://avatar"') && upload.body.includes('filename="avatar.jpg"'),
    'the profile photo is uploaded as a multipart JPEG',
    upload && { ...upload, body: upload.body.slice(0, 300) },
  );

  // ---------- webhook ----------
  console.log('\nwebhook');
  check((await webhook(message(carol, { text: '/start' }), 'wrong')).status === 403, 'wrong webhook secret: 403');
  from = mock.calls.length;
  check((await webhook(message(carol, { text: '/start' }))).status === 200, 'webhook answers 200');
  let reply = sentTo(from, 333)[0];
  check(reply?.params.text.startsWith('Здравствуйте, Carol!') && button(reply)?.web_app.url === APP_URL, '/start replies in Russian with an Open button', reply?.params);
  from = mock.calls.length;
  await webhook(message(alice, { text: '/start goal_abc' }));
  reply = sentTo(from, 111)[0];
  check(button(reply)?.web_app.url === `${APP_URL}/?open=goal_abc`, '/start <param> opens the app at that deep link', button(reply));
  from = mock.calls.length;
  await webhook(message(alice, { text: 'hello?' }));
  check(sentTo(from, 111)[0]?.params.text.startsWith('LifePath helps you'), 'any other text gets the help message');
  from = mock.calls.length;
  await webhook(message(alice, { text: '/paysupport' }));
  check(sentTo(from, 111)[0]?.params.text.includes('Telegram Stars') && !button(sentTo(from, 111)[0]), '/paysupport explains payments');
  check((await call('POST', '/api/hello', { user: carol, body: { tz: 'UTC', lang: 'ru' } })).json?.reminders.canMessage === true, 'writing to the bot lets it message the user');
  check((await webhook({ message: { not: 'a real update' } })).status === 200, 'a malformed update is still acknowledged');

  // ---------- reminders and cron ----------
  console.log('\nreminders');
  // A slot two minutes ahead, in UTC, so the cron can be pointed at it.
  const target = Math.ceil(Date.now() / 60_000) * 60_000 + 120_000;
  const at = new Date(target);
  const slot = { hour: at.getUTCHours(), minute: at.getUTCMinutes() };
  const today = at.toISOString().slice(0, 10);
  const yesterday = new Date(target - DAY).toISOString().slice(0, 10);
  const every = [1, 2, 3, 4, 5, 6, 7];

  check((await call('PUT', '/api/reminders', { user: alice, body: { enabled: true, tz: 'UTC', lang: 'en', items: 'nope' } })).status === 400, 'items must be an array');
  check(
    (await call('PUT', '/api/reminders', { user: alice, body: { enabled: true, tz: 'UTC', lang: 'en', items: [{ id: 'x', text: 'a', ...slot, open: 'bad link!' }] } })).status === 400,
    'a bad deep link is refused',
  );
  const put = await call('PUT', '/api/reminders', {
    user: alice,
    body: {
      enabled: true, tz: 'UTC', lang: 'en', openLabel: 'Open LifePath', lastActiveDay: yesterday,
      nudge: { enabled: true, ...slot, text: '🔥 Keep your streak' },
      items: [
        { id: 'g_1', text: '🎯 Time for your goal', ...slot, days: every, open: 'goal_1' },
        { id: 'p_1', text: '🗓️ One-off task', ...slot, date: today, open: 'tasks' },
        { id: 'p_old', text: 'Already past', hour: 0, minute: 0, date: '2020-01-01' },
      ],
    },
  });
  check(put.status === 200 && put.json.count === 2 && put.json.canMessage === true, 'reminders saved; a past one-off is skipped', put.json);
  await call('POST', '/api/hello', { user: bob, body: { tz: 'UTC', lang: 'uz' } });
  await call('PUT', '/api/reminders', {
    user: bob,
    body: { enabled: true, tz: 'UTC', lang: 'uz', lastActiveDay: today, nudge: { enabled: true, ...slot, text: '🔥 Seriyani saqlang' }, items: [] },
  });
  await call('PUT', '/api/reminders', {
    user: carol,
    body: { enabled: true, tz: 'UTC', lang: 'ru', items: [{ id: 'h_1', text: '🙂 Привычка', ...slot, days: every, open: 'habits' }] },
  });
  mock.respond('sendMessage', (p) => (p.chat_id === 333 ? tgError(403, 'Forbidden: bot was blocked by the user') : undefined));

  from = mock.calls.length;
  await cron(target - 30_000);
  check(mock.since(from, 'sendMessage').length === 0, 'nothing is sent before its time');
  await cron(target + 1000);
  const toAlice = sentTo(from, 111);
  const goal = toAlice.find((c) => c.params.text === '🎯 Time for your goal');
  check(toAlice.length === 3, 'goal, one-off and nudge reach Alice', toAlice.map((c) => c.params.text));
  check(button(goal)?.text === 'Open LifePath' && button(goal)?.web_app.url === `${APP_URL}/?open=goal_1`, 'the reminder button opens the goal', button(goal));
  check(sentTo(from, 222).length === 0, 'no nudge for someone already active today');
  check(sentTo(from, 333).length === 1, 'the blocked user was tried once');
  check((await call('POST', '/api/hello', { user: carol, body: { tz: 'UTC', lang: 'ru' } })).json?.reminders.canMessage === false, 'a 403 marks the user as not reachable');
  from = mock.calls.length;
  await cron(target + 1000);
  check(mock.since(from, 'sendMessage').length === 0, 'running the same minute again sends nothing twice');
  mock.reset();

  await call('PUT', '/api/reminders', { user: alice, body: { enabled: false, tz: 'UTC', lang: 'en', items: [] } });
  from = mock.calls.length;
  await cron(target + 7 * DAY + 1000);
  check(sentTo(from, 111).length === 0, 'turning reminders off removes them');
  check(sentTo(from, 222).length === 0, 'a slot missed by hours is dropped, not sent late');

  // ---------- prayer reminders ----------
  console.log('\nprayer reminders');
  // The Worker works the times out with the app's calculation (adhan); the test does the same here.
  const placeDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  const clock = (ms) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Tashkent' }).format(ms);
  function dhuhrAfter(after) {
    const params = adhan.CalculationMethod.MuslimWorldLeague();
    params.madhab = adhan.Madhab.Shafi;
    params.highLatitudeRule = adhan.HighLatitudeRule.TwilightAngle;
    for (let i = 0; i < 3; i++) {
      const [y, m, d] = placeDay(after + i * DAY).split('-').map(Number);
      const at = new adhan.PrayerTimes(new adhan.Coordinates(41.31, 69.28), new Date(y, m - 1, d, 12), params).dhuhr.getTime();
      if (at > after) return at;
    }
    throw new Error('no Dhuhr found');
  }
  const prayerOn = {
    enabled: true, lat: 41.31, lon: 69.28, tz: 'Asia/Tashkent', method: 'mwl', asr: 'standard', before: 0,
    items: [
      { key: 'dhuhr', text: "☀️ It's time for Dhuhr ({time})." },
      { key: 'asr', text: "🌤️ It's time for Asr ({time})." },
    ],
  };
  const withPrayer = (prayer) => ({ user: alice, body: { enabled: true, tz: 'UTC', lang: 'en', openLabel: 'Open LifePath', items: [], prayer } });
  check((await call('PUT', '/api/reminders', withPrayer({ ...prayerOn, method: 'nope' }))).status === 400, 'an unknown calculation method is refused');
  check((await call('PUT', '/api/reminders', withPrayer({ ...prayerOn, lat: 123 }))).status === 400, 'a latitude out of range is refused');
  check(
    (await call('PUT', '/api/reminders', withPrayer({ ...prayerOn, items: [{ key: 'asr', text: 'a' }, { key: 'asr', text: 'b' }] }))).status === 400,
    'the same prayer twice is refused',
  );
  const savedPrayer = await call('PUT', '/api/reminders', withPrayer(prayerOn));
  check(savedPrayer.status === 200 && savedPrayer.json.count === 0, 'prayer reminders saved', savedPrayer.json);

  const dhuhr1 = dhuhrAfter(Date.now());
  from = mock.calls.length;
  await cron(dhuhr1 - 60_000);
  check(sentTo(from, 111).length === 0, 'nothing before the prayer');
  await cron(dhuhr1 + 1000);
  let toAlicePrayer = sentTo(from, 111);
  check(
    toAlicePrayer.length === 1 && toAlicePrayer[0].params.text === `☀️ It's time for Dhuhr (${clock(dhuhr1)}).`,
    "Dhuhr arrives on time, with the time on the place's clock",
    toAlicePrayer.map((c) => c.params.text),
  );
  check(button(toAlicePrayer[0])?.web_app?.url === `${APP_URL}/?open=prayer`, 'its button opens the prayer screen', button(toAlicePrayer[0]));
  from = mock.calls.length;
  await cron(dhuhr1 + 1000);
  check(sentTo(from, 111).length === 0, 'the same prayer is not sent twice');

  // The next day: worked out afresh. Asr of the day before is long past by then, so it is dropped.
  const dhuhr2 = dhuhrAfter(dhuhr1 + 60_000);
  from = mock.calls.length;
  await cron(dhuhr2 + 1000);
  toAlicePrayer = sentTo(from, 111);
  check(
    toAlicePrayer.length === 1 && toAlicePrayer[0].params.text === `☀️ It's time for Dhuhr (${clock(dhuhr2)}).`,
    'the next day brings the next Dhuhr, and a missed Asr is not sent late',
    toAlicePrayer.map((c) => c.params.text),
  );

  // Ahead of time: the message still shows the prayer's own time. A change is scheduled from the
  // real clock, so the first slot is the first Dhuhr at least 15 minutes from now.
  await call('PUT', '/api/reminders', withPrayer({ ...prayerOn, before: 15, items: [{ key: 'dhuhr', text: '☀️ Dhuhr is in 15 min, at {time}.' }] }));
  const dhuhr3 = dhuhrAfter(Date.now() + 15 * 60_000);
  from = mock.calls.length;
  await cron(dhuhr3 - 15 * 60_000 + 1000);
  toAlicePrayer = sentTo(from, 111);
  check(
    toAlicePrayer.length === 1 && toAlicePrayer[0].params.text === `☀️ Dhuhr is in 15 min, at ${clock(dhuhr3)}.`,
    'a reminder 15 minutes ahead names the prayer time',
    toAlicePrayer.map((c) => c.params.text),
  );

  await call('PUT', '/api/reminders', withPrayer({ enabled: false }));
  from = mock.calls.length;
  await cron(dhuhrAfter(dhuhr3 + 60_000) + 1000);
  check(sentTo(from, 111).length === 0, 'turning prayer reminders off removes them');
  await call('PUT', '/api/reminders', { user: alice, body: { enabled: false, tz: 'UTC', lang: 'en', items: [] } });
  mock.reset();

  // ---------- activity and rankings ----------
  console.log('\nrankings');
  const week = (() => {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * DAY;
  })();
  const now = new Date().toISOString().slice(0, 10);
  const activity = (user, totalXp, weekXp, weekStart = week) =>
    call('POST', '/api/activity', { user, body: { lastActiveDay: now, totalXp, weekXp, weekStart, level: 7, streak: 12 } });
  check((await activity(alice, 100, 200)).status === 400, 'weekly XP above total XP: 400');
  check((await activity(alice, 12_000, 9_000)).status === 200, 'activity accepted');
  await activity(bob, 3_000, 3_000);
  let board = await call('GET', '/api/rankings?scope=global&period=week', { user: alice });
  check(board.status === 200 && board.json.rows.length === 0 && board.json.me === null, 'nobody is ranked before opting in', board.json);
  check((await call('PUT', '/api/rankings/profile', { user: alice, body: { optedIn: true, name: 'x'.repeat(25), country: 'UZ' } })).status === 400, 'names over 24 characters: 400');
  const joined = await call('PUT', '/api/rankings/profile', { user: alice, body: { optedIn: true, name: '  Alice   A ', country: 'uz' } });
  check(joined.json?.optedIn === true && joined.json.name === 'Alice A' && joined.json.country === 'UZ', 'opt in cleans the name and country', joined.json);
  await call('PUT', '/api/rankings/profile', { user: bob, body: { optedIn: true, name: 'Bobur', country: 'UZ' } });
  board = await call('GET', '/api/rankings?scope=global&period=week', { user: alice });
  check(
    board.json?.rows.length === 2 && board.json.rows[0].name === 'Alice A' && board.json.rows[0].xp === 5_000 && board.json.rows[0].isMe &&
      board.json.me.rank === 1 && board.json.total === 2 && board.json.weekEndsAt === week + 7 * DAY,
    'weekly board: growth is capped at 5000 a day',
    board.json,
  );
  board = await call('GET', '/api/rankings?scope=country&period=all', { user: bob });
  check(board.json?.rows[0].xp === 12_000 && board.json.me.rank === 2 && board.json.me.xp === 3_000, 'all-time country board ranks Bob second', board.json);
  board = await call('GET', '/api/rankings?scope=country&period=week', { user: carol });
  check(board.json?.rows.length === 0 && board.json.total === 0, 'no country, no country board', board.json);
  await activity(alice, 13_000, 13_000, week - 7 * DAY);
  board = await call('GET', '/api/rankings?scope=global&period=week', { user: alice });
  check(board.json?.rows[0].xp === 5_000, 'a report for another week leaves this week alone', board.json?.rows[0]);
  check((await call('GET', '/api/rankings?scope=moon', { user: alice })).status === 400, 'unknown scope: 400');

  // ---------- friend challenges ----------
  console.log('\nchallenges');
  const counters = (xp, prayer = 0, quran = 0, focus = 0) => ({ xp, prayer, quran, focus });
  const progress = (user, c) =>
    call('POST', '/api/activity', { user, body: { lastActiveDay: now, totalXp: 0, weekXp: 0, weekStart: week, level: 7, streak: 12, counters: c } });
  check((await call('POST', '/api/challenges', { user: alice, body: { kind: 'steps', days: 7, counters: counters(0) } })).status === 400, 'unknown challenge kind: 400');
  check((await call('POST', '/api/challenges', { user: alice, body: { kind: 'xp', days: 31, counters: counters(0) } })).status === 400, 'more than 30 days: 400');
  check((await call('POST', '/api/challenges', { user: alice, body: { kind: 'xp', days: 7 } })).status === 400, 'no counters: 400');
  const made = await call('POST', '/api/challenges', { user: alice, body: { kind: 'xp', days: 7, counters: counters(1_000, 10) } });
  const cid = made.json?.challenge?.id;
  check(
    made.status === 200 && /^[a-z0-9]{8}$/.test(cid ?? '') && made.json.challenge.isOwner && made.json.challenge.joined &&
      made.json.challenge.members.length === 1 && made.json.challenge.endsAt - made.json.challenge.startsAt === 7 * DAY,
    'Alice starts a 7-day XP challenge',
    made.json,
  );
  const preview = await call('GET', `/api/challenges/one?id=${cid}`, { user: bob });
  check(preview.json?.challenge.joined === false && preview.json.challenge.owner === 'Alice' && preview.json.challenge.members.length === 1, 'Bob sees the invite before joining', preview.json);
  check((await call('GET', '/api/challenges/one?id=zzzzzzzz', { user: bob })).status === 404, 'unknown challenge: 404');
  check((await call('GET', '/api/challenges/one?id=../x', { user: bob })).status === 400, 'malformed challenge id: 400');
  from = mock.calls.length;
  const bobJoins = await call('POST', '/api/challenges/join', { user: bob, body: { id: cid, counters: counters(500) } });
  check(bobJoins.json?.challenge.joined === true && bobJoins.json.challenge.members.length === 2, 'Bob joins', bobJoins.json);
  const told = sentTo(from, 111);
  check(
    told.length === 1 && told[0].params.text.includes('Bobur') && button(told[0])?.web_app.url.includes(`open=ch_${cid}`),
    'Alice hears that Bob joined, with a button to the challenge',
    told.map((c) => c.params),
  );
  from = mock.calls.length;
  check((await call('POST', '/api/challenges/join', { user: bob, body: { id: cid, counters: counters(9_999) } })).json?.challenge.members.length === 2, 'joining twice changes nothing');
  check(sentTo(from, 111).length === 0, 'and sends nothing');
  await progress(alice, counters(1_300, 12));
  await progress(bob, counters(900));
  let mine = await call('GET', '/api/challenges', { user: alice });
  let board1 = mine.json?.challenges.find((x) => x.id === cid);
  check(
    board1?.members.map((m) => `${m.name}:${m.score}:${m.isMe}`).join() === 'Bobur:400:false,Alice:300:true',
    'scores are what each counter moved since joining',
    board1?.members,
  );
  await progress(bob, counters(500_000));
  mine = await call('GET', '/api/challenges', { user: bob });
  board1 = mine.json?.challenges.find((x) => x.id === cid);
  check(board1?.members[0].score === 5_000 && board1.members[0].isMe, 'an XP score grows by at most 5000 a day', board1?.members);
  check((await progress(carol, { xp: -1, prayer: 0, quran: 0, focus: 0 })).status === 400, 'negative counters: 400');

  // A one-day prayer challenge, and its results the day after.
  const pray = (await call('POST', '/api/challenges', { user: alice, body: { kind: 'prayer', days: 1, counters: counters(1_300, 12) } })).json?.challenge;
  await call('POST', '/api/challenges/join', { user: bob, body: { id: pray.id, counters: counters(500_000, 40) } });
  await progress(alice, counters(1_300, 15));
  await progress(bob, counters(500_000, 99));
  mine = await call('GET', '/api/challenges', { user: alice });
  const prayBoard = mine.json?.challenges.find((x) => x.id === pray.id);
  check(prayBoard?.members.map((m) => m.score).join() === '5,3', 'prayers count at most five a day', prayBoard?.members);
  from = mock.calls.length;
  await cron(Date.now() + 2 * DAY);
  const results = mock.since(from, 'sendMessage').filter((c) => c.params.text.includes('🏆') || c.params.text.includes('🏁'));
  const bobResult = results.find((c) => c.params.chat_id === 222);
  const aliceResult = results.find((c) => c.params.chat_id === 111);
  check(
    results.length === 2 && bobResult?.params.text.startsWith('🏆') && bobResult.params.text.includes('namoz') &&
      aliceResult?.params.text.includes('2 of 2') && aliceResult.params.text.includes('Bobur') && button(aliceResult)?.web_app.url.includes(`open=ch_${pray.id}`),
    'when it ends, each member hears their place (in their language)',
    results.map((c) => c.params.text),
  );
  from = mock.calls.length;
  await cron(Date.now() + 2 * DAY + 60_000);
  check(mock.since(from, 'sendMessage').filter((c) => c.params.text.includes('🏁') || c.params.text.includes('🏆')).length === 0, 'results are sent once');

  check((await call('POST', '/api/challenges/leave', { user: bob, body: { id: cid } })).json?.ok === true, 'Bob leaves');
  mine = await call('GET', '/api/challenges', { user: bob });
  check(!mine.json?.challenges.some((x) => x.id === cid), 'a challenge you left is off your list');
  await call('POST', '/api/challenges/leave', { user: alice, body: { id: cid } });
  check((await call('GET', `/api/challenges/one?id=${cid}`, { user: alice })).status === 404, 'the last one out deletes the challenge');
  let made2 = 0;
  let refused = null;
  for (let i = 0; i < 7 && !refused; i++) {
    const r = await call('POST', '/api/challenges', { user: carol, body: { kind: 'focus', days: 3, counters: counters(0) } });
    if (r.status === 200) made2++;
    else refused = r;
  }
  check(made2 === 5 && refused?.status === 409 && refused.json?.error === 'limit', 'at most five running challenges of your own', { made2, refused: refused?.json });

  // ---------- buddy streaks ----------
  console.log('\nbuddy streaks');
  {
    const dayAt = (delta) => new Date(Date.now() + delta * DAY).toISOString().slice(0, 10);
    const [yesterday, today, tomorrow] = [dayAt(-1), dayAt(0), dayAt(1)];
    // People of this section's own: every person may only call so often in a minute.
    const alice = { id: 611, first_name: 'Anora', language_code: 'en', allows_write_to_pm: true };
    const bob = { id: 612, first_name: 'Botir', language_code: 'uz', allows_write_to_pm: true };
    const carol = { id: 613, first_name: 'Kamila', language_code: 'ru' };
    const dave = { id: 444, first_name: 'Dave', language_code: 'en' };
    const hello = (user, lang = 'en') => call('POST', '/api/hello', { user, body: { tz: 'UTC', lang } });
    // The app reports the last day the person did something with its activity.
    const active = (user, activeDay) =>
      call('POST', '/api/activity', { user, body: { lastActiveDay: activeDay, totalXp: 0, weekXp: 0, weekStart: week, level: 7, streak: 12, activeDay } });
    const buddiesOf = async (user) => (await call('GET', '/api/buddies', { user })).json;
    const first = await hello(alice);
    check(first.json?.together?.buddies === 0 && first.json.together.khatms === 0, 'hello says there is nothing to load yet', first.json?.together);
    await hello(bob, 'uz');
    await hello(carol, 'ru');
    await hello(dave);

    let mine = await buddiesOf(alice);
    check(mine?.buddies.length === 0 && mine.code === null && mine.max === 5, 'nobody has a buddy to begin with', mine);
    const invite = await call('POST', '/api/buddies/invite', { user: alice });
    const code = invite.json?.code;
    check(invite.status === 200 && /^[a-z0-9]{8}$/.test(code ?? ''), 'Alice gets her invite code', invite.json);
    check((await call('POST', '/api/buddies/invite', { user: alice })).json?.code === code, 'and the same one the next time');
    const seen = await call('GET', `/api/buddies/invite?code=${code}`, { user: bob });
    check(seen.json?.invite.name === alice.first_name && seen.json.invite.mine === false && seen.json.invite.buddy === false, 'Bob sees whose invite it is', seen.json);
    check((await call('GET', `/api/buddies/invite?code=${code}`, { user: alice })).json?.invite.mine === true, 'Alice sees that it is her own');
    check((await call('GET', '/api/buddies/invite?code=zzzzzzzz', { user: bob })).status === 404, 'unknown invite: 404');
    check((await call('GET', '/api/buddies/invite?code=../x', { user: bob })).status === 400, 'malformed invite code: 400');
    const self = await call('POST', '/api/buddies/accept', { user: alice, body: { code } });
    check(self.status === 409 && self.json?.error === 'self', 'nobody is their own buddy', self.json);
    check((await active(alice, 'yesterday')).status === 400, 'an active day that is not a day: 400');

    // Both were active yesterday, so the day they pair up already counts.
    await active(alice, yesterday);
    from = mock.calls.length;
    const accepted = await call('POST', '/api/buddies/accept', { user: bob, body: { code, activeDay: yesterday } });
    const pair = accepted.json?.buddy;
    check(
      accepted.status === 200 && pair?.name === alice.first_name && pair.streak === 1 && pair.best === 1 && pair.meDone === false && pair.theyDone === false,
      'Bob accepts: a day both had already done counts at once',
      accepted.json,
    );
    let told = sentTo(from, alice.id);
    check(
      told.length === 1 && told[0].params.text.includes(bob.first_name) && button(told[0])?.web_app.url.includes('open=buddies'),
      'Alice hears that Bob accepted, with a button to her buddies',
      told.map((c) => c.params),
    );
    from = mock.calls.length;
    check((await call('POST', '/api/buddies/accept', { user: bob, body: { code } })).json?.buddy.id === pair.id, 'accepting twice keeps the one pair');
    check(sentTo(from, alice.id).length === 0, 'and sends nothing');
    check((await call('GET', `/api/buddies/invite?code=${code}`, { user: bob })).json?.invite.buddy === true, 'the invite now says they are buddies');
    check((await hello(bob, 'uz')).json?.together.buddies === 1, 'and hello counts the buddy');

    // Alice does today's part; Bob has not yet.
    await active(alice, today);
    mine = await buddiesOf(alice);
    check(
      mine?.buddies.length === 1 && mine.buddies[0].name === bob.first_name && mine.buddies[0].streak === 1 && mine.buddies[0].meDone === true &&
        mine.buddies[0].theyDone === false && mine.buddies[0].canNudge === true && mine.code === code,
      'one side done: the streak waits for the other',
      mine,
    );
    const early = await call('POST', '/api/buddies/nudge', { user: bob, body: { id: pair.id } });
    check(early.status === 409 && early.json?.error === 'not_done', 'only someone who has done their part may nudge', early.json);
    from = mock.calls.length;
    check((await call('POST', '/api/buddies/nudge', { user: alice, body: { id: pair.id } })).json?.ok === true, 'Alice nudges Bob');
    told = sentTo(from, bob.id);
    check(
      told.length === 1 && told[0].params.text.includes(alice.first_name) && told[0].params.text.includes('seriya') && button(told[0])?.web_app.url.includes('open=buddies'),
      'Bob gets the nudge in his language',
      told.map((c) => c.params),
    );
    const again = await call('POST', '/api/buddies/nudge', { user: alice, body: { id: pair.id } });
    check(again.status === 409 && again.json?.error === 'nudged', 'one nudge a day', again.json);
    check((await buddiesOf(alice))?.buddies[0].nudged === true, 'and the app is told so');
    check((await call('POST', '/api/buddies/nudge', { user: alice, body: { id: 'zzzzzzzz' } })).status === 404, 'a pair that is not yours: 404');

    // Bob does his: today is shared, and it follows yesterday.
    await active(bob, today);
    mine = await buddiesOf(bob);
    check(
      mine?.buddies[0].streak === 2 && mine.buddies[0].best === 2 && mine.buddies[0].meDone && mine.buddies[0].theyDone && !mine.buddies[0].canNudge,
      'both done: the streak grows by one',
      mine,
    );
    await active(bob, today);
    await active(alice, today);
    check((await buddiesOf(alice))?.buddies[0].streak === 2, 'reporting the same day again changes nothing');
    const late = await call('POST', '/api/buddies/nudge', { user: alice, body: { id: pair.id } });
    check(late.status === 409 && late.json?.error === 'done', 'nobody is nudged about a day they have done', late.json);

    // Calendars can be a day apart: Alice is already on tomorrow when Bob gets there.
    await active(alice, tomorrow);
    check((await buddiesOf(alice))?.buddies[0].streak === 2, 'a day only one has done is not shared yet');
    await active(bob, tomorrow);
    mine = await buddiesOf(bob);
    check(mine?.buddies[0].streak === 3 && mine.buddies[0].best === 3, 'the next shared day continues the streak', mine);
    await active(bob, dayAt(-3));
    await active(bob, dayAt(3));
    check((await buddiesOf(bob))?.buddies[0].streak === 3, 'days far from the server date are not believed');

    // Someone the bot cannot write to is not nudged; five buddies is the most.
    const daveAccepts = await call('POST', '/api/buddies/accept', { user: dave, body: { code } });
    check(daveAccepts.json?.buddy.streak === 0 && daveAccepts.json.buddy.theyDone === true && daveAccepts.json.buddy.meDone === false, 'Dave becomes a buddy with nothing shared yet', daveAccepts.json);
    const silent = await call('POST', '/api/buddies/nudge', { user: alice, body: { id: (await buddiesOf(alice))?.buddies.find((b) => b.name === 'Dave')?.id } });
    check(silent.status === 409 && silent.json?.error === 'unreachable', 'a buddy the bot cannot write to: no nudge', silent.json);
    await active(dave, tomorrow);
    check((await buddiesOf(dave))?.buddies[0].streak === 1, 'a first shared day starts the streak at one');
    let made = 0;
    let refused = null;
    for (let i = 0; i < 6 && !refused; i++) {
      const r = await call('POST', '/api/buddies/accept', { user: { id: 500 + i, first_name: `Friend ${i}` }, body: { code } });
      if (r.status === 200) made++;
      else refused = r;
    }
    check(made === 3 && refused?.status === 409 && refused.json?.error === 'full', 'a person with five buddies takes no more', { made, refused: refused?.json });
    const carolCode = (await call('POST', '/api/buddies/invite', { user: carol })).json?.code;
    const tooMany = await call('POST', '/api/buddies/accept', { user: alice, body: { code: carolCode } });
    check(tooMany.status === 409 && tooMany.json?.error === 'limit', 'and cannot accept another invite either', tooMany.json);

    check((await call('POST', '/api/buddies/leave', { user: bob, body: { id: pair.id } })).json?.ok === true, 'Bob leaves');
    check((await buddiesOf(bob))?.buddies.length === 0, 'the pair is gone for him');
    check(!(await buddiesOf(alice))?.buddies.some((b) => b.id === pair.id), 'and for Alice');
    check((await call('POST', '/api/buddies/accept', { user: alice, body: { code: carolCode } })).json?.buddy.name === carol.first_name, 'which makes room for a new buddy');

    // An app that has never counted an active day still names today as the last one (the evening nudge
    // leaves a newcomer alone). That is not a day done, whichever of the two the newcomer is.
    const idle = { id: 615, first_name: 'Ilhom', language_code: 'en' };
    const doer = { id: 616, first_name: 'Dilnoza', language_code: 'en' };
    const guest = { id: 617, first_name: 'Lola', language_code: 'en' };
    const opened = (user) =>
      call('POST', '/api/activity', { user, body: { lastActiveDay: today, totalXp: 0, weekXp: 0, weekStart: week, level: 1, streak: 0 } });
    for (const user of [idle, doer, guest]) await hello(user);
    await opened(idle);
    await opened(guest);
    await active(doer, today);
    const idleCode = (await call('POST', '/api/buddies/invite', { user: idle })).json?.code;
    const withIdle = await call('POST', '/api/buddies/accept', { user: doer, body: { code: idleCode, activeDay: today } });
    check(
      withIdle.json?.buddy.streak === 0 && withIdle.json.buddy.meDone === true && withIdle.json.buddy.theyDone === false,
      'whoever shared a link and has done nothing yet has not done today',
      withIdle.json,
    );
    const doerCode = (await call('POST', '/api/buddies/invite', { user: doer })).json?.code;
    const withGuest = await call('POST', '/api/buddies/accept', { user: guest, body: { code: doerCode } });
    check(
      withGuest.json?.buddy.streak === 0 && withGuest.json.buddy.meDone === false && withGuest.json.buddy.theyDone === true,
      'nor has a newcomer who accepts one',
      withGuest.json,
    );
    await active(idle, today);
    check((await buddiesOf(idle))?.buddies[0].streak === 1, 'the first thing they do makes the day a shared one');
  }

  // ---------- group khatm ----------
  console.log('\ngroup khatm');
  {
    const dayAt = (delta) => new Date(Date.now() + delta * DAY).toISOString().slice(0, 10);
    const today = dayAt(0);
    // People of this section's own, and three more readers for the last juz.
    const alice = { id: 631, first_name: 'Omina', language_code: 'en', allows_write_to_pm: true };
    const bob = { id: 632, first_name: 'Nodir', language_code: 'uz', allows_write_to_pm: true };
    const carol = { id: 633, first_name: 'Sevara', language_code: 'ru' };
    const readers = [alice, bob, ...[641, 642, 643].map((id, i) => ({ id, first_name: 'Reader ' + (i + 1) }))];
    const juz = (user, id, n, action, day = today) => call('POST', '/api/gkhatm/juz', { user, body: { id, juz: n, action, day } });
    check((await call('POST', '/api/gkhatm', { user: alice, body: { title: '   ' } })).status === 400, 'a khatm needs a title: 400');
    check((await call('POST', '/api/gkhatm', { user: alice, body: { title: 'Late', due: dayAt(-5) } })).status === 400, 'a finish date in the past: 400');
    const made = await call('POST', '/api/gkhatm', { user: alice, body: { title: '  Family   khatm ', due: dayAt(20) } });
    const k = made.json?.khatm;
    const kid = k?.id;
    check(
      made.status === 200 && /^[a-z0-9]{8}$/.test(kid ?? '') && k.title === 'Family khatm' && k.due === dayAt(20) && k.isOwner && k.joined &&
        k.round === 1 && k.read === 0 && k.done === false && k.members.length === 1 && k.members[0].isMe && k.parts.length === 0,
      'Alice starts a group khatm',
      made.json,
    );
    const preview = await call('GET', `/api/gkhatm/one?id=${kid}`, { user: bob });
    check(preview.json?.khatm.joined === false && preview.json.khatm.owner === alice.first_name && preview.json.khatm.isOwner === false, 'Bob sees it before joining', preview.json);
    check((await call('GET', '/api/gkhatm/one?id=zzzzzzzz', { user: bob })).status === 404, 'unknown khatm: 404');
    const outsider = await juz(bob, kid, 1, 'take');
    check(outsider.status === 403 && outsider.json?.error === 'not_member', 'only members take a juz', outsider.json);
    from = mock.calls.length;
    const bobJoins = await call('POST', '/api/gkhatm/join', { user: bob, body: { id: kid } });
    check(bobJoins.json?.khatm.joined === true && bobJoins.json.khatm.members.length === 2, 'Bob joins', bobJoins.json);
    const told = sentTo(from, alice.id);
    check(
      told.length === 1 && told[0].params.text.includes(bob.first_name) && told[0].params.text.includes('Family khatm') && button(told[0])?.web_app.url.includes(`open=k_${kid}`),
      'Alice hears that Bob joined, with a button to the khatm',
      told.map((c) => c.params),
    );
    from = mock.calls.length;
    check((await call('POST', '/api/gkhatm/join', { user: bob, body: { id: kid } })).json?.khatm.members.length === 2, 'joining twice changes nothing');
    check(sentTo(from, alice.id).length === 0, 'and sends nothing');
    check((await call('POST', '/api/hello', { user: bob, body: { tz: 'UTC', lang: 'uz' } })).json?.together.khatms === 1, 'and hello counts the khatm');

    // Taking, giving back and marking.
    check((await juz(alice, kid, 1, 'take')).json?.khatm.parts.map((p) => `${p.juz}:${p.name}:${p.mine}:${p.done}`).join() === '1:' + alice.first_name + ':true:false', 'Alice takes juz 1');
    const clash = await juz(bob, kid, 1, 'take');
    check(clash.status === 409 && clash.json?.error === 'taken', 'a juz has one reader', clash.json);
    check((await juz(bob, kid, 1, 'read')).status === 409, 'and only its reader marks it');
    const stray = await juz(bob, kid, 5, 'read');
    check(stray.status === 409 && stray.json?.error === 'not_yours', 'a juz is taken before it is read', stray.json);
    check((await juz(bob, kid, 31, 'take')).status === 400 && (await juz(bob, kid, 2, 'burn')).status === 400, 'there are thirty juz and four things to do with one: 400');
    await juz(bob, kid, 2, 'take');
    let r = await juz(alice, kid, 1, 'read');
    check(r.json?.xp === 20 && r.json.completed === false && r.json.khatm.read === 1 && r.json.khatm.parts[0].done === true, 'marking a juz read brings 20 XP', r.json);
    check((await juz(alice, kid, 1, 'read')).json?.xp === 0, 'marking it again brings nothing');
    await juz(alice, kid, 3, 'take');
    await juz(alice, kid, 4, 'take');
    check((await juz(alice, kid, 3, 'read')).json?.xp === 20 && (await juz(alice, kid, 4, 'read')).json?.xp === 0, 'at most 40 XP a day from it');
    r = await juz(alice, kid, 3, 'unread');
    check(r.json?.xp === -20 && r.json.khatm.read === 2, 'taking a mark back takes its XP back', r.json);
    check((await juz(alice, kid, 4, 'unread')).json?.xp === 0, 'a mark that brought nothing takes nothing back');
    check((await juz(alice, kid, 3, 'read')).json?.xp === 20, 'and the day has room for it again');
    const kept = await juz(alice, kid, 1, 'release');
    check(kept.status === 409 && kept.json?.error === 'read', 'a juz that is read is not given back', kept.json);
    check(!(await juz(bob, kid, 2, 'release')).json?.khatm.parts.some((p) => p.juz === 2), 'Bob gives juz 2 back');

    // Members come and go.
    const carolIn = (await call('POST', '/api/gkhatm/join', { user: carol, body: { id: kid } })).json?.khatm;
    const carolKey = carolIn?.members.find((m) => m.isMe)?.key;
    await juz(carol, kid, 10, 'take');
    await juz(carol, kid, 10, 'read');
    await juz(carol, kid, 11, 'take');
    check((await call('POST', '/api/gkhatm/remove', { user: bob, body: { id: kid, key: carolKey } })).status === 404, 'only whoever started it removes a member');
    const removed = await call('POST', '/api/gkhatm/remove', { user: alice, body: { id: kid, key: carolKey } });
    check(
      removed.json?.khatm.members.length === 2 && !removed.json.khatm.parts.some((p) => p.juz === 11) &&
        removed.json.khatm.parts.find((p) => p.juz === 10)?.done === true && removed.json.khatm.parts.find((p) => p.juz === 10)?.name === carol.first_name,
      'removing a member frees what they had not read and keeps what they had',
      removed.json,
    );
    const aliceKey = removed.json?.khatm.members.find((m) => m.isMe)?.key;
    check((await call('POST', '/api/gkhatm/remove', { user: alice, body: { id: kid, key: aliceKey } })).status === 409, 'not themselves, though');
    check((await call('POST', '/api/gkhatm/leave', { user: alice, body: { id: kid } })).status === 409, 'and whoever started it does not leave: they delete it');
    await juz(bob, kid, 12, 'take');
    check((await call('POST', '/api/gkhatm/leave', { user: bob, body: { id: kid } })).json?.ok === true, 'Bob leaves');
    let board = (await call('GET', `/api/gkhatm/one?id=${kid}`, { user: alice })).json?.khatm;
    check(board?.members.length === 1 && !board.parts.some((p) => p.juz === 12), 'and his unread juz is free again', board);
    const list = await call('GET', '/api/gkhatm', { user: alice });
    check(list.json?.khatms.length === 1 && list.json.khatms[0].id === kid && list.json.khatms[0].read === 3, 'the khatm is on Alice’s list', list.json);
    check((await call('GET', '/api/gkhatm', { user: bob })).json?.khatms.length === 0, 'and off Bob’s');

    // The last juz completes it.
    await call('POST', '/api/gkhatm/join', { user: bob, body: { id: kid } });
    await juz(alice, kid, 4, 'release');
    for (const reader of readers.slice(2)) await call('POST', '/api/gkhatm/join', { user: reader, body: { id: kid } });
    board = (await call('GET', `/api/gkhatm/one?id=${kid}`, { user: alice })).json?.khatm;
    const open = [];
    for (let n = 1; n <= 30; n++) if (!board.parts.some((p) => p.juz === n && p.done)) open.push(n);
    from = mock.calls.length;
    let last = null;
    for (const [i, n] of open.entries()) {
      const reader = readers[i % readers.length];
      await juz(reader, kid, n, 'take');
      last = await juz(reader, kid, n, 'read');
      if (i < open.length - 1 && last.json?.completed) check(false, `juz ${n} completed the khatm too early`, last.json);
    }
    // Of the five, only the first two can be written to by the bot.
    const finisher = readers[(open.length - 1) % readers.length];
    const others = [alice, bob].filter((u) => u !== finisher);
    check(last?.json?.completed === true && last.json.khatm.done === true && last.json.khatm.read === 30, 'the thirtieth juz completes the khatm', last?.json);
    const done = mock.since(from, 'sendMessage').filter((c) => c.params.text.includes('🤲'));
    check(
      done.length === others.length && others.every((u) => done.some((c) => c.params.chat_id === u.id)) && done[0].params.text.includes('Family khatm') && button(done[0])?.web_app.url.includes(`open=k_${kid}`),
      'the bot tells the other members once, not the one who read the last juz',
      done.map((c) => c.params),
    );
    const frozen = await juz(alice, kid, 1, 'unread');
    check(frozen.status === 409 && frozen.json?.error === 'complete', 'a complete khatm stays as it is', frozen.json);
    check((await call('POST', '/api/gkhatm/next', { user: bob, body: { id: kid } })).status === 404, 'only whoever started it begins the next round');
    from = mock.calls.length;
    const next = await call('POST', '/api/gkhatm/next', { user: alice, body: { id: kid } });
    check(next.json?.khatm.round === 2 && next.json.khatm.parts.length === 0 && next.json.khatm.done === false && next.json.khatm.members.length === readers.length, 'the next round starts with an empty board', next.json);
    const twice = await call('POST', '/api/gkhatm/next', { user: alice, body: { id: kid } });
    check(twice.status === 409 && twice.json?.error === 'not_complete', 'a round that is not complete does not move on', twice.json);
    check(mock.since(from, 'sendMessage').length === 0, 'and nothing is sent for it');

    let started = 0;
    let refused = null;
    for (let i = 0; i < 5 && !refused; i++) {
      const r2 = await call('POST', '/api/gkhatm', { user: carol, body: { title: `Khatm ${i}` } });
      if (r2.status === 200) started++;
      else refused = r2;
    }
    check(started === 3 && refused?.status === 409 && refused.json?.error === 'limit', 'at most three unfinished khatms of your own', { started, refused: refused?.json });
    check((await call('POST', '/api/gkhatm/delete', { user: bob, body: { id: kid } })).status === 404, 'only whoever started it deletes it');
    const gone = await call('POST', '/api/gkhatm/delete', { user: alice, body: { id: kid } });
    check(gone.json?.ok === true, 'Alice deletes the khatm, its members and its juz', gone.json);
    check((await call('GET', `/api/gkhatm/one?id=${kid}`, { user: bob })).status === 404, 'and it is gone for everyone');
  }

  // ---------- story pictures ----------
  console.log('\nstories');
  const picture = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3, 0xff, 0xd9]);
  const postPicture = (user, body, type = 'image/jpeg') =>
    fetch(`${BASE}/api/story`, { method: 'POST', headers: { Authorization: `tma ${initData(user)}`, 'content-type': type }, body });
  check((await fetch(`${BASE}/api/story`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: picture })).status === 401, 'story upload needs Telegram auth');
  check((await postPicture(alice, picture, 'image/png')).status === 400, 'only JPEG pictures: 400');
  check((await postPicture(alice, new Uint8Array([1, 2, 3, 4]))).status === 400, 'a body that is not a JPEG: 400');
  const stored = await (await postPicture(alice, picture)).json();
  const storyPath = stored.url?.replace(APP_URL, '');
  check(/^\/s\/[A-Za-z0-9]{22}\.jpg$/.test(storyPath ?? ''), 'the upload returns a public address on the app', stored);
  const served = await fetch(`${BASE}${storyPath}`);
  const servedBytes = new Uint8Array(await served.arrayBuffer());
  check(
    served.status === 200 && served.headers.get('content-type') === 'image/jpeg' && servedBytes.length === picture.length && servedBytes.every((b, i) => b === picture[i]),
    'the picture is served as it was uploaded',
    { status: served.status, type: served.headers.get('content-type'), length: servedBytes.length },
  );
  check((await fetch(`${BASE}/s/AAAAAAAAAAAAAAAAAAAAAA.jpg`)).status === 404, 'unknown pictures: 404');
  check((await fetch(`${BASE}/s/${storyPath.slice(3, 10)}.png`)).status === 404, 'only the exact picture address answers');

  // ---------- Plus ----------
  console.log('\nplus');
  let plus = await call('GET', '/api/plus', { user: alice });
  check(plus.json?.active === false && plus.json.priceStars === 150, 'Plus starts inactive', plus.json);
  from = mock.calls.length;
  const invoice = await call('POST', '/api/plus/invoice', { user: alice });
  const link = mock.since(from, 'createInvoiceLink')[0]?.params;
  check(invoice.json?.url?.startsWith('https://t.me/$mock-invoice-'), 'invoice link returned', invoice.json);
  check(
    link?.currency === 'XTR' && link.prices[0].amount === 150 && link.subscription_period === 2_592_000 && link.payload === 'plus:111' && link.provider_token === '',
    'a 30-day Stars subscription invoice',
    link,
  );

  const pcq = (user, payload) => ({ pre_checkout_query: { id: `pcq${++updateId}`, from: user, currency: 'XTR', total_amount: 150, invoice_payload: payload } });
  from = mock.calls.length;
  await webhook(pcq(alice, 'plus:111'));
  check(mock.since(from, 'answerPreCheckoutQuery')[0]?.params.ok === true, 'pre-checkout approved');
  from = mock.calls.length;
  await webhook(pcq(bob, 'plus:111'));
  check(mock.since(from, 'answerPreCheckoutQuery')[0]?.params.ok === false, "someone else's invoice is refused");

  const subEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
  const payment = message(alice, {
    successful_payment: {
      currency: 'XTR', total_amount: 150, invoice_payload: 'plus:111', subscription_expiration_date: subEnd,
      is_recurring: true, is_first_recurring: true, telegram_payment_charge_id: 'ch_1', provider_payment_charge_id: '',
    },
  });
  from = mock.calls.length;
  await webhook(payment);
  check(sentTo(from, 111)[0]?.params.text.startsWith('Thank you! LifePath Plus is active until'), 'payment thanked');
  plus = await call('GET', '/api/plus', { user: alice });
  check(plus.json?.active === true && plus.json.expiresAt === subEnd * 1000, 'Plus active until the subscription ends', plus.json);
  from = mock.calls.length;
  await webhook(payment);
  check(sentTo(from, 111).length === 0, 'a repeated payment update changes nothing');
  from = mock.calls.length;
  await webhook(pcq(alice, 'plus:111'));
  check(mock.since(from, 'answerPreCheckoutQuery')[0]?.params.ok === false, 'no second charge while a renewing subscription is active');
  await webhook({ subscription: { user: alice, invoice_payload: 'plus:111', state: 'canceled' } });
  check((await call('GET', '/api/plus', { user: alice })).json?.active === true, 'canceling keeps Plus until the period ends');
  await webhook(message(alice, { refunded_payment: { currency: 'XTR', total_amount: 150, invoice_payload: 'plus:111', telegram_payment_charge_id: 'ch_1' } }));
  check((await call('GET', '/api/plus', { user: alice })).json?.active === false, 'a refund ends Plus');

  // ---------- the owner's panel ----------
  console.log("\nowner's panel");
  const hi = (user, lang = 'en') => call('POST', '/api/hello', { user, body: { tz: 'UTC', lang } }).then((r) => r.json);
  const owner = await hi(alice);
  check(owner?.admin === true && owner.access.levels === false, 'hello tells an owner, named by username, that the panel is theirs', owner);
  check((await hi(carol, 'ru'))?.admin === true, 'an owner can be named by id');
  const guest = await hi(bob, 'uz');
  check(guest && !('admin' in guest) && guest.access.levels === false, 'and says nothing of it to anyone else', guest);
  check((await call('GET', '/api/admin/users')).status === 401, 'the panel needs a login');
  check((await call('GET', '/api/admin/users', { user: bob })).status === 404, 'for anyone else the panel does not exist');
  check((await call('PUT', '/api/admin/access', { user: bob, body: { id: 222, plus: true } })).status === 404, 'nor can they open things for themselves');
  check((await call('GET', '/api/admin/users', { user: { ...alice, username: 'ALICE' } })).status === 200, 'a username matches whatever its capitals');
  check((await call('GET', '/api/admin/users', { user: { id: 999, first_name: 'Eve', username: 'alice2' } })).status === 404, 'a look-alike username is not the owner');

  // Carol, the other owner, asks from here on: every person may only call so often in a minute, and Alice has been busy.
  await call('POST', '/api/activity', { user: bob, body: { lastActiveDay: '2026-03-01', totalXp: 4200, xp: 5600, weekXp: 0, weekStart: 0, level: 9, streak: 4 } });
  const panel = await call('GET', '/api/admin/users?sort=level', { user: alice });
  const person = (id) => panel.json?.users.find((u) => u.id === id);
  check(
    panel.status === 200 && panel.json.total >= 3 && panel.json.stats.users === panel.json.total && panel.json.users.length === panel.json.total && panel.json.more === false,
    'the owner sees everyone',
    panel.json?.stats,
  );
  check(
    person(222)?.firstName === 'Bobur' && person(222).level === 9 && person(222).xp === 5600 && person(222).provenXp === 4200 && person(222).streak === 4 &&
      person(222).lastActiveDay === '2026-03-01' && person(222).seenAt > Date.now() - 600_000 && person(111)?.username === 'alice',
    'with their level, score and when they were last here',
    person(222),
  );
  check(panel.json.users.every((u, i, all) => i === 0 || all[i - 1].level >= u.level), 'highest level first when asked');
  // An app from before the panel sends no "xp": what was known stays, and nobody shows less than their proven XP.
  await call('POST', '/api/activity', { user: bob, body: { lastActiveDay: '2026-03-01', totalXp: 4300, weekXp: 0, weekStart: 0, level: 9, streak: 4 } });
  await call('POST', '/api/activity', { user: carol, body: { lastActiveDay: '2026-03-01', totalXp: 700, weekXp: 0, weekStart: 0, level: 3, streak: 1 } });
  const older = (await call('GET', '/api/admin/users', { user: alice })).json?.users ?? [];
  check(
    older.find((u) => u.id === 222)?.xp === 5600 && older.find((u) => u.id === 222).provenXp === 4300 && older.find((u) => u.id === 333)?.xp === 700,
    'an older app that does not send all its XP loses nothing',
    older.map((u) => [u.id, u.xp, u.provenXp]),
  );
  check(panel.json.stats.today >= 3 && panel.json.stats.week >= 3 && panel.json.stats.fresh >= 3, 'and how many were here today and joined this week', panel.json.stats);
  const byName = await call('GET', '/api/admin/users?q=@alice', { user: alice });
  check(byName.json?.total === 1 && byName.json.users[0].id === 111 && byName.json.stats.users === panel.json.total, 'search by username', byName.json?.users);
  check((await call('GET', '/api/admin/users?q=222', { user: alice })).json?.users[0]?.id === 222, 'search by id');
  check((await call('GET', '/api/admin/users?q=%25', { user: alice })).json?.total === 0, 'a percent sign is looked for as itself');
  check((await call('GET', '/api/admin/users?sort=shoe', { user: alice })).status === 400, 'unknown order: 400');

  const give = await call('PUT', '/api/admin/access', { user: carol, body: { id: 222, levels: true } });
  check(give.status === 200 && give.json.levelsOpen === true && give.json.plusGift === false, 'the owner opens the levels for someone', give.json);
  let bobNow = await hi(bob, 'uz');
  check(bobNow?.access.levels === true && bobNow.plus.active === false, 'and their app is told', bobNow);
  check(bobNow?.access.wardrobe === false, 'the wardrobe stays as it was until the owner opens it', bobNow?.access);
  const robe = await call('PUT', '/api/admin/access', { user: carol, body: { id: 222, wardrobe: true } });
  check(robe.status === 200 && robe.json.wardrobeOpen === true && robe.json.levelsOpen === true, 'the owner opens the whole wardrobe, and the levels stay open', robe.json);
  bobNow = await hi(bob, 'uz');
  check(bobNow?.access.wardrobe === true, 'and their app is told the wardrobe is open', bobNow?.access);
  check((await call('GET', '/api/admin/users?q=222', { user: alice })).json?.users[0]?.wardrobeOpen === true, 'the panel lists it');
  check((await call('PUT', '/api/admin/access', { user: carol, body: { id: 222, wardrobe: 'yes' } })).status === 400, 'a wardrobe switch that is not true or false: 400');
  await call('PUT', '/api/admin/access', { user: carol, body: { id: 222, plus: true } });
  bobNow = await hi(bob, 'uz');
  check(
    bobNow?.access.levels === true && bobNow.plus.active === true && bobNow.plus.gift === true && bobNow.plus.expiresAt === null,
    'Plus as a gift is on with no end date, and the levels stay open',
    bobNow?.plus,
  );
  check((await call('GET', '/api/plus', { user: bob })).json?.active === true, 'GET /api/plus agrees');
  const sparks = await call('PUT', '/api/admin/access', { user: carol, body: { id: 222, sparks: 500 } });
  check(sparks.json?.sparksGift === 500 && sparks.json.levelsOpen === true && sparks.json.plusGift === true, 'the owner gives Sparks, and the switches stay as they were', sparks.json);
  check((await hi(bob, 'uz'))?.access.sparks === 500 && (await hi(carol, 'ru'))?.access.sparks === 0, 'their app is told how many, and nobody else gets any');
  check((await call('PUT', '/api/admin/access', { user: carol, body: { id: 222, sparks: -5 } })).status === 400, 'fewer than no Sparks: 400');
  check((await call('PUT', '/api/admin/access', { user: carol, body: { id: 222, sparks: 100_001 } })).status === 400, 'more Sparks than the limit: 400');
  const given = await call('GET', '/api/admin/users?q=Bobur', { user: alice });
  check(
    given.json?.users[0]?.levelsOpen === true && given.json.users[0].plusGift === true && given.json.users[0].sparksGift === 500 &&
      given.json.stats.plus === 1 && given.json.stats.levelsOpen === 1,
    'the panel shows what was given',
    given.json?.stats,
  );
  await call('PUT', '/api/admin/access', { user: carol, body: { id: 222, levels: false, plus: false } });
  bobNow = await hi(bob, 'uz');
  check(bobNow?.access.levels === false && bobNow.plus.active === false && !('gift' in bobNow.plus) && bobNow.access.sparks === 500, 'taking the switches back closes both and leaves the Sparks', bobNow);
  check((await call('PUT', '/api/admin/access', { user: carol, body: { id: 424242, plus: true } })).status === 404, 'someone who never opened the app: 404');
  check((await call('PUT', '/api/admin/access', { user: carol, body: { id: 222 } })).status === 400, 'nothing to change: 400');
  check((await call('PUT', '/api/admin/access', { user: carol, body: { id: 222, plus: 'yes' } })).status === 400, 'a switch is on or off: 400');

  // ---------- errors the app reports ----------
  console.log('\nerrors');
  // Dave has never said hello: a report needs a login, but nothing of the person is looked up or kept.
  const dave = { id: 444, first_name: 'Dave', language_code: 'en' };
  const OLD_BUILD = '261117.0423-edab962';
  const NEW_BUILD = '261118.0900-abc1234';
  const report = (fields = {}) => ({
    kind: 'render',
    message: "TypeError: Cannot read properties of undefined (reading 'title')",
    stack: 'TypeError: Cannot read properties of undefined (reading "title")\n    at Tasks (https://lifepath.example.test/assets/daily-AbC123.js:4:120)\n    at Array.map (<anonymous>)',
    screen: 'tasks',
    build: OLD_BUILD,
    platform: 'ios',
    tg: '8.0',
    lang: 'ru',
    ...fields,
  });
  const send = (fields, user = dave) => call('POST', '/api/errors', { user, body: report(fields) });
  check((await call('POST', '/api/errors', { body: report() })).status === 401, 'an error report needs a login');
  const sent = await send();
  check(sent.status === 200 && sent.json?.ok === true, 'the app reports an error', sent.json);
  // The same error again, from another phone and another place in the app.
  await send({ kind: 'error', screen: 'sheet:task', platform: 'android', tg: '7.10', lang: 'uz', stack: 'at Other (https://x.example/assets/other-1.js:1:1)' }, bob);
  await send({ message: 'RangeError: Invalid time value', stack: undefined, screen: undefined, platform: undefined, tg: undefined, lang: undefined });
  await send({ build: NEW_BUILD });
  await send({
    build: NEW_BUILD,
    kind: 'promise',
    message: `Could not read "Morning walk with Alisher" at https://lifepath.example.test/api/thing?user=123456789 ${'x'.repeat(400)}`,
    stack: '',
  });
  for (const [fields, what] of [
    [{ kind: 'crash' }, 'an unknown kind'],
    [{ build: undefined }, 'no build'],
    [{ build: 'not a build' }, 'a build that is not a short name'],
    [{ message: '   ' }, 'no message'],
    [{ message: 42 }, 'a message that is not text'],
    [{ message: 'x'.repeat(4001) }, 'a message far too long'],
    [{ screen: 'two words' }, 'a screen that is not a name'],
    [{ lang: 'de' }, 'an unsupported language'],
  ]) {
    check((await send(fields)).status === 400, `${what}: 400`);
  }

  check((await call('GET', '/api/admin/errors')).status === 401, 'the list of errors needs a login');
  check((await call('GET', '/api/admin/errors', { user: bob })).status === 404, 'and for anyone but an owner it does not exist');
  const seen = await call('GET', '/api/admin/errors', { user: carol });
  const builds = seen.json?.builds ?? [];
  check(
    seen.status === 200 && builds.length === 2 && builds[0].build === NEW_BUILD && builds[1].build === OLD_BUILD,
    'the owner sees the errors, the newest build first',
    builds.map((b) => b.build),
  );
  const twice = builds[1]?.errors.find((e) => e.message.startsWith('TypeError'));
  check(
    builds[1]?.errors.length === 2 && builds[1].count === 3 && twice?.count === 2 && twice.message === report().message,
    'one row for a build and a message, counted each time it comes',
    builds[1]?.errors.map((e) => [e.message, e.count]),
  );
  check(
    twice?.kind === 'error' && twice.screen === 'sheet:task' && twice.platform === 'android' && twice.tg === '7.10' && twice.lang === 'uz',
    'a row says where the latest one happened, and on what',
    twice,
  );
  check(twice?.stack === 'at /assets/daily-AbC123.js:4:120', 'and keeps the top of the first stack, without the message or the address', twice?.stack);
  check(
    twice?.firstAt <= twice?.lastAt && twice.lastAt > Date.now() - 600_000 && seen.json.now >= twice.lastAt,
    'with when it was first and last seen',
    twice && [twice.firstAt, twice.lastAt, seen.json.now],
  );
  const bare = builds[1]?.errors.find((e) => e.message.startsWith('RangeError'));
  check(bare?.count === 1 && bare.stack === '' && bare.screen === '' && bare.platform === '' && bare.lang === '', 'a report may come with the message alone', bare);
  check(builds[0]?.errors.length === 2 && builds[0].count === 2 && builds[0].errors[0].kind === 'promise', 'the same message in another build is another row, and the latest comes first', builds[0]?.errors.map((e) => e.kind));
  const cut = builds[0]?.errors[0]?.message ?? '';
  check(
    cut === 'Unexpected application error' && !/Alisher|example|123456789/.test(cut),
    'the server cuts a message down itself, whatever the app sent',
    cut,
  );
  check(
    Object.keys(twice ?? {}).sort().join() === 'count,firstAt,key,kind,lang,lastAt,message,platform,screen,stack,tg',
    'nothing in a row says who sent it',
    Object.keys(twice ?? {}),
  );

  // ---------- blocking ----------
  console.log('\nblocking');
  const member = (status) => ({ my_chat_member: { chat: { id: 222, type: 'private' }, from: bob, date: 0, new_chat_member: { status } } });
  await webhook(member('kicked'));
  check((await call('POST', '/api/hello', { user: bob, body: { tz: 'UTC', lang: 'uz' } })).json?.reminders.canMessage === false, 'blocking the bot is remembered');
  await webhook(member('member'));
  check((await call('POST', '/api/hello', { user: bob, body: { tz: 'UTC', lang: 'uz' } })).json?.reminders.canMessage === true, 'unblocking is remembered');

  // ---------- front end ----------
  console.log('\nfront end');
  const page = await fetch(`${BASE}/`);
  check(page.status === 200 && (page.headers.get('content-type') ?? '').includes('text/html'), 'the app is served at /');
  const deep = await fetch(`${BASE}/calendar`, { headers: { accept: 'text/html' } });
  check(deep.status === 200 && (deep.headers.get('content-type') ?? '').includes('text/html'), 'other paths fall back to the app');
  check((await call('GET', '/tg/other')).status === 404, 'unknown bot paths: 404');

  // Last, because wrangler dev may not reuse a connection whose request body was left unread.
  console.log('\nlimits');
  check((await call('POST', '/api/hello', { user: alice, raw: JSON.stringify({ tz: 'UTC', lang: 'en', pad: 'x'.repeat(70_000) }) })).status === 400, 'body over 64 KB: 400');
} catch (e) {
  console.error(e);
  failures++;
}

if (failures) {
  const notable = devLog.split('\n').filter((line) => line.trim() && !/^\[wrangler:info\] (GET|POST|PUT) /.test(line));
  console.log(`\nwrangler dev log (without request lines):\n${notable.slice(-60).join('\n')}`);
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
await stop(failures ? 1 : 0);
