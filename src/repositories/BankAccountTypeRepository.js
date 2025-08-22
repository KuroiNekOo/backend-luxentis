import { BaseRepository } from './BaseRepository.js';
import logger from '../config/logger.js';

export class BankAccountTypeRepository extends BaseRepository {
  constructor() {
    super('bankAccountType');
  }

  async findByName(name) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Finding by name:`, { name });
      return await prisma[this.model].findFirst({
        where: { name }
      });
    }, 'FindByName');
  }

  async findAllWithAccounts() {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        include: {
          bankAccounts: {
            where: { isActive: true }
          }
        },
        orderBy: { name: 'asc' }
      });
    }, 'FindAllWithAccounts');
  }

  async getAccountTypeStats(typeId) {
    return this.executeWithReconnect(async (prisma) => {
      const accountType = await prisma[this.model].findUnique({
        where: { id: typeId },
        include: {
          bankAccounts: {
            where: { isActive: true }
          }
        }
      });

      if (!accountType) {
        return null;
      }

      const totalBalance = accountType.bankAccounts.reduce(
        (sum, account) => sum + parseFloat(account.balance), 
        0
      );

      return {
        ...accountType,
        totalAccounts: accountType.bankAccounts.length,
        totalBalance,
        averageBalance: accountType.bankAccounts.length > 0 
          ? totalBalance / accountType.bankAccounts.length 
          : 0
      };
    }, 'GetAccountTypeStats');
  }

  async findByInterestRateRange(minRate, maxRate) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: {
          interestRate: {
            gte: minRate,
            lte: maxRate
          }
        },
        orderBy: { interestRate: 'desc' }
      });
    }, 'FindByInterestRateRange');
  }
}

const bankAccountTypeRepository = new BankAccountTypeRepository();
export default bankAccountTypeRepository;