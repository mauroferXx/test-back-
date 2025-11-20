import express from 'express';
import {
  getCartController,
  addToCartController,
  updateCartItemController,
  removeFromCartController,
  clearCartController
} from '../controllers/cartController.js';

const router = express.Router();

router.get('/', getCartController);
router.post('/add', addToCartController);
router.put('/update', updateCartItemController);
router.delete('/remove', removeFromCartController);
router.delete('/clear', clearCartController);

export default router;


