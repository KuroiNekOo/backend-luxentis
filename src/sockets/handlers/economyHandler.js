import logger from '../../config/logger.js';
import database from '../../config/database.js';
import { withErrorHandling } from '../middlewares/errorMiddleware.js';
import { withValidation } from '../middlewares/validationMiddleware.js';
import { 
  bankAccountCreateSchema,
  bankAccountDeleteSchema,
  priceFluctuationSchema,
  transactionWebRequestSchema,
  transactionMinecraftConfirmationSchema,
  transactionMinecraftDirectSchema
} from '../schemas/exampleSchemas.js';
import { v4 as uuidv4 } from 'uuid';

const generateTransactionId = () => {
  return uuidv4();
};

export const setupEconomyHandler = (socket, io) => {
  logger.info('Setting up Economy handler', { socketId: socket.id });

  // 1. Route pour créer un compte bancaire
  socket.on('economy:create-bank-account',
    withErrorHandling(
      withValidation(
        bankAccountCreateSchema,
        async (data, callback) => {
          if (!socket.connected) {
            logger.warn('Socket disconnected during economy:create-bank-account', { socketId: socket.id });
            return;
          }

          const { pseudo, accountType, initialBalance } = data;
          logger.info('Bank account creation request received', { socketId: socket.id, pseudo, accountType });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Vérifier que l'utilisateur existe
              const user = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo } });
              });

              if (!user) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Utilisateur introuvable',
                    errorCode: 'USER_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier que l'utilisateur n'a pas déjà un compte de ce type
              const existingAccount = await database.executeWithReconnection(async (db) => {
                return await db.bankAccount.findFirst({
                  where: { 
                    ownerId: user.id,
                    accountType,
                    isActive: true
                  }
                });
              });

              if (existingAccount) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Un compte de ce type existe déjà pour cet utilisateur',
                    errorCode: 'ACCOUNT_ALREADY_EXISTS'
                  });
                }
                return;
              }

              // Créer le compte bancaire
              const account = await database.executeWithReconnection(async (db) => {
                return await db.bankAccount.create({
                  data: {
                    ownerId: user.id,
                    accountType,
                    balance: initialBalance,
                    isActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date()
                  }
                });
              });

              logger.info('Bank account created successfully', { accountId: account.id, pseudo });

              // Émettre la confirmation vers le canal approprié
              io.emit('economy:bank-account-created', {
                account: {
                  id: account.id,
                  ownerPseudo: pseudo,
                  accountType: account.accountType,
                  balance: account.balance
                },
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Compte bancaire créé avec succès',
                  account: {
                    id: account.id,
                    accountType: account.accountType,
                    balance: account.balance
                  }
                });
              }
            }

          } catch (error) {
            logger.error('Error during bank account creation', { error: error.message, pseudo });
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

  // 2. Route pour supprimer un compte bancaire
  socket.on('economy:delete-bank-account',
    withErrorHandling(
      withValidation(
        bankAccountDeleteSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { accountId, ownerPseudo } = data;
          logger.info('Bank account deletion request received', { socketId: socket.id, accountId, ownerPseudo });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Vérifier que l'utilisateur existe
              const owner = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: ownerPseudo } });
              });

              if (!owner) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Utilisateur introuvable',
                    errorCode: 'USER_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier que le compte existe et appartient à l'utilisateur
              const account = await database.executeWithReconnection(async (db) => {
                return await db.bankAccount.findUnique({ where: { id: accountId } });
              });

              if (!account) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Compte bancaire introuvable',
                    errorCode: 'ACCOUNT_NOT_FOUND'
                  });
                }
                return;
              }

              if (account.ownerId !== owner.id) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Seul le propriétaire peut supprimer ce compte',
                    errorCode: 'UNAUTHORIZED'
                  });
                }
                return;
              }

              if (account.balance > 0) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Impossible de supprimer un compte avec un solde positif',
                    errorCode: 'ACCOUNT_HAS_BALANCE'
                  });
                }
                return;
              }

              // Désactiver le compte (soft delete)
              await database.executeWithReconnection(async (db) => {
                await db.bankAccount.update({
                  where: { id: accountId },
                  data: { 
                    isActive: false,
                    updatedAt: new Date()
                  }
                });
              });

              logger.info('Bank account deleted successfully', { accountId });

              // Émettre la confirmation vers le canal approprié
              io.emit('economy:bank-account-deleted', {
                accountId,
                ownerPseudo,
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Compte bancaire supprimé avec succès',
                  accountId
                });
              }
            }

          } catch (error) {
            logger.error('Error during bank account deletion', { error: error.message, accountId });
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

  // 3. Route pour recevoir les fluctuations de prix
  socket.on('economy:price-fluctuation',
    withErrorHandling(
      withValidation(
        priceFluctuationSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { itemId, itemName, oldPrice, newPrice, changePercentage, marketType, serverPseudo } = data;
          logger.info('Price fluctuation received', { socketId: socket.id, itemId, oldPrice, newPrice, marketType });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Enregistrer la fluctuation en base de données
              const fluctuation = await database.executeWithReconnection(async (db) => {
                return await db.priceFluctuation.create({
                  data: {
                    itemId,
                    itemName,
                    oldPrice,
                    newPrice,
                    changePercentage,
                    marketType,
                    timestamp: new Date()
                  }
                });
              });

              logger.info('Price fluctuation saved', { fluctuationId: fluctuation.id, itemId });

              // Émettre les informations vers le canal approprié
              io.emit('economy:price-updated', {
                itemId,
                itemName,
                oldPrice,
                newPrice,
                changePercentage,
                marketType,
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Fluctuation de prix enregistrée',
                  fluctuation: {
                    id: fluctuation.id,
                    itemId,
                    itemName,
                    oldPrice,
                    newPrice,
                    changePercentage,
                    marketType
                  }
                });
              }
            }

          } catch (error) {
            logger.error('Error during price fluctuation processing', { error: error.message, itemId });
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

  // 4. Route pour les transactions depuis Web (étape 1 - demande)
  socket.on('economy:web-transaction-request',
    withErrorHandling(
      withValidation(
        transactionWebRequestSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { fromPseudo, toPseudo, amount, description, transactionType } = data;
          logger.info('Web transaction request received', { socketId: socket.id, fromPseudo, toPseudo, amount, transactionType });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Vérifier que les utilisateurs existent
              const fromUser = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: fromPseudo } });
              });

              const toUser = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: toPseudo } });
              });

              if (!fromUser || !toUser) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Un ou plusieurs utilisateurs introuvables',
                    errorCode: 'USER_NOT_FOUND'
                  });
                }
                return;
              }

              // Créer une transaction en attente
              const transactionId = generateTransactionId();
              const transaction = await database.executeWithReconnection(async (db) => {
                return await db.transaction.create({
                  data: {
                    id: transactionId,
                    fromUserId: fromUser.id,
                    toUserId: toUser.id,
                    amount,
                    description: description || null,
                    transactionType,
                    status: 'pending',
                    createdAt: new Date()
                  }
                });
              });

              logger.info('Transaction created and pending verification', { transactionId });

              // Émettre vers Minecraft pour vérification des soldes
              io.emit('economy:verify-transaction', {
                transactionId,
                fromPseudo,
                toPseudo,
                amount,
                description,
                transactionType,
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Transaction en cours de vérification',
                  transactionId
                });
              }
            }

          } catch (error) {
            logger.error('Error during web transaction request', { error: error.message, fromPseudo, toPseudo });
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

  // 5. Route pour la confirmation de transaction depuis Minecraft (étape 2 - confirmation)
  socket.on('economy:minecraft-transaction-confirmation',
    withErrorHandling(
      withValidation(
        transactionMinecraftConfirmationSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { transactionId, success, errorMessage, fromBalance, toBalance, serverPseudo } = data;
          logger.info('Minecraft transaction confirmation received', { socketId: socket.id, transactionId, success });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Récupérer la transaction
              const transaction = await database.executeWithReconnection(async (db) => {
                return await db.transaction.findUnique({
                  where: { id: transactionId },
                  include: {
                    fromUser: true,
                    toUser: true
                  }
                });
              });

              if (!transaction) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Transaction introuvable',
                    errorCode: 'TRANSACTION_NOT_FOUND'
                  });
                }
                return;
              }

              if (transaction.status !== 'pending') {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Transaction déjà traitée',
                    errorCode: 'TRANSACTION_ALREADY_PROCESSED'
                  });
                }
                return;
              }

              // Mettre à jour le statut de la transaction
              const updatedTransaction = await database.executeWithReconnection(async (db) => {
                return await db.transaction.update({
                  where: { id: transactionId },
                  data: {
                    status: success ? 'completed' : 'failed',
                    errorMessage: success ? null : errorMessage,
                    processedAt: new Date()
                  }
                });
              });

              // Si la transaction est réussie, mettre à jour les soldes des comptes
              if (success && fromBalance !== undefined && toBalance !== undefined) {
                await database.executeWithReconnection(async (db) => {
                  // Mettre à jour le solde de l'expéditeur
                  await db.bankAccount.updateMany({
                    where: { 
                      ownerId: transaction.fromUserId,
                      isActive: true
                    },
                    data: { balance: fromBalance, updatedAt: new Date() }
                  });

                  // Mettre à jour le solde du destinataire
                  await db.bankAccount.updateMany({
                    where: { 
                      ownerId: transaction.toUserId,
                      isActive: true
                    },
                    data: { balance: toBalance, updatedAt: new Date() }
                  });
                });
              }

              logger.info('Transaction processed successfully', { transactionId, success });

              // Émettre la confirmation finale vers le canal approprié
              io.emit('economy:transaction-completed', {
                transactionId,
                fromPseudo: transaction.fromUser.pseudo,
                toPseudo: transaction.toUser.pseudo,
                amount: transaction.amount,
                transactionType: transaction.transactionType,
                success,
                errorMessage,
                fromBalance,
                toBalance,
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Confirmation de transaction traitée',
                  transaction: {
                    id: transactionId,
                    status: updatedTransaction.status,
                    fromPseudo: transaction.fromUser.pseudo,
                    toPseudo: transaction.toUser.pseudo,
                    amount: transaction.amount
                  }
                });
              }
            }

          } catch (error) {
            logger.error('Error during transaction confirmation', { error: error.message, transactionId });
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

  // 6. Route pour les transactions directes depuis Minecraft
  socket.on('economy:minecraft-transaction-direct',
    withErrorHandling(
      withValidation(
        transactionMinecraftDirectSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { fromPseudo, toPseudo, amount, description, transactionType, fromBalance, toBalance, serverPseudo } = data;
          logger.info('Minecraft direct transaction received', { socketId: socket.id, fromPseudo, toPseudo, amount, transactionType });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Vérifier que les utilisateurs existent
              const fromUser = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: fromPseudo } });
              });

              const toUser = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: toPseudo } });
              });

              if (!fromUser || !toUser) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Un ou plusieurs utilisateurs introuvables',
                    errorCode: 'USER_NOT_FOUND'
                  });
                }
                return;
              }

              // Créer la transaction directement comme terminée
              const transactionId = generateTransactionId();
              const transaction = await database.executeWithReconnection(async (db) => {
                return await db.transaction.create({
                  data: {
                    id: transactionId,
                    fromUserId: fromUser.id,
                    toUserId: toUser.id,
                    amount,
                    description: description || null,
                    transactionType,
                    status: 'completed',
                    createdAt: new Date(),
                    processedAt: new Date()
                  }
                });
              });

              // Mettre à jour les soldes des comptes
              await database.executeWithReconnection(async (db) => {
                // Mettre à jour le solde de l'expéditeur
                await db.bankAccount.updateMany({
                  where: { 
                    ownerId: fromUser.id,
                    isActive: true
                  },
                  data: { balance: fromBalance, updatedAt: new Date() }
                });

                // Mettre à jour le solde du destinataire
                await db.bankAccount.updateMany({
                  where: { 
                    ownerId: toUser.id,
                    isActive: true
                  },
                  data: { balance: toBalance, updatedAt: new Date() }
                });
              });

              logger.info('Direct transaction processed successfully', { transactionId });

              // Émettre la confirmation vers le canal approprié
              io.emit('economy:transaction-completed', {
                transactionId,
                fromPseudo,
                toPseudo,
                amount,
                transactionType,
                success: true,
                fromBalance,
                toBalance,
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Transaction directe traitée avec succès',
                  transaction: {
                    id: transactionId,
                    fromPseudo,
                    toPseudo,
                    amount,
                    transactionType,
                    fromBalance,
                    toBalance
                  }
                });
              }
            }

          } catch (error) {
            logger.error('Error during direct transaction', { error: error.message, fromPseudo, toPseudo });
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

  logger.info('Economy handler setup complete', { socketId: socket.id });
};