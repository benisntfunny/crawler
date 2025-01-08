const fs = require("fs").promises;
const path = require("path");
const { Pinecone } = require("@pinecone-database/pinecone"); // Pinecone import

// Define the directory where embedded files are stored
const directoryPath = path.join(__dirname, "data-embedded");

// Initialize Pinecone with the API key
const apiKey = "0c1786d9-e034-4976-861b-0d675f7350d9"; // Replace with your Pinecone API key

const pc = new Pinecone({
  apiKey: apiKey,
});

// Define the index name
const indexName = "data-analyzed-index";

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

// Function to upsert the embedding to Pinecone
// Function to upsert the embedding to Pinecone
const upsertToPinecone = async (
  index,
  fileName,
  embedding,
  url,
  content,
  title,
  keywords,
  links
) => {
  try {
    // Pinecone expects an array of vectors
    const vectors = [
      {
        id: url, // Use the URL as the primary key
        values: embedding, // The embedding vector (an array of numbers)
        /*
        metadata: {
          keywords,
        },
        */
      },
    ];

    const upsertRequest = {
      vectors,
    };
    console.log(JSON.stringify({ upsertRequest }));
    await index.upsert({ upsertRequest });

    console.log(`Uploaded ${fileName} to Pinecone.`);
  } catch (err) {
    console.error(`Failed to upload ${fileName} to Pinecone:`, err);
    process.exit();
  }
};

// Function to process each file and upload to Pinecone
const processFiles = async (files, index) => {
  for (const file of files) {
    console.log(`Processing file: ${file}`); // Log file name for debugging
    const filePath = path.join(directoryPath, file);
    const jsonData = await readJsonFile(filePath);

    // Ensure the file contains the embedding and URL
    if (
      jsonData.embedding &&
      Array.isArray(jsonData.embedding) &&
      jsonData.url
    ) {
      await upsertToPinecone(
        index,
        file,
        jsonData.embedding,
        jsonData.url,
        jsonData.content,
        jsonData.title,
        jsonData.keywords,
        jsonData.links
      );
    } else {
      console.error(`No valid embedding or URL found in file: ${file}`);
    }
  }
};

// Main function to execute the script
(async () => {
  try {
    // Get the Pinecone index instance
    const pineconeIndex = await pc.index(indexName);
    console.log(pineconeIndex);
    // Get the list of files from the embedded directory
    const filesList = await getFilesList(directoryPath);

    if (filesList.length === 0) {
      console.error("No files found in data-embedded directory.");
      return;
    }

    console.log(`Found ${filesList.length} files to process.`);

    // Process the files and upload to Pinecone
    await processFiles(filesList, pineconeIndex);

    console.log("Pinecone upload complete.");
  } catch (error) {
    console.error("Error:", error);
  }
})();
