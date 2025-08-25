import { ZodError } from 'zod';
import logger from '../../config/logger.js';

/**
 * Middleware pour valider les données avec Zod avant d'exécuter le handler
 * @param {ZodSchema} schema - Le schéma Zod pour valider
 * @param {Function} handler - La fonction handler à exécuter après validation
 * @param {string} [eventName] - Le nom de l'événement (optionnel, pour les logs)
 * @returns {Function} - Handler avec validation automatique
 */
export const withValidation = (schema, handler, eventName = 'unknown') => {
  // Validation des paramètres à la construction
  if (!schema || typeof schema?.parse !== 'function') {
    throw new Error(`Invalid schema provided to withValidation for event: ${eventName}`);
  }
  
  if (typeof handler !== 'function') {
    throw new Error(`Invalid handler provided to withValidation for event: ${eventName}`);
  }

  return async (data, callback) => {
    try {
      // Parsing automatique des strings JSON
      let parsedData = data;
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
          logger.debug(`JSON string parsed for ${eventName}`, { original: data, parsed: parsedData });
        } catch (parseError) {
          throw new Error('Invalid JSON format received');
        }
      }

      // Validation des données avec Zod
      const validatedData = schema.parse(parsedData);
      
      logger.debug(`Validation successful for ${eventName}`, {
        eventName,
        validatedData
      });
      
      // Exécuter le handler avec les données validées
      await handler(validatedData, callback);
      
    } catch (error) {
      if (error instanceof ZodError) {
        // Erreur de validation Zod
        const validationErrors = error.errors.map(e => 
          `${e.path.join('.')}: ${e.message}`
        ).join(', ');
        
        logger.warn(`Validation failed for ${eventName}`, {
          eventName,
          validationErrors,
          receivedData: data
        });
        
        if (typeof callback === 'function') {
          callback({
            success: false,
            error: 'Validation failed',
            errorCode: 'VALIDATION_ERROR',
            details: validationErrors,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        // Autres erreurs (handler)
        logger.error(`Handler error for ${eventName}`, {
          eventName,
          error: error.message,
          stack: error.stack
        });
        
        if (typeof callback === 'function') {
          callback({
            success: false,
            error: 'Internal server error',
            errorCode: 'HANDLER_ERROR',
            timestamp: new Date().toISOString()
          });
        }
      }
    }
  };
};