import { MongoClient, Db } from "mongodb";

// Cache the client across HMR reloads in dev and across lambda invocations.
const globalForMongo = globalThis as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

function getClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_NOT_CONFIGURED");

  globalForMongo._mongoClientPromise ??= new MongoClient(uri).connect();
  return globalForMongo._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  // Database name comes from the connection string (bento_hotline).
  return client.db();
}
