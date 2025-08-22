import { Server } from 'socket.io';
import logger from '../config/logger.js';
import { setupUserHandler } from './handlers/userHandler.js';
import { setupProductHandler } from './handlers/productHandler.js';
import { setupAuthHandler } from './handlers/authHandler.js';

/**
 * Configuration du serveur Socket.IO
 * @param {Server} httpServer - Serveur HTTP
 * @returns {Server} - Instance Socket.IO
 */
export const setupSocketIO = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: true, // Permet toutes les origines
      methods: ['GET', 'POST'],
      credentials: true
    },
    allowEIO3: true, // Compatibilité Engine.IO v3
    transports: ['websocket', 'polling'] // Tous les transports
  });

  // Connexion des clients
  io.on('connection', (socket) => {
    logger.info('Client connected', {
      socketId: socket.id,
      address: socket.handshake.address
    });

    // Setup des handlers par entité
    setupUserHandler(socket, io);
    setupProductHandler(socket, io);
    setupAuthHandler(socket, io);

    // Ping générique pour test
    socket.on('ping', (callback) => {
      logger.debug('Ping received', { socketId: socket.id });
      
      if (callback) {
        callback({
          success: true,
          pong: true,
          timestamp: new Date().toISOString(),
          socketId: socket.id
        });
      }
    });

    // Déconnexion
    socket.on('disconnect', (reason) => {
      logger.info('Client disconnected', {
        socketId: socket.id,
        reason
      });
    });
  });

  // Gestion des erreurs de connexion
  io.engine.on('connection_error', (err) => {
    logger.error('Socket.IO connection error', {
      code: err.code,
      message: err.message,
      context: err.context
    });
  });

  logger.info('Socket.IO server initialized');
  return io;
};