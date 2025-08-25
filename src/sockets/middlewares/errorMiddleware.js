import logger from '../../config/logger.js';

/**
 * Middleware pour encapsuler les handlers et gérer les erreurs async/sync
 * @param {Function} handler - La fonction handler à protéger
 * @param {string} [eventName] - Le nom de l'événement (optionnel, pour les logs)
 * @returns {Function} - Handler protégé contre les erreurs
 */
export const withErrorHandling = (handler, eventName = 'unknown') => {
  // Validation des paramètres à la construction
  if (typeof handler !== 'function') {
    throw new Error(`Invalid handler provided to withErrorHandling for event: ${eventName}`);
  }

  return async (data, callback) => {
    try {
      // Validation des paramètres à l'exécution
      if (callback && typeof callback !== 'function') {
        throw new Error(`Invalid callback provided for event: ${eventName}`);
      }

      // Exécuter le handler
      await handler(data, callback);
    } catch (error) {
      logger.error(`Error in ${eventName} handler`, {
        eventName,
        error: error.message,
        stack: error.stack,
        data: typeof data === 'object' ? JSON.stringify(data) : data
      });

      // Répondre avec une erreur si callback fourni
      if (typeof callback === 'function') {
        callback({
          success: false,
          error: 'Internal server error',
          errorCode: 'HANDLER_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  };
};