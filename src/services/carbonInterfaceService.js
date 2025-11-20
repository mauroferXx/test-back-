import axios from 'axios';

const CARBON_INTERFACE_BASE_URL = process.env.CARBON_INTERFACE_BASE_URL || 'https://www.carboninterface.com/api/v1';
const API_KEY = process.env.CARBON_INTERFACE_API_KEY;

/**
 * Calcula la huella de carbono de un producto basado en su información
 */
export async function calculateCarbonFootprint(productData) {
  if (!API_KEY) {
    console.warn('Carbon Interface API key not configured, using default values');
    return estimateCarbonFootprint(productData);
  }

  try {
    // Carbon Interface requiere información específica
    // Para productos alimenticios, usamos estimaciones basadas en categoría y origen
    const category = productData.category || '';
    const origin = productData.openfoodfacts_data?.origins || '';
    
    // Intentamos obtener estimación más precisa
    const estimate = estimateCarbonFootprint(productData);
    
    // Si el producto ya tiene carbon_footprint de Open Food Facts, lo usamos
    if (productData.carbon_footprint) {
      return productData.carbon_footprint;
    }

    return estimate;
  } catch (error) {
    console.error('Error calculating carbon footprint:', error.message);
    return estimateCarbonFootprint(productData);
  }
}

/**
 * Estima la huella de carbono basado en categoría y características del producto
 * Valores en kg CO2 equivalente por kg de producto
 */
function estimateCarbonFootprint(productData) {
  const category = (productData.category || '').toLowerCase();
  const grade = productData.eco_score || productData.nutrition_grade || '';

  // Factores de emisión estimados por categoría (kg CO2/kg producto)
  const emissionFactors = {
    'frutas': 0.5,
    'verduras': 0.4,
    'cereales': 1.2,
    'lácteos': 3.2,
    'carne': 27.0,
    'pescado': 5.0,
    'bebidas': 0.3,
    'snacks': 2.5,
    'conservas': 1.8,
    'panadería': 1.5,
    'default': 2.0
  };

  let factor = emissionFactors.default;
  
  for (const [key, value] of Object.entries(emissionFactors)) {
    if (category.includes(key)) {
      factor = value;
      break;
    }
  }

  // Ajuste según eco_score
  const ecoScoreMultiplier = {
    'A': 0.7,
    'B': 0.85,
    'C': 1.0,
    'D': 1.15,
    'E': 1.3,
    'default': 1.0
  };

  const multiplier = ecoScoreMultiplier[grade] || ecoScoreMultiplier.default;
  
  // Estimación para un producto promedio (asumiendo ~500g)
  const estimatedWeight = 0.5; // kg
  return (factor * multiplier * estimatedWeight).toFixed(4);
}

/**
 * Calcula el impacto total de una lista de productos
 */
export function calculateTotalCarbonFootprint(products) {
  return products.reduce((total, product) => {
    const carbon = parseFloat(product.carbon_footprint || 0);
    const quantity = product.quantity || 1;
    return total + (carbon * quantity);
  }, 0);
}

