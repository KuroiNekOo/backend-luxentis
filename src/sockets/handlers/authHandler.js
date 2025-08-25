import logger from '../../config/logger.js';
import database from '../../config/database.js';
import redisInstance from '../../config/redis.js';
import { withErrorHandling } from '../middlewares/errorMiddleware.js';
import { withValidation } from '../middlewares/validationMiddleware.js';
import { 
  minecraftSignupRequestSchema,
  webCompleteSignupSchema,
  minecraftPlayerConnectSchema,
  minecraftPlayerDisconnectSchema,
  minecraftPasswordChangeRequestSchema,
  webCompletePasswordChangeSchema
} from '../schemas/exampleSchemas.js';
import bcrypt from 'bcrypt';

/**
 * TTL pour les codes d'authentification en secondes
 */
const TTL = 300; // 5 minutes

/**
 * Génère un code à 6 chiffres
 */
const generateCode = () => {
  return Math.random().toString().slice(-6);
};

/**
 * Génère une clé Redis pour un pseudo
 */
const getRedisKey = (pseudo, type = 'signup') => {
  return `user:${type}:${pseudo}`;
};

/**
 * Handler pour les événements d'authentification Minecraft
 * @param {Socket} socket - Socket client
 * @param {Server} io - Serveur Socket.IO
 */
