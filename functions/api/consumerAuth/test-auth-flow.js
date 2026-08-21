const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { unmarshall } = require("@aws-sdk/util-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");

const decodeBody = (response) => JSON.parse(String(response.body || "{}"));

const createApiEvent = ({ path, body, headers }) => ({
  path,
  resource: path,
  httpMethod: "POST",
  headers: headers || {},
  body: JSON.stringify(body || {}),
  requestContext: {
    requestId: "req-test",
    identity: {
      sourceIp: "127.0.0.1",
    },
  },
});

const run = async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

  process.env.APP_DATA_TABLE_NAME = "app-data-test";
  process.env.JWT_ISSUER = "feature-flag-platform";
  process.env.JWT_AUDIENCE = "feature-flag-api";
  process.env.JWT_PRIVATE_KEY = privateKey;
  process.env.JWT_KEY_ID = "consumer-auth-rs256";
  process.env.JWT_EXPIRES_IN_SECONDS = "300";
  process.env.DEFAULT_ENVIRONMENT = "dev";
  process.env.ONBOARDING_API_KEY = "onboard-secret";

  const store = new Map();
  const originalSend = DynamoDBClient.prototype.send;
  DynamoDBClient.prototype.send = async function mockedSend(command) {
    const commandName = command && command.constructor ? command.constructor.name : "";
    const input = command.input || {};

    if (commandName === "PutItemCommand") {
      const item = unmarshall(input.Item || {});
      if (store.has(item.clientId)) {
        const error = new Error("Conditional check failed");
        error.name = "ConditionalCheckFailedException";
        throw error;
      }
      store.set(item.clientId, item);
      return {};
    }

    if (commandName === "GetItemCommand") {
      const clientId = input.Key && input.Key.clientId ? input.Key.clientId.S : "";
      const item = store.get(clientId);
      if (!item) {
        return {};
      }
      const { marshall } = require("@aws-sdk/util-dynamodb");
      return { Item: marshall(item) };
    }

    return originalSend.call(this, command);
  };

  try {
    const { handler } = require("./index");

    const onboardingResponse = await handler(
      createApiEvent({
        path: "/consumer/onboard",
        headers: { "x-onboarding-api-key": "onboard-secret" },
        body: {
          accountId: "acc-100",
          appId: "app-200",
          environment: "prod",
        },
      })
    );

    assert.equal(onboardingResponse.statusCode, 201, "onboarding should succeed");
    const onboardingBody = decodeBody(onboardingResponse);
    assert.ok(onboardingBody.clientId, "onboarding returns clientId");
    assert.ok(onboardingBody.clientSecret, "onboarding returns clientSecret");

    const authResponse = await handler(
      createApiEvent({
        path: "/consumer/auth",
        body: {
          clientId: onboardingBody.clientId,
          clientSecret: onboardingBody.clientSecret,
        },
      })
    );

    assert.equal(authResponse.statusCode, 200, "auth should succeed");
    const authBody = decodeBody(authResponse);
    assert.ok(authBody.accessToken, "auth returns access token");

    const decoded = jwt.decode(authBody.accessToken);
    assert.equal(decoded.sub, "app:acc-100:app-200");
    assert.equal(decoded.accountId, "acc-100");
    assert.equal(decoded.appId, "app-200");
    assert.equal(decoded.environment, "prod");
    assert.ok(Number.isFinite(decoded.iat), "iat present");
    assert.ok(Number.isFinite(decoded.exp), "exp present");

    const verified = jwt.verify(authBody.accessToken, publicKey, {
      algorithms: ["RS256"],
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
    });

    const expectedChannel = "flags:acc:acc-100:app:app-200";
    assert.deepEqual(verified.channels, [expectedChannel]);
    assert.deepEqual(Object.keys(verified.subs || {}), [expectedChannel]);

    const badSecretResponse = await handler(
      createApiEvent({
        path: "/consumer/auth",
        body: {
          clientId: onboardingBody.clientId,
          clientSecret: `${onboardingBody.clientSecret}-bad`,
        },
      })
    );
    assert.equal(badSecretResponse.statusCode, 401, "invalid secret should fail");

    const expiredToken = jwt.sign(
      {
        accountId: "acc-100",
        appId: "app-200",
        environment: "prod",
      },
      privateKey,
      {
        algorithm: "RS256",
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        subject: "app:acc-100:app-200",
        expiresIn: -1,
      }
    );

    assert.throws(
      () =>
        jwt.verify(expiredToken, publicKey, {
          algorithms: ["RS256"],
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }),
      /jwt expired/
    );

    const wrongKeys = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });

    const invalidToken = jwt.sign(
      {
        accountId: "acc-100",
        appId: "app-200",
        environment: "prod",
      },
      wrongKeys.privateKey,
      {
        algorithm: "RS256",
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        subject: "app:acc-100:app-200",
        expiresIn: 300,
      }
    );

    assert.throws(
      () =>
        jwt.verify(invalidToken, publicKey, {
          algorithms: ["RS256"],
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }),
      /invalid signature/
    );

    console.log("Auth flow validation passed.");
  } finally {
    DynamoDBClient.prototype.send = originalSend;
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
