import { BaseRepository } from './BaseRepository.js';
import logger from '../config/logger.js';

export class BankAccountRepository extends BaseRepository {
  constructor() {
    super('bankAccount');
  }

  async findByOwnerId(ownerId, ownerType) {
    return this.executeWithReconnect(async (prisma) => {
      const where = { ownerType };
      if (ownerType === 'USER') {
        where.userId = ownerId;
      } else if (ownerType === 'COMPANY') {
        where.companyId = ownerId;
      }

      return await prisma[this.model].findMany({
        where,
        include: {
          bankAccountType: true,
          user: ownerType === 'USER',
          company: ownerType === 'COMPANY'
        }
      });
    }, 'FindByOwnerId');
  }

  async findDefaultAccount(ownerId, ownerType) {
    return this.executeWithReconnect(async (prisma) => {
      const where = { 
        ownerType,
        isDefault: true,
        isActive: true
      };
      
      if (ownerType === 'USER') {
        where.userId = ownerId;
      } else if (ownerType === 'COMPANY') {
        where.companyId = ownerId;
      }

      return await prisma[this.model].findFirst({
        where,
        include: {
          bankAccountType: true
        }
      });
    }, 'FindDefaultAccount');
  }

  async updateBalance(accountId, newBalance) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Updating balance:`, { accountId, newBalance });
      return await prisma[this.model].update({
        where: { id: accountId },
        data: { balance: newBalance }
      });
    }, 'UpdateBalance');
  }

  async transfer(fromAccountId, toAccountId, amount) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma.$transaction(async (tx) => {
        // Vérifier les comptes
        const fromAccount = await tx.bankAccount.findUnique({
          where: { id: fromAccountId },
          include: { bankAccountType: true }
        });
        
        const toAccount = await tx.bankAccount.findUnique({
          where: { id: toAccountId }
        });

        if (!fromAccount || !toAccount) {
          throw new Error('One or both accounts not found');
        }

        if (fromAccount.balance < amount) {
          throw new Error('Insufficient funds');
        }

        // Effectuer le transfert
        await tx.bankAccount.update({
          where: { id: fromAccountId },
          data: { balance: { decrement: amount } }
        });

        await tx.bankAccount.update({
          where: { id: toAccountId },
          data: { balance: { increment: amount } }
        });

        return { success: true, transferredAmount: amount };
      });
    }, 'Transfer');
  }

  async findActiveAccounts() {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { isActive: true },
        include: {
          bankAccountType: true,
          user: true,
          company: true
        }
      });
    }, 'FindActiveAccounts');
  }

  async getTotalBalanceByOwner(ownerId, ownerType) {
    return this.executeWithReconnect(async (prisma) => {
      const where = { 
        ownerType,
        isActive: true
      };
      
      if (ownerType === 'USER') {
        where.userId = ownerId;
      } else if (ownerType === 'COMPANY') {
        where.companyId = ownerId;
      }

      const result = await prisma[this.model].aggregate({
        where,
        _sum: {
          balance: true
        }
      });

      return result._sum.balance || 0;
    }, 'GetTotalBalanceByOwner');
  }
}

const bankAccountRepository = new BankAccountRepository();
export default bankAccountRepository;