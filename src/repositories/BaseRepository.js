import database from '../config/database.js';
import logger from '../config/logger.js';

export class BaseRepository {
  constructor(model) {
    this.model = model;
    this.database = database;
  }

  getPrismaClient() {
    return this.database.getClient();
  }

  isAvailable() {
    return this.database.isAvailable();
  }

  async create(data) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Creating record:`, data);
      const result = await prisma[this.model].create({ data });
      logger.debug(`${this.model} - Created record:`, { id: result.id });
      return result;
    }, 'Create');
  }

  // Méthode pour détecter les erreurs de connexion
  isConnectionError(error) {
    return error.code === 'P1001' || // Cannot reach database server
           error.code === 'P1002' || // Database timeout
           error.code === 'P1008' || // Operations timed out
           error.message?.includes('ECONNREFUSED') ||
           error.message?.includes('timeout');
  }

  async findById(id, include = null) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Finding by ID:`, { id });
      const options = { where: { id } };
      if (include) {
        options.include = include;
      }
      return await prisma[this.model].findUnique(options);
    }, 'FindById');
  }

  // Méthode helper pour exécuter les opérations avec gestion d'erreur
  async executeWithReconnect(operation, operationName) {
    try {
      const prisma = this.getPrismaClient();
      if (!prisma) {
        logger.warn(`${this.model} - Database not available for ${operationName} operation`);
        throw new Error('Database not available');
      }

      return await operation(prisma);
    } catch (error) {
      logger.error(`${this.model} - ${operationName} error:`, error);
      
      if (this.isConnectionError(error)) {
        logger.info(`${this.model} - Attempting to reconnect database...`);
        await this.database.reconnect();
      }
      
      throw error;
    }
  }

  async findMany(options = {}) {
    return this.executeWithReconnect(async (prisma) => {
      const {
        where = {},
        include = null,
        orderBy = { createdAt: 'desc' },
        skip = 0,
        take = 10
      } = options;

      logger.debug(`${this.model} - FindMany:`, { where, skip, take });
      
      const queryOptions = {
        where,
        orderBy,
        skip,
        take
      };

      if (include) {
        queryOptions.include = include;
      }

      const [data, total] = await Promise.all([
        prisma[this.model].findMany(queryOptions),
        prisma[this.model].count({ where })
      ]);

      return {
        data,
        total,
        page: Math.floor(skip / take) + 1,
        totalPages: Math.ceil(total / take),
        hasNext: skip + take < total,
        hasPrev: skip > 0
      };
    }, 'FindMany');
  }

  async update(id, data) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Updating:`, { id, data });
      const result = await prisma[this.model].update({
        where: { id },
        data
      });
      logger.debug(`${this.model} - Updated record:`, { id: result.id });
      return result;
    }, 'Update');
  }

  async delete(id) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Deleting:`, { id });
      const result = await prisma[this.model].delete({
        where: { id }
      });
      logger.debug(`${this.model} - Deleted record:`, { id: result.id });
      return result;
    }, 'Delete');
  }

  async exists(where) {
    return this.executeWithReconnect(async (prisma) => {
      const count = await prisma[this.model].count({ where });
      return count > 0;
    }, 'Exists');
  }

  async findFirst(where, include = null) {
    return this.executeWithReconnect(async (prisma) => {
      const options = { where };
      if (include) {
        options.include = include;
      }
      return await prisma[this.model].findFirst(options);
    }, 'FindFirst');
  }

  async upsert(where, create, update) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Upsert:`, { where, create, update });
      const result = await prisma[this.model].upsert({
        where,
        create,
        update
      });
      logger.debug(`${this.model} - Upserted record:`, { id: result.id });
      return result;
    }, 'Upsert');
  }

  async deleteMany(where) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - DeleteMany:`, { where });
      const result = await prisma[this.model].deleteMany({ where });
      logger.debug(`${this.model} - Deleted ${result.count} records`);
      return result;
    }, 'DeleteMany');
  }
}