import { BaseRepository } from './BaseRepository.js';
import logger from '../config/logger.js';

export class UserRepository extends BaseRepository {
  constructor() {
    super('user');
  }

  async findByEmail(email) {
    try {
      logger.debug('UserRepository - Finding by email:', { email });
      const user = await this.prisma.user.findUnique({
        where: { email },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: {
                      permission: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (user) {
        // Transformer les données pour faciliter l'utilisation
        user.roles = user.userRoles.map(ur => ur.role.name);
        user.permissions = user.userRoles.flatMap(ur => 
          ur.role.rolePermissions.map(rp => ({
            name: rp.permission.name,
            resource: rp.permission.resource,
            action: rp.permission.action
          }))
        );
        
        // Nettoyer les relations pour éviter la surcharge
        delete user.userRoles;
      }

      return user;
    } catch (error) {
      logger.error('UserRepository - FindByEmail error:', error);
      throw error;
    }
  }

  async findByUsername(username) {
    try {
      logger.debug('UserRepository - Finding by username:', { username });
      const user = await this.prisma.user.findUnique({
        where: { username }
      });
      return user;
    } catch (error) {
      logger.error('UserRepository - FindByUsername error:', error);
      throw error;
    }
  }

  async findWithRolesAndPermissions(id) {
    try {
      logger.debug('UserRepository - Finding with roles and permissions:', { id });
      const user = await this.prisma.user.findUnique({
        where: { id },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: {
                      permission: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (user) {
        // Transformer les données
        user.roles = user.userRoles.map(ur => ur.role.name);
        user.permissions = user.userRoles.flatMap(ur => 
          ur.role.rolePermissions.map(rp => ({
            name: rp.permission.name,
            resource: rp.permission.resource,
            action: rp.permission.action
          }))
        );
        
        delete user.userRoles;
      }

      return user;
    } catch (error) {
      logger.error('UserRepository - FindWithRolesAndPermissions error:', error);
      throw error;
    }
  }

  async assignRole(userId, roleId) {
    try {
      logger.debug('UserRepository - Assigning role:', { userId, roleId });
      const userRole = await this.prisma.userRole.create({
        data: {
          userId,
          roleId
        }
      });
      return userRole;
    } catch (error) {
      logger.error('UserRepository - AssignRole error:', error);
      throw error;
    }
  }

  async removeRole(userId, roleId) {
    try {
      logger.debug('UserRepository - Removing role:', { userId, roleId });
      const userRole = await this.prisma.userRole.delete({
        where: {
          userId_roleId: {
            userId,
            roleId
          }
        }
      });
      return userRole;
    } catch (error) {
      logger.error('UserRepository - RemoveRole error:', error);
      throw error;
    }
  }

  async findActiveUsers(options = {}) {
    try {
      const where = { isActive: true, ...options.where };
      return await this.findMany({ ...options, where });
    } catch (error) {
      logger.error('UserRepository - FindActiveUsers error:', error);
      throw error;
    }
  }

  async deactivateUser(id) {
    try {
      logger.debug('UserRepository - Deactivating user:', { id });
      const user = await this.update(id, { isActive: false });
      return user;
    } catch (error) {
      logger.error('UserRepository - DeactivateUser error:', error);
      throw error;
    }
  }

  async activateUser(id) {
    try {
      logger.debug('UserRepository - Activating user:', { id });
      const user = await this.update(id, { isActive: true });
      return user;
    } catch (error) {
      logger.error('UserRepository - ActivateUser error:', error);
      throw error;
    }
  }

  async updatePassword(id, hashedPassword) {
    try {
      logger.debug('UserRepository - Updating password:', { id });
      const user = await this.update(id, { password: hashedPassword });
      return user;
    } catch (error) {
      logger.error('UserRepository - UpdatePassword error:', error);
      throw error;
    }
  }

  async getUserStats() {
    try {
      logger.debug('UserRepository - Getting user stats');
      const [total, active, inactive] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.user.count({ where: { isActive: false } })
      ]);

      return { total, active, inactive };
    } catch (error) {
      logger.error('UserRepository - GetUserStats error:', error);
      throw error;
    }
  }
}

const userRepository = new UserRepository();
export default userRepository;