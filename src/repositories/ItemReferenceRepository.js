import { BaseRepository } from './BaseRepository.js';
import logger from '../config/logger.js';

export class ItemReferenceRepository extends BaseRepository {
  constructor() {
    super('itemReference');
  }

  async findByReferenceId(referenceId) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Finding by reference ID:`, { referenceId });
      return await prisma[this.model].findUnique({
        where: { referenceId },
        include: {
          driveAvailableItems: true,
          marketPrice: true
        }
      });
    }, 'FindByReferenceId');
  }

  async findByMaterial(material) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { material },
        include: {
          driveAvailableItems: true,
          marketPrice: true
        },
        orderBy: { displayName: 'asc' }
      });
    }, 'FindByMaterial');
  }

  async findByCategory(category) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { category },
        include: {
          driveAvailableItems: true,
          marketPrice: true
        },
        orderBy: { displayName: 'asc' }
      });
    }, 'FindByCategory');
  }

  async searchItems(searchTerm) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: {
          OR: [
            { displayName: { contains: searchTerm } },
            { description: { contains: searchTerm } },
            { material: { contains: searchTerm } },
            { category: { contains: searchTerm } }
          ]
        },
        include: {
          driveAvailableItems: true,
          marketPrice: true
        },
        orderBy: { displayName: 'asc' }
      });
    }, 'SearchItems');
  }

  async getItemWithFullDetails(itemId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findUnique({
        where: { id: itemId },
        include: {
          driveAvailableItems: true,
          driveOrderItems: {
            include: {
              driveOrder: {
                include: {
                  user: true
                }
              }
            }
          },
          marketPrice: true,
          marketPriceHistory: {
            orderBy: { createdAt: 'desc' },
            take: 30
          }
        }
      });
    }, 'GetItemWithFullDetails');
  }

  async findAvailableInDrive() {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: {
          driveAvailableItems: {
            isNot: null
          }
        },
        include: {
          driveAvailableItems: true
        },
        orderBy: { displayName: 'asc' }
      });
    }, 'FindAvailableInDrive');
  }

  async getMostPopularItems(limit = 10) {
    return this.executeWithReconnect(async (prisma) => {
      const popularItems = await prisma.driveOrderItem.groupBy({
        by: ['itemReferenceId'],
        _sum: {
          quantity: true
        },
        orderBy: {
          _sum: {
            quantity: 'desc'
          }
        },
        take: limit
      });

      const itemIds = popularItems.map(item => item.itemReferenceId);
      
      const items = await prisma[this.model].findMany({
        where: {
          id: { in: itemIds }
        },
        include: {
          driveAvailableItems: true,
          marketPrice: true
        }
      });

      return items.map(item => {
        const popularItem = popularItems.find(p => p.itemReferenceId === item.id);
        return {
          ...item,
          totalOrdered: popularItem._sum.quantity
        };
      });
    }, 'GetMostPopularItems');
  }

  async getItemsByPriceRange(minPrice, maxPrice) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: {
          driveAvailableItems: {
            price: {
              gte: minPrice,
              lte: maxPrice
            }
          }
        },
        include: {
          driveAvailableItems: true,
          marketPrice: true
        },
        orderBy: {
          driveAvailableItems: {
            price: 'asc'
          }
        }
      });
    }, 'GetItemsByPriceRange');
  }
}

const itemReferenceRepository = new ItemReferenceRepository();
export default itemReferenceRepository;