import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Si hay una URL de conexión completa, usarla directamente
// Si no, usar las variables individuales
let poolConfig;

if (process.env.DATABASE_URL) {
  // Usar la URL de conexión completa (útil para Render, Heroku, etc.)
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('render.com') || process.env.DATABASE_URL.includes('heroku') 
      ? { rejectUnauthorized: false } 
      : false
  };
} else {
  // Usar configuración por variables individuales
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'sustainable_shopping',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  };
}

const pool = new Pool(poolConfig);

export default pool;

