import pool from '../config/database.js';

export class Purchase {
  static async create(userId, listId, totalPrice, totalCarbon, totalSavings) {
    const result = await pool.query(
      `INSERT INTO purchases (user_id, list_id, total_price, total_carbon, total_savings)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, listId, totalPrice, totalCarbon, totalSavings]
    );
    return result.rows[0];
  }

  static async addItem(purchaseId, productId, quantity, price) {
    const result = await pool.query(
      'INSERT INTO purchase_items (purchase_id, product_id, quantity, price) VALUES ($1, $2, $3, $4) RETURNING *',
      [purchaseId, productId, quantity, price]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM purchases WHERE user_id = $1 ORDER BY purchase_date DESC',
      [userId]
    );
    return result.rows;
  }
}

