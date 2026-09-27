const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const Jimp = require('jimp');

// Dentro del contenedor de Lambda que levanta Floci, el emulador debe ser
// alcanzable en esta URL (misma red de Docker Compose que el servicio "floci").
const endpoint = process.env.AWS_ENDPOINT_URL || 'http://floci:4566';
const region = process.env.AWS_REGION || 'us-east-1';
const TABLA_ATRIBUTOS = process.env.TABLA_ATRIBUTOS || 'ProductoAtributos';

const baseConfig = {
  endpoint,
  region,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  forcePathStyle: true,
};

const s3 = new S3Client(baseConfig);
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient(baseConfig));

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

exports.handler = async (event) => {
  const { producto_id, bucket_origen, bucket_destino, key } = event;

  try {
    const original = await s3.send(new GetObjectCommand({ Bucket: bucket_origen, Key: key }));
    const buffer = await streamToBuffer(original.Body);

    const imagen = await Jimp.read(buffer);
    imagen.scaleToFit(300, 300); // conserva proporción, máximo 300x300
    const miniaturaBuffer = await imagen.getBufferAsync(Jimp.MIME_JPEG);

    const miniaturaKey = `miniaturas/${producto_id}.jpg`; // clave determinista: no duplica

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket_destino,
        Key: miniaturaKey,
        Body: miniaturaBuffer,
        ContentType: 'image/jpeg',
      })
    );

    await dynamo.send(
      new UpdateCommand({
        TableName: TABLA_ATRIBUTOS,
        Key: { producto_id: String(producto_id) },
        UpdateExpression: 'SET imagen_original_key = :orig, miniatura_key = :min, estado_imagen = :estado',
        ExpressionAttributeValues: {
          ':orig': key,
          ':min': miniaturaKey,
          ':estado': 'LISTA',
        },
      })
    );

    return { estado: 'LISTA', miniatura_key: miniaturaKey };
  } catch (err) {
    console.error('Error generando miniatura:', err);

    try {
      await dynamo.send(
        new UpdateCommand({
          TableName: TABLA_ATRIBUTOS,
          Key: { producto_id: String(producto_id) },
          UpdateExpression: 'SET imagen_original_key = :orig, estado_imagen = :estado',
          ExpressionAttributeValues: { ':orig': key, ':estado': 'ERROR' },
        })
      );
    } catch (dynamoErr) {
      console.error('Además falló al registrar el estado ERROR en DynamoDB:', dynamoErr);
    }

    return { estado: 'ERROR', mensaje: err.message };
  }
};
