import express from 'express';
import { updatePreferencesController, getUserController } from '../controllers/userController.js';

const router = express.Router();

router.get('/:userId', getUserController);
router.put('/:userId/preferences', updatePreferencesController);

export default router;
