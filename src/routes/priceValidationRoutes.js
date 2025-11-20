import express from 'express';
import {
  getPriceStatisticsController,
  validatePricesController,
  fixPricesController,
  fixProductPriceController,
  fixMultiplePricesController,
  getInvalidPricesController
} from '../controllers/priceValidationController.js';

const router = express.Router();

// Estadísticas de precios
router.get('/statistics', getPriceStatisticsController);

// Obtener productos con precios inválidos
router.get('/invalid', getInvalidPricesController);

// Revisar precios (solo lectura, no corrige)
router.get('/validate', validatePricesController);

// Corregir precios automáticamente
router.post('/fix', fixPricesController);

// Corregir precio de un producto específico
router.post('/fix/:id', fixProductPriceController);

// Corregir múltiples productos
router.post('/fix-multiple', fixMultiplePricesController);

export default router;

