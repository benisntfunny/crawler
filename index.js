require("dotenv").config(); // Add this at the top
const fs = require("fs");
const path = require("path");
const winston = require("winston");
const { addOrUpdateConfig, clearCurrentScanHistory } = require("./database");
const { startCrawling } = require("./crawler");

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

// Load all configuration files from ./configs directory
const configDir = "./configs";
const configs = fs
  .readdirSync(configDir)
  .filter((file) => path.extname(file) === ".json")
  .map((file) => {
    const filePath = path.join(configDir, file);
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data);
    } catch (err) {
      logger.error(`Error loading or parsing config file ${filePath}:`, err);
      process.exit(1); // Exit if a config file cannot be loaded or parsed
    }
  });

(async () => {
  // Clear current scan history before starting
  clearCurrentScanHistory(async (err) => {
    if (err) {
      logger.error("Error clearing current scan history:", err);
      return;
    }
    logger.info("Current scan history cleared.");

    // Store configurations in the database and start crawling
    for (const config of configs) {
      addOrUpdateConfig(config, async (err, configId) => {
        if (err) {
          logger.error("Error adding or updating config in the database:", err);
          return;
        }
        await startCrawling(config, configId);
      });
    }
  });
})();
