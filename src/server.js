import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './config/database.js';
import productRoutes from './routes/productRoutes.js';
import listRoutes from './routes/listRoutes.js';
import purchaseRoutes from './routes/purchaseRoutes.js';
import authRoutes from './routes/authRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import priceValidationRoutes from './routes/priceValidationRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { startScheduledTasks } from './services/scheduledTasks.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/prices', priceValidationRoutes);
app.use('/api/users', userRoutes);

// Initialize database
async function initializeDatabase() {
  try {
    // Ejecutar migraciones en orden
    const migrations = [
      '001_create_tables.sql',
      '002_add_user_cart.sql',
      '003_add_auth_and_cart.sql',
      '004_add_user_preferences.sql',
      '005_add_country_to_products.sql'
    ];

    for (const migrationFile of migrations) {
      try {
        const migrationPath = path.join(__dirname, 'db', 'migrations', migrationFile);
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        await pool.query(migrationSQL);
        console.log(`Migration ${migrationFile} executed successfully`);
      } catch (error) {
        if (error.code === '42P07' || error.message.includes('already exists')) {
          console.log(`Migration ${migrationFile} already applied`);
        } else {
          console.error(`Error executing migration ${migrationFile}:`, error.message);
        }
      }
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Start server
async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

      // Iniciar tareas programadas después de que el servidor esté listo
      startScheduledTasks();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;

