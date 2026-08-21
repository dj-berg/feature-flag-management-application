"use strict";

const { SignatureV4 } = require("@smithy/signature-v4");
const { defaultProvider } = require("@aws-sdk/credential-provider-node");
const { getDefaultRoleAssumerWithWebIdentity } = require("@aws-sdk/client-sts");
const { createHash } = require("crypto");
const { Sha256HashConstructor } = require("./Sha256Constructor");

const SERVICE = "kafka-cluster";
const SIGNED_HEADERS = "host";
const HASHED_PAYLOAD =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const ALGORITHM = "AWS4-HMAC-SHA256";
const ACTION = "kafka-cluster:Connect";

class AuthenticationPayloadCreator {
  constructor({ region, ttl = 900, userAgent = "MSK_IAM_v1.0.0" }) {
    this.region = region;
    this.ttl = ttl;
    this.userAgent = userAgent;
    this.provider = defaultProvider({
      roleAssumerWithWebIdentity: getDefaultRoleAssumerWithWebIdentity({
        region: process.env.AWS_REGION || region,
      }),
    });

    this.signature = new SignatureV4({
      credentials: this.provider,
      region: this.region,
      service: SERVICE,
      applyChecksum: false,
      uriEscapePath: true,
      sha256: Sha256HashConstructor,
    });
  }

  timestampYYYYmmDDFormat(date) {
    const d = new Date(date);
    return this.timestampYYYYmmDDTHHMMSSZFormat(d).substring(0, 8);
  }

  timestampYYYYmmDDTHHMMSSZFormat(date) {
    const d = new Date(date);
    return d.toISOString().replace(/[-.:]/g, "").substring(0, 15).concat("Z");
  }

  generateCanonicalHeaders(brokerHost) {
    return `host:${brokerHost}\n`;
  }

  generateXAmzCredential(accessKeyId, dateString) {
    return `${accessKeyId}/${dateString}/${this.region}/${SERVICE}/aws4_request`;
  }

  generateStringToSign(date, canonicalRequest) {
    return `${ALGORITHM}
${this.timestampYYYYmmDDTHHMMSSZFormat(date)}
${this.timestampYYYYmmDDFormat(date)}/${this.region}/${SERVICE}/aws4_request
${createHash("sha256").update(canonicalRequest, "utf8").digest("hex")}`;
  }

  generateCanonicalQueryString(dateString, xAmzCredential, sessionToken) {
    return new URLSearchParams({
      Action: ACTION,
      "X-Amz-Algorithm": ALGORITHM,
      "X-Amz-Credential": xAmzCredential,
      "X-Amz-Date": dateString,
      "X-Amz-Expires": `${this.ttl}`,
      ...(sessionToken ? { "X-Amz-Security-Token": sessionToken } : {}),
      "X-Amz-SignedHeaders": SIGNED_HEADERS,
    }).toString();
  }

  generateCanonicalRequest(
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedPayload
  ) {
    return (
      "GET\n" +
      "/\n" +
      canonicalQueryString +
      "\n" +
      canonicalHeaders +
      "\n" +
      signedHeaders +
      "\n" +
      hashedPayload
    );
  }

  async create({ brokerHost }) {
    if (!brokerHost) throw new Error("Missing values");

    const credentials = await this.provider();
    const { accessKeyId, sessionToken } = credentials;

    if (!accessKeyId) {
      throw new Error("Missing access key id");
    }

    const now = Date.now();

    const xAmzCredential = this.generateXAmzCredential(
      accessKeyId,
      this.timestampYYYYmmDDFormat(now)
    );
    const canonicalHeaders = this.generateCanonicalHeaders(brokerHost);
    const canonicalQueryString = this.generateCanonicalQueryString(
      this.timestampYYYYmmDDTHHMMSSZFormat(now),
      xAmzCredential,
      sessionToken
    );
    const canonicalRequest = this.generateCanonicalRequest(
      canonicalQueryString,
      canonicalHeaders,
      SIGNED_HEADERS,
      HASHED_PAYLOAD
    );
    const stringToSign = this.generateStringToSign(now, canonicalRequest);

    const signature = await this.signature.sign(stringToSign, {
      signingDate: new Date(now).toISOString(),
    });

    const payload = {
      version: "2020_10_22",
      "user-agent": this.userAgent,
      host: brokerHost,
      action: ACTION,
      "x-amz-credential": xAmzCredential,
      "x-amz-algorithm": ALGORITHM,
      "x-amz-date": this.timestampYYYYmmDDTHHMMSSZFormat(now),
      "x-amz-signedheaders": SIGNED_HEADERS,
      "x-amz-expires": this.ttl,
      "x-amz-signature": signature,
    };

    if (sessionToken) {
      payload["x-amz-security-token"] = sessionToken;
    }

    return payload;
  }
}

module.exports = {
  AuthenticationPayloadCreator,
};