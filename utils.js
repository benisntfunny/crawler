require("dotenv").config(); // Add this at the top
const { URL } = require("url");
const { decode } = require("html-entities");
const winston = require("winston");

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

/**
 * Ensure the URL starts with https://
 * @param {string} url - The URL to be formatted
 * @returns {string} - Formatted URL
 */
function ensureHttps(url) {
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    logger.debug(`Formatting URL to https://${url}`);
    return `https://${url}`;
  }
  return url;
}

/**
 * Extract content and links from the page
 * @param {Object} page - Puppeteer page object
 * @param {Array} selectors - Array of content selectors
 * @param {string} linkPattern - Pattern for valid links
 * @param {Array} excludePatterns - Array of patterns to exclude links
 * @returns {Object} - Extracted content and links
 */
async function extractContentAndLinks(
  page,
  selectors,
  linkPattern,
  excludePatterns
) {
  logger.debug(`Extracting content and links from page`);
  const bodyContent = await page.evaluate(() => document.body.innerHTML);
  const bodyText = await page.evaluate(() => document.body.innerText);

  // Extract content based on selectors using regex
  const content = extractContent(bodyContent, selectors);

  // Extract links using regex
  const links = extractUrls(
    bodyContent,
    linkPattern,
    excludePatterns,
    page.url()
  );

  // Remove duplicate links
  const uniqueLinks = [...new Set(links)];

  // Concatenate content to create combinedContent
  const combinedContent = content.join(" ");

  return { content, links: uniqueLinks, body: bodyText, combinedContent };
}

/**
 * Extract content based on selectors using regex
 * @param {string} htmlString - HTML content of the page
 * @param {Array} selectors - Array of content selectors
 * @returns {Array} - Extracted content
 */
function extractContent(htmlString, selectors) {
  logger.debug(`Extracting content based on selectors`);
  const content = [];
  selectors.forEach((selector) => {
    const regex = new RegExp(`<${selector}[^>]*>(.*?)</${selector}>`, "gs");
    let match;
    while ((match = regex.exec(htmlString)) !== null) {
      content.push(match[1].trim());
    }
  });
  return content;
}

/**
 * Extract URLs using regex
 * @param {string} htmlString - HTML content of the page
 * @param {string} pattern - Pattern for valid links
 * @param {Array} excludePatterns - Array of patterns to exclude links
 * @param {string} baseUrl - The base URL for resolving relative links
 * @returns {Array} - Extracted URLs
 */
function extractUrls(htmlString, pattern, excludePatterns, baseUrl) {
  logger.debug(`Extracting URLs using regex`);
  const anchorRegex = /<a[^>]+href="([^"]+)"[^>]*>/g;
  const urlRegex = new RegExp(pattern);
  const excludeRegexes = excludePatterns.map((pattern) => new RegExp(pattern));
  const urls = [];

  let match;
  while ((match = anchorRegex.exec(htmlString)) !== null) {
    let url = decode(match[1]); // Decode HTML entities
    // Resolve relative URLs
    url = new URL(url, baseUrl).href;
    if (
      urlRegex.test(url) &&
      !excludeRegexes.some((regex) => regex.test(url))
    ) {
      urls.push(url);
    }
  }

  return urls;
}

module.exports = {
  ensureHttps,
  extractContentAndLinks,
  extractContent,
  extractUrls,
};
