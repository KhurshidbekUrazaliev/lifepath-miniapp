// End-to-end test of the Worker: `wrangler dev` on a fresh local database, talking to the mock
// Telegram API. Covers the API, the webhook, the setup call, payments and the reminder cron.
//   npm run build   (once: the Worker serves ./dist)
//   npm run test:worker
import { execFileSync, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMock, tgError } from './mock-telegram.mjs';

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
const port = 8790 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${port}`;
const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };

execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'lifepath', '--local', '--persist-to', dir], { env, stdio: 'pipe' });

const vars = { BOT_TOKEN: TOKEN, WEBHOOK_SECRET, SETUP_KEY, DEV_AUTH: '1', TELEGRAM_API: mock.url, APP_URL, PLUS_STARS: '150' };
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
