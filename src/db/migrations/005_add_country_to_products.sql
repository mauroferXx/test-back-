-- Agregar campo country a products_cache para optimizar búsquedas por país
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products_cache' AND column_name = 'country'
    ) THEN
        ALTER TABLE products_cache ADD COLUMN country VARCHAR(100);
        
        -- Crear índice para mejorar búsquedas por país
        CREATE INDEX IF NOT EXISTS idx_products_country ON products_cache(country);
        
        -- Crear índice compuesto para búsquedas por nombre y país
        CREATE INDEX IF NOT EXISTS idx_products_name_country ON products_cache(name, country);
    END IF;
END $$;

