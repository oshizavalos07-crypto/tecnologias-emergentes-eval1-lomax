-- Esquema para RDS (MySQL) - Catálogo Lomax SA

CREATE DATABASE IF NOT EXISTS lomax;
USE lomax;

CREATE TABLE IF NOT EXISTS categoria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS producto (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL UNIQUE,
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT,
  precio DECIMAL(10,2) NOT NULL,
  categoria_id INT NOT NULL,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  estado ENUM('PENDIENTE', 'PUBLICADO') NOT NULL DEFAULT 'PENDIENTE',
  CONSTRAINT fk_producto_categoria FOREIGN KEY (categoria_id) REFERENCES categoria(id),
  CONSTRAINT chk_precio_no_negativo CHECK (precio >= 0)
);

-- 3 categorías iniciales requeridas por la práctica
INSERT INTO categoria (nombre) VALUES
  ('Teclados'),
  ('Pantallas'),
  ('Mouses')
ON DUPLICATE KEY UPDATE nombre = nombre;
