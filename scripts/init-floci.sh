#!/usr/bin/env bash
set -e

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
ENDPOINT="http://localhost:4566"

echo "Esperando a que Floci responda en $ENDPOINT ..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null "$ENDPOINT/_localstack/health"; then break; fi
  sleep 2
done

echo "Creando buckets S3..."
aws --endpoint-url "$ENDPOINT" s3 mb s3://lomax-originales
aws --endpoint-url "$ENDPOINT" s3 mb s3://lomax-miniaturas

echo "Creando tabla DynamoDB ProductoAtributos..."
aws --endpoint-url "$ENDPOINT" dynamodb create-table \
  --table-name ProductoAtributos \
  --attribute-definitions AttributeName=producto_id,AttributeType=S \
  --key-schema AttributeName=producto_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

echo "Empaquetando la funcion Lambda..."
cd "$(dirname "$0")/../lambda/thumbnail"
rm -rf node_modules function.zip
npm install --omit=dev
zip -r function.zip . -x "*.git*" > /dev/null

echo "Desplegando la funcion Lambda en Floci..."
aws --endpoint-url "$ENDPOINT" lambda create-function \
  --function-name generar-miniatura \
  --runtime nodejs20.x \
  --handler index.handler \
  --timeout 30 \
  --memory-size 256 \
  --zip-file "fileb://$(pwd)/function.zip" \
  --role arn:aws:iam::000000000000:role/lambda-role \
  --environment "Variables={AWS_ENDPOINT_URL=http://floci:4566,AWS_REGION=us-east-1,TABLA_ATRIBUTOS=ProductoAtributos}"

echo "Listo. Abre http://localhost:8080"
