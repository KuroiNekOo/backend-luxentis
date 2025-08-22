import { BaseRepository } from './BaseRepository.js';
import logger from '../config/logger.js';

export class ContainerRepository extends BaseRepository {
  constructor() {
    super('container');
  }

  async findByName(name) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Finding by name:`, { name });
      return await prisma[this.model].findUnique({
        where: { name },
        include: {
          user: true,
          company: true,
          containerHistory: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });
    }, 'FindByName');
  }

  async findByOwnerId(ownerId, ownerType) {
    return this.executeWithReconnect(async (prisma) => {
      const where = {};
      if (ownerType === 'USER') {
        where.userId = ownerId;
      } else if (ownerType === 'COMPANY') {
        where.companyId = ownerId;
      }

      return await prisma[this.model].findMany({
        where,
        include: {
          user: true,
          company: true
        },
        orderBy: { createdAt: 'desc' }
      });
    }, 'FindByOwnerId');
  }

  async findByLocation(worldName, x, y, z, radius = 10) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: {
          worldName,
          xCoord: {
            gte: x - radius,
            lte: x + radius
          },
          yCoord: {
            gte: y - radius,
            lte: y + radius
          },
          zCoord: {
            gte: z - radius,
            lte: z + radius
          }
        },
        include: {
          user: true,
          company: true
        }
      });
    }, 'FindByLocation');
  }

  async findByWorld(worldName) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { worldName },
        include: {
          user: true,
          company: true
        },
        orderBy: { createdAt: 'desc' }
      });
    }, 'FindByWorld');
  }

  async updateContent(containerId, newContent, userId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma.$transaction(async (tx) => {
        // Mettre à jour le container
        const updatedContainer = await tx.container.update({
          where: { id: containerId },
          data: { content: newContent }
        });

        // Créer une entrée dans l'historique
        await tx.containerHistory.create({
          data: {
            containerId,
            userId,
            content: newContent
          }
        });

        return updatedContainer;
      });
    }, 'UpdateContent');
  }

  async getContainerWithHistory(containerId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findUnique({
        where: { id: containerId },
        include: {
          user: true,
          company: true,
          containerHistory: {
            include: {
              user: true
            },
            orderBy: { createdAt: 'desc' }
          }
        }
      });
    }, 'GetContainerWithHistory');
  }

  async findByPluginKey(pluginKey) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { pluginKey },
        include: {
          user: true,
          company: true
        }
      });
    }, 'FindByPluginKey');
  }
}

const containerRepository = new ContainerRepository();
export default containerRepository;