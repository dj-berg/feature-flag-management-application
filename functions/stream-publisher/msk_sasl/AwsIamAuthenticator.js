"use strict";

const { AuthenticationPayloadCreator } = require("./AuthenticationPayloadCreator");

const INT32_SIZE = 4;

const awsIamAuthenticator =
  (region, ttl) =>
  ({ host, port, logger, saslAuthenticate }) => {
    return {
      authenticate: async () => {
        const broker = `${host}:${port}`;
        const payloadFactory = new AuthenticationPayloadCreator({
          region,
          ttl,
        });

        try {
          const payload = payloadFactory.create({ brokerHost: host });

          const authenticateResponse = await saslAuthenticate({
            request: {
              async encode() {
                const stringifiedPayload = JSON.stringify(await payload);
                const byteLength = Buffer.byteLength(stringifiedPayload, "utf8");
                const buf = Buffer.alloc(INT32_SIZE + byteLength);
                buf.writeUInt32BE(byteLength, 0);
                buf.write(stringifiedPayload, INT32_SIZE, byteLength, "utf8");
                return buf;
              },
            },
            response: {
              decode: (rawData) => {
                const byteLength = rawData.readInt32BE(0);
                return rawData.subarray(INT32_SIZE, INT32_SIZE + byteLength);
              },
              parse: (data) => JSON.parse(data.toString()),
            },
          });

          logger.info("Authentication response", {
            authenticateResponse,
          });

          if (!authenticateResponse || !authenticateResponse.version) {
            throw new Error("Invalid response from broker");
          }

          logger.info("SASL MSK IAM authentication successful", {
            broker,
          });
        } catch (err) {
          logger.error("Error authenticating SASL broker", {
            broker,
            err,
          });
          throw err;
        }
      },
    };
  };

module.exports = {
  awsIamAuthenticator,
};