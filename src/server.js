import 'dotenv/config';
import { createServer } from 'http';

// Configurations
import logger from './config/logger.js';
import database from './config/database.js';
import redisClient from './config/redis.js';

// Socket.IO
import { setupSocketIO } from './sockets/index.js';

class Server {
  constructor() {
    this.server = createServer((req, res) => {
      // Ne gérer que les requêtes qui ne sont PAS pour Socket.IO
      if (!req.url.startsWith('/socket.io/')) {
        logger.debug(`HTTP request: ${req.method} ${req.url}`, {
          userAgent: req.headers['user-agent'],
          origin: req.headers.origin
        });
        
        res.writeHead(200, { 
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end('Socket.IO Server Running\n');
      }
      // Laisser Socket.IO gérer ses propres routes
    });
    this.port = process.env.PORT || 3000;
    this.io = null;
  }

  async initializeDatabase() {
    try {
      await database.connect();
      if (database.isConnected) {
        logger.info('Database connected successfully');
      } else {
        logger.warn('Database connection failed, continuing without database');
      }
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      logger.warn('Database failed but not required, continuing without it');
    }
  }

  async initializeRedis() {
    try {
      await redisClient.connect();
      logger.info('Redis connected successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      logger.warn('Redis failed but not required, continuing without it');
    }
  }

  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      try {
        // Fermer les connexions à la base de données
        await database.disconnect();
        logger.info('Database connection closed');

        // Fermer la connexion Redis
        await redisClient.disconnect();
        logger.info('Redis connection closed');

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (shutdownError) {
        logger.error('Error during graceful shutdown:', shutdownError);
        process.exit(1);
      }
    };

    // Enregistrer les handlers pour les signaux de fermeture
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Pour nodemon

    // Gestion des erreurs non capturées
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    logger.info('Graceful shutdown handlers registered');
  }

  async start() {
    try {
      logger.info('Starting Minimal Server...');
      logger.info('⏳ Initializing connections...');

      // Initialisation des connexions
      await this.initializeDatabase();
      await this.initializeRedis();

      logger.info('✅ Connection testing completed');

      // Setup Socket.IO
      this.io = setupSocketIO(this.server);
      logger.info('Socket.IO initialized');

      // Configuration du graceful shutdown
      this.setupGracefulShutdown();

      // Démarrer le serveur HTTP
      this.server.listen(this.port, () => {
        logger.info('🚀 Server running', {
          port: this.port,
          environment: process.env.NODE_ENV || 'development',
          nodeVersion: process.version,
          pid: process.pid
        });

        logger.info('✨ Server ready', {
          websocket: `ws://localhost:${this.port}`,
          database: database.isConnected ? 'connected' : 'disconnected',
          redis: redisClient.isOpen ? 'connected' : 'disconnected'
        });
      });

      // Garder le processus en vie
      setInterval(() => {
        logger.debug('Server heartbeat - connections status:', {
          database: database.isConnected ? 'connected' : 'disconnected',
          redis: redisClient.isOpen ? 'connected' : 'disconnected'
        });
      }, 30000); // Heartbeat toutes les 30 secondes

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Démarrage du serveur
const server = new Server();
server.start().catch((error) => {
  logger.error('Server startup failed:', error);
  process.exit(1);
});