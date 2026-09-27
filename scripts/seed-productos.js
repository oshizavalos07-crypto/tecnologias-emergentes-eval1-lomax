// Crea productos de prueba en bloque llamando directo a la API del backend
// (a través del proxy). Genera una imagen sintética por producto con Jimp,
// para no depender de fotos reales. Sirve para llegar rápido a los 20
// productos publicados que pide la guía, distribuidos en las 3 categorías
// con 2 (o más) conjuntos de atributos distintos.
//
// Uso:
//   cd scripts
//   npm install
//   node seed-productos.js            (crea 18 productos, 6 por categoría)
//   node seed-productos.js 30          (crea 30 en vez de 18)

const Jimp = require('jimp');

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';
const CANTIDAD = Number(process.argv[2] || 18);

// Debe coincidir con las categorías creadas en db/init.sql
const CATEGORIAS = [
  {
    nombre: 'Teclados',
    color: 0x2f855aff,
    atributos: () => ({ conexion: azarDe(['USB', 'Bluetooth', 'USB-C']), distribucion: azarDe(['Español', 'Inglés']) }),
  },
  {
    nombre: 'Pantallas',
    color: 0x2b6cb0ff,
    atributos: () => ({ pulgadas: azarDe(['21.5"', '24"', '27"', '32"']), resolucion: azarDe(['1920x1080', '2560x1440', '3840x2160']) }),
  },
  {
    nombre: 'Mouses',
    color: 0xb7791fff,
    atributos: () => ({ conexion: azarDe(['USB', 'Inalámbrico']), dpi: azarDe(['1600', '3200', '6400', '16000']) }),
  },
];

function azarDe(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

function precioAzar() {
  return Math.round((50 + Math.random() * 950) * 100) / 100;
}

async function obtenerCategorias() {
  const res = await fetch(`${API_BASE}/categorias`);
  if (!res.ok) throw new Error(`No se pudo leer /categorias (HTTP ${res.status})`);
  const categorias = await res.json();
  const mapa = {};
  for (const c of categorias) mapa[c.nombre] = c.id;
  return mapa;
}

async function generarImagen(texto, colorHex) {
  const imagen = new Jimp(600, 400, colorHex);
  const fuente = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  imagen.print(fuente, 20, 20, texto);
  return imagen.getBufferAsync(Jimp.MIME_JPEG);
}

async function crearProducto(categoriaId, categoriaDef, indice) {
  const codigo = `${categoriaDef.nombre.slice(0, 3).toUpperCase()}-${String(indice).padStart(3, '0')}`;
  const nombre = `${categoriaDef.nombre.slice(0, -1)} de prueba ${indice}`;
  const atributos = categoriaDef.atributos();

  const cuerpo = {
    codigo,
    nombre,
    descripcion: `Producto generado automáticamente para pruebas (${categoriaDef.nombre}).`,
    precio: precioAzar(),
    categoria_id: categoriaId,
    atributos,
  };

  const resCrear = await fetch(`${API_BASE}/productos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const datosCrear = await resCrear.json();
  if (!resCrear.ok) {
    console.error(`  ✗ ${codigo}: no se pudo crear (${resCrear.status}) ${JSON.stringify(datosCrear)}`);
    return;
  }

  const productoId = datosCrear.producto_id;
  const imagenBuffer = await generarImagen(codigo, categoriaDef.color);

  const formData = new FormData();
  formData.append('imagen', new Blob([imagenBuffer], { type: 'image/jpeg' }), `${codigo}.jpg`);

  const resImagen = await fetch(`${API_BASE}/productos/${productoId}/imagen`, {
    method: 'POST',
    body: formData,
  });
  const datosImagen = await resImagen.json();

  if (resImagen.ok && datosImagen.estado_producto === 'PUBLICADO') {
    console.log(`  ✓ ${codigo} (id ${productoId}) → PUBLICADO`);
  } else {
    console.error(`  ✗ ${codigo} (id ${productoId}) → ${JSON.stringify(datosImagen)}`);
  }
}

async function main() {
  console.log(`Consultando categorías en ${API_BASE} ...`);
  const mapaCategorias = await obtenerCategorias();
  console.log('Categorías encontradas:', mapaCategorias);

  let creados = 0;
  let intento = 1;
  while (creados < CANTIDAD) {
    const categoriaDef = CATEGORIAS[creados % CATEGORIAS.length];
    const categoriaId = mapaCategorias[categoriaDef.nombre];
    if (!categoriaId) {
      throw new Error(`No existe la categoría "${categoriaDef.nombre}" en la base. Revisa db/init.sql.`);
    }
    await crearProducto(categoriaId, categoriaDef, intento);
    creados += 1;
    intento += 1;
  }

  console.log(`\nListo: se intentó crear ${CANTIDAD} productos.`);
}

main().catch((err) => {
  console.error('Error general:', err.message);
  process.exit(1);
});