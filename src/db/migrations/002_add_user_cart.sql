-- Tabla para el carrito de compras del usuario (persistencia)
CREATE TABLE IF NOT EXISTS user_cart_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products_cache(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id) -- Un usuario solo puede tener un producto una vez (se actualiza quantity)
);

-- Índice para mejorar performance
CREATE INDEX IF NOT EXISTS idx_user_cart_items_user ON user_cart_items(user_id);


