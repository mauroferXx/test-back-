import express from 'express';
import {
  getProductByBarcodeController,
  searchProductsController,
  getProductByIdController,
  ensureProductExistsController
} from '../controllers/productController.js';

const router = express.Router();

router.get('/barcode/:barcode', getProductByBarcodeController);
router.get('/search', searchProductsController);
router.post('/cache', ensureProductExistsController); // Asegurar que producto exista en BD
router.get('/:id', getProductByIdController);

export default router;

