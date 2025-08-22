#!/usr/bin/env node

// Script pour démarrer l'app en mode développement sans services externes
process.env.DATABASE_ENABLED = 'false';
process.env.REDIS_ENABLED = 'false';
process.env.NODE_ENV = 'development';

console.log('🔧 Starting in development mode without external services...');
console.log('📊 Database: DISABLED');
console.log('🔗 Redis: DISABLED');
console.log('👤 Using fallback auth with admin@semirp.com / password123');
console.log('');

// Importer et démarrer le serveur
import('../server.js');