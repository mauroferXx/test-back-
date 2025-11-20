import pool from '../config/database.js';

export class User {
  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  static async create({ id, email, name, password }) {
    // Verificar si el usuario ya existe
    if (id) {
      const existing = await this.findById(id);
      if (existing) {
        return existing;
      }
    }

    // Crear nuevo usuario
    try {
      if (id) {
        // Insertar con ID específico (para usuario TEST)
        const result = await pool.query(
          'INSERT INTO users (id, email, name, password) VALUES ($1, $2, $3, $4) RETURNING *',
          [id, email, name, password]
        );

        // Actualizar secuencia
        await pool.query(
          `SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users), $1), true)`,
          [id]
        );

        return result.rows[0];
      } else {
        // Insertar sin ID (genera automáticamente)
        const result = await pool.query(
          'INSERT INTO users (email, name, password, preferences) VALUES ($1, $2, $3, $4) RETURNING *',
          [email, name, password, {}]
        );
        return result.rows[0];
      }
    } catch (error) {
      // Si falla por constraint de email único, intentar con email diferente
      if (error.code === '23505') {
        if (id) {
          const existing = await this.findById(id);
          if (existing) return existing;
        }
        const result = await pool.query(
          'INSERT INTO users (email, name, password, preferences) VALUES ($1, $2, $3, $4) RETURNING *',
          [`${email}_${Date.now()}`, name, password, {}]
        );
        return result.rows[0];
      }
      throw error;
    }
  }

  static async createOrGet(id, email, name) {
    // Verificar si el usuario ya existe
    let user = await this.findById(id);
    if (user) {
      return user;
    }

    // Si no existe, crear uno nuevo con el ID específico
    // PostgreSQL permite insertar valores específicos en columnas SERIAL
    // pero necesitamos actualizar la secuencia después
    try {
      const result = await pool.query(
        'INSERT INTO users (id, email, name, preferences) VALUES ($1, $2, $3, $4) RETURNING *',
        [id, email || `user${id}@example.com`, name || `Usuario ${id}`, {}]
      );

      // Actualizar la secuencia para que el próximo ID generado sea mayor que el insertado
      await pool.query(
        `SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users), $1), true)`,
        [id]
      );

      return result.rows[0];
    } catch (error) {
      // Si falla por constraint de email único, intentar obtener el usuario existente
      if (error.code === '23505') {
        const existingByEmail = await this.findByEmail(email || `user${id}@example.com`);
        if (existingByEmail) {
          return existingByEmail;
        }
      }
      // Si falla por constraint de ID único (improbable), el usuario ya existe
      if (error.code === '23505' || error.message.includes('duplicate key')) {
        user = await this.findById(id);
        if (user) {
          return user;
        }
      }
      throw error;
    }
  }

  static async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }
  static async updatePreferences(id, preferences) {
    const result = await pool.query(
      'UPDATE users SET preferences = $1 WHERE id = $2 RETURNING *',
      [JSON.stringify(preferences), id]
    );
    return result.rows[0] || null;
  }
}

