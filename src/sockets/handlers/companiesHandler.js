import logger from '../../config/logger.js';
import database from '../../config/database.js';
import { withErrorHandling } from '../middlewares/errorMiddleware.js';
import { withValidation } from '../middlewares/validationMiddleware.js';
import { 
  companyCreateSchema,
  companyUpdateSchema,
  companyDeleteSchema,
  companyAddPlayerSchema,
  companyRemovePlayerSchema
} from '../schemas/exampleSchemas.js';

export const setupCompaniesHandler = (socket, io) => {
  logger.info('Setting up Companies handler', { socketId: socket.id });

  // 1. Route pour créer une nouvelle entreprise
  socket.on('companies:create',
    withErrorHandling(
      withValidation(
        companyCreateSchema,
        async (data, callback) => {
          if (!socket.connected) {
            logger.warn('Socket disconnected during companies:create', { socketId: socket.id });
            return;
          }

          const { name, description, sector, ownerPseudo } = data;
          logger.info('Company creation request received', { socketId: socket.id, name, ownerPseudo });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Vérifier que le propriétaire existe
              const owner = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: ownerPseudo } });
              });

              if (!owner) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Propriétaire introuvable',
                    errorCode: 'OWNER_NOT_FOUND'
                  });
                }
                return;
              }

              // Créer l'entreprise
              const company = await database.executeWithReconnection(async (db) => {
                return await db.company.create({
                  data: {
                    name,
                    description: description || null,
                    sector: sector || null,
                    ownerId: owner.id,
                    createdAt: new Date(),
                    updatedAt: new Date()
                  }
                });
              });

              logger.info('Company created successfully', { companyId: company.id, name });

              // Émettre la confirmation vers le canal approprié
              io.emit('companies:created', {
                company: {
                  id: company.id,
                  name: company.name,
                  description: company.description,
                  sector: company.sector,
                  ownerPseudo
                },
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Entreprise créée avec succès',
                  company: {
                    id: company.id,
                    name: company.name,
                    description: company.description,
                    sector: company.sector,
                    ownerPseudo
                  }
                });
              }
            }

          } catch (error) {
            logger.error('Error during company creation', { error: error.message, name, ownerPseudo });
            if (callback) {
              callback({
                success: false,
                error: 'Erreur serveur',
                errorCode: 'SERVER_ERROR'
              });
            }
          }
        }
      )
    )
  );

  // 2. Route pour modifier une entreprise
  socket.on('companies:update',
    withErrorHandling(
      withValidation(
        companyUpdateSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { companyId, name, description, sector, updaterPseudo } = data;
          logger.info('Company update request received', { socketId: socket.id, companyId, updaterPseudo });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Vérifier que l'utilisateur existe
              const updater = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: updaterPseudo } });
              });

              if (!updater) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Utilisateur introuvable',
                    errorCode: 'USER_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier que l'entreprise existe et que l'utilisateur est le propriétaire
              const company = await database.executeWithReconnection(async (db) => {
                return await db.company.findUnique({ where: { id: companyId } });
              });

              if (!company) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Entreprise introuvable',
                    errorCode: 'COMPANY_NOT_FOUND'
                  });
                }
                return;
              }

              if (company.ownerId !== updater.id) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Seul le propriétaire peut modifier l\'entreprise',
                    errorCode: 'UNAUTHORIZED'
                  });
                }
                return;
              }

              // Construire les données de mise à jour
              const updateData = { updatedAt: new Date() };
              if (name) updateData.name = name;
              if (description !== undefined) updateData.description = description;
              if (sector !== undefined) updateData.sector = sector;

              // Mettre à jour l'entreprise
              const updatedCompany = await database.executeWithReconnection(async (db) => {
                return await db.company.update({
                  where: { id: companyId },
                  data: updateData
                });
              });

              logger.info('Company updated successfully', { companyId });

              // Émettre la confirmation vers le canal approprié
              io.emit('companies:updated', {
                company: {
                  id: updatedCompany.id,
                  name: updatedCompany.name,
                  description: updatedCompany.description,
                  sector: updatedCompany.sector,
                  updaterPseudo
                },
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Entreprise modifiée avec succès',
                  company: {
                    id: updatedCompany.id,
                    name: updatedCompany.name,
                    description: updatedCompany.description,
                    sector: updatedCompany.sector
                  }
                });
              }
            }

          } catch (error) {
            logger.error('Error during company update', { error: error.message, companyId });
            if (callback) {
              callback({
                success: false,
                error: 'Erreur serveur',
                errorCode: 'SERVER_ERROR'
              });
            }
          }
        }
      )
    )
  );

  // 3. Route pour supprimer une entreprise
  socket.on('companies:delete',
    withErrorHandling(
      withValidation(
        companyDeleteSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { companyId, deleterPseudo } = data;
          logger.info('Company deletion request received', { socketId: socket.id, companyId, deleterPseudo });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Vérifier que l'utilisateur existe
              const deleter = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: deleterPseudo } });
              });

              if (!deleter) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Utilisateur introuvable',
                    errorCode: 'USER_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier que l'entreprise existe et que l'utilisateur est le propriétaire
              const company = await database.executeWithReconnection(async (db) => {
                return await db.company.findUnique({ where: { id: companyId } });
              });

              if (!company) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Entreprise introuvable',
                    errorCode: 'COMPANY_NOT_FOUND'
                  });
                }
                return;
              }

              if (company.ownerId !== deleter.id) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Seul le propriétaire peut supprimer l\'entreprise',
                    errorCode: 'UNAUTHORIZED'
                  });
                }
                return;
              }

              // Supprimer l'entreprise
              await database.executeWithReconnection(async (db) => {
                await db.company.delete({ where: { id: companyId } });
              });

              logger.info('Company deleted successfully', { companyId });

              // Émettre la confirmation vers le canal approprié
              io.emit('companies:deleted', {
                companyId,
                deleterPseudo,
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Entreprise supprimée avec succès',
                  companyId
                });
              }
            }

          } catch (error) {
            logger.error('Error during company deletion', { error: error.message, companyId });
            if (callback) {
              callback({
                success: false,
                error: 'Erreur serveur',
                errorCode: 'SERVER_ERROR'
              });
            }
          }
        }
      )
    )
  );

  // 4. Route pour ajouter un joueur à une entreprise
  socket.on('companies:add-player',
    withErrorHandling(
      withValidation(
        companyAddPlayerSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { companyId, playerPseudo, position, salary, recruiterPseudo } = data;
          logger.info('Add player to company request received', { socketId: socket.id, companyId, playerPseudo, recruiterPseudo });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Vérifier que le recruteur existe
              const recruiter = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: recruiterPseudo } });
              });

              if (!recruiter) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Recruteur introuvable',
                    errorCode: 'RECRUITER_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier que le joueur existe
              const player = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: playerPseudo } });
              });

              if (!player) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Joueur introuvable',
                    errorCode: 'PLAYER_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier que l'entreprise existe et que le recruteur est le propriétaire
              const company = await database.executeWithReconnection(async (db) => {
                return await db.company.findUnique({ where: { id: companyId } });
              });

              if (!company) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Entreprise introuvable',
                    errorCode: 'COMPANY_NOT_FOUND'
                  });
                }
                return;
              }

              if (company.ownerId !== recruiter.id) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Seul le propriétaire peut recruter',
                    errorCode: 'UNAUTHORIZED'
                  });
                }
                return;
              }

              // Vérifier que le joueur n'est pas déjà dans l'entreprise
              const existingEmployment = await database.executeWithReconnection(async (db) => {
                return await db.employment.findFirst({
                  where: { 
                    companyId,
                    employeeId: player.id,
                    endDate: null
                  }
                });
              });

              if (existingEmployment) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Le joueur est déjà employé dans cette entreprise',
                    errorCode: 'ALREADY_EMPLOYED'
                  });
                }
                return;
              }

              // Créer l'emploi
              const employment = await database.executeWithReconnection(async (db) => {
                return await db.employment.create({
                  data: {
                    companyId,
                    employeeId: player.id,
                    position: position || null,
                    salary: salary || null,
                    startDate: new Date()
                  }
                });
              });

              logger.info('Player added to company successfully', { companyId, playerPseudo });

              // Émettre la confirmation vers le canal approprié
              io.emit('companies:player-added', {
                companyId,
                playerPseudo,
                position: position || null,
                salary: salary || null,
                recruiterPseudo,
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Joueur ajouté à l\'entreprise avec succès',
                  employment: {
                    id: employment.id,
                    companyId,
                    playerPseudo,
                    position: position || null,
                    salary: salary || null
                  }
                });
              }
            }

          } catch (error) {
            logger.error('Error during player addition to company', { error: error.message, companyId, playerPseudo });
            if (callback) {
              callback({
                success: false,
                error: 'Erreur serveur',
                errorCode: 'SERVER_ERROR'
              });
            }
          }
        }
      )
    )
  );

  // 5. Route pour supprimer un joueur d'une entreprise
  socket.on('companies:remove-player',
    withErrorHandling(
      withValidation(
        companyRemovePlayerSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { companyId, playerPseudo, removerPseudo, reason } = data;
          logger.info('Remove player from company request received', { socketId: socket.id, companyId, playerPseudo, removerPseudo });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Vérifier que celui qui licencie existe
              const remover = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: removerPseudo } });
              });

              if (!remover) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Utilisateur introuvable',
                    errorCode: 'USER_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier que le joueur existe
              const player = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: playerPseudo } });
              });

              if (!player) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Joueur introuvable',
                    errorCode: 'PLAYER_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier que l'entreprise existe et que le remover est le propriétaire
              const company = await database.executeWithReconnection(async (db) => {
                return await db.company.findUnique({ where: { id: companyId } });
              });

              if (!company) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Entreprise introuvable',
                    errorCode: 'COMPANY_NOT_FOUND'
                  });
                }
                return;
              }

              if (company.ownerId !== remover.id) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Seul le propriétaire peut licencier',
                    errorCode: 'UNAUTHORIZED'
                  });
                }
                return;
              }

              // Vérifier que le joueur est employé dans l'entreprise
              const employment = await database.executeWithReconnection(async (db) => {
                return await db.employment.findFirst({
                  where: { 
                    companyId,
                    employeeId: player.id,
                    endDate: null
                  }
                });
              });

              if (!employment) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Le joueur n\'est pas employé dans cette entreprise',
                    errorCode: 'NOT_EMPLOYED'
                  });
                }
                return;
              }

              // Terminer l'emploi
              await database.executeWithReconnection(async (db) => {
                await db.employment.update({
                  where: { id: employment.id },
                  data: { 
                    endDate: new Date(),
                    terminationReason: reason || null
                  }
                });
              });

              logger.info('Player removed from company successfully', { companyId, playerPseudo });

              // Émettre la confirmation vers le canal approprié
              io.emit('companies:player-removed', {
                companyId,
                playerPseudo,
                removerPseudo,
                reason: reason || null,
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Joueur retiré de l\'entreprise avec succès',
                  companyId,
                  playerPseudo
                });
              }
            }

          } catch (error) {
            logger.error('Error during player removal from company', { error: error.message, companyId, playerPseudo });
            if (callback) {
              callback({
                success: false,
                error: 'Erreur serveur',
                errorCode: 'SERVER_ERROR'
              });
            }
          }
        }
      )
    )
  );

  logger.info('Companies handler setup complete', { socketId: socket.id });
};