const crypto = require("node:crypto");

const DEFAULT_ALGORITHM = "scrypt";
const DEFAULT_KEY_LENGTH = 64;
const DEFAULT_COST = 16384;
const DEFAULT_BLOCK_SIZE = 8;
const DEFAULT_PARALLELIZATION = 1;
const DEFAULT_SALT_BYTES = 16;

const timingSafeCompare = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyScryptSecret = async (secret, options) => {
  const {
    hash,
    salt,
    keyLength = DEFAULT_KEY_LENGTH,
    cost = DEFAULT_COST,
    blockSize = DEFAULT_BLOCK_SIZE,
    parallelization = DEFAULT_PARALLELIZATION,
  } = options;

  if (!hash || !salt) {
    return false;
  }

  const derivedKey = await new Promise((resolve, reject) => {
    crypto.scrypt(
      secret,
      salt,
      Number(keyLength),
      {
        N: Number(cost),
        r: Number(blockSize),
        p: Number(parallelization),
      },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(key);
      }
    );
  });

  return timingSafeCompare(derivedKey.toString("hex"), hash);
};

const hashScryptSecret = async (
  secret,
  {
    salt,
    keyLength = DEFAULT_KEY_LENGTH,
    cost = DEFAULT_COST,
    blockSize = DEFAULT_BLOCK_SIZE,
    parallelization = DEFAULT_PARALLELIZATION,
  } = {}
) => {
  const resolvedSalt = salt || crypto.randomBytes(DEFAULT_SALT_BYTES).toString("hex");

  const derivedKey = await new Promise((resolve, reject) => {
    crypto.scrypt(
      secret,
      resolvedSalt,
      Number(keyLength),
      {
        N: Number(cost),
        r: Number(blockSize),
        p: Number(parallelization),
      },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(key);
      }
    );
  });

  return {
    algorithm: "scrypt",
    hash: derivedKey.toString("hex"),
    salt: resolvedSalt,
    keyLength: Number(keyLength),
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
  };
};

const verifySecret = async (secret, options) => {
  const algorithm = String(options?.algorithm || DEFAULT_ALGORITHM).toLowerCase();

  if (algorithm !== "scrypt") {
    throw new Error(`Unsupported secret algorithm: ${algorithm}`);
  }

  return verifyScryptSecret(secret, options || {});
};

module.exports = {
  hashScryptSecret,
  verifySecret,
};
