import 'dotenv/config';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcrypt';
import database from '../config/database.js';
import logger from '../config/logger.js';

class DatabaseSeeder {
  constructor() {
    this.prisma = null;
  }

  async initialize() {
    try {
      await database.connect();
      this.prisma = database.getClient();
      logger.info('Database connected for seeding');
    } catch (error) {
      logger.error('Failed to connect to database for seeding:', error);
      throw error;
    }
  }

  async seedRoles() {
    logger.info('Seeding roles...');
    
    const roles = [
      {
        name: 'admin',
        description: 'Administrator with full access'
      },
      {
        name: 'moderator',
        description: 'Moderator with limited administrative access'
      },
      {
        name: 'user',
        description: 'Regular user with basic access'
      },
      {
        name: 'minecraft_admin',
        description: 'Minecraft server administrator'
      }
    ];

    const createdRoles = [];
    for (const roleData of roles) {
      const role = await this.prisma.role.upsert({
        where: { name: roleData.name },
        update: { description: roleData.description },
        create: roleData
      });
      createdRoles.push(role);
      logger.info(`Role '${role.name}' seeded`);
    }

    return createdRoles;
  }

  async seedPermissions() {
    logger.info('Seeding permissions...');
    
    const permissions = [
      // User permissions
      { name: 'user.read', resource: 'user', action: 'read', description: 'Read user information' },
      { name: 'user.update', resource: 'user', action: 'update', description: 'Update user information' },
      { name: 'user.delete', resource: 'user', action: 'delete', description: 'Delete user' },
      { name: 'user.create', resource: 'user', action: 'create', description: 'Create new user' },
      { name: 'user.list', resource: 'user', action: 'list', description: 'List all users' },
      
      // Minecraft permissions
      { name: 'minecraft.connect', resource: 'minecraft', action: 'connect', description: 'Connect to minecraft server' },
      { name: 'minecraft.command', resource: 'minecraft', action: 'command', description: 'Execute minecraft commands' },
      { name: 'minecraft.admin', resource: 'minecraft', action: 'admin', description: 'Minecraft server administration' },
      { name: 'minecraft.chat', resource: 'minecraft', action: 'chat', description: 'Use minecraft chat' },
      
      // Server permissions
      { name: 'server.manage', resource: 'server', action: 'manage', description: 'Manage server settings' },
      { name: 'server.stats', resource: 'server', action: 'stats', description: 'View server statistics' }
    ];

    const createdPermissions = [];
    for (const permData of permissions) {
      const permission = await this.prisma.permission.upsert({
        where: { name: permData.name },
        update: { 
          resource: permData.resource,
          action: permData.action,
          description: permData.description 
        },
        create: permData
      });
      createdPermissions.push(permission);
    }

    logger.info(`${createdPermissions.length} permissions seeded`);
    return createdPermissions;
  }

