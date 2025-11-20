-- Agregar campo password a usuarios (si no existe)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'password'
    ) THEN
        ALTER TABLE users ADD COLUMN password VARCHAR(255);
    END IF;
END $$;

-- Crear usuario TEST por defecto (si no existe)
INSERT INTO users (id, email, name, password)
VALUES (1, 'test@example.com', 'Usuario TEST', 'test123')
ON CONFLICT (id) DO UPDATE 
SET email = EXCLUDED.email, 
    name = EXCLUDED.name,
    password = EXCLUDED.password;

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


