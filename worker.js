/**
 * Atmos Villas — Telegram lead forwarder
 * Cloudflare Worker. Deploy at https://workers.cloudflare.com (free plan).
 *
 * Required secrets (Settings -> Variables -> Add variable, "Encrypt" for the token):
 *   BOT_TOKEN  — token from @BotFather, e.g. 8123456789:AAH...
 *   CHAT_ID    — your chat id from @userinfobot, e.g. 512345678
 *
 * Optional variable:
 *   ALLOWED_ORIGIN — your site origin, e.g. https://atmos.villas
 *                    (if omitted, any origin is accepted)
 */

const LABELS = {
  WhatsApp: '💬 WhatsApp',
  Telegram: '✈️ Telegram',
  Call:     '📞 Phone call',
};

const LANG_NAMES = {
  en: 'English', ru: 'Русский', uk: 'Українська',
  de: 'Deutsch', fr: 'Français', es: 'Español', he: 'עברית',
};

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function clean(s) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
}

function cors(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': allowed || origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';
    const CORS = cors(origin, allowed);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405, CORS);
    if (allowed && origin && origin !== allowed) return json({ ok: false, error: 'origin' }, 403, CORS);

    let d;
    try { d = await request.json(); } catch (e) { return json({ ok: false, error: 'json' }, 400, CORS); }

    // honeypot: a bot filled the hidden field -> pretend success, send nothing
    if (clean(d.website)) return json({ ok: true }, 200, CORS);

    const name  = clean(d.name).slice(0, 80);
    const phone = clean(d.phone).slice(0, 40);
    const how   = clean(d.how).slice(0, 20);
    const lang  = clean(d.lang).slice(0, 5).toLowerCase();
    const page  = clean(d.page).slice(0, 300);

    if (!name || !phone) return json({ ok: false, error: 'missing' }, 400, CORS);

    const when = new Date().toLocaleString('en-GB', {
      timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });

    const text =
      '🏝 <b>New enquiry — Atmos Villas</b>\n\n' +
      '👤 <b>Name:</b> ' + esc(name) + '\n' +
      '📱 <b>Phone:</b> <code>' + esc(phone) + '</code>\n' +
      '🔔 <b>Prefers:</b> ' + esc(LABELS[how] || how || '—') + '\n' +
      '🌐 <b>Language:</b> ' + esc(LANG_NAMES[lang] || lang || '—') + '\n' +
      '🕒 <b>Time:</b> ' + esc(when) + ' (Bangkok)\n' +
      (page ? '🔗 ' + esc(page) : '');

    const wa = phone.replace(/[^\d]/g, '');
    const reply_markup = wa
      ? { inline_keyboard: [[{ text: '💬 Reply on WhatsApp', url: 'https://wa.me/' + wa }]] }
      : undefined;

    const tg = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup,
      }),
    });

    if (!tg.ok) {
      const info = await tg.text();
      console.log('telegram error', tg.status, info);
      return json({ ok: false, error: 'telegram' }, 502, CORS);
    }

    return json({ ok: true }, 200, CORS);
  },
};
