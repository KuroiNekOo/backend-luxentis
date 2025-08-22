import { BaseRepository } from './BaseRepository.js';
import logger from '../config/logger.js';

export class MarketPriceRepository extends BaseRepository {
  constructor() {
    super('marketPrice');
  }

  async findByItemReferenceId(itemReferenceId) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Finding by item reference ID:`, { itemReferenceId });
      return await prisma[this.model].findUnique({
        where: { itemReferenceId },
        include: {
          itemReference: true
        }
      });
    }, 'FindByItemReferenceId');
  }

  async updatePrice(itemReferenceId, newPrice) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma.$transaction(async (tx) => {
        // Mettre à jour le prix actuel
        const updatedPrice = await tx.marketPrice.upsert({
          where: { itemReferenceId },
          create: {
            itemReferenceId,
            price: newPrice,
            lastUpdated: new Date()
          },
          update: {
            price: newPrice,
            lastUpdated: new Date()
          }
        });

        // Ajouter une entrée dans l'historique
        await tx.marketPriceHistory.create({
          data: {
            itemReferenceId,
            price: newPrice,
            demand: 0, // À calculer selon la logique métier
            supply: 0, // À calculer selon la logique métier
            createdAt: new Date()
          }
        });

        return updatedPrice;
      });
    }, 'UpdatePrice');
  }

  async getPriceHistory(itemReferenceId, days = 30) {
    return this.executeWithReconnect(async (prisma) => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      return await prisma.marketPriceHistory.findMany({
        where: {
          itemReferenceId,
          createdAt: {
            gte: startDate
          }
        },
        include: {
          itemReference: true
        },
        orderBy: { createdAt: 'asc' }
      });
    }, 'GetPriceHistory');
  }

  async getTopPricedItems(limit = 10) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        include: {
          itemReference: true
        },
        orderBy: { price: 'desc' },
        take: limit
      });
    }, 'GetTopPricedItems');
  }

  async getPricesByPriceRange(minPrice, maxPrice) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: {
          price: {
            gte: minPrice,
            lte: maxPrice
          }
        },
        include: {
          itemReference: true
        },
        orderBy: { price: 'asc' }
      });
    }, 'GetPricesByPriceRange');
  }

  async getRecentlyUpdatedPrices(hours = 24) {
    return this.executeWithReconnect(async (prisma) => {
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - hours);

      return await prisma[this.model].findMany({
        where: {
          lastUpdated: {
            gte: startDate
          }
        },
        include: {
          itemReference: true
        },
        orderBy: { lastUpdated: 'desc' }
      });
    }, 'GetRecentlyUpdatedPrices');
  }

  async getPriceStatistics() {
    return this.executeWithReconnect(async (prisma) => {
      const stats = await prisma[this.model].aggregate({
        _avg: { price: true },
        _max: { price: true },
        _min: { price: true },
        _count: { itemReferenceId: true }
      });

      return {
        averagePrice: stats._avg.price,
        highestPrice: stats._max.price,
        lowestPrice: stats._min.price,
        totalItems: stats._count.itemReferenceId
      };
    }, 'GetPriceStatistics');
  }

  async searchItemsByName(searchTerm) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: {
          itemReference: {
            OR: [
              { displayName: { contains: searchTerm } },
              { material: { contains: searchTerm } }
            ]
          }
        },
        include: {
          itemReference: true
        },
        orderBy: { price: 'asc' }
      });
    }, 'SearchItemsByName');
  }

  async updatePriceWithSupplyDemand(itemReferenceId, newPrice, supply, demand) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma.$transaction(async (tx) => {
        // Mettre à jour le prix actuel
        const updatedPrice = await tx.marketPrice.upsert({
          where: { itemReferenceId },
          create: {
            itemReferenceId,
            price: newPrice,
            lastUpdated: new Date()
          },
          update: {
            price: newPrice,
            lastUpdated: new Date()
          }
        });

        // Ajouter une entrée dans l'historique avec supply/demand
        await tx.marketPriceHistory.create({
          data: {
            itemReferenceId,
            price: newPrice,
            demand,
            supply,
            createdAt: new Date()
          }
        });

        return updatedPrice;
      });
    }, 'UpdatePriceWithSupplyDemand');
  }
}

const marketPriceRepository = new MarketPriceRepository();
export default marketPriceRepository;