export const setupAuthHandler = (socket, io) => {
  logger.info('Setting up Auth handler', { socketId: socket.id });

  // 1. Route pour recevoir les demandes d'inscription depuis Web
  socket.on('web:signup-request',
    withErrorHandling(
      withValidation(
        minecraftSignupRequestSchema,
        async (data, callback) => {
          if (!socket.connected) {
            logger.warn('Socket disconnected during web:signup-request', { socketId: socket.id });
            return;
          }

          const { pseudo } = data;
          logger.info('Web signup request received', { socketId: socket.id, pseudo });

          try {
            // Vérifier si l'utilisateur existe déjà en BDD
            const prisma = database.getClient();
            if (prisma) {
              const existingUser = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo } });
              });

              if (existingUser) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Ce pseudo est déjà utilisé',
                    errorCode: 'PSEUDO_ALREADY_EXISTS'
                  });
                }
                return;
              }
            }

            // Générer et stocker le code dans Redis avec la clé user:signup:pseudo
            const code = generateCode();
            const redisKey = getRedisKey(pseudo, 'signup');

            if (redisInstance.isConnected) {
              await redisInstance.set(redisKey, code, TTL);
              logger.info('Signup code generated and stored in Redis', { pseudo, redisKey });
            }

            // Émettre le code vers le canal que le serveur Minecraft écoute
            io.emit('auth:code-generated', {
              pseudo,
              code,
              type: 'signup'
            });

            if (callback) {
              callback({
                success: true,
                message: 'Code généré pour inscription',
                pseudo
              });
            }

          } catch (error) {
            logger.error('Error during web signup request', { error: error.message, pseudo });
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

  // 2. Route pour finaliser l'inscription avec code, mot de passe et confirmation
  socket.on('web:complete-signup',
    withErrorHandling(
      withValidation(
        webCompleteSignupSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { pseudo, code, password, confirmPassword } = data;
          logger.info('Web signup completion request', { socketId: socket.id, pseudo });

          try {
            // Vérifier que les mots de passe correspondent
            if (password !== confirmPassword) {
              if (callback) {
                callback({
                  success: false,
                  error: 'Les mots de passe ne correspondent pas',
                  errorCode: 'PASSWORD_MISMATCH'
                });
              }
              return;
            }

            // Vérifier le code dans Redis
            const redisKey = getRedisKey(pseudo, 'signup');
            let storedCode = null;

            if (redisInstance.isConnected) {
              storedCode = await redisInstance.get(redisKey);
            }

            if (!storedCode || storedCode !== code) {
              if (callback) {
                callback({
                  success: false,
                  error: 'Code invalide ou expiré',
                  errorCode: 'INVALID_CODE'
                });
              }
              return;
            }

            // Hasher le mot de passe et créer l'utilisateur en BDD
            const hashedPassword = await bcrypt.hash(password, 12);
            const prisma = database.getClient();

            if (prisma) {
              await database.executeWithReconnection(async (db) => {
                await db.user.create({
                  data: {
                    pseudo,
                    password: hashedPassword,
                    createdAt: new Date(),
                    updatedAt: new Date()
                  }
                });
              });

              // Supprimer le code de Redis
              if (redisInstance.isConnected) {
                await redisInstance.del(redisKey);
              }

              logger.info('User registration completed successfully', { pseudo });

              if (callback) {
                callback({
                  success: true,
                  message: 'Inscription terminée avec succès',
                  pseudo
                });
              }
            }

          } catch (error) {
            logger.error('Error during signup completion', { error: error.message, pseudo });
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

  // 3. Route pour recevoir les connexions depuis Minecraft
  socket.on('minecraft:player-connect',
    withErrorHandling(
      withValidation(
        minecraftPlayerConnectSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { pseudo } = data;
          logger.info('Minecraft player connection', { socketId: socket.id, pseudo });

          try {
            // Vérifier si le pseudo existe en BDD
            const prisma = database.getClient();
            let user = null;

            if (prisma) {
              user = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo } });
              });
            }

            if (!user) {
              logger.warn('Player connection failed - user not found', { pseudo });
              if (callback) {
                callback({
                  success: false,
                  error: 'Utilisateur non trouvé',
                  errorCode: 'USER_NOT_FOUND'
                });
              }
              return;
            }

            // Mettre à jour la date de dernière connexion
            if (prisma) {
              await database.executeWithReconnection(async (db) => {
                await db.user.update({
                  where: { pseudo },
                  data: { lastLoginAt: new Date() }
                });
              });
            }

            // Envoyer l'information de connexion vers le canal approprié
            io.emit('player:connected', {
              pseudo,
              timestamp: new Date().toISOString()
            });

            logger.info('Player connected successfully', { pseudo });

            if (callback) {
              callback({
                success: true,
                message: 'Connexion enregistrée',
                pseudo
              });
            }

          } catch (error) {
            logger.error('Error during player connection', { error: error.message, pseudo });
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

  // 4. Route pour recevoir les déconnexions depuis Minecraft
  socket.on('minecraft:player-disconnect',
    withErrorHandling(
      withValidation(
        minecraftPlayerDisconnectSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { pseudo } = data;
          logger.info('Minecraft player disconnection', { socketId: socket.id, pseudo });

          try {
            // Envoyer l'information de déconnexion vers le canal approprié (pas de vérification BDD nécessaire)
            io.emit('player:disconnected', {
              pseudo,
              timestamp: new Date().toISOString()
            });

            logger.info('Player disconnected successfully', { pseudo });

            if (callback) {
              callback({
                success: true,
                message: 'Déconnexion enregistrée',
                pseudo
              });
            }

          } catch (error) {
            logger.error('Error during player disconnection', { error: error.message, pseudo });
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

  // 5. Route pour demande de changement de mot de passe depuis Web
  socket.on('web:password-change-request',
    withErrorHandling(
      withValidation(
        minecraftPasswordChangeRequestSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { pseudo } = data;
          logger.info('Web password change request', { socketId: socket.id, pseudo });

          try {
            // Vérifier si l'utilisateur existe en BDD
            const prisma = database.getClient();
            let user = null;

            if (prisma) {
              user = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo } });
              });
            }

            if (!user) {
              if (callback) {
                callback({
                  success: false,
                  error: 'Utilisateur non trouvé',
                  errorCode: 'USER_NOT_FOUND'
                });
              }
              return;
            }

            // Générer et stocker le code dans Redis avec la clé user:password-change:pseudo
            const code = generateCode();
            const redisKey = getRedisKey(pseudo, 'password-change');

            if (redisInstance.isConnected) {
              await redisInstance.set(redisKey, code, TTL);
              logger.info('Password change code generated and stored', { pseudo, redisKey });
            }

            // Émettre le code vers le canal que le serveur Minecraft écoute
            io.emit('auth:code-generated', {
              pseudo,
              code,
              type: 'password-change'
            });

            if (callback) {
              callback({
                success: true,
                message: 'Code généré pour changement de mot de passe',
                pseudo
              });
            }

          } catch (error) {
            logger.error('Error during password change request', { error: error.message, pseudo });
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

  // 6. Route pour finaliser le changement de mot de passe avec code, nouveau mot de passe et confirmation
  socket.on('web:complete-password-change',
    withErrorHandling(
      withValidation(
        webCompletePasswordChangeSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { pseudo, code, password, confirmPassword } = data;
          logger.info('Web password change completion', { socketId: socket.id, pseudo });

          try {
            // Vérifier que les mots de passe correspondent
            if (password !== confirmPassword) {
              if (callback) {
                callback({
                  success: false,
                  error: 'Les mots de passe ne correspondent pas',
                  errorCode: 'PASSWORD_MISMATCH'
                });
              }
              return;
            }

            // Vérifier le code dans Redis
            const redisKey = getRedisKey(pseudo, 'password-change');
            let storedCode = null;

            if (redisInstance.isConnected) {
              storedCode = await redisInstance.get(redisKey);
            }

            if (!storedCode || storedCode !== code) {
              if (callback) {
                callback({
                  success: false,
                  error: 'Code invalide ou expiré',
                  errorCode: 'INVALID_CODE'
                });
              }
              return;
            }

            // Hasher le nouveau mot de passe et mettre à jour en BDD
            const hashedPassword = await bcrypt.hash(password, 12);
            const prisma = database.getClient();

            if (prisma) {
              await database.executeWithReconnection(async (db) => {
                await db.user.update({
                  where: { pseudo },
                  data: {
                    password: hashedPassword,
                    updatedAt: new Date()
                  }
                });
              });

              // Supprimer le code de Redis
              if (redisInstance.isConnected) {
                await redisInstance.del(redisKey);
              }

              logger.info('Password changed successfully', { pseudo });

              if (callback) {
                callback({
                  success: true,
                  message: 'Mot de passe changé avec succès',
                  pseudo
                });
              }
            }

          } catch (error) {
            logger.error('Error during password change completion', { error: error.message, pseudo });
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

  logger.info('Auth handler setup complete', { socketId: socket.id });
};