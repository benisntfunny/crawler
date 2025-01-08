const { Pinecone } = require("@pinecone-database/pinecone");

// Initialize Pinecone with the API key
const apiKey = "0c1786d9-e034-4976-861b-0d675f7350d9"; // Replace with your Pinecone API key

const pc = new Pinecone({
  apiKey: apiKey,
});

// Define the index name and dimension
const indexName = "data-analyzed-index";
const dimension = 1024; // Adjust according to your embedding size (OpenAI embeddings are usually 1536-dimensional)

async function createPineconeIndex() {
  await pc.createIndex({
    name: indexName,
    dimension: dimension, // Your vector dimension
    metric: "cosine", // Replace with your desired metric (cosine, euclidean, etc.)
    spec: {
      serverless: {
        cloud: "aws",
        region: "us-east-1", // Change region if necessary
      },
    },
  });
  console.log(`Index "${indexName}" created.`);
}

// Execute the function to create the index
createPineconeIndex().catch((error) => {
  console.error("Error creating Pinecone index:", error);
});
