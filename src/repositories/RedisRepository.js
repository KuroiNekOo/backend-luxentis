import redisClient from '../config/redis.js';
import logger from '../config/logger.js';

export class RedisRepository {
  constructor(keyPrefix = 'app') {
    this.keyPrefix = keyPrefix;
  }

  generateKey(key) {
    return `${this.keyPrefix}:${key}`;
  }

  async set(key, value, expiration = null) {
    try {
      const fullKey = this.generateKey(key);
      await redisClient.set(fullKey, value, expiration);
      logger.debug(`RedisRepository - SET: ${fullKey}`);
      return true;
    } catch (error) {
      logger.error(`RedisRepository - SET error for key ${key}:`, error);
      throw error;
    }
  }

  async get(key) {
    try {
      const fullKey = this.generateKey(key);
      const value = await redisClient.get(fullKey);
      logger.debug(`RedisRepository - GET: ${fullKey}`, { found: value !== null });
      return value;
    } catch (error) {
      logger.error(`RedisRepository - GET error for key ${key}:`, error);
      throw error;
    }
  }

  async delete(key) {
    try {
      const fullKey = this.generateKey(key);
      const result = await redisClient.del(fullKey);
      logger.debug(`RedisRepository - DELETE: ${fullKey}`, { deleted: result === 1 });
      return result === 1;
    } catch (error) {
      logger.error(`RedisRepository - DELETE error for key ${key}:`, error);
      throw error;
    }
  }

  async exists(key) {
    try {
      const fullKey = this.generateKey(key);
      const exists = await redisClient.exists(fullKey);
      return exists;
    } catch (error) {
      logger.error(`RedisRepository - EXISTS error for key ${key}:`, error);
      throw error;
    }
  }

  async expire(key, seconds) {
    try {
      const fullKey = this.generateKey(key);
      const result = await redisClient.expire(fullKey, seconds);
      return result;
    } catch (error) {
      logger.error(`RedisRepository - EXPIRE error for key ${key}:`, error);
      throw error;
    }
  }

  // Méthodes spécialisées pour différents types de données

  async setHash(key, field, value) {
    try {
      const fullKey = this.generateKey(key);
      const client = redisClient.getClient();
      await client.hSet(fullKey, field, JSON.stringify(value));
      logger.debug(`RedisRepository - HSET: ${fullKey}:${field}`);
      return true;
    } catch (error) {
      logger.error(`RedisRepository - HSET error for ${key}:${field}:`, error);
      throw error;
    }
  }

  async getHash(key, field) {
    try {
      const fullKey = this.generateKey(key);
      const client = redisClient.getClient();
      const value = await client.hGet(fullKey, field);
      if (value === null) return null;
      return JSON.parse(value);
    } catch (error) {
      logger.error(`RedisRepository - HGET error for ${key}:${field}:`, error);
      throw error;
    }
  }

  async getAllHash(key) {
    try {
      const fullKey = this.generateKey(key);
      const client = redisClient.getClient();
      const hash = await client.hGetAll(fullKey);
      
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        result[field] = JSON.parse(value);
      }
      return result;
    } catch (error) {
      logger.error(`RedisRepository - HGETALL error for key ${key}:`, error);
      throw error;
    }
  }

  async deleteHash(key, field) {
    try {
      const fullKey = this.generateKey(key);
      const client = redisClient.getClient();
      const result = await client.hDel(fullKey, field);
      return result === 1;
    } catch (error) {
      logger.error(`RedisRepository - HDEL error for ${key}:${field}:`, error);
      throw error;
    }
  }

  async addToList(key, value) {
    try {
      const fullKey = this.generateKey(key);
      const client = redisClient.getClient();
      await client.lPush(fullKey, JSON.stringify(value));
      logger.debug(`RedisRepository - LPUSH: ${fullKey}`);
      return true;
    } catch (error) {
      logger.error(`RedisRepository - LPUSH error for key ${key}:`, error);
      throw error;
    }
  }

  async getList(key, start = 0, end = -1) {
    try {
      const fullKey = this.generateKey(key);
      const client = redisClient.getClient();
      const values = await client.lRange(fullKey, start, end);
      return values.map(value => JSON.parse(value));
    } catch (error) {
      logger.error(`RedisRepository - LRANGE error for key ${key}:`, error);
      throw error;
    }
  }

  async removeFromList(key, count, value) {
    try {
      const fullKey = this.generateKey(key);
      const client = redisClient.getClient();
      const result = await client.lRem(fullKey, count, JSON.stringify(value));
      return result;
    } catch (error) {
      logger.error(`RedisRepository - LREM error for key ${key}:`, error);
      throw error;
    }
  }

  async addToSet(key, value) {
    try {
      const fullKey = this.generateKey(key);
      const client = redisClient.getClient();
      const result = await client.sAdd(fullKey, JSON.stringify(value));
      return result === 1;
    } catch (error) {
      logger.error(`RedisRepository - SADD error for key ${key}:`, error);
      throw error;
    }
  }

  async removeFromSet(key, value) {
    try {
      const fullKey = this.generateKey(key);
      const client = redisClient.getClient();
      const result = await client.sRem(fullKey, JSON.stringify(value));
      return result === 1;
    } catch (error) {
      logger.error(`RedisRepository - SREM error for key ${key}:`, error);
      throw error;
    }
  }

  async getSet(key) {
    try {
      const fullKey = this.generateKey(key);
      const client = redisClient.getClient();
      const values = await client.sMembers(fullKey);
      return values.map(value => JSON.parse(value));
    } catch (error) {
      logger.error(`RedisRepository - SMEMBERS error for key ${key}:`, error);
      throw error;
    }
  }

  async isInSet(key, value) {
    try {
      const fullKey = this.generateKey(key);
      const client = redisClient.getClient();
      const result = await client.sIsMember(fullKey, JSON.stringify(value));
      return result === 1;
    } catch (error) {
      logger.error(`RedisRepository - SISMEMBER error for key ${key}:`, error);
      throw error;
    }
  }
}

// Repository spécialisés
export class CacheRepository extends RedisRepository {
  constructor() {
    super('cache');
  }

  async cacheUser(userId, userData, expiration = 3600) {
    return await this.set(`user:${userId}`, userData, expiration);
  }

  async getCachedUser(userId) {
    return await this.get(`user:${userId}`);
  }

  async invalidateUser(userId) {
    return await this.delete(`user:${userId}`);
  }
}

export class SessionRepository extends RedisRepository {
  constructor() {
    super('session');
  }

  async storeSessionData(sessionId, data, expiration = 86400) {
    return await this.set(`data:${sessionId}`, data, expiration);
  }

  async getSessionData(sessionId) {
    return await this.get(`data:${sessionId}`);
  }

  async deleteSessionData(sessionId) {
    return await this.delete(`data:${sessionId}`);
  }
}

const cacheRepository = new CacheRepository();
const sessionRepository = new SessionRepository();

export { cacheRepository, sessionRepository };
export default RedisRepository;