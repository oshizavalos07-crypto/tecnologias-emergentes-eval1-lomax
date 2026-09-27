const { S3Client } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient } = require('@aws-sdk/client-lambda');

// Todos los servicios "AWS" de esta práctica corren emulados en Floci
// (http://floci:4566 dentro de la red de Docker Compose). Las credenciales
// son ficticias: Floci no las valida, solo requiere que existan.
const endpoint = process.env.AWS_ENDPOINT_URL || 'http://floci:4566';
const region = process.env.AWS_REGION || 'us-east-1';

const baseConfig = {
  endpoint,
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
  forcePathStyle: true, // necesario para S3 contra un endpoint local
};

const s3 = new S3Client(baseConfig);
const dynamoRaw = new DynamoDBClient(baseConfig);
const dynamo = DynamoDBDocumentClient.from(dynamoRaw);
const lambda = new LambdaClient(baseConfig);

module.exports = { s3, dynamo, lambda };