  async seedRolePermissions(roles, permissions) {
    logger.info('Seeding role permissions...');

    const rolePermissionMappings = {
      'admin': [
        'user.read', 'user.update', 'user.delete', 'user.create', 'user.list',
        'minecraft.connect', 'minecraft.command', 'minecraft.admin', 'minecraft.chat',
        'server.manage', 'server.stats'
      ],
      'moderator': [
        'user.read', 'user.update', 'user.list',
        'minecraft.connect', 'minecraft.command', 'minecraft.chat',
        'server.stats'
      ],
      'user': [
        'user.read', 'user.update',
        'minecraft.connect', 'minecraft.chat'
      ],
      'minecraft_admin': [
        'user.read', 'user.list',
        'minecraft.connect', 'minecraft.command', 'minecraft.admin', 'minecraft.chat',
        'server.stats'
      ]
    };

    for (const [roleName, permissionNames] of Object.entries(rolePermissionMappings)) {
      const role = roles.find(r => r.name === roleName);
      if (!role) continue;

      for (const permissionName of permissionNames) {
        const permission = permissions.find(p => p.name === permissionName);
        if (!permission) continue;

        await this.prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id
            }
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permission.id
          }
        });
      }

      logger.info(`Permissions assigned to role '${roleName}'`);
    }
  }

  async seedUsers(roles) {
    logger.info('Seeding users...');

    const saltRounds = 12;
    const defaultPassword = await bcrypt.hash('password123', saltRounds);

    // Créer un admin par défaut
    const adminUser = await this.prisma.user.upsert({
      where: { email: 'admin@semirp.com' },
      update: {},
      create: {
        username: 'admin',
        email: 'admin@semirp.com',
        password: defaultPassword,
        firstName: 'Admin',
        lastName: 'User',
        isActive: true
      }
    });

    // Assigner le rôle admin
    const adminRole = roles.find(r => r.name === 'admin');
    if (adminRole) {
      await this.prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: adminUser.id,
            roleId: adminRole.id
          }
        },
        update: {},
        create: {
          userId: adminUser.id,
          roleId: adminRole.id
        }
      });
    }

    logger.info('Admin user created: admin@semirp.com / password123');

    // Créer des utilisateurs de test
    const userRole = roles.find(r => r.name === 'user');
    const moderatorRole = roles.find(r => r.name === 'moderator');
    
    const testUsers = [];
    
    // 10 utilisateurs normaux
    for (let i = 0; i < 10; i++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const username = faker.internet.username({ firstName, lastName }).toLowerCase();
      const email = faker.internet.email({ firstName, lastName }).toLowerCase();

      const user = await this.prisma.user.create({
        data: {
          username: `${username}_${i}`,
          email: `test${i}_${email}`,
          password: defaultPassword,
          firstName,
          lastName,
          isActive: faker.datatype.boolean(0.9) // 90% actifs
        }
      });

      // Assigner le rôle user
      if (userRole) {
        await this.prisma.userRole.create({
          data: {
            userId: user.id,
            roleId: userRole.id
          }
        });
      }

      testUsers.push(user);
    }

    // 3 modérateurs
    for (let i = 0; i < 3; i++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const username = faker.internet.username({ firstName, lastName }).toLowerCase();
      const email = faker.internet.email({ firstName, lastName }).toLowerCase();

      const user = await this.prisma.user.create({
        data: {
          username: `mod_${username}_${i}`,
          email: `mod${i}_${email}`,
          password: defaultPassword,
          firstName,
          lastName,
          isActive: true
        }
      });

      // Assigner le rôle moderator
      if (moderatorRole) {
        await this.prisma.userRole.create({
          data: {
            userId: user.id,
            roleId: moderatorRole.id
          }
        });
      }

      testUsers.push(user);
    }

    logger.info(`${testUsers.length + 1} users seeded (including admin)`);
    return testUsers;
  }

  async seedMinecraftServers() {
    logger.info('Seeding Minecraft servers...');

    const servers = [
      {
        name: 'Semirp Main Server',
        host: 'localhost',
        port: 25565,
        description: 'Le serveur principal de Semirp avec toutes les fonctionnalités',
        isActive: true
      },
      {
        name: 'Semirp Creative',
        host: 'localhost',
        port: 25566,
        description: 'Serveur créatif pour tester et construire',
        isActive: true
      },
      {
        name: 'Semirp Test',
        host: 'test.semirp.local',
        port: 25567,
        description: 'Serveur de test pour les nouvelles fonctionnalités',
        isActive: false
      }
    ];

    const createdServers = [];
    for (const serverData of servers) {
      const server = await this.prisma.minecraftServer.upsert({
        where: { 
          host_port: {
            host: serverData.host,
            port: serverData.port
          }
        },
        update: serverData,
        create: serverData
      });
      createdServers.push(server);
      logger.info(`Minecraft server '${server.name}' seeded`);
    }

    return createdServers;
  }

  async cleanDatabase() {
    logger.info('Cleaning existing data...');
    
    try {
      // Ordre important pour respecter les contraintes de clés étrangères
      await this.prisma.session.deleteMany();
      await this.prisma.userRole.deleteMany();
      await this.prisma.rolePermission.deleteMany();
      await this.prisma.user.deleteMany();
      await this.prisma.permission.deleteMany();
      await this.prisma.role.deleteMany();
      await this.prisma.minecraftServer.deleteMany();
      
      logger.info('Database cleaned');
    } catch (error) {
      logger.warn('Error cleaning database (may be normal on first run):', error.message);
    }
  }

  async run(clean = false) {
    try {
      await this.initialize();

      if (clean) {
        await this.cleanDatabase();
      }

      logger.info('🌱 Starting database seeding...');

      // Seed dans l'ordre correct
      const roles = await this.seedRoles();
      const permissions = await this.seedPermissions();
      await this.seedRolePermissions(roles, permissions);
      const users = await this.seedUsers(roles);
      const servers = await this.seedMinecraftServers();

      logger.info('✅ Database seeding completed successfully!');
      logger.info('Default admin credentials: admin@semirp.com / password123');
      
      return {
        roles: roles.length,
        permissions: permissions.length,
        users: users.length + 1, // +1 for admin
        servers: servers.length
      };

    } catch (error) {
      logger.error('❌ Database seeding failed:', error);
      throw error;
    } finally {
      await database.disconnect();
    }
  }
}

// Exécution si appelé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  const seeder = new DatabaseSeeder();
  const shouldClean = process.argv.includes('--clean');
  
  seeder.run(shouldClean)
    .then((stats) => {
      logger.info('Seeding stats:', stats);
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding failed:', error);
      process.exit(1);
    });
}

export default DatabaseSeeder;