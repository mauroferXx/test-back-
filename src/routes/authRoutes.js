import express from 'express';
import {
  registerController,
  loginController,
  quickLoginTestController,
  getCurrentUserController
} from '../controllers/authController.js';

const router = express.Router();

router.post('/register', registerController);
router.post('/login', loginController);
router.post('/quick-login-test', quickLoginTestController);
router.get('/me', getCurrentUserController);

export default router;


