// A tiny stand-in for the Telegram Bot API: it records every call and answers the way Telegram would.
//
// From a test:   const mock = await startMock({ token });  mock.calls, mock.respond(...), mock.close()
// By hand:       node worker/test/mock-telegram.mjs 8799
//                then set TELEGRAM_API="http://127.0.0.1:8799" in .dev.vars and watch the calls.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

/**
 * @param {{ token?: string, port?: number, log?: boolean }} [options]
 *   token: when set, calls with another bot token get 401 like the real API.
 */
export async function startMock({ token, port = 0, log = false } = {}) {
  /** @type {{ method: string, params: any, at: number }[]} */
  const calls = [];
  /** @type {{ path: string, headers: Record<string, any>, body: Buffer }[]} What the push service stand-in got. */
  const pushes = [];
  /** @type {Map<string, number>} Status the push stand-in answers for a path (201 otherwise). */
  const pushStatus = new Map();
  /** @type {string[]} The paths asked of the Quran and hadith stand-ins. */
  const sources = [];
  /** @type {Map<string, (params: any) => ({ status?: number, body: any } | undefined)>} */
  const overrides = new Map();
  let counter = 0;

  const results = {
    getMe: () => ({ id: 4242, is_bot: true, first_name: 'LifePath Test', username: 'lifepath_test_bot' }),
    createInvoiceLink: () => `https://t.me/$mock-invoice-${++counter}`,
    sendMessage: (p) => ({
      message_id: ++counter,
      date: Math.floor(Date.now() / 1000),
      chat: { id: p.chat_id, type: 'private' },
      text: p.text,
    }),
  };

  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const reply = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      const path = new URL(req.url ?? '/', 'http://mock').pathname;
      // A stand-in for a browser's push service (worker/src/push.ts posts the notifications here).
      if (path.startsWith('/push/') && req.method === 'POST') {
        pushes.push({ path, headers: req.headers, body: raw });
        res.writeHead(pushStatus.get(path) ?? 201);
        return res.end();
      }
      // Stand-ins for Quran.com and the hadith collection that the ayah and hadith of the day come from.
      if (path.startsWith('/quran/') || path.startsWith('/hadith/')) {
        sources.push(path);
        const found = source(path);
        return found ? reply(200, found) : reply(404, { message: 'Not Found' });
      }
      const match = /^\/bot([^/]+)\/([A-Za-z]+)$/.exec(path);
      if (!match) return reply(404, { ok: false, error_code: 404, description: 'Not Found' });
      if (token && match[1] !== token) return reply(401, { ok: false, error_code: 401, description: 'Unauthorized' });

      let params;
      if ((req.headers['content-type'] ?? '').startsWith('multipart/form-data')) {
        // File uploads: keep the raw form so a test can look for its parts.
        params = { multipart: true, body: raw.toString('latin1') };
      } else {
        try {
          params = raw.length ? JSON.parse(raw.toString('utf8')) : {};
        } catch {
          return reply(400, { ok: false, error_code: 400, description: 'Bad Request: invalid JSON' });
        }
      }
      const method = match[2];
      calls.push({ method, params, at: Date.now() });
      if (log) console.log(method, JSON.stringify(params));

      const custom = overrides.get(method)?.(params);
      if (custom) return reply(custom.status ?? 200, custom.body);
      reply(200, { ok: true, result: results[method] ? results[method](params) : true });
    });
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(undefined)));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());

  return {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    sources,
    pushes,
    pushStatus,
    /** Calls of one method made since `from` (an earlier calls.length). */
    since: (from, method) => calls.slice(from).filter((call) => !method || call.method === method),
    /** Answer a method yourself: return { status, body } from `fn`, or undefined for the default answer. */
    respond: (method, fn) => overrides.set(method, fn),
    /** Back to default answers. */
    reset: () => overrides.clear(),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve(undefined));
      }),
  };
}

const AYAH = {
  verse: {
    verse_key: '2:286',
    text_uthmani: 'لَا يُكَلِّفُ ٱللَّهُ نَفْسًا إِلَّا وُسْعَهَا',
    page_number: 49,
    translations: [
      { resource_id: 20, text: 'Allah does not burden a soul beyond that it can bear.<sup foot_note=1>1</sup>' },
      { resource_id: 79, text: 'Аллах не возлагает на человека сверх его возможностей.' },
      { resource_id: 55, text: 'Alloh hech bir jonni toqatidan tashqari narsaga taklif qilmas. O`zi' },
    ],
  },
};
const HADITH = {
  rus: 'Сообщается со слов Абу Хурайры, что Пророк ﷺ сказал: «Поистине, эта религия легка, и никто не будет состязаться с ней»',
  eng: 'Narrated Abu Huraira:The Prophet (ﷺ) said, "Religion is very easy and whoever overburdens himself in his religion will not be able to continue in that way."',
  ara: 'عَنْ أَبِي هُرَيْرَةَ عَنِ النَّبِيِّ صلى الله عليه وسلم قَالَ إِنَّ الدِّينَ يُسْرٌ',
};

/** What the stand-in sources answer: one ayah, and the same short hadith under every number. */
function source(path) {
  if (path === '/quran/verses/random') return AYAH;
  const m = /^\/hadith\/editions\/(rus|eng|ara)-bukhari\/(\d+)\.json$/.exec(path);
  return m ? { hadiths: [{ hadithnumber: Number(m[2]), text: HADITH[m[1]] }] } : null;
}

/** A Telegram-style error answer. */
export const tgError = (code, description, parameters) => ({
  status: code,
  body: { ok: false, error_code: code, description, ...(parameters && { parameters }) },
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mock = await startMock({ port: Number(process.argv[2] ?? 8799), log: true });
  console.log(`Mock Telegram Bot API on ${mock.url} (Ctrl+C to stop)`);
}
