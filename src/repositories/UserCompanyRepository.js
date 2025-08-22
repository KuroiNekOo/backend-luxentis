import { BaseRepository } from './BaseRepository.js';
import logger from '../config/logger.js';

export class UserCompanyRepository extends BaseRepository {
  constructor() {
    super('userCompany');
  }

  async findByUserId(userId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { userId },
        include: {
          company: true
        },
        orderBy: { createdAt: 'desc' }
      });
    }, 'FindByUserId');
  }

  async findByCompanyId(companyId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { companyId },
        include: {
          user: true
        },
        orderBy: { createdAt: 'desc' }
      });
    }, 'FindByCompanyId');
  }

  async findByUserAndCompany(userId, companyId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findUnique({
        where: {
          userId_companyId: {
            userId,
            companyId
          }
        },
        include: {
          user: true,
          company: true
        }
      });
    }, 'FindByUserAndCompany');
  }

  async findActiveEmployees(companyId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: {
          companyId,
          isActive: true
        },
        include: {
          user: true
        },
        orderBy: { status: 'desc' }
      });
    }, 'FindActiveEmployees');
  }

  async findOwners(companyId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: {
          companyId,
          status: 'OWNER'
        },
        include: {
          user: true
        }
      });
    }, 'FindOwners');
  }

  async updateSalary(userId, companyId, newSalary) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Updating salary:`, { userId, companyId, newSalary });
      return await prisma[this.model].update({
        where: {
          userId_companyId: {
            userId,
            companyId
          }
        },
        data: { salary: newSalary }
      });
    }, 'UpdateSalary');
  }

  async promoteToOwner(userId, companyId) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Promoting to owner:`, { userId, companyId });
      return await prisma[this.model].update({
        where: {
          userId_companyId: {
            userId,
            companyId
          }
        },
        data: { status: 'OWNER' }
      });
    }, 'PromoteToOwner');
  }

  async demoteToEmployee(userId, companyId) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Demoting to employee:`, { userId, companyId });
      return await prisma[this.model].update({
        where: {
          userId_companyId: {
            userId,
            companyId
          }
        },
        data: { status: 'EMPLOYEE' }
      });
    }, 'DemoteToEmployee');
  }

  async deactivateEmployee(userId, companyId) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Deactivating employee:`, { userId, companyId });
      return await prisma[this.model].update({
        where: {
          userId_companyId: {
            userId,
            companyId
          }
        },
        data: { isActive: false }
      });
    }, 'DeactivateEmployee');
  }

  async reactivateEmployee(userId, companyId) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Reactivating employee:`, { userId, companyId });
      return await prisma[this.model].update({
        where: {
          userId_companyId: {
            userId,
            companyId
          }
        },
        data: { isActive: true }
      });
    }, 'ReactivateEmployee');
  }

  async getCompanyPayroll(companyId) {
    return this.executeWithReconnect(async (prisma) => {
      const employees = await prisma[this.model].findMany({
        where: {
          companyId,
          isActive: true
        },
        include: {
          user: true
        }
      });

      const totalSalary = employees.reduce((sum, emp) => sum + parseFloat(emp.salary), 0);
      
      return {
        employees,
        totalEmployees: employees.length,
        totalSalary,
        averageSalary: employees.length > 0 ? totalSalary / employees.length : 0,
        owners: employees.filter(emp => emp.status === 'OWNER').length,
        regularEmployees: employees.filter(emp => emp.status === 'EMPLOYEE').length
      };
    }, 'GetCompanyPayroll');
  }

  async findTopEarners(limit = 10) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { isActive: true },
        include: {
          user: true,
          company: true
        },
        orderBy: { salary: 'desc' },
        take: limit
      });
    }, 'FindTopEarners');
  }

  async getSalaryStatistics() {
    return this.executeWithReconnect(async (prisma) => {
      const stats = await prisma[this.model].aggregate({
        where: { isActive: true },
        _avg: { salary: true },
        _max: { salary: true },
        _min: { salary: true },
        _count: { userId: true }
      });

      const statusStats = await prisma[this.model].groupBy({
        by: ['status'],
        where: { isActive: true },
        _count: { userId: true },
        _avg: { salary: true }
      });

      return {
        overall: {
          totalEmployees: stats._count.userId,
          averageSalary: stats._avg.salary,
          highestSalary: stats._max.salary,
          lowestSalary: stats._min.salary
        },
        byStatus: statusStats.reduce((acc, stat) => {
          acc[stat.status] = {
            count: stat._count.userId,
            averageSalary: stat._avg.salary
          };
          return acc;
        }, {})
      };
    }, 'GetSalaryStatistics');
  }
}

const userCompanyRepository = new UserCompanyRepository();
export default userCompanyRepository;