import { BaseRepository } from './BaseRepository.js';
import logger from '../config/logger.js';

export class ZoneRepository extends BaseRepository {
  constructor() {
    super('zone');
  }

  async findByStatus(status) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { status },
        include: {
          playerZoneStates: {
            include: {
              user: true
            }
          }
        },
        orderBy: { scheduledStart: 'asc' }
      });
    }, 'FindByStatus');
  }

  async findByWorld(world) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { world },
        orderBy: { scheduledStart: 'desc' }
      });
    }, 'FindByWorld');
  }

  async findByOwner(ownerUuid) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { ownerUuid },
        orderBy: { createdAt: 'desc' }
      });
    }, 'FindByOwner');
  }

  async findActiveZones() {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { status: 'ACTIVE' },
        include: {
          playerZoneStates: {
            include: {
              user: true
            }
          }
        },
        orderBy: { startedAt: 'desc' }
      });
    }, 'FindActiveZones');
  }

  async findUpcomingZones() {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { 
          status: 'PENDING',
          scheduledStart: {
            gte: new Date()
          }
        },
        orderBy: { scheduledStart: 'asc' }
      });
    }, 'FindUpcomingZones');
  }

  async startZone(zoneId) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Starting zone:`, { zoneId });
      return await prisma[this.model].update({
        where: { id: zoneId },
        data: {
          status: 'ACTIVE',
          startedAt: new Date()
        }
      });
    }, 'StartZone');
  }

  async endZone(zoneId, ownerUuid = null) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Ending zone:`, { zoneId, ownerUuid });
      return await prisma[this.model].update({
        where: { id: zoneId },
        data: {
          status: 'EXPIRED',
          endedAt: new Date(),
          ownerUuid
        }
      });
    }, 'EndZone');
  }

  async findByBiome(biome) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { biome },
        orderBy: { createdAt: 'desc' }
      });
    }, 'FindByBiome');
  }

  async findByPriceRange(minPrice, maxPrice) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: {
          startingPrice: {
            gte: minPrice,
            lte: maxPrice
          }
        },
        orderBy: { startingPrice: 'asc' }
      });
    }, 'FindByPriceRange');
  }

  async getZoneStatistics() {
    return this.executeWithReconnect(async (prisma) => {
      const stats = await prisma[this.model].groupBy({
        by: ['status'],
        _count: {
          id: true
        }
      });

      const priceStats = await prisma[this.model].aggregate({
        _avg: { startingPrice: true },
        _max: { startingPrice: true },
        _min: { startingPrice: true }
      });

      return {
        statusCounts: stats.reduce((acc, stat) => {
          acc[stat.status] = stat._count.id;
          return acc;
        }, {}),
        priceStatistics: {
          averageStartingPrice: priceStats._avg.startingPrice,
          highestStartingPrice: priceStats._max.startingPrice,
          lowestStartingPrice: priceStats._min.startingPrice
        }
      };
    }, 'GetZoneStatistics');
  }

  async findExpiredZones(days = 30) {
    return this.executeWithReconnect(async (prisma) => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      return await prisma[this.model].findMany({
        where: {
          status: 'EXPIRED',
          endedAt: {
            gte: startDate
          }
        },
        orderBy: { endedAt: 'desc' }
      });
    }, 'FindExpiredZones');
  }

  async getZoneWithPlayers(zoneId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findUnique({
        where: { id: zoneId },
        include: {
          playerZoneStates: {
            include: {
              user: true
            }
          }
        }
      });
    }, 'GetZoneWithPlayers');
  }

  async findZonesByChunkCount(minChunks, maxChunks) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: {
          chunkCount: {
            gte: minChunks,
            lte: maxChunks
          }
        },
        orderBy: { chunkCount: 'desc' }
      });
    }, 'FindZonesByChunkCount');
  }
}

const zoneRepository = new ZoneRepository();
export default zoneRepository;