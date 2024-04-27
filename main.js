import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());

import cron from "node-cron";
import dotenv from "dotenv";

import { promises as fsPromises } from "fs";

const { access, writeFile, unlink } = fsPromises;

// Function to check if the lock file exists
async function isLockFilePresent() {
  try {
    await access("lockfile");
    return true;
  } catch (error) {
    return false;
  }
}

// Function to create the lock file
async function createLockFile() {
  await writeFile("lockfile", "");
}

// Function to remove the lock file
async function removeLockFile() {
  await unlink("lockfile");
}

dotenv.config({ path: "./bot.env" });
// const token = process.env.BOT_KEY;
// const bot = new Telegraf(token);
// const chatId = process.env.CHAT_ID;

(async function solScrape() {
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: `./temp`,
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(3.6e6);

  let currentPage = 1;
  const baseUrl = "https://www.geckoterminal.com/base/pools?page=";

  while (true) {
    const url = baseUrl + currentPage;
    try {
      await page.goto(url, { waitUntil: "networkidle0" });

      //parse fdv && marketCap
      const parseValue = value => {
        if (typeof value !== "string") {
          return 0;
        }
        const numericPart = parseFloat(value.replace(/[^\d.]/g, ""));
        const multiplier = value.includes("K")
          ? 1e3
          : value.includes("M")
          ? 1e6
          : value.includes("B")
          ? 1e9
          : value.includes("T")
          ? 1e12
          : 1;
        return numericPart * multiplier;
      };

      // parse price change
      const parseChange = value => {
        // Extract numeric part and remove non-numeric characters
        const numericPart = parseFloat(value.replace(/[^\d.-]/g, ""));
        if (numericPart < 0) {
          return 0;
        }
        // Check if the value contains a percentage sign
        const multiplier = value.includes("%") ? 0.01 : 1;
        return numericPart * multiplier;
      };

      await page.waitForSelector(`table tbody tr`);
      const tr = await page.$$(`table tbody tr`);

      for (let i = 0; i < tr.length; i++) {
        const tdTexts = await tr[i].$$eval("td", tds =>
          tds.map(td => td.textContent)
        );

        const fdv = parseValue(tdTexts[10]); //td index no 10
        const liq = parseValue(tdTexts[9]); //td index no 9
        if (fdv !== `` && liq > 100 && fdv > 500 && fdv <= 50000 && fdv > liq) {
          if (tdTexts) {
            let data = {
              name: tdTexts[0] || ``,
              price: tdTexts[1] || ``,
              fee: tdTexts[2] || ``,
              _24h_tx: tdTexts[3] || ``,
              _5m: tdTexts[4] || ``,
              _1h: tdTexts[5] || ``,
              _6h: tdTexts[6] || ``,
              _24h: tdTexts[7] || ``,
              _24h_volume: tdTexts[8] || ``,
              Liquidity: tdTexts[9] || ``,
              FDV: tdTexts[10] || ``,
            };
            data.name = data.name.replace(/^\d+\s*/, " ");
            data.name = data.name.trim().substring(1);
            const formattedData = `{\n "name": "${data.name}",\n "price": "${data.price}",\n "fee": "${data.fee}",\n "_24h_tx": "${data._24h_tx}",\n "_5m": "${data._5m}",\n "_1h": "${data._1h}",\n "_6h": "${data._6h}",\n "_24h": "${data._24h}",\n "_24h_volume": "${data._24h_volume}",\n "Liquidity": "${data.Liquidity}",\n "FDV": "${data.FDV}"\n}`;

            // bot.telegram.sendMessage(chatId, jsonData, { timeout: 10000 });
            console.log(formattedData);
          }
        }
      }

      const nextPageButton = await page.$("nav a[aria-label='Next']");
      if (!nextPageButton) {
        console.log("No more pages to load");
        await browser.close();
        break;
      }

      currentPage++; // Increment the page number for the next iteration
    } catch (error) {
      console.error("Error navigating to the next page:", error);
      break;
    }
  }

  await browser.close();
})();

// bot.launch();
cron.schedule("*/20 * * * *", async () => {
  if (!(await isLockFilePresent())) {
    // If lock file is not present, create it and execute the function
    await createLockFile();
    await solScrape();
    // Remove the lock file after function execution
    await removeLockFile();
  }
});
