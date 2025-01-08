require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const fs = require("fs");
const urlLib = require("url");
const crypto = require("crypto");
const winston = require("winston");
const {
  addPage,
  updateLastScan,
  getNextPageToScan,
  addCurrentScanHistory,
  isInCurrentScanHistory,
} = require("./database");
const { ensureHttps } = require("./utils");
const { decode } = require("html-entities");

// Determine log level from environment variable or default to 'info'
const logLevel = process.env.LOG_LEVEL || "info";

// Initialize winston logger
const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      silent: logLevel === "none",
    }),
    new winston.transports.File({
      filename: "app.log",
      silent: logLevel === "none",
    }),
  ],
});

async function initializePuppeteer() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars",
      "--window-position=0,0",
      "--ignore-certifcate-errors",
      "--ignore-certifcate-errors-spki-list",
      "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    ],
  });
  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  await page.evaluateOnNewDocument(() => {
    window.navigator.chrome = { runtime: {} };
  });

  await page.evaluateOnNewDocument(() => {
    const originalQuery = window.navigator.permissions.query;
    return (window.navigator.permissions.query = (parameters) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters));
  });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
  });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
  });

  return { browser, page };
}
async function processPage(
  page,
  url,
  configId,
  contentSelectors,
  linkPattern,
  excludePatterns,
  domain
) {
  url = ensureHttps(url);
  url = decode(url);
  logger.info(`Processing ${url}`);

  try {
    logger.debug(`Checking scan history for ${url}`);
    const scanHistory = await new Promise((resolve, reject) => {
      isInCurrentScanHistory(url, (err, row) => {
        if (err) {
          logger.error(`Error checking scan history for ${url}: ${err}`);
          return reject(err);
        }
        logger.debug(`Scan history check completed for ${url}`);
        resolve(row);
      });
    });

    if (scanHistory) {
      logger.info(`URL ${url} is already in the current scan history.`);
      return;
    }

    logger.info(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "networkidle0", timeout: 90000 });
    logger.info(`Navigation to ${url} completed`);

    logger.info(`Extracting content and links from ${url}`);
    const { content, links, body, combinedContent } =
      await extractContentAndLinks(
        page,
        contentSelectors,
        linkPattern,
        excludePatterns,
        domain
      );
    logger.info(`Extracted ${links.length} links from ${url}`);

    const jsonData = {
      url,
      content,
      links_on_page: [...new Set(links.map((link) => decode(link)))],
      body,
      combinedContent,
      last_scan: Math.floor(Date.now() / 1000),
    };

    const hash = crypto.createHash("sha256").update(url).digest("hex");
    const dataDir = "./data";
    const jsonFilePath = `${dataDir}/${hash}.json`;

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
      logger.info(`Created directory: ${dataDir}`);
    }

    logger.info(`Writing JSON data to ${jsonFilePath}`);
    fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));
    logger.info(`JSON data written to ${jsonFilePath}`);

    logger.info(`Adding ${url} to pages database`);
    await new Promise((resolve, reject) => {
      addPage(url, jsonFilePath, configId, (err) => {
        if (err) {
          logger.error(`Error adding ${url} to pages database: ${err}`);
          return reject(err);
        }
        logger.info(`${url} added to pages database`);
        resolve();
      });
    });

    for (const link of links) {
      const decodedLink = decode(link);
      logger.info(`Adding link ${decodedLink} to pages database`);
      await new Promise((resolve, reject) => {
        addPage(decodedLink, null, configId, (err) => {
          if (err) {
            logger.error(
              `Error adding link ${decodedLink} to pages database: ${err}`
            );
            return reject(err);
          }
          logger.info(`Link ${decodedLink} added to pages database`);
          resolve();
        });
      });
    }

    logger.info(`Updating last scan time for ${url}`);
    await new Promise((resolve, reject) => {
      updateLastScan(url, jsonData.last_scan, (err) => {
        if (err) {
          logger.error(`Error updating last scan time for ${url}: ${err}`);
          return reject(err);
        }
        logger.info(`Last scan time updated for ${url}`);
        resolve();
      });
    });

    logger.info(`Adding ${url} to current scan history`);
    await new Promise((resolve, reject) => {
      addCurrentScanHistory(url, (err) => {
        if (err) {
          logger.error(`Error adding ${url} to current scan history: ${err}`);
          return reject(err);
        }
        logger.info(`${url} added to current scan history`);
        resolve();
      });
    });

    logger.info(`Processed ${url} successfully`);
  } catch (err) {
    logger.error(`Error processing page ${url}: ${err}`);

    // Mark the page as processed by updating the lastScan time
    const failedScanTime = Math.floor(Date.now() / 1000);
    await new Promise((resolve, reject) => {
      updateLastScan(url, failedScanTime, (err) => {
        if (err) {
          logger.error(
            `Error updating last scan time for failed URL ${url}: ${err}`
          );
          return reject(err);
        }
        logger.info(`${url} marked as processed after error`);
        resolve();
      });
    });
  }
}
async function crawlNext(
  page,
  browser,
  configId,
  refreshTime,
  contentSelectors,
  linkPattern,
  excludePatterns,
  domain
) {
  logger.info("Starting crawlNext function");
  getNextPageToScan(refreshTime, async (err, row) => {
    if (err) {
      logger.error(`Error fetching next page to scan: ${err}`);
      return;
    }
    if (row) {
      logger.info(`Next page to scan: ${row.url}`);
      await processPage(
        page,
        row.url,
        configId,
        contentSelectors,
        linkPattern,
        excludePatterns,
        domain
      );
      await crawlNext(
        page,
        browser,
        configId,
        refreshTime,
        contentSelectors,
        linkPattern,
        excludePatterns,
        domain
      );
    } else {
      logger.info("No pages to scan or refresh. Crawling complete.");
      await browser.close();
    }
  });
}

async function extractContentAndLinks(
  page,
  contentSelectors,
  linkPattern,
  excludePatterns,
  domain
) {
  const bodyContent = await page.evaluate(() => document.body.innerHTML);
  const urls = extractUrls(bodyContent, domain);
  const filteredUrls = urls.filter((url) => {
    return (
      linkPattern.test(url) &&
      !excludePatterns.some((pattern) => pattern.test(url))
    );
  });

  const content = {};
  for (const selector of contentSelectors) {
    content[selector] = await page.evaluate((sel) => {
      const element = document.querySelector(sel);
      return element ? element.innerText : null;
    }, selector);
  }

  return { content, links: filteredUrls };
}

function extractUrls(htmlString, domain) {
  const urlRegex = /https?:\/\/[^\s"'<>]+/g;
  const allUrls = htmlString.match(urlRegex) || [];
  const filteredUrls = allUrls.filter((url) => {
    const urlObj = new urlLib.URL(url);
    return urlObj.hostname === new urlLib.URL(domain).hostname;
  });
  return filteredUrls;
}

module.exports = {
  initializePuppeteer,
  processPage,
  crawlNext,
  extractContentAndLinks,
  extractUrls,
};
