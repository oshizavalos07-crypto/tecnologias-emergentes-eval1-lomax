# Catálogo Lomax SA — Stack local (Etapas 2 a 5)

Este proyecto levanta, en tu propia máquina, todo lo que la evaluación pide **hasta
la Etapa 5** (persistencia RDS+DynamoDB, S3+Lambda, backend con los 7 endpoints,
frontend con las 3 vistas). ECR (Etapa 6) y EKS (Etapa 7) no están incluidos
todavía — los hacemos después, cuando confirmes que esto corre bien.

No se ha ejecutado ni probado en un entorno real todavía (aquí no tengo Docker
disponible), así que es posible que algún comando necesite un ajuste menor la
primera vez. Si algo falla, copia el mensaje de error y lo arreglamos.

## Qué representa cada pieza

| Servicio en la práctica | Cómo está implementado aquí |
|---|---|
| RDS (MySQL) | Contenedor `mysql-rds` (MySQL 8 real) |
| DynamoDB, S3, Lambda | Contenedor `floci` (emulador local de AWS, puerto 4566) |
| Backend / API | Contenedor `backend` (Node.js + Express) |
| Frontend | Contenedor `frontend` (archivos estáticos servidos con nginx) |
| Reverse proxy | Contenedor `proxy` (nginx), único punto de entrada en `http://localhost:8080` |

## 1. Instalar lo necesario (una sola vez)

1. **Docker Desktop** (incluye Docker Compose): https://www.docker.com/products/docker-desktop/
2. **AWS CLI v2**: https://awscli.amazonaws.com/AWSCLIV2.msi
3. **Node.js 20** (solo para que el script empaquete la Lambda): https://nodejs.org/
4. Verifica en PowerShell:
   ```powershell
   docker --version
   aws --version
   node --version
   ```

## 2. Descomprimir el proyecto y abrirlo en VS Code

1. Descomprime el ZIP, por ejemplo en `Descargas\practica-lomax`.
2. Abre PowerShell y entra a la carpeta:
   ```powershell
   cd $HOME\Downloads\practica-lomax
   code .
   ```

## 3. Levantar los contenedores

```powershell
docker compose build
docker compose up -d
docker compose ps
```

Espera hasta que `lomax-mysql` aparezca como `healthy` (puede tardar 20-30
segundos la primera vez, porque MySQL está cargando `db/init.sql`).

## 4. Crear los recursos "AWS" dentro de Floci (S3, DynamoDB, Lambda)

Esto solo se hace una vez (o cada vez que borres los datos de Floci):

```powershell
.\scripts\init-floci.ps1
```

Este script espera a que Floci esté listo, crea los dos buckets S3
(`lomax-originales`, `lomax-miniaturas`), la tabla DynamoDB
(`ProductoAtributos`) y empaqueta + despliega la función Lambda
(`generar-miniatura`).

## 5. Abrir la aplicación

http://localhost:8080

- Catálogo: `http://localhost:8080/`
- Registrar producto: `http://localhost:8080/registro.html`
- La API queda accesible también en `http://localhost:8080/api/...` y,
  directo (sin proxy), en `http://localhost:3000/...`

## 6. Ver lo que hay "por dentro" (para explicar/defender la práctica)

- **MySQL (RDS):** conéctate con cualquier cliente MySQL (o la extensión de
  VS Code) a `localhost:3307`, usuario `lomax_user`, contraseña `lomax_pass`,
  base `lomax`. O desde PowerShell:
  ```powershell
  docker exec -it lomax-mysql mysql -u lomax_user -plomax_pass lomax
  ```
- **DynamoDB (vía Floci):**
  ```powershell
  aws --endpoint-url http://localhost:4566 dynamodb scan --table-name ProductoAtributos
  ```
- **S3 (vía Floci):**
  ```powershell
  aws --endpoint-url http://localhost:4566 s3 ls s3://lomax-originales
  aws --endpoint-url http://localhost:4566 s3 ls s3://lomax-miniaturas
  ```
- **Logs de cada contenedor:**
  ```powershell
  docker compose logs -f backend
  docker compose logs -f floci
  ```

## 7. Apagar todo

```powershell
docker compose down
```
Agrega `-v` si además quieres borrar los datos de MySQL (`docker compose down -v`).

## Estructura del proyecto

```
practica-lomax/
├─ docker-compose.yml
├─ db/init.sql              -> esquema RDS (categoria, producto)
├─ backend/                 -> API Node/Express (7 endpoints de la guía)
├─ lambda/thumbnail/         -> función Lambda que genera la miniatura
├─ frontend/                 -> catálogo, registro y detalle (HTML/CSS/JS)
├─ proxy/nginx.conf          -> enruta / al frontend y /api al backend
└─ scripts/init-floci.ps1    -> crea buckets, tabla y Lambda en Floci
```

## Pendiente para las siguientes etapas (no incluido aún)

- Etapa 6: publicar las imágenes de `backend` y `frontend` en ECR (Floci también
  lo emula).
- Etapa 7: desplegar en un clúster EKS (o el que provea Floci).
- Diagrama de arquitectura (Etapa 1) y demás entregables en PDF: los preparamos
  después, como pediste.
