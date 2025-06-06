require('dotenv').config();
const express = require('express');
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Сигнал Railway, що сервер "живий"
app.get('/', (_, res) => res.send('✅ Парсер готовий. Використай /run для запуску'));

// 🧠 Основний ендпоінт запуску парсера
app.get('/run', async (req, res) => {
  console.log('🚀 Парсинг стартував...');
  const url = process.env.TARGET_URL;

  if (!url) {
    console.warn('❌ TARGET_URL не задано');
    return res.status(400).json({ error: 'TARGET_URL не задано у .env' });
  }

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 60_000,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    const data = await page.evaluate(() => {
      const result = {
        prices: [],
        procedures: [],
        contacts: [],
        socialMedia: [],
        reviewsLinks: [],
        specialists: [],
        values: []
      };

      const regexPrice = /\d{2,5}\s?(грн|₴)/gi;
      const regexPhone = /(?:\+38)?0\d{9}/g;
      const regexEmail = /[\w.-]+@[\w.-]+\.\w+/g;
      const allElements = document.querySelectorAll('body *');

      allElements.forEach(el => {
        const text = el.innerText?.trim();
        const href = el.getAttribute('href') || '';

        if (text) {
          if (regexPrice.test(text)) result.prices.push(...text.match(regexPrice));
          if (text.length < 100 && regexPrice.test(text)) result.procedures.push(text);
          if (regexPhone.test(text)) result.contacts.push(...text.match(regexPhone));
          if (regexEmail.test(text)) result.contacts.push(...text.match(regexEmail));
          if (/косметолог|лікар|експерт|терапевт|спеціаліст/i.test(text)) result.specialists.push(text);
          if (/про нас|місія|чому ми|наша команда/i.test(text) && text.length > 80) result.values.push(text);
        }

        if (/instagram\.com|facebook\.com|t\.me|youtube\.com|viber\.com/i.test(href)) {
          result.socialMedia.push(href);
        }
        if (/maps\.google|reviews|відгук/i.test(href)) {
          result.reviewsLinks.push(href);
        }
      });

      const unique = arr => Array.from(new Set(arr.map(item => item.trim())));
      return {
        prices: unique(result.prices),
        procedures: unique(result.procedures),
        contacts: unique(result.contacts),
        socialMedia: unique(result.socialMedia),
        reviewsLinks: unique(result.reviewsLinks),
        specialists: unique(result.specialists),
        values: unique(result.values)
      };
    });

    fs.writeFileSync('result.json', JSON.stringify(data, null, 2));
    console.log('✅ Дані збережено');
    res.status(200).json(data);

  } catch (err) {
    console.error('💥 Помилка під час парсингу:', err.message || err);
    res.status(500).json({ error: '❌ Не вдалося завершити парсинг', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ✅ Старт сервера
app.listen(PORT, () => {
  console.log(`🌐 Сервер працює на порту ${PORT}`);
});
