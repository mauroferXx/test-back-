import express from 'express';
import {
  createPurchaseController,
  getPurchaseHistoryController
} from '../controllers/purchaseController.js';

const router = express.Router();

router.post('/', createPurchaseController);
router.get('/user/:userId', getPurchaseHistoryController);

export default router;

