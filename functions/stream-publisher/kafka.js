const { KafkaClient, GetBootstrapBrokersCommand } = require("@aws-sdk/client-kafka");
const { Kafka, CompressionTypes, logLevel } = require("kafkajs");
const { awsIamAuthenticator } = require("./msk_sasl/AwsIamAuthenticator");

const REGION = process.env.AWS_REGION || "us-east-1";

const kafkaClient = new KafkaClient({
  region: REGION,
});

const getBootstrapServers = async (clusterArn) => {
  const command = new GetBootstrapBrokersCommand({
    ClusterArn: clusterArn,
  });

  const response = await kafkaClient.send(command);

  return response.BootstrapBrokerStringSaslIam;
};

let producer;
let currentClusterId;

const getProducer = async () => {
  const clusterId = process.env.MSK_CLUSTER_ID;
  const accountNumber = process.env.MSK_ACCOUNT_ID;

  if (!clusterId) {
    throw new Error("MSK_CLUSTER_ID environment variable is required.");
  }

  if (!accountNumber) {
    throw new Error("MSK_ACCOUNT_ID environment variable is required.");
  }

  if (producer && currentClusterId === clusterId) {
    return producer;
  }

  const clusterArn = `arn:aws:kafka:${REGION}:${accountNumber}:cluster/${clusterId}`;
  const bootstrapServers = await getBootstrapServers(clusterArn);

  const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || "feature-flag-management-application",
    brokers: bootstrapServers.split(","),
    ssl: true,
    sasl: {
      mechanism: "AWS_MSK_IAM",
      authenticationProvider: awsIamAuthenticator(REGION, 3600),
    },
    authenticationTimeout: 20000,
    connectionTimeout: 10000,
    requestTimeout: 25000,
    enforceRequestTimeout: true,
    retry: {
      retries: 3,
      initialRetryTime: 100,
    },
    logLevel: logLevel.INFO,
  });

  producer = kafka.producer({
    allowAutoTopicCreation: false,
    compression: CompressionTypes.LZ4,
    maxInFlightRequests: 1,
  });

  await producer.connect();

  currentClusterId = clusterId;

  return producer;
};

const extractKafkaKey = (message) => {
  if (message?.accountId && message?.appId) {
    return `${message.accountId}:${message.appId}`;
  }

  return Date.now().toString();
};

const publishToKafka = async ({ topic, message, headers }) => {
  const kafkaProducer = await getProducer();
  const key = extractKafkaKey(message);

  await kafkaProducer.send({
    topic,
    messages: [
      {
        key,
        value: JSON.stringify(message),
        headers,
      },
    ],
  });

  console.log(`Published message to Kafka topic ${topic}`);
};

const disconnectProducer = async () => {
  if (producer) {
    await producer.disconnect();
    producer = null;
    currentClusterId = null;
  }
};

process.on("beforeExit", disconnectProducer);
process.on("SIGTERM", disconnectProducer);

module.exports = {
  publishToKafka,
  disconnectProducer,
};
