import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../config/logger.js';

const execAsync = promisify(exec);

export const ensurePrismaGenerated = async () => {
  try {
    logger.info('Checking if Prisma client is generated...');
    
    // Essayer d'importer le client Prisma
    const { PrismaClient } = await import('@prisma/client');
    
    // Essayer de créer une instance
    const testClient = new PrismaClient();
    await testClient.$disconnect();
    
    logger.info('Prisma client is already generated');
    return true;
  } catch (error) {
    if (error.message?.includes('did not initialize yet')) {
      logger.warn('Prisma client not generated, generating now...');
      
      try {
        const { stdout, stderr } = await execAsync('npm run db:generate');
        if (stderr && !stderr.includes('Update available')) {
          logger.warn('Prisma generate warnings:', stderr);
        }
        logger.info('Prisma client generated successfully');
        return true;
      } catch (generateError) {
        logger.error('Failed to generate Prisma client:', generateError);
        return false;
      }
    }
    
    logger.error('Unknown Prisma error:', error);
    return false;
  }
};