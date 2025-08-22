import { PrismaClient } from '@prisma/client';
import logger from './logger.js';

class Database {
  constructor() {
    this.prisma = null;
    this.isConnected = false;
    this.isEnabled = process.env.DATABASE_ENABLED !== 'false'; // Permet de désactiver la DB
    this.connectionRetries = 0;
    this.maxRetries = parseInt(process.env.DATABASE_MAX_RETRIES) || 5;
  }

  async connect() {
    if (!this.isEnabled) {
      logger.warn('Database is disabled by configuration');
      return null;
    }

    try {
      // Vérifier si Prisma est généré en essayant d'importer le client
      try {
        this.prisma = new PrismaClient({
          log: [
            {
              emit: 'event',
              level: 'query'
            },
            {
              emit: 'event',
              level: 'error'
            },
            {
              emit: 'event',
              level: 'info'
            },
            {
              emit: 'event',
              level: 'warn'
            }
          ],
          errorFormat: 'pretty'
        });
      } catch (prismaError) {
        if (prismaError.message?.includes('did not initialize yet')) {
          logger.error('Prisma client not generated. Please run "npm run db:generate" first');
          this.isEnabled = false;
          return null;
        }
        throw prismaError;
      }

      // Log Prisma events
      this.prisma.$on('query', (e) => {
        if (process.env.NODE_ENV === 'development') {
          logger.debug('Prisma Query:', {
            query: e.query,
            params: e.params,
            duration: `${e.duration}ms`
          });
        }
      });

      this.prisma.$on('error', (e) => {
        logger.error('Prisma Error:', e);
        this.isConnected = false;
      });

      this.prisma.$on('info', (e) => {
        logger.info('Prisma Info:', e);
      });

      this.prisma.$on('warn', (e) => {
        logger.warn('Prisma Warning:', e);
      });

      // Test connection avec timeout
      const connectPromise = this.prisma.$connect();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database connection timeout')), 10000);
      });

      await Promise.race([connectPromise, timeoutPromise]);
      this.isConnected = true;
      this.connectionRetries = 0; // Reset compteur sur succès
      logger.info('Successfully connected to MySQL database');
      
      return this.prisma;
    } catch (error) {
      this.connectionRetries++;
      logger.error(`Failed to connect to database (attempt ${this.connectionRetries}/${this.maxRetries}):`, error);
      
      // Essayer toutes les tentatives avant d'abandonner
      if (this.connectionRetries < this.maxRetries) {
        const retryDelay = process.env.NODE_ENV === 'development' ? 2000 : 10000; // Plus rapide en dev
        logger.info(`Retrying database connection in ${retryDelay/1000} seconds (attempt ${this.connectionRetries + 1}/${this.maxRetries})...`);
        
        // Attendre et réessayer de manière synchrone
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return await this.connect(); // Récursif mais synchrone
      }
      
      // Après max retries, vérifier si la base de données est requise
      if (process.env.DATABASE_REQUIRED === 'true') {
        logger.error('Database is required but connection failed after all retries');
        throw error; // Fail fast si la DB est critique
      } else {
        logger.warn('Database failed but not required, continuing without it');
        this.isEnabled = false;
        return null;
      }
    }
  }

  async disconnect() {
    if (this.prisma && this.isConnected) {
      await this.prisma.$disconnect();
      this.isConnected = false;
      logger.info('Database connection closed');
    }
  }

  getClient() {
    if (!this.isEnabled) {
      logger.warn('Database is disabled, returning null client');
      return null;
    }
    if (!this.prisma || !this.isConnected) {
      logger.warn('Database not connected, operations will fail gracefully');
      return null;
    }
    return this.prisma;
  }

  async healthCheck() {
    try {
      if (!this.isEnabled || !this.prisma || !this.isConnected) {
        return { 
          status: 'disabled', 
          message: 'Database is disabled or not connected',
          timestamp: new Date().toISOString() 
        };
      }
      
      // Utiliser le wrapper pour la reconnexion automatique
      const result = await this.executeWithReconnection(async (prisma) => {
        await prisma.$queryRaw`SELECT 1`;
        return { status: 'healthy', timestamp: new Date().toISOString() };
      });
      
      return result || { status: 'unhealthy', error: 'Database not available', timestamp: new Date().toISOString() };
    } catch (error) {
      logger.error('Database health check failed:', error);
      this.isConnected = false;
      return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
    }
  }

  // Méthode pour vérifier si la DB est disponible
  isAvailable() {
    return this.isEnabled && this.isConnected && this.prisma;
  }

  // Méthode pour essayer de reconnecter manuellement
  async reconnect() {
    if (!this.isEnabled) {
      logger.warn('Cannot reconnect: database is disabled');
      return false;
    }

    logger.info('Attempting manual database reconnection...');
    try {
      await this.disconnect();
      this.connectionRetries = 0; // Reset retry counter
      await this.connect();
      return this.isConnected;
    } catch (error) {
      logger.error('Manual reconnection failed:', error);
      return false;
    }
  }

  // Wrapper pour les opérations Prisma avec reconnexion automatique
  async executeWithReconnection(operation) {
    if (!this.isAvailable()) {
      logger.warn('Database not available, skipping operation');
      return null;
    }

    try {
      return await operation(this.prisma);
    } catch (error) {
      // Détecter les erreurs de connexion Prisma
      if (error.code === 'P1001' || error.code === 'P1017' || error.code === 'P1008') {
        logger.warn('Database connection lost, attempting reconnection...', { 
          errorCode: error.code, 
          message: error.message 
        });
        
        // Tentative de reconnexion automatique
        const reconnected = await this.reconnect();
        
        if (reconnected) {
          logger.info('Database reconnected successfully, retrying operation...');
          try {
            return await operation(this.prisma);
          } catch (retryError) {
            logger.error('Operation failed after successful reconnection:', retryError);
            throw retryError;
          }
        } else {
          logger.error('Failed to reconnect to database');
          throw error;
        }
      }
      
      // Pour les autres erreurs, les propager directement
      throw error;
    }
  }

}

const database = new Database();

export default database;