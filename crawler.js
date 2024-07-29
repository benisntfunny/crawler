require("dotenv").config(); // Add this at the top
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const winston = require("winston");
const { getPage } = require("./database");
const { ensureHttps } = require("./utils");
const { processPage, crawlNext, initializePuppeteer } = require("./processor");

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
      silent: logLevel === "none", // Silence logs if level is 'none'
    }),
    new winston.transports.File({
      filename: "app.log",
      silent: logLevel === "none", // Silence logs if level is 'none'
    }),
  ],
});

puppeteer.use(StealthPlugin());

async function startCrawling(config, configId) {
  const { browser, page } = await initializePuppeteer();

  const domain = ensureHttps(config.domain);
  logger.info(`Formatted domain: ${domain}`);
  const contentSelectors = config.contentSelectors;
  const linkPattern = new RegExp(config.linkPattern);
  const excludePatterns = config.excludePatterns.map(
    (pattern) => new RegExp(pattern)
  );
  const refreshTime = config.refreshSeconds;

  const startUrl = domain;
  logger.info(`Start URL: ${startUrl}`);

  getPage(startUrl, async (err, row) => {
    if (err) {
      logger.error(`Error fetching page from database: ${err}`);
      return;
    }
    if (!row) {
      await processPage(
        page,
        startUrl,
        configId,
        contentSelectors,
        linkPattern,
        excludePatterns,
        domain
      );
    }
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
  });
}

module.exports = { startCrawling };
