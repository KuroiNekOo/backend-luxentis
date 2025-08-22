import logger from '../../config/logger.js';
import { withErrorHandling } from '../middlewares/errorMiddleware.js';
import { withValidation } from '../middlewares/validationMiddleware.js';
import { userActionSchema } from '../schemas/exampleSchemas.js';

/**
 * Handler pour les événements User
 * @param {Socket} socket - Socket client
 * @param {Server} io - Serveur Socket.IO
 */
export const setupUserHandler = (socket, io) => {
  logger.info('Setting up User handler', { socketId: socket.id });

  // Canal user:action avec validation et gestion d'erreurs
  socket.on('user:action', 
    withErrorHandling(
      withValidation(
        userActionSchema,
        async (data, callback) => {
          // Logique métier simple : juste logger
          logger.info('User action received', {
            socketId: socket.id,
            userId: data.userId,
            action: data.action,
            message: data.data?.message || 'No message'
          });

          // Réponse de succès
          const response = {
            success: true,
            message: `User action "${data.action}" processed successfully`,
            userId: data.userId,
            timestamp: new Date().toISOString()
          };

          // Callback si fourni
          if (callback) {
            callback(response);
          }

          // Émettre une confirmation
          socket.emit('user:action-confirmed', response);
        },
        'user:action'
      ),
      'user:action'
    )
  );

  logger.info('User handler setup complete', { socketId: socket.id });
};