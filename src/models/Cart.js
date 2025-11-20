import pool from '../config/database.js';

export class Cart {
  static async getItems(userId) {
    const result = await pool.query(
      `SELECT ci.*, p.* 
       FROM user_cart_items ci
       JOIN products_cache p ON ci.product_id = p.id
       WHERE ci.user_id = $1
       ORDER BY ci.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  static async addItem(userId, productId, quantity = 1) {
    // Usar UPSERT (Insert or Update) para manejar concurrencia y evitar errores de llave duplicada
    const result = await pool.query(
      `INSERT INTO user_cart_items (user_id, product_id, quantity) 
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id) 
       DO UPDATE SET 
         quantity = user_cart_items.quantity + EXCLUDED.quantity,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, productId, quantity]
    );
    return result.rows[0];
  }

  static async updateQuantity(userId, productId, quantity) {
    if (quantity <= 0) {
      // Eliminar item
      await pool.query(
        'DELETE FROM user_cart_items WHERE user_id = $1 AND product_id = $2',
        [userId, productId]
      );
      return null;
    }

    const result = await pool.query(
      `UPDATE user_cart_items 
       SET quantity = $1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2 AND product_id = $3
       RETURNING *`,
      [quantity, userId, productId]
    );
    return result.rows[0] || null;
  }

  static async removeItem(userId, productId) {
    await pool.query(
      'DELETE FROM user_cart_items WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );
  }

  static async clear(userId) {
    await pool.query(
      'DELETE FROM user_cart_items WHERE user_id = $1',
      [userId]
    );
  }
}


