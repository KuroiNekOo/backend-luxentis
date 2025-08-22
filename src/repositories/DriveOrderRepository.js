import { BaseRepository } from './BaseRepository.js';
import logger from '../config/logger.js';

export class DriveOrderRepository extends BaseRepository {
  constructor() {
    super('driveOrder');
  }

  async findByUserId(userId, options = {}) {
    return this.executeWithReconnect(async (prisma) => {
      const { includeItems = true, delivered = null } = options;
      
      const where = { userId };
      if (delivered !== null) {
        where.delivered = delivered;
      }

      return await prisma[this.model].findMany({
        where,
        include: {
          user: true,
          driveOrderItems: includeItems ? {
            include: {
              itemReference: true
            }
          } : false
        },
        orderBy: { createdAt: 'desc' }
      });
    }, 'FindByUserId');
  }

  async findPendingOrders() {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { delivered: false },
        include: {
          user: true,
          driveOrderItems: {
            include: {
              itemReference: true
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      });
    }, 'FindPendingOrders');
  }

  async createOrderWithItems(userId, items) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma.$transaction(async (tx) => {
        // Créer la commande
        const order = await tx.driveOrder.create({
          data: {
            userId,
            delivered: false
          }
        });

        // Ajouter les items
        const orderItems = await Promise.all(
          items.map(item => 
            tx.driveOrderItem.create({
              data: {
                driveOrderId: order.id,
                itemReferenceId: item.itemReferenceId,
                quantity: item.quantity
              }
            })
          )
        );

        return {
          ...order,
          driveOrderItems: orderItems
        };
      });
    }, 'CreateOrderWithItems');
  }

  async markAsDelivered(orderId) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Marking as delivered:`, { orderId });
      return await prisma[this.model].update({
        where: { id: orderId },
        data: {
          delivered: true,
          deliveredAt: new Date()
        }
      });
    }, 'MarkAsDelivered');
  }

  async getOrderWithItems(orderId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findUnique({
        where: { id: orderId },
        include: {
          user: true,
          driveOrderItems: {
            include: {
              itemReference: {
                include: {
                  driveAvailableItems: true
                }
              }
            }
          }
        }
      });
    }, 'GetOrderWithItems');
  }

  async getOrderStats(startDate, endDate) {
    return this.executeWithReconnect(async (prisma) => {
      const orders = await prisma[this.model].findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        include: {
          driveOrderItems: {
            include: {
              itemReference: {
                include: {
                  driveAvailableItems: true
                }
              }
            }
          }
        }
      });

      const stats = {
        totalOrders: orders.length,
        deliveredOrders: orders.filter(o => o.delivered).length,
        pendingOrders: orders.filter(o => !o.delivered).length,
        totalValue: 0,
        totalItems: 0,
        mostOrderedItems: {}
      };

      orders.forEach(order => {
        order.driveOrderItems.forEach(item => {
          stats.totalItems += item.quantity;
          
          if (item.itemReference.driveAvailableItems) {
            stats.totalValue += parseFloat(item.itemReference.driveAvailableItems.price) * item.quantity;
          }

          const itemName = item.itemReference.displayName || item.itemReference.material;
          stats.mostOrderedItems[itemName] = (stats.mostOrderedItems[itemName] || 0) + item.quantity;
        });
      });

      return stats;
    }, 'GetOrderStats');
  }

  async getUserOrderHistory(userId, limit = 10) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { userId },
        include: {
          driveOrderItems: {
            include: {
              itemReference: {
                include: {
                  driveAvailableItems: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit
      });
    }, 'GetUserOrderHistory');
  }
}

const driveOrderRepository = new DriveOrderRepository();
export default driveOrderRepository;