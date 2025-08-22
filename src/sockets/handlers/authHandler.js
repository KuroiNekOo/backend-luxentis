import logger from '../../config/logger.js';
import database from '../../config/database.js';
import redisInstance from '../../config/redis.js';
import { withErrorHandling } from '../middlewares/errorMiddleware.js';
import { withValidation } from '../middlewares/validationMiddleware.js';
import { 
  authRegisterRequestSchema,
  authSendCodeSchema,
  authVerifyCodeSchema,
  authSetPasswordSchema,
  authLoginSchema,
  authLogoutSchema,
  authPasswordChangeRequestSchema
} from '../schemas/exampleSchemas.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

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
const getRedisKey = (pseudo, type = 'register') => {
  return `user_${pseudo}_${type}`;
};

/**
 * Handler pour les événements d'authentification
 * @param {Socket} socket - Socket client
 * @param {Server} io - Serveur Socket.IO
 */
export const setupAuthHandler = (socket, io) => {
  logger.info('Setting up Auth handler', { socketId: socket.id });

  // 1. Route pour réceptionner une inscription par pseudo
  socket.on('auth:register-request',
    withErrorHandling(
      withValidation(
        authRegisterRequestSchema,
        async (data, callback) => {
          if (!socket.connected) {
            logger.warn('Socket disconnected during auth:register-request', { socketId: socket.id });
            return;
          }

          const { pseudo } = data;
          logger.info('Registration request received', { socketId: socket.id, pseudo });

          try {
            // Vérifier si l'utilisateur existe déjà
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
                    errorCode: 'PSEUDO_ALREADY_EXISTS',
                    timestamp: new Date().toISOString()
                  });
                }
                return;
              }
            }

            // Générer et stocker le code dans Redis
            const code = generateCode();
            const redisKey = getRedisKey(pseudo, 'register');

            console.log(code);
            console.log(redisKey);
            console.log(redisInstance.isConnected);

            if (redisInstance.isConnected) {
              await redisInstance.set(redisKey, code, TTL);
              logger.info('Registration code generated and stored', { pseudo, code });
            }

            // Émettre le code au client (simulation d'envoi)
            socket.emit('auth:code-generated', {
              success: true,
              message: 'Code généré pour inscription',
              pseudo,
              code, // En production, ne pas renvoyer le code ici
              type: 'register',
              timestamp: new Date().toISOString()
            });

            if (callback) {
              callback({
                success: true,
                message: 'Demande d\'inscription enregistrée',
                pseudo,
                timestamp: new Date().toISOString()
              });
            }

          } catch (error) {
            logger.error('Error during registration request', { error: error.message, pseudo });
            throw error;
          }
        },
        'auth:register-request'
      ),
      'auth:register-request'
    )
  );

  // 2. Route pour envoyer le code
  socket.on('auth:send-code',
    withErrorHandling(
      withValidation(
        authSendCodeSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { pseudo, type } = data;
          logger.info('Code sending request', { socketId: socket.id, pseudo, type });

          try {
            const redisKey = getRedisKey(pseudo, type);
            let code = null;

            if (redisInstance.isConnected) {
              code = await redisInstance.get(redisKey);
            }

            if (code) {
              // Simuler l'envoi du code (email, SMS, etc.)
              socket.emit('auth:code-sent', {
                success: true,
                message: `Code envoyé pour ${type === 'register' ? 'inscription' : 'changement de mot de passe'}`,
                pseudo,
                code, // En production, ne pas renvoyer le code ici
                type,
                timestamp: new Date().toISOString()
              });
            }

            if (callback) {
              callback({
                success: code ? true : false,
                message: code ? 'Code envoyé' : 'Aucun code trouvé pour ce pseudo',
                pseudo,
                timestamp: new Date().toISOString()
              });
            }

          } catch (error) {
            logger.error('Error during code sending', { error: error.message, pseudo, type });
            throw error;
          }
        },
        'auth:send-code'
      ),
      'auth:send-code'
    )
  );

  // 3. Route pour vérifier le code
  socket.on('auth:verify-code',
    withErrorHandling(
      withValidation(
        authVerifyCodeSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { pseudo, code, type } = data;
          logger.info('Code verification request', { socketId: socket.id, pseudo, type });

          try {
            const redisKey = getRedisKey(pseudo, type);
            let storedCode = null;

            if (redisInstance.isConnected) {
              storedCode = await redisInstance.get(redisKey);
            }

            const isValid = storedCode && storedCode === code;

            socket.emit('auth:code-verified', {
              success: isValid,
              message: isValid ? 'Code valide' : 'Code invalide ou expiré',
              pseudo,
              type,
              codeValid: isValid,
              timestamp: new Date().toISOString()
            });

            if (callback) {
              callback({
                success: isValid,
                message: isValid ? 'Code valide' : 'Code invalide ou expiré',
                pseudo,
                codeValid: isValid,
                timestamp: new Date().toISOString()
              });
            }

          } catch (error) {
            logger.error('Error during code verification', { error: error.message, pseudo, type });
            throw error;
          }
        },
        'auth:verify-code'
      ),
      'auth:verify-code'
    )
  );

  // 4. Route pour définir le mot de passe (inscription ou changement)
  socket.on('auth:set-password',
    withErrorHandling(
      withValidation(
        authSetPasswordSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { pseudo, password, code, type } = data;
          logger.info('Password setting request', { socketId: socket.id, pseudo, type });

          try {
            // Vérifier le code
            const redisKey = getRedisKey(pseudo, type);
            let storedCode = null;

            if (redisInstance.isConnected) {
              storedCode = await redisInstance.get(redisKey);
            }

            if (!storedCode || storedCode !== code) {
              if (callback) {
                callback({
                  success: false,
                  error: 'Code invalide ou expiré',
                  errorCode: 'INVALID_CODE',
                  timestamp: new Date().toISOString()
                });
              }
              return;
            }

            // Hasher le mot de passe
            const hashedPassword = await bcrypt.hash(password, 12);

            const prisma = database.getClient();
            if (prisma) {
              if (type === 'register') {
                // Créer nouvel utilisateur
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

                logger.info('User registered successfully', { pseudo });
                
                // Supprimer le code de Redis
                if (redisInstance.isConnected) {
                  await redisInstance.del(redisKey);
                }

                socket.emit('auth:registration-complete', {
                  success: true,
                  message: 'Inscription terminée avec succès',
                  pseudo,
                  timestamp: new Date().toISOString()
                });

              } else if (type === 'password_change') {
                // Mettre à jour le mot de passe
                await database.executeWithReconnection(async (db) => {
                  await db.user.update({
                    where: { pseudo },
                    data: {
                      password: hashedPassword,
                      updatedAt: new Date()
                    }
                  });
                });

                logger.info('Password changed successfully', { pseudo });

                // Supprimer le code de Redis
                if (redisInstance.isConnected) {
                  await redisInstance.del(redisKey);
                }

                socket.emit('auth:password-change-complete', {
                  success: true,
                  message: 'Changement de mot de passe terminé avec succès',
                  pseudo,
                  timestamp: new Date().toISOString()
                });
              }
            }

            if (callback) {
              callback({
                success: true,
                message: type === 'register' ? 'Inscription terminée' : 'Mot de passe changé',
                pseudo,
                timestamp: new Date().toISOString()
              });
            }

          } catch (error) {
            logger.error('Error during password setting', { error: error.message, pseudo, type });
            throw error;
          }
        },
        'auth:set-password'
      ),
      'auth:set-password'
    )
  );

  // 5. Route pour connexion
  socket.on('auth:login',
    withErrorHandling(
      withValidation(
        authLoginSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { pseudo, password } = data;
          logger.info('Login request', { socketId: socket.id, pseudo });

          try {
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
                  error: 'Pseudo ou mot de passe incorrect',
                  errorCode: 'INVALID_CREDENTIALS',
                  timestamp: new Date().toISOString()
                });
              }
              return;
            }

            // Vérifier le mot de passe
            const isPasswordValid = await bcrypt.compare(password, user.password);

            if (!isPasswordValid) {
              if (callback) {
                callback({
                  success: false,
                  error: 'Pseudo ou mot de passe incorrect',
                  errorCode: 'INVALID_CREDENTIALS',
                  timestamp: new Date().toISOString()
                });
              }
              return;
            }

            // Connexion réussie
            logger.info('User logged in successfully', { pseudo, socketId: socket.id });

            socket.emit('auth:login-success', {
              success: true,
              message: 'Connexion réussie',
              user: {
                pseudo: user.pseudo,
                createdAt: user.createdAt
              },
              socketId: socket.id,
              timestamp: new Date().toISOString()
            });

            // Broadcaster la connexion aux autres clients
            socket.broadcast.emit('auth:user-connected', {
              pseudo: user.pseudo,
              socketId: socket.id,
              timestamp: new Date().toISOString()
            });

            if (callback) {
              callback({
                success: true,
                message: 'Connexion réussie',
                user: {
                  pseudo: user.pseudo,
                  createdAt: user.createdAt
                },
                timestamp: new Date().toISOString()
              });
            }

          } catch (error) {
            logger.error('Error during login', { error: error.message, pseudo });
            throw error;
          }
        },
        'auth:login'
      ),
      'auth:login'
    )
  );

  // 6. Route pour déconnexion
  socket.on('auth:logout',
    withErrorHandling(
      withValidation(
        authLogoutSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { pseudo } = data;
          logger.info('Logout request', { socketId: socket.id, pseudo });

          socket.emit('auth:logout-success', {
            success: true,
            message: 'Déconnexion réussie',
            pseudo,
            timestamp: new Date().toISOString()
          });

          // Broadcaster la déconnexion aux autres clients
          socket.broadcast.emit('auth:user-disconnected', {
            pseudo,
            socketId: socket.id,
            timestamp: new Date().toISOString()
          });

          if (callback) {
            callback({
              success: true,
              message: 'Déconnexion réussie',
              pseudo,
              timestamp: new Date().toISOString()
            });
          }
        },
        'auth:logout'
      ),
      'auth:logout'
    )
  );

  // 7. Route pour demande de changement de mot de passe
  socket.on('auth:password-change-request',
    withErrorHandling(
      withValidation(
        authPasswordChangeRequestSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { pseudo } = data;
          logger.info('Password change request', { socketId: socket.id, pseudo });

          try {
            // Vérifier si l'utilisateur existe
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
                  errorCode: 'USER_NOT_FOUND',
                  timestamp: new Date().toISOString()
                });
              }
              return;
            }

            // Générer et stocker le code dans Redis
            const code = generateCode();
            const redisKey = getRedisKey(pseudo, 'password_change');
            
            if (redisInstance.isConnected) {
              await redisInstance.set(redisKey, code, TTL);
              logger.info('Password change code generated', { pseudo, code });
            }

            // Émettre le code au client
            socket.emit('auth:code-generated', {
              success: true,
              message: 'Code généré pour changement de mot de passe',
              pseudo,
              code, // En production, ne pas renvoyer le code ici
              type: 'password_change',
              timestamp: new Date().toISOString()
            });

            if (callback) {
              callback({
                success: true,
                message: 'Demande de changement de mot de passe enregistrée',
                pseudo,
                timestamp: new Date().toISOString()
              });
            }

          } catch (error) {
            logger.error('Error during password change request', { error: error.message, pseudo });
            throw error;
          }
        },
        'auth:password-change-request'
      ),
      'auth:password-change-request'
    )
  );

  logger.info('Auth handler setup complete', { socketId: socket.id });
};