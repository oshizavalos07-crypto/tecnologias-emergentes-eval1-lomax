const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql-rds',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'lomax_user',
  password: process.env.DB_PASSWORD || 'lomax_pass',
  database: process.env.DB_NAME || 'lomax',
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
