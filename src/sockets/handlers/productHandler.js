import logger from '../../config/logger.js';
import { withErrorHandling } from '../middlewares/errorMiddleware.js';
import { withValidation } from '../middlewares/validationMiddleware.js';
import { productActionSchema } from '../schemas/exampleSchemas.js';

/**
 * Handler pour les événements Product
 * @param {Socket} socket - Socket client
 * @param {Server} io - Serveur Socket.IO
 */
export const setupProductHandler = (socket, io) => {
  logger.info('Setting up Product handler', { socketId: socket.id });

  // Canal product:operation avec validation et gestion d'erreurs
  socket.on('product:operation',
    withErrorHandling(
      withValidation(
        productActionSchema,
        async (data, callback) => {
          // Vérification de la connexion socket pendant l'exécution
          if (!socket.connected) {
            logger.warn('Socket disconnected during product operation', { 
              socketId: socket.id,
              operation: data.operation 
            });
            return;
          }

          // Logique métier simple : juste logger
          logger.info('Product operation received', {
            socketId: socket.id,
            productId: data.productId,
            operation: data.operation,
            payload: data.payload || {}
          });

          // Simuler une opération qui peut échouer parfois
          if (data.operation === 'delete' && data.productId === 'forbidden') {
            throw new Error('Cannot delete forbidden product');
          }

          // Réponse de succès
          const response = {
            success: true,
            message: `Product operation "${data.operation}" completed`,
            productId: data.productId,
            operation: data.operation,
            timestamp: new Date().toISOString()
          };

          // Callback si fourni
          if (callback) {
            callback(response);
          }

          // Broadcaster à tous les autres clients
          socket.broadcast.emit('product:operation-broadcast', {
            ...response,
            fromSocket: socket.id
          });
        },
        'product:operation'
      ),
      'product:operation'
    )
  );

  logger.info('Product handler setup complete', { socketId: socket.id });
};