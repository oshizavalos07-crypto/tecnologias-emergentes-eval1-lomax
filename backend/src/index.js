const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { InvokeCommand } = require('@aws-sdk/client-lambda');
const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const pool = require('./db');
const { s3, dynamo, lambda } = require('./aws');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const BUCKET_ORIGINALES = process.env.BUCKET_ORIGINALES || 'lomax-originales';
const BUCKET_MINIATURAS = process.env.BUCKET_MINIATURAS || 'lomax-miniaturas';
const TABLA_ATRIBUTOS = process.env.TABLA_ATRIBUTOS || 'ProductoAtributos';
const LAMBDA_MINIATURA = process.env.LAMBDA_MINIATURA || 'generar-miniatura';

// ---------- Utilidades ----------

function esImagenValida(mimetype) {
  return mimetype === 'image/jpeg' || mimetype === 'image/png';
}

async function obtenerAtributos(productoId) {
  const res = await dynamo.send(
    new GetCommand({ TableName: TABLA_ATRIBUTOS, Key: { producto_id: String(productoId) } })
  );
  return res.Item || null;
}

// ---------- GET /categorias ----------

app.get('/categorias', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, nombre FROM categoria ORDER BY nombre');
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'RDS no disponible', detalle: err.message });
  }
});

// ---------- POST /productos ----------

app.post('/productos', async (req, res) => {
  const { codigo, nombre, descripcion, precio, categoria_id, atributos } = req.body || {};

  if (!codigo || !nombre || precio === undefined || !categoria_id) {
    return res.status(400).json({ error: 'Faltan campos obligatorios (codigo, nombre, precio, categoria_id)' });
  }
  if (Number(precio) < 0) {
    return res.status(400).json({ error: 'El precio no puede ser negativo' });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    const [categorias] = await conn.query('SELECT id FROM categoria WHERE id = ?', [categoria_id]);
    if (categorias.length === 0) {
      conn.release();
      return res.status(400).json({ error: 'La categoría indicada no existe' });
    }

    const [existentes] = await conn.query('SELECT id FROM producto WHERE codigo = ?', [codigo]);
    if (existentes.length > 0) {
      conn.release();
      return res.status(409).json({ error: 'Ya existe un producto con ese código' });
    }

    const [result] = await conn.query(
      'INSERT INTO producto (codigo, nombre, descripcion, precio, categoria_id, estado) VALUES (?, ?, ?, ?, ?, "PENDIENTE")',
      [codigo, nombre, descripcion || null, precio, categoria_id]
    );
    conn.release();

    const productoId = result.insertId;

    try {
      await dynamo.send(
        new PutCommand({
          TableName: TABLA_ATRIBUTOS,
          Item: {
            producto_id: String(productoId),
            atributos: atributos || {},
            imagen_original_key: null,
            miniatura_key: null,
            estado_imagen: 'PENDIENTE',
          },
        })
      );
    } catch (dynamoErr) {
      console.error('Error guardando atributos en DynamoDB:', dynamoErr);
      return res.status(502).json({
        error: 'Producto creado en RDS pero falló el guardado de atributos en DynamoDB',
        producto_id: productoId,
        estado: 'PENDIENTE',
        paso_fallido: 'dynamodb',
      });
    }

    res.status(201).json({ producto_id: productoId, estado: 'PENDIENTE' });
  } catch (err) {
    if (conn) conn.release();
    console.error(err);
    res.status(503).json({ error: 'RDS no disponible', detalle: err.message });
  }
});

// ---------- POST /productos/:id/imagen ----------

app.post('/productos/:id/imagen', upload.single('imagen'), async (req, res) => {
  const productoId = req.params.id;

  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo (campo esperado: imagen)' });
  }
  if (!esImagenValida(req.file.mimetype)) {
    return res.status(415).json({ error: 'Formato no permitido, use JPEG o PNG' });
  }

  const [productos] = await pool.query('SELECT id FROM producto WHERE id = ?', [productoId]);
  if (productos.length === 0) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }

  const extension = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
  const key = `originales/${productoId}.${extension}`;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_ORIGINALES,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );
  } catch (err) {
    console.error('Error subiendo original a S3:', err);
    return res.status(502).json({ error: 'No se pudo guardar la imagen original en S3', paso_fallido: 's3' });
  }

  return invocarLambdaYPublicar(productoId, key, res);
});

