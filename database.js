require("dotenv").config(); // Add this at the top
const sqlite3 = require("sqlite3").verbose();
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

const db = new sqlite3.Database("crawler.db");

// Create tables if they don't exist
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS pages (
    url TEXT PRIMARY KEY,
    jsonFilePath TEXT,
    lastScan INTEGER,
    configId INTEGER
  )`,
    (err) => {
      if (err) {
        logger.error(`Error creating pages table: ${err}`);
      } else {
        logger.info("Pages table created or already exists.");
      }
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT UNIQUE,
    contentSelectors TEXT,
    linkPattern TEXT,
    excludePatterns TEXT,
    refreshSeconds INTEGER
  )`,
    (err) => {
      if (err) {
        logger.error(`Error creating configs table: ${err}`);
      } else {
        logger.info("Configs table created or already exists.");
      }
    }
  );

  // New table for the current scan history
  db.run(
    `CREATE TABLE IF NOT EXISTS current_scan_history (
    url TEXT PRIMARY KEY
  )`,
    (err) => {
      if (err) {
        logger.error(`Error creating current_scan_history table: ${err}`);
      } else {
        logger.info("Current scan history table created or already exists.");
      }
    }
  );
});

// Function to clear the current scan history
function clearCurrentScanHistory(callback) {
  logger.info("Clearing current scan history.");
  db.run(`DELETE FROM current_scan_history`, (err) => {
    if (err) {
      logger.error(`Error clearing current scan history: ${err}`);
    } else {
      logger.info("Current scan history cleared.");
    }
    callback(err);
  });
}

// Function to add a URL to the current scan history
function addCurrentScanHistory(url, callback) {
  logger.info(`Adding URL to current scan history: ${url}`);
  db.run(`INSERT INTO current_scan_history (url) VALUES (?)`, [url], (err) => {
    if (err) {
      logger.error(`Error adding URL to current scan history: ${err}`);
    } else {
      logger.info(`URL added to current scan history: ${url}`);
    }
    callback(err);
  });
}

// Function to check if a URL is in the current scan history
function isInCurrentScanHistory(url, callback) {
  logger.info(`Checking if URL is in current scan history: ${url}`);
  db.get(
    `SELECT url FROM current_scan_history WHERE url = ?`,
    [url],
    (err, row) => {
      if (err) {
        logger.error(`Error checking current scan history for URL: ${err}`);
      } else {
        logger.info(`Check complete for URL in current scan history: ${url}`);
      }
      callback(err, row);
    }
  );
}

function addOrUpdateConfig(config, callback) {
  logger.info(`Adding or updating config for domain: ${config.domain}`);
  db.get(
    `SELECT id FROM configs WHERE domain = ?`,
    [config.domain],
    (err, row) => {
      if (err) {
        logger.error(
          `Error retrieving config for domain ${config.domain}: ${err}`
        );
        callback(err);
      } else if (row) {
        db.run(
          `UPDATE configs SET contentSelectors = ?, linkPattern = ?, excludePatterns = ?, refreshSeconds = ? WHERE id = ?`,
          [
            JSON.stringify(config.contentSelectors),
            config.linkPattern,
            JSON.stringify(config.excludePatterns),
            config.refreshSeconds,
            row.id,
          ],
          (updateErr) => {
            if (updateErr) {
              logger.error(
                `Error updating config for domain ${config.domain}: ${updateErr}`
              );
            } else {
              logger.info(`Config updated for domain ${config.domain}`);
            }
            callback(updateErr, row.id);
          }
        );
      } else {
        db.run(
          `INSERT INTO configs (domain, contentSelectors, linkPattern, excludePatterns, refreshSeconds) VALUES (?, ?, ?, ?, ?)`,
          [
            config.domain,
            JSON.stringify(config.contentSelectors),
            config.linkPattern,
            JSON.stringify(config.excludePatterns),
            config.refreshSeconds,
          ],
          function (insertErr) {
            if (insertErr) {
              logger.error(
                `Error inserting config for domain ${config.domain}: ${insertErr}`
              );
            } else {
              logger.info(`Config inserted for domain ${config.domain}`);
            }
            callback(insertErr, this.lastID);
          }
        );
      }
    }
  );
}

function getConfigs(callback) {
  logger.info("Retrieving all configs.");
  db.all(`SELECT * FROM configs`, (err, rows) => {
    if (err) {
      logger.error(`Error retrieving configs: ${err}`);
    } else {
      logger.info("Configs retrieved successfully.");
    }
    callback(err, rows);
  });
}

function addPage(url, jsonFilePath, configId, callback) {
  const decodedUrl = decode(url);
  const lastScan = jsonFilePath ? Math.floor(Date.now() / 1000) : null;
  logger.info(`Adding page with URL: ${decodedUrl}`);
  db.run(
    `INSERT INTO pages (url, jsonFilePath, lastScan, configId) VALUES (?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET jsonFilePath=excluded.jsonFilePath, configId=excluded.configId`,
    [decodedUrl, jsonFilePath, lastScan, configId],
    (err) => {
      if (err) {
        logger.error(`Error adding page with URL ${decodedUrl}: ${err}`);
      } else {
        logger.info(`Page added or updated with URL ${decodedUrl}`);
      }
      callback(err);
    }
  );
}

function updateLastScan(url, lastScan, callback) {
  const decodedUrl = decode(url);
  logger.info(`Updating last scan time for URL: ${decodedUrl}`);
  db.run(
    `UPDATE pages SET lastScan = ? WHERE url = ?`,
    [lastScan, decodedUrl],
    (err) => {
      if (err) {
        logger.error(
          `Error updating last scan time for URL ${decodedUrl}: ${err}`
        );
      } else {
        logger.info(`Last scan time updated for URL ${decodedUrl}`);
      }
      callback(err);
    }
  );
}

function getPage(url, callback) {
  const decodedUrl = decode(url);
  logger.info(`Retrieving page with URL: ${decodedUrl}`);
  db.get(`SELECT * FROM pages WHERE url = ?`, [decodedUrl], (err, row) => {
    if (err) {
      logger.error(`Error retrieving page with URL ${decodedUrl}: ${err}`);
    } else {
      logger.info(`Page retrieved with URL ${decodedUrl}`);
    }
    callback(err, row);
  });
}

function getNextPageToScan(refreshTime, callback) {
  const currentTime = Math.floor(Date.now() / 1000);
  logger.info("Fetching next page to scan based on refresh time.");
  db.get(
    `SELECT * FROM pages WHERE lastScan IS NULL OR lastScan < ? ORDER BY lastScan ASC LIMIT 1`,
    [currentTime - refreshTime],
    (err, row) => {
      if (err) {
        logger.error(`Error fetching next page to scan: ${err}`);
        callback(err);
      } else {
        if (row) {
          logger.info(`Fetched next page to scan: ${row.url}`);
        } else {
          logger.info("No pages to scan based on refresh time.");
        }
        callback(null, row);
      }
    }
  );
}

module.exports = {
  addOrUpdateConfig,
  getConfigs,
  addPage,
  updateLastScan,
  getPage,
  getNextPageToScan,
  clearCurrentScanHistory,
  addCurrentScanHistory,
  isInCurrentScanHistory,
};
