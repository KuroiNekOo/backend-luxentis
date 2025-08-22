// Repository index - Export all repositories

// Legacy repositories
export { default as userRepository } from './UserRepository.js';
export { BaseRepository } from './BaseRepository.js';

// Redis repositories
export { 
  RedisRepository, 
  CacheRepository, 
  SessionRepository,
  cacheRepository,
  sessionRepository 
} from './RedisRepository.js';

// Luxentis repositories
export { default as luxentisUserRepository } from './LuxentisUserRepository.js';
export { default as companyRepository } from './CompanyRepository.js';
export { default as bankAccountRepository } from './BankAccountRepository.js';
export { default as bankAccountTypeRepository } from './BankAccountTypeRepository.js';
export { default as containerRepository } from './ContainerRepository.js';
export { default as itemReferenceRepository } from './ItemReferenceRepository.js';
export { default as driveOrderRepository } from './DriveOrderRepository.js';
export { default as marketPriceRepository } from './MarketPriceRepository.js';
export { default as zoneRepository } from './ZoneRepository.js';
export { default as userCompanyRepository } from './UserCompanyRepository.js';

// Repository collections for easier access
export const luxentisRepositories = {
  user: luxentisUserRepository,
  company: companyRepository,
  bankAccount: bankAccountRepository,
  bankAccountType: bankAccountTypeRepository,
  container: containerRepository,
  itemReference: itemReferenceRepository,
  driveOrder: driveOrderRepository,
  marketPrice: marketPriceRepository,
  zone: zoneRepository,
  userCompany: userCompanyRepository
};

export const redisRepositories = {
  cache: cacheRepository,
  session: sessionRepository
};