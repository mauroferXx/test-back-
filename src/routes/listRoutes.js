import express from 'express';
import {
  createListController,
  getListByIdController,
  addItemToListController,
  optimizeListController,
  getSubstitutesController
} from '../controllers/listController.js';

const router = express.Router();

router.post('/', createListController);
router.get('/:id', getListByIdController);
router.post('/:listId/items', addItemToListController);
router.post('/:id/optimize', optimizeListController);
router.get('/substitutes/:productId', getSubstitutesController);

export default router;

