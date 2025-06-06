require('dotenv').config();
const express = require('express');
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ✅ Health check
app.get('/', (_, res) => {
  res.send('✅ Парсер готовий. Використай /run або /api/scrape');
});

// 📥 Основний парсинг через POST
app.post('/api/scrape', async (req, res) => {
  const url = req.body.url;
  if (!url) {
    return res.status(400).json({ error: '❌ Не передано параметр `url`' });
  }

  let browser;
  try {
    // 🔍 Перевіряємо доступність сайту
    try {
      await axios.get(url, { timeout: 10000 });
      console.log('🌐 Сайт доступний');
    } catch (err) {
      return res.status(400).json({ error: '❌ Сайт недоступний', details: err.message });
    }

    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('body');
    await page.waitForTimeout(3000); // даємо контенту дозавантажитись

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

      const regexPrice = /\d[\d\s.,]{2,6}?(грн|₴)?/gi;
      const regexPhone = /(?:\+38)?0\d{9}/g;
      const regexEmail = /[\w.-]+@[\w.-]+\.\w+/g;
      const allElements = Array.from(document.querySelectorAll('body *'));

      allElements.forEach(el => {
        const tag = el.tagName;
        if (!['P', 'DIV', 'SPAN', 'LI', 'A'].includes(tag)) return;

        const text = el.innerText?.trim() || el.textContent?.trim();
        const href = el.getAttribute('href') || '';

        if (!text || text.length > 1000) return;

        if (regexPrice.test(text)) result.prices.push(...text.match(regexPrice));
        if (text.length < 150 && /(чистка|масаж|уколи|ботокс|пілінг|шугаринг|процедур|послуг)/i.test(text)) {
          result.procedures.push(text);
        }
        if (regexPhone.test(text)) result.contacts.push(...text.match(regexPhone));
        if (regexEmail.test(text)) result.contacts.push(...text.match(regexEmail));
        if (/(косметолог|лікар|дерматолог|експерт|терапевт|спеціаліст)/i.test(text)) {
          result.specialists.push(text);
        }
        if (/(про нас|місія|чому ми|наша команда)/i.test(text) && text.length > 80) {
          result.values.push(text);
        }

        if (/instagram\.com|facebook\.com|t\.me|youtube\.com|viber\.com/i.test(href)) {
          result.socialMedia.push(href);
        }
        if (/maps\.google|reviews|відгук/i.test(href)) {
          result.reviewsLinks.push(href);
        }
      });

      const unique = arr => Array.from(new Set(arr.map(i => i.trim())));
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

    await browser.close();
    console.log('✅ Парсинг завершено');

    // зберігаємо у файл (опційно)
    fs.writeFileSync('result.json', JSON.stringify(data, null, 2));

    return res.status(200).json({
      url,
      success: true,
      timestamp: new Date().toISOString(),
      data
    });

  } catch (err) {
    if (browser) await browser.close();
    console.error('💥 Помилка:', err.message || err);
    return res.status(500).json({ error: '❌ Не вдалося завершити парсинг', details: err.message });
  }
});
 
// 🔥 Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Server запущено на порту ${PORT}`);
});
