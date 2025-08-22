import { BaseRepository } from './BaseRepository.js';
import logger from '../config/logger.js';

export class LuxentisUserRepository extends BaseRepository {
  constructor() {
    super('user');
  }

  async findByName(name) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Finding by name:`, { name });
      return await prisma[this.model].findFirst({
        where: { name }
      });
    }, 'FindByName');
  }

  async findActiveUsers() {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' }
      });
    }, 'FindActiveUsers');
  }

  async getUserWithBankAccounts(userId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findUnique({
        where: { id: userId },
        include: {
          bankAccounts: {
            include: {
              bankAccountType: true
            }
          }
        }
      });
    }, 'GetUserWithBankAccounts');
  }

  async getUserWithCompanies(userId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findUnique({
        where: { id: userId },
        include: {
          userCompanies: {
            include: {
              company: true
            }
          }
        }
      });
    }, 'GetUserWithCompanies');
  }

  async getUserFullProfile(userId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findUnique({
        where: { id: userId },
        include: {
          bankAccounts: {
            include: {
              bankAccountType: true
            }
          },
          containers: true,
          userCompanies: {
            include: {
              company: true
            }
          },
          driveOrders: {
            include: {
              driveOrderItems: {
                include: {
                  itemReference: true
                }
              }
            }
          },
          playerZoneState: {
            include: {
              zone: true
            }
          }
        }
      });
    }, 'GetUserFullProfile');
  }
}

const luxentisUserRepository = new LuxentisUserRepository();
export default luxentisUserRepository;