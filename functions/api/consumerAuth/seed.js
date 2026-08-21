const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall } = require("@aws-sdk/util-dynamodb");
const crypto = require("node:crypto");
const { hashScryptSecret } = require("./lib/credentials");

const client = new DynamoDBClient({});

const APP_DATA_TABLE_NAME = process.env.APP_DATA_TABLE_NAME || process.env.APPLICATIONS_TABLE_NAME;
const accountId = process.env.SEED_ACCOUNT_ID;
const appId = process.env.SEED_APP_ID;
const environment = process.env.SEED_ENVIRONMENT || process.env.DEFAULT_ENVIRONMENT || "dev";
const rawPermissions = process.env.SEED_PERMISSIONS || "flags:read flags:write flags:subscribe";

const parsePermissions = (value) =>
  String(value)
    .split(/[\s,]+/)
    .map((permission) => permission.trim())
    .filter(Boolean);

const createClientId = () => `cli_${crypto.randomUUID().replace(/-/g, "")}`;
const createClientSecret = () => crypto.randomBytes(32).toString("base64url");

const main = async () => {
  if (!APP_DATA_TABLE_NAME) {
    throw new Error("APP_DATA_TABLE_NAME (or APPLICATIONS_TABLE_NAME) is required.");
  }

  if (!accountId || !appId) {
    throw new Error("SEED_ACCOUNT_ID and SEED_APP_ID are required.");
  }

  const now = new Date().toISOString();
  const clientId = createClientId();
  const clientSecret = createClientSecret();
  const hashedSecret = await hashScryptSecret(clientSecret);

  const item = {
    clientId,
    accountId,
    appId,
    environment,
    permissions: parsePermissions(rawPermissions),
    status: "active",
    secretHash: hashedSecret.hash,
    secretSalt: hashedSecret.salt,
    secretAlgorithm: hashedSecret.algorithm,
    secretKeyLength: hashedSecret.keyLength,
    secretCost: hashedSecret.cost,
    secretBlockSize: hashedSecret.blockSize,
    secretParallelization: hashedSecret.parallelization,
    createdAt: now,
    updatedAt: now,
  };

  await client.send(
    new PutItemCommand({
      TableName: APP_DATA_TABLE_NAME,
      Item: marshall(item),
      ConditionExpression: "attribute_not_exists(clientId)",
    })
  );

  console.log(
    JSON.stringify(
      {
        clientId,
        clientSecret,
        accountId,
        appId,
        environment,
        permissions: item.permissions,
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