// ---------- POST /productos/:id/reprocesar ----------

app.post('/productos/:id/reprocesar', async (req, res) => {
  const productoId = req.params.id;

  const [productos] = await pool.query('SELECT id FROM producto WHERE id = ?', [productoId]);
  if (productos.length === 0) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }

  const atributos = await obtenerAtributos(productoId);
  if (!atributos || !atributos.imagen_original_key) {
    return res.status(409).json({ error: 'No existe una imagen original guardada para este producto' });
  }

  return invocarLambdaYPublicar(productoId, atributos.imagen_original_key, res);
});

async function invocarLambdaYPublicar(productoId, keyOriginal, res) {
  let payloadLambda;
  try {
    const respuesta = await lambda.send(
      new InvokeCommand({
        FunctionName: LAMBDA_MINIATURA,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(
          JSON.stringify({
            producto_id: String(productoId),
            bucket_origen: BUCKET_ORIGINALES,
            bucket_destino: BUCKET_MINIATURAS,
            key: keyOriginal,
          })
        ),
      })
    );
    payloadLambda = JSON.parse(Buffer.from(respuesta.Payload).toString());
    if (respuesta.FunctionError || payloadLambda.estado === 'ERROR') {
      throw new Error(payloadLambda.mensaje || 'La función Lambda reportó un error');
    }
  } catch (err) {
    console.error('Error invocando Lambda:', err);
    return res.status(502).json({
      error: 'Falló el procesamiento de la imagen (Lambda)',
      paso_fallido: 'lambda',
      detalle: err.message,
    });
  }

  try {
    const atributosPrevios = (await obtenerAtributos(productoId)) || {};
    const debePublicar =
      payloadLambda.estado === 'LISTA' && atributosPrevios.atributos !== undefined;

    if (debePublicar) {
      await pool.query('UPDATE producto SET estado = "PUBLICADO" WHERE id = ?', [productoId]);
    }

    res.status(200).json({
      producto_id: productoId,
      estado_imagen: payloadLambda.estado,
      estado_producto: debePublicar ? 'PUBLICADO' : 'PENDIENTE',
      miniatura_key: payloadLambda.miniatura_key || null,
    });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'RDS no disponible al confirmar publicación', detalle: err.message });
  }
}

// ---------- GET /productos ----------

app.get('/productos', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.codigo, p.nombre, p.precio, c.nombre AS categoria
       FROM producto p JOIN categoria c ON c.id = p.categoria_id
       WHERE p.estado = "PUBLICADO"
       ORDER BY p.id DESC`
    );

    const productos = await Promise.all(
      rows.map(async (fila) => {
        const atributos = await obtenerAtributos(fila.id);
        return {
          ...fila,
          atributos: atributos ? atributos.atributos : {},
             miniatura_url: `/api/productos/${fila.id}/imagen`,
        };
      })
    );

    res.status(200).json(productos);
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'Error consultando el catálogo', detalle: err.message });
  }
});

// ---------- GET /productos/:id ----------

app.get('/productos/:id', async (req, res) => {
  const productoId = req.params.id;
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.codigo, p.nombre, p.descripcion, p.precio, p.estado, c.nombre AS categoria
       FROM producto p JOIN categoria c ON c.id = p.categoria_id
       WHERE p.id = ?`,
      [productoId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    const atributos = await obtenerAtributos(productoId);
    res.status(200).json({
      ...rows[0],
      atributos: atributos ? atributos.atributos : {},
      estado_imagen: atributos ? atributos.estado_imagen : 'PENDIENTE',
    });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'Error consultando el producto', detalle: err.message });
  }
});

// ---------- GET /productos/:id/imagen ----------

app.get('/productos/:id/imagen', async (req, res) => {
  const productoId = req.params.id;
  const atributos = await obtenerAtributos(productoId);
  if (!atributos || !atributos.miniatura_key || atributos.estado_imagen !== 'LISTA') {
    return res.status(404).json({ error: 'Miniatura no disponible' });
  }
  try {
    const objeto = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET_MINIATURAS, Key: atributos.miniatura_key })
    );
    res.setHeader('Content-Type', objeto.ContentType || 'image/jpeg');
    objeto.Body.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: 'No se pudo recuperar la miniatura de S3' });
  }
});

app.get('/', (req, res) => res.json({ ok: true, servicio: 'lomax-backend' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend Lomax escuchando en puerto ${PORT}`));
