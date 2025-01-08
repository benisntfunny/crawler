const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

// Define the directory paths
const directoryPath = path.join(__dirname, "data-analyzed");
const outputDirectoryPath = path.join(__dirname, "data-embedded");

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

// Function to read and parse JSON file
const readJsonFile = async (filePath) => {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    throw new Error("Unable to read file: " + err);
  }
};

// Function to save the response (embedded content) to a new file
const saveEmbeddedFile = async (fileName, embeddedData) => {
  const outputFilePath = path.join(outputDirectoryPath, fileName);
  try {
    await fs.writeFile(
      outputFilePath,
      JSON.stringify(embeddedData, null, 4),
      "utf8"
    );
  } catch (err) {
    throw new Error("Unable to save file: " + err);
  }
};

// Function to process each file and generate embeddings
const processFiles = async (files) => {
  for (const file of files) {
    const filePath = path.join(directoryPath, file);
    const jsonData = await readJsonFile(filePath);

    if (jsonData.content && typeof jsonData.content === "string") {
      try {
        const response = await axios.post(
          "http://localhost:11434/api/embeddings",
          {
            model: "mxbai-embed-large",
            prompt: `${jsonData.title}\n${jsonData.content}\n\n\n${jsonData.keywords}`,
            stream: false,
          }
        );

        if (response?.data?.embedding) {
          const embedding = response.data.embedding;
          const newFile = {
            url: jsonData.url,
            content: jsonData.content,
            title: jsonData.title,
            keywords: jsonData.keywords,
            links: jsonData.links,
            embedding, // Add the embedding from the API response
          };

          // Save the embedded content to the output folder
          await saveEmbeddedFile(file, newFile);
          console.log(`Embedded content saved for ${file}`);
        } else {
          console.error(`No embedding found in API response for file: ${file}`);
        }
      } catch (err) {
        console.error(`API call failed for file: ${file}`, err);
      }
    } else {
      console.error(`Invalid content in file: ${file}`);
    }
  }
};

// Main function to execute the script
(async () => {
  try {
    await ensureOutputDirectoryExists(outputDirectoryPath);
    const filesList = await getFilesList(directoryPath);
    await processFiles(filesList);
    console.log("Embedding generation complete.");
  } catch (error) {
    console.error("Error:", error);
  }
})();
