# Crea los recursos "AWS" (S3, DynamoDB, Lambda) dentro de Floci.
# Ejecutar DESPUES de `docker compose up -d` y con Floci ya arriba.
# Requiere: AWS CLI v2 instalado (aws --version).

$env:AWS_ACCESS_KEY_ID = "test"
$env:AWS_SECRET_ACCESS_KEY = "test"
$env:AWS_DEFAULT_REGION = "us-east-1"
$Endpoint = "http://localhost:4566"

function Wait-Floci {
    Write-Host "Esperando a que Floci responda en $Endpoint ..."
    $listo = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            Invoke-WebRequest -Uri "$Endpoint/_localstack/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
            $listo = $true
            break
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    if (-not $listo) {
        Write-Warning "Floci no respondio a tiempo. Verifica 'docker compose ps' y los logs de 'lomax-floci'."
        exit 1
    }
    Write-Host "Floci listo."
}

Wait-Floci

Write-Host "`nCreando buckets S3..."
aws --endpoint-url $Endpoint s3 mb s3://lomax-originales
aws --endpoint-url $Endpoint s3 mb s3://lomax-miniaturas

Write-Host "`nCreando tabla DynamoDB ProductoAtributos..."
aws --endpoint-url $Endpoint dynamodb create-table `
    --table-name ProductoAtributos `
    --attribute-definitions AttributeName=producto_id,AttributeType=S `
    --key-schema AttributeName=producto_id,KeyType=HASH `
    --billing-mode PAY_PER_REQUEST

Write-Host "`nEmpaquetando la funcion Lambda (generar-miniatura)..."
Push-Location "$PSScriptRoot\..\lambda\thumbnail"
if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }
npm install --omit=dev
if (Test-Path function.zip) { Remove-Item function.zip }
Compress-Archive -Path * -DestinationPath function.zip
Pop-Location

Write-Host "`nDesplegando la funcion Lambda en Floci..."
aws --endpoint-url $Endpoint lambda create-function `
    --function-name generar-miniatura `
    --runtime nodejs20.x `
    --handler index.handler `
    --timeout 30 `
    --memory-size 256 `
    --zip-file "fileb://$PSScriptRoot\..\lambda\thumbnail\function.zip" `
    --role arn:aws:iam::000000000000:role/lambda-role `
    --environment "Variables={AWS_ENDPOINT_URL=http://floci:4566,AWS_REGION=us-east-1,TABLA_ATRIBUTOS=ProductoAtributos}"

Write-Host "`nListo. Recursos creados en Floci: buckets, tabla DynamoDB y funcion Lambda."
Write-Host "Abre http://localhost:8080 para usar la aplicacion."
