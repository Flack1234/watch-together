const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const http = require('http');

// === НАЛАШТУВАННЯ ===
const BOT_TOKEN = '8962969516:AAFAcRiSJJXma8vk5v1igCwE2hfIg-pto-Y';
const ADMIN_ID = 7818240227;
const SITE_URL = 'https://watch-together-68ay.onrender.com';
// ====================

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function checkSite() {
  return new Promise((resolve) => {
    const start = Date.now();
    const client = SITE_URL.startsWith('https') ? https : http;
    const req = client.get(SITE_URL, (res) => {
      const ms = Date.now() - start;
      resolve({ online: res.statusCode === 200, status: res.statusCode, ms });
    });
    req.on('error', () => resolve({ online: false, status: 0, ms: 0 }));
    req.setTimeout(30000, () => {
      req.destroy();
      resolve({ online: false, status: 0, ms: 0 });
    });
  });
}

const keyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '📊 Статус сайту' }, { text: '🚀 Запустити сайт' }]
    ],
    resize_keyboard: true
  }
};

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '👋 Привіт! Я керую Watch Together сайтом.\n\n' +
    '📊 *Статус сайту* — перевірити чи працює\n' +
    '🚀 *Запустити сайт* — розбудити якщо спить\n\n' +
    `🔗 Сайт: ${SITE_URL}`,
    { parse_mode: 'Markdown', ...keyboard }
  );
});

bot.onText(/📊 Статус сайту/, async (msg) => {
  const waiting = await bot.sendMessage(msg.chat.id, '⏳ Перевіряю...');
  const result = await checkSite();

  if (result.online) {
    bot.editMessageText(
      `✅ *Сайт працює!*\n\n` +
      `⏱ Відповідь: ${result.ms}ms\n` +
      `🔗 ${SITE_URL}`,
      { chat_id: msg.chat.id, message_id: waiting.message_id, parse_mode: 'Markdown' }
    );
  } else {
    bot.editMessageText(
      `😴 *Сайт спить або недоступний*\n\n` +
      `Натисни "🚀 Запустити сайт" щоб розбудити.`,
      { chat_id: msg.chat.id, message_id: waiting.message_id, parse_mode: 'Markdown' }
    );
  }
});

bot.onText(/🚀 Запустити сайт/, async (msg) => {
  const waiting = await bot.sendMessage(msg.chat.id, '⏳ Будю сайт... (може зайняти до 50 сек)');
  const result = await checkSite();

  if (result.online) {
    bot.editMessageText(
      `✅ *Сайт активний і працює!*\n\n` +
      `⏱ Відповідь: ${result.ms}ms\n` +
      `🔗 ${SITE_URL}\n\n` +
      `🔑 Пароль: 4422`,
      { chat_id: msg.chat.id, message_id: waiting.message_id, parse_mode: 'Markdown' }
    );
  } else {
    bot.editMessageText(
      `❌ *Не вдалося розбудити сайт.*\n\nСпробуй ще раз через хвилину.`,
      { chat_id: msg.chat.id, message_id: waiting.message_id, parse_mode: 'Markdown' }
    );
  }
});

console.log('🤖 Бот запущено! Очікую команди...');
