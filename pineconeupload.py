import os
import json
from pinecone import Pinecone, ServerlessSpec

# Initialize Pinecone client with your API key
API_KEY = "0c1786d9-e034-4976-861b-0d675f7350d9"  # Replace with your Pinecone API key
pinecone_client = Pinecone(api_key=API_KEY)

# Define the Pinecone index name and dimension (make sure this matches your embeddings)
INDEX_NAME = "data-analyzed-index"
DIMENSION = 1024  # Set this to match your embeddings' dimensionality

# Check if the index exists, if not create it
if INDEX_NAME not in pinecone_client.list_indexes().names():
    pinecone_client.create_index(
        name=INDEX_NAME,
        dimension=DIMENSION,
        metric='cosine',  # Adjust if using a different metric (e.g., 'euclidean')
        spec=ServerlessSpec(
            cloud='aws',
            region='us-west-1'  # Adjust this based on your Pinecone environment
        )
    )

# Connect to the Pinecone index
index = pinecone_client.Index(INDEX_NAME)

# Define the directory where embedded files are stored
EMBEDDED_DIR = "./data-embedded"

# Function to read JSON files
def read_json_file(file_path):
    with open(file_path, 'r') as f:
        return json.load(f)

# Function to batch and upsert vectors to Pinecone
def upsert_batch_to_pinecone(vectors_batch):
    try:
        # Upsert the batch of vectors to Pinecone
        index.upsert(vectors=vectors_batch)
        print(f"Upserted batch of {len(vectors_batch)} vectors.")
    except Exception as e:
        print(f"Error upserting to Pinecone: {e}")

# Function to process files in batches
def process_files_in_batches(directory, batch_size=1):
    vectors_batch = []

    for filename in os.listdir(directory):
        if filename.endswith(".json"):
            print(f"Processing file: {filename}")

            # Read the JSON file
            file_path = os.path.join(directory, filename)
            json_data = read_json_file(file_path)

            # Check if the JSON contains a valid embedding and URL
            if 'embedding' in json_data and 'url' in json_data:
                vectors_batch.append({
                    'id': json_data['url'],  # Use the URL as the ID
                    'values': json_data['embedding'],  # Embedding vector
                    'metadata': {
                        'keywords': json_data.get('keywords', [])
                    }
                })

                # Once batch size is reached, upsert the batch to Pinecone
                if len(vectors_batch) >= batch_size:
                    upsert_batch_to_pinecone(vectors_batch)
                    vectors_batch = []  # Clear the batch

    # Upsert any remaining vectors in the last batch
    if vectors_batch:
        upsert_batch_to_pinecone(vectors_batch)

# Main execution
if __name__ == "__main__":
    # Process all files in the directory in batches
    process_files_in_batches(EMBEDDED_DIR, batch_size=1)

    print("Pinecone upload complete.")