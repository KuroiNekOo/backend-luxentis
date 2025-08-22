import { BaseRepository } from './BaseRepository.js';
import logger from '../config/logger.js';

export class CompanyRepository extends BaseRepository {
  constructor() {
    super('company');
  }

  async findByName(name) {
    return this.executeWithReconnect(async (prisma) => {
      logger.debug(`${this.model} - Finding by name:`, { name });
      return await prisma[this.model].findFirst({
        where: { name }
      });
    }, 'FindByName');
  }

  async findActiveCompanies() {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { isActive: true },
        orderBy: { level: 'desc' }
      });
    }, 'FindActiveCompanies');
  }

  async getCompanyWithEmployees(companyId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findUnique({
        where: { id: companyId },
        include: {
          userCompanies: {
            include: {
              user: true
            }
          }
        }
      });
    }, 'GetCompanyWithEmployees');
  }

  async getCompanyWithBankAccounts(companyId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findUnique({
        where: { id: companyId },
        include: {
          bankAccounts: {
            include: {
              bankAccountType: true
            }
          }
        }
      });
    }, 'GetCompanyWithBankAccounts');
  }

  async getCompanyFullProfile(companyId) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findUnique({
        where: { id: companyId },
        include: {
          bankAccounts: {
            include: {
              bankAccountType: true
            }
          },
          containers: true,
          userCompanies: {
            include: {
              user: true
            }
          }
        }
      });
    }, 'GetCompanyFullProfile');
  }

  async findCompaniesByLevel(level) {
    return this.executeWithReconnect(async (prisma) => {
      return await prisma[this.model].findMany({
        where: { level },
        orderBy: { createdAt: 'desc' }
      });
    }, 'FindCompaniesByLevel');
  }
}

const companyRepository = new CompanyRepository();
export default companyRepository;