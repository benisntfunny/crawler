const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

// Define the directory paths
const directoryPath = path.join(__dirname, "data");
const outputDirectoryPath = path.join(__dirname, "data-analyzed");
const fileSizeThreshold = 35 * 1024; // 35KB in bytes

// Ensure the output directory exists
const ensureOutputDirectoryExists = async (dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    throw new Error("Unable to create output directory: " + err);
  }
};

// Function to get a list of all files in the directory
const getFilesList = async (dirPath) => {
  try {
    const files = await fs.readdir(dirPath);
    return files;
  } catch (err) {
    throw new Error("Unable to scan directory: " + err);
  }
};

// Function to get the file size
const getFileSize = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (err) {
    throw new Error("Unable to get file size: " + err);
  }
};

// Function to read and parse JSON file
const readJsonFile = async (filePath) => {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    throw new Error("Unable to read file: " + err);
  }
};

// Function to save the response to a new file
const saveResponseToFile = async (fileName, response) => {
  const outputFilePath = path.join(outputDirectoryPath, fileName);
  try {
    await fs.writeFile(outputFilePath, response, "utf8");
  } catch (err) {
    throw new Error("Unable to save file: " + err);
  }
};

// Function to process each file and concatenate content properties
const processFiles = async (files) => {
  for (const file of files) {
    const filePath = path.join(directoryPath, file);
    const fileSize = await getFileSize(filePath);

    // Only process files larger than 35KB
    if (fileSize > fileSizeThreshold) {
      const jsonData = await readJsonFile(filePath);
      console.log(`Processing file: ${file} (${fileSize} bytes)`);
      if (jsonData.content && typeof jsonData.content === "object") {
        let concatenatedContent = "";
        for (const key in jsonData.content) {
          if (jsonData.content.hasOwnProperty(key)) {
            concatenatedContent += jsonData.content[key];
          }
        }
        if (concatenatedContent) {
          try {
            console.log("Making first API call...");
            const response = await axios.post(
              "http://localhost:11434/api/generate",
              {
                model: "llama3.1",
                prompt: `Please take this content, do not drop any of the data but help me pick out a proper title for the content, and keywords. As a response I want ONLY JSON, 
              no other explanation. The format is {"title":"The summarized title of the content", "keywords": ["keyword1","keyword2","keyword3", "etc"]} do not prepend it with markdown, do not say anything else. Example response should be: {"title": "Understanding Fish", "keywords": ["goldfish","Fish Care", "feeding fish"]} . 
              Please attempt find at least 5 good keywords that are not directly taken from the document but instead synonymous with words in the document to improve searchability. 
              ${concatenatedContent}`,
                stream: false,
              }
            );
            console.log("First API response received", response.data);

            console.log("Making second API call...");
            const summarize = await axios.post(
              "http://localhost:11434/api/generate",
              {
                model: "llama3.1",
                prompt: `Take this content and strip out any unnecessary text from it that serves no purpose. Such as words like "Table of contents" and such. This should be be a summarization of the text but a clean up. 
                Return ONLY the cleaned up text. No other explanation. 
              ${concatenatedContent}`,
                stream: false,
              }
            );
            console.log("Second API response received", summarize.data);

            if (response?.data?.response) {
              const { title, keywords } = JSON.parse(response.data.response);
              const newFile = {
                content: summarize.data.response, // Update to reference summarize response
                links: jsonData.links_on_page,
                title,
                keywords,
                url: jsonData.url,
              };
              console.log(`Saving file: ${file}`);
              await saveResponseToFile(file, JSON.stringify(newFile, null, 4));
            } else {
              console.error(`No response found in API call for file: ${file}`);
            }
          } catch (err) {
            console.error(`API call failed for file: ${file}`, err);
          }
        }
      }
    } else {
      console.log(
        `Skipping ${file}, size is below 35KB threshold (${fileSize} bytes)`
      );
    }
  }
};

// Main function to execute the script
(async () => {
  try {
    await ensureOutputDirectoryExists(outputDirectoryPath);
    const filesList = await getFilesList(directoryPath);
    await processFiles(filesList);
    console.log("Processing complete.");
  } catch (error) {
    console.error("Error:", error);
  }
})();
