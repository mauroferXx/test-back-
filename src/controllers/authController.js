import { User } from '../models/User.js';
import bcrypt from 'bcryptjs'; // npm install bcryptjs

/**
 * Registrar nuevo usuario
 */
export async function registerController(req, res) {
  try {
    const { email, name, password } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ error: 'email, name, and password are required' });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const user = await User.create({
      email,
      name,
      password: hashedPassword
    });

    // No retornar la contraseña
    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      user: userWithoutPassword,
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('Error in registerController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Iniciar sesión
 */
export async function loginController(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    // Buscar usuario
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, user.password || '');
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // No retornar la contraseña
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Error in loginController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Login rápido con usuario TEST (sin contraseña)
 */
export async function quickLoginTestController(req, res) {
  try {
    // Buscar usuario TEST
    const user = await User.findById(1);
    
    if (!user || user.email !== 'test@example.com') {
      return res.status(404).json({ error: 'Test user not found' });
    }

    // No retornar la contraseña
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
      message: 'Quick login successful'
    });
  } catch (error) {
    console.error('Error in quickLoginTestController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Obtener usuario actual (verificar sesión)
 */
export async function getCurrentUserController(req, res) {
  try {
    const { userId } = req.query; // En producción, esto vendría del token JWT

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // No retornar la contraseña
    const { password: _, ...userWithoutPassword } = user;

    res.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('Error in getCurrentUserController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

