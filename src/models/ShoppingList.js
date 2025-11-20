import pool from '../config/database.js';

export class ShoppingList {
  static async create(userId, name, budget) {
    const result = await pool.query(
      'INSERT INTO shopping_lists (user_id, name, budget) VALUES ($1, $2, $3) RETURNING *',
      [userId, name, budget]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM shopping_lists WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM shopping_lists WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  static async updateStatus(id, status) {
    const result = await pool.query(
      'UPDATE shopping_lists SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );
    return result.rows[0];
  }

  static async addItem(listId, productId, quantity = 1) {
    const result = await pool.query(
      'INSERT INTO list_items (list_id, product_id, quantity) VALUES ($1, $2, $3) RETURNING *',
      [listId, productId, quantity]
    );
    return result.rows[0];
  }

  static async getItems(listId) {
    const result = await pool.query(
      `SELECT li.*, p.* 
       FROM list_items li
       JOIN products_cache p ON li.product_id = p.id
       WHERE li.list_id = $1`,
      [listId]
    );
    return result.rows;
  }

  static async deleteItem(itemId) {
    await pool.query('DELETE FROM list_items WHERE id = $1', [itemId]);
  }
}

