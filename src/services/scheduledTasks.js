import cron from 'node-cron';
import { validateAllPrices } from './priceValidationService.js';

/**
 * Servicio de Tareas Programadas
 * 
 * Ejecuta tareas automáticas en intervalos regulares
 */

let isRunning = false;

/**
 * Revisa y corrige precios automáticamente
 */
async function autoFixPrices() {
  if (isRunning) {
    console.log('[Scheduled Task] Price validation already running, skipping...');
    return;
  }

  try {
    isRunning = true;
    console.log('[Scheduled Task] Starting automatic price validation and fix...');
    
    const report = await validateAllPrices({
      onlyInvalid: true, // Solo revisar productos con precios inválidos
      fixPrices: true,    // Corregir automáticamente
      limit: null,        // Sin límite, revisar todos
      offset: 0
    });

    console.log('[Scheduled Task] Price validation completed:');
    console.log(`  - Total products reviewed: ${report.totalProducts}`);
    console.log(`  - Valid products: ${report.validProducts}`);
    console.log(`  - Invalid products: ${report.invalidProducts}`);
    console.log(`  - Prices fixed: ${report.fixedPrices.length}`);
    
    if (report.productsWithIssues.length > 0) {
      console.log(`  - Products with issues: ${report.productsWithIssues.length}`);
      console.log(`    - Missing prices: ${report.summary.missingPrice}`);
      console.log(`    - Invalid prices: ${report.summary.invalidPrice}`);
      console.log(`    - Out of range: ${report.summary.outOfRange}`);
      console.log(`    - Mismatch with expected: ${report.summary.mismatchWithExpected}`);
    }
  } catch (error) {
    console.error('[Scheduled Task] Error in automatic price validation:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Inicia las tareas programadas
 * 
 * @param {Object} options - Opciones de configuración
 * @param {string} options.priceValidationCron - Expresión cron para validación de precios (default: '0 2 * * *' = 2 AM diario)
 * @param {boolean} options.enablePriceValidation - Habilitar validación automática de precios (default: true)
 */
export function startScheduledTasks(options = {}) {
  const {
    priceValidationCron = process.env.PRICE_VALIDATION_CRON || '0 2 * * *', // 2 AM diario por defecto
    enablePriceValidation = process.env.ENABLE_AUTO_PRICE_VALIDATION !== 'false'
  } = options;

  console.log('[Scheduled Tasks] Initializing scheduled tasks...');

  // Tarea de validación y corrección automática de precios
  if (enablePriceValidation) {
    // Validar expresión cron
    if (!cron.validate(priceValidationCron)) {
      console.error(`[Scheduled Tasks] Invalid cron expression: ${priceValidationCron}`);
      console.log('[Scheduled Tasks] Using default: 0 2 * * * (daily at 2 AM)');
      cron.schedule('0 2 * * *', autoFixPrices);
    } else {
      console.log(`[Scheduled Tasks] Price validation scheduled: ${priceValidationCron}`);
      cron.schedule(priceValidationCron, autoFixPrices);
    }

    // Ejecutar inmediatamente al iniciar (por defecto: true)
    // Puede desactivarse con RUN_PRICE_VALIDATION_ON_START=false
    const runOnStart = process.env.RUN_PRICE_VALIDATION_ON_START !== 'false';
    
    if (runOnStart) {
      console.log('[Scheduled Tasks] Running initial price validation on startup...');
      // Ejecutar después de 30 segundos para dar tiempo a que la BD esté lista
      setTimeout(() => {
        autoFixPrices().catch(err => {
          console.error('[Scheduled Tasks] Error in initial price validation:', err);
        });
      }, 30000);
    } else {
      console.log('[Scheduled Tasks] Skipping initial price validation on startup (disabled)');
    }
  } else {
    console.log('[Scheduled Tasks] Automatic price validation is disabled');
  }

  console.log('[Scheduled Tasks] Scheduled tasks initialized successfully');
}

/**
 * Detiene todas las tareas programadas
 */
export function stopScheduledTasks() {
  console.log('[Scheduled Tasks] Stopping scheduled tasks...');
  // node-cron no tiene un método directo para detener todas las tareas
  // pero podemos marcar isRunning para evitar nuevas ejecuciones
  isRunning = true;
}

/**
 * Ejecuta la validación de precios manualmente (útil para testing)
 */
export async function runPriceValidationNow() {
  return await autoFixPrices();
}

