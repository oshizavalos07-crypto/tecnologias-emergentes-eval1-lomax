# Catálogo Lomax SA — Práctica de Tecnologías Emergentes I

Proyecto individual (Andrew) para la Primera Evaluación: sistema de registro y
consulta de productos para "Lomax SA", cubriendo las 7 etapas de la guía sobre
un entorno local con **Floci** (emulador de AWS).

## Estado: las 7 etapas están completas y verificadas

| Etapa | Qué es | Estado |
|---|---|---|
| 1 | Diagrama de arquitectura | Ver `evidencias/E1-arquitectura/` |
| 2 | RDS (MySQL) + DynamoDB | ✅ Funcionando |
| 3 | S3 + Lambda (miniaturas) | ✅ Funcionando |
| 4 | Backend / API (7 endpoints) | ✅ Funcionando |
| 5 | Frontend (catálogo, registro, detalle) | ✅ Funcionando, 21 productos publicados |
| 6 | ECR (imágenes versionadas por commit) | ✅ Funcionando |
| 7 | EKS (clúster real k3s vía Floci) | ✅ Funcionando: escalado 1→3, autorrecuperación, persistencia verificada |

## Qué representa cada pieza

| Servicio de la práctica | Cómo está implementado |
|---|---|
| RDS (MySQL) | Contenedor `mysql-rds` (MySQL 8 real) |
| DynamoDB, S3, Lambda, ECR, EKS | Contenedor `floci` (emulador de AWS, puerto 4566) |
| Panel visual de Floci | Contenedor `floci-ui`, http://localhost:4500 |
| Backend / API | Imagen propia (Node.js + Express), corre como Pod en EKS |
| Frontend | Imagen propia (nginx + HTML/CSS/JS estático), corre como Pod en EKS |
| Reverse proxy | Contenedor `proxy` (nginx) → único punto de entrada, `http://localhost:8080`, reenvía a los Pods del clúster EKS |

## 1. Instalar lo necesario (una sola vez)

- **Docker Desktop**: https://www.docker.com/products/docker-desktop/
- **AWS CLI v2**: https://awscli.amazonaws.com/AWSCLIV2.msi
- **kubectl**: `winget install Kubernetes.kubectl`
- **Node.js 20+**: https://nodejs.org/
- **Git**: `winget install Git.Git`

Verifica: `docker --version`, `aws --version`, `kubectl version --client`, `node --version`, `git --version`.

## 2. Levantar el stack base (Docker Compose)

```powershell
cd practica-lomax
docker compose build
docker compose up -d
docker compose ps    # espera a que lomax-mysql y lomax-floci digan "healthy"
```

## 3. Crear los recursos "AWS" en Floci (S3, DynamoDB, Lambda)

```powershell
.\scripts\init-floci.ps1
```

Crea los buckets `lomax-originales`/`lomax-miniaturas`, la tabla `ProductoAtributos`
y despliega la función Lambda `generar-miniatura`.

## 4. (Opcional) Cargar productos de prueba en bloque

```powershell
cd scripts
npm install
node seed-productos.js 18
```

Genera productos con imagen sintética, repartidos en las 3 categorías, para
llegar rápido a los 20+ que pide la guía. También puedes usar el formulario
normal (`registro.html`) para registrar a mano.

## 5. Etapa 6 — Publicar en ECR

Resumen (detalle completo con comandos en `evidencias/E6-ecr/`):

```powershell
git commit -am "version a publicar"
$version = (git rev-parse --short HEAD)

aws --endpoint-url http://localhost:4566 ecr create-repository --repository-name lomax-backend
aws --endpoint-url http://localhost:4566 ecr create-repository --repository-name lomax-frontend
# login + tag + push con $version como tag (ver script/evidencia)
```

## 6. Etapa 7 — Desplegar en EKS

Resumen (detalle completo en `evidencias/E7-eks/` y manifiestos en `k8s/`):

```powershell
aws --endpoint-url http://localhost:4566 eks create-cluster --name lomax-cluster \
  --role-arn arn:aws:iam::000000000000:role/eks-role \
  --resources-vpc-config subnetIds=[],securityGroupIds=[] --kubernetes-version 1.31

aws --endpoint-url http://localhost:4566 eks update-kubeconfig --name lomax-cluster

kubectl apply -f k8s\backend.yaml
kubectl apply -f k8s\frontend.yaml
kubectl scale deployment lomax-backend --replicas=3
```

> Nota: Floci exige una credencial IAM real (no `test`/`test`) para autenticar
> `kubectl`. Se creó un usuario IAM `lomax-eks-admin` con `aws iam create-access-key`
> y se guardó de forma permanente con `aws configure set`.

> Nota de red: como "mysql-rds" y "floci" son contenedores propios de Docker
> Compose (no servicios nativos de Floci), los Pods no podían resolver esos
> nombres por DNS. Se solucionó agregando `hostAliases` en el manifiesto del
> backend (`k8s/backend.yaml`) con las IPs reales de esos contenedores.

## 7. Abrir la aplicación

**http://localhost:8080** (siempre, sin importar si estás usando la versión de
`docker-compose` o la de EKS — el proxy reenvía a lo que esté activo).

Panel visual de Floci (S3, DynamoDB, Lambda, ECR, EKS): **http://localhost:4500**

## 8. Ver lo que hay "por dentro" (para la defensa)

```powershell
# RDS
docker exec lomax-mysql mysql -u lomax_user -plomax_pass -e "SELECT * FROM lomax.producto;"

# DynamoDB
aws --endpoint-url http://localhost:4566 dynamodb scan --table-name ProductoAtributos

# S3
aws --endpoint-url http://localhost:4566 s3 ls s3://lomax-originales --recursive
aws --endpoint-url http://localhost:4566 s3 ls s3://lomax-miniaturas --recursive

# ECR
aws --endpoint-url http://localhost:4566 ecr describe-images --repository-name lomax-backend

# EKS
kubectl get pods -o wide
kubectl get deployment lomax-backend
```

## 9. Apagar todo

```powershell
docker compose down          # agrega -v para borrar también los datos de MySQL
```

## Estructura del proyecto