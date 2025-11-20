-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de productos cacheados
CREATE TABLE IF NOT EXISTS products_cache (
    id SERIAL PRIMARY KEY,
    barcode VARCHAR(255) UNIQUE,
    name VARCHAR(500) NOT NULL,
    brand VARCHAR(255),
    category VARCHAR(255),
    price DECIMAL(10, 2),
    image_url TEXT,
    nutrition_grade VARCHAR(1),
    eco_score VARCHAR(1),
    carbon_footprint DECIMAL(10, 4), -- kg CO2 equivalent
    openfoodfacts_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de listas de compras
CREATE TABLE IF NOT EXISTS shopping_lists (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    budget DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft', -- draft, optimized, completed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de items en listas (lista de deseos)
CREATE TABLE IF NOT EXISTS list_items (
    id SERIAL PRIMARY KEY,
    list_id INTEGER REFERENCES shopping_lists(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products_cache(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    is_optimized BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de compras realizadas (historial)
CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    list_id INTEGER REFERENCES shopping_lists(id) ON DELETE SET NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    total_carbon DECIMAL(10, 4),
    total_savings DECIMAL(10, 2),
    purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de productos en compras
CREATE TABLE IF NOT EXISTS purchase_items (
    id SERIAL PRIMARY KEY,
    purchase_id INTEGER REFERENCES purchases(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products_cache(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL
);

-- Índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products_cache(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name ON products_cache(name);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_user ON shopping_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);

