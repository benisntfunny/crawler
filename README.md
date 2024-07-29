# Crawler

This project is a custom web crawler built using Node.js, Puppeteer, and SQLite. It scrapes web pages based on configurations in JSON files, stores data in an SQLite database, and refreshes content based on a specified interval. The goal is to collect data for a vector database.

## Features

- Stealth mode enabled using Puppeteer Extra and Stealth Plugin
- Extracts content and links from web pages based on configurable selectors and patterns
- Stores reference to scraped data in an SQLite database
- RAW Data stored in JSON files
- Supports page revisit and refresh based on a configurable interval
- Handles browser fingerprinting to avoid detection

## Installation

1. Clone the repository
``` sh
git clone https://github.com/your-username/custom-web-crawler.git
cd custom-web-crawler
```

2. Install dependencies
```sh
npm install
```

3. Create a config.json file with your crawling configurations:
``` sh
{
“domain”: “https://example.com”,
“contentSelectors”: [“h1”, “.content”, “#main”],
“linkPattern”: “https://example.com/article/.”,
“excludePatterns”: [“https://example.com/exclude/.”],
“refreshSeconds”: 3600
}
```

## Usage

1. Start the crawler:

``` sh
node index.js
``` 

## Project Structure

- index.js: Main entry point of the application, initializes the crawler and starts the crawling process.
- processor.js: Contains all the processing logic for crawling, including page processing, link extraction, and content extraction.
- database.js: Contains functions to interact with the SQLite database.
- utils.js: Utility functions used across the project.
- *config.json files: Configuration files containing the crawling settings.


## Database Schema

- pages: Stores information about the pages that have been crawled.
- scan_history: Stores information about the pages that have been scanned in the current session.
