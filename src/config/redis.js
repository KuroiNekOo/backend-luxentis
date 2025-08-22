import { createClient } from 'redis';
import logger from './logger.js';

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isEnabled = process.env.REDIS_ENABLED !== 'false'; // Permet de désactiver Redis
    this.connectionRetries = 0;
    this.maxRetries = parseInt(process.env.REDIS_MAX_RETRIES) || 5;
    this.reconnectInterval = null; // Pour les reconnexions périodiques
  }

  async connect() {
    if (!this.isEnabled) {
      logger.warn('Redis is disabled by configuration');
      return null;
    }

    try {
      this.client = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          connectTimeout: 5000,
          // Stratégie de reconnexion automatique avec backoff exponentiel
          reconnectStrategy: (retries) => {
            // Utiliser la variable d'environnement pour le nombre max de retries
            const maxRetries = parseInt(process.env.REDIS_MAX_RETRIES) || 10;
            
            // Arrêter après maxRetries tentatives
            if (retries > maxRetries) {
              logger.error(`Redis reconnection failed after ${maxRetries} attempts - running in degraded mode`);
              logger.warn('🔄 Redis degraded mode activated: sessions will use memory store, cache operations disabled');
              this.startPeriodicReconnection(); // Démarrer les tentatives périodiques
              return false;
            }
            
            logger.info(`Redis reconnection attempt ${retries}/${maxRetries}`);
            // Backoff exponentiel: 100ms, 200ms, 400ms, 800ms, 1600ms, puis max 5s
            return Math.min(retries * 100, 5000);
          }
        },
        username: process.env.REDIS_USERNAME || undefined,
        password: process.env.REDIS_PASSWORD || undefined,
        // Configuration des retry pour les commandes individuelles
        retryDelayOnFailover: 100,    // 100ms entre les tentatives lors d'un failover
        maxRetriesPerRequest: 3,      // 3 tentatives par commande Redis
        lazyConnect: false            // Connexion immédiate au démarrage
      });

      this.client.on('error', (err) => {
        logger.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis Client Connected');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        logger.warn('Redis Client Disconnected');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        logger.info('Redis Client Reconnecting');
      });

      // Connexion initiale - une seule tentative
      await this.client.connect();
      logger.info('Successfully connected to Redis');
      
      return this.client;
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      
      // Vérifier si Redis est requis au démarrage
      if (process.env.REDIS_REQUIRED === 'true') {
        logger.error('Redis is required but connection failed at startup');
        throw error; // Fail fast si Redis est critique
      } else {
        logger.warn('Redis failed but not required, continuing without it');
        this.isEnabled = false;
        return null;
      }
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      logger.info('Redis connection closed');
    }
    
    // Arrêter les tentatives périodiques
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
      logger.debug('Periodic reconnection stopped');
    }
  }

  // Démarrer les tentatives de reconnexion périodiques après échec de la stratégie native
  startPeriodicReconnection() {
    if (this.reconnectInterval) return; // Éviter les doublons
    
    logger.info('🔄 Starting periodic Redis reconnection attempts (every 30s)');
    
    this.reconnectInterval = setInterval(async () => {
      if (!this.isConnected && this.isEnabled) {
        logger.info('⏰ Attempting periodic Redis reconnection...');
        try {
          // Recréer le client pour éviter les problèmes d'état
          await this.connect();
          
          // Si succès, arrêter les tentatives périodiques
          if (this.isConnected) {
            logger.info('✅ Periodic reconnection successful - Redis back online!');
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
          }
        } catch (error) {
          logger.debug('⏱️  Periodic reconnection failed, will retry in 30s');
        }
      }
    }, 30000); // Toutes les 30 secondes
  }

  getClient() {
    if (!this.isEnabled) {
      return null;
    }
    if (!this.client || !this.isConnected) {
      logger.warn('Redis client not connected, operations will be skipped');
      return null;
    }
    return this.client;
  }

  async set(key, value, expiration = null) {
    try {
      const client = this.getClient();
      if (!client) {
        logger.debug('Redis not available, skipping SET operation');
        return false;
      }
      
      const serializedValue = JSON.stringify(value);
      
      if (expiration) {
        await client.setEx(key, expiration, serializedValue);
      } else {
        await client.set(key, serializedValue);
      }
      
      logger.debug(`Redis SET: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Redis SET error for key ${key}:`, error);
      return false;
    }
  }

  async get(key) {
    try {
      const client = this.getClient();
      if (!client) {
        logger.debug('Redis not available, skipping GET operation');
        return null;
      }
      
      const value = await client.get(key);
      
      if (value === null) {
        return null;
      }
      
      logger.debug(`Redis GET: ${key}`);
      return JSON.parse(value);
    } catch (error) {
      logger.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  async del(key) {
    try {
      const client = this.getClient();
      if (!client) {
        logger.debug('Redis not available, skipping DEL operation');
        return 0;
      }
      
      const result = await client.del(key);
      logger.debug(`Redis DEL: ${key}`);
      return result;
    } catch (error) {
      logger.error(`Redis DEL error for key ${key}:`, error);
      return 0;
    }
  }

  async exists(key) {
    try {
      const client = this.getClient();
      if (!client) {
        logger.debug('Redis not available, skipping EXISTS operation');
        return false;
      }
      
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  async expire(key, seconds) {
    try {
      const client = this.getClient();
      if (!client) {
        logger.debug('Redis not available, skipping EXPIRE operation');
        return false;
      }
      
      const result = await client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      logger.error(`Redis EXPIRE error for key ${key}:`, error);
      return false;
    }
  }

  async flushAll() {
    try {
      const client = this.getClient();
      if (!client) {
        logger.debug('Redis not available, skipping FLUSHALL operation');
        return false;
      }
      
      await client.flushAll();
      logger.info('Redis: All data flushed');
      return true;
    } catch (error) {
      logger.error('Redis FLUSHALL error:', error);
      return false;
    }
  }
}

const redisInstance = new RedisClient();

export default redisInstance;