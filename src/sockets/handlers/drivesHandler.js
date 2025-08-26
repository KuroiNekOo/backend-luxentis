import logger from '../../config/logger.js';
import database from '../../config/database.js';
import { withErrorHandling } from '../middlewares/errorMiddleware.js';
import { withValidation } from '../middlewares/validationMiddleware.js';
import { 
  drivePurchaseSchema,
  driveAddItemSchema,
  driveUpdateItemSchema,
  driveRemoveItemSchema,
  driveWithdrawItemsSchema
} from '../schemas/exampleSchemas.js';
import { v4 as uuidv4 } from 'uuid';

const generateOrderId = () => {
  return uuidv4();
};

export const setupDrivesHandler = (socket, io) => {
  logger.info('Setting up Drives handler', { socketId: socket.id });

  // 1. Route pour achat dans le drive
  socket.on('drives:purchase',
    withErrorHandling(
      withValidation(
        drivePurchaseSchema,
        async (data, callback) => {
          if (!socket.connected) {
            logger.warn('Socket disconnected during drives:purchase', { socketId: socket.id });
            return;
          }

          const { driveId, buyerPseudo, items, totalAmount } = data;
          logger.info('Drive purchase request received', { socketId: socket.id, driveId, buyerPseudo, totalAmount });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Vérifier que l'acheteur existe
              const buyer = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: buyerPseudo } });
              });

              if (!buyer) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Acheteur introuvable',
                    errorCode: 'BUYER_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier que le drive existe
              const drive = await database.executeWithReconnection(async (db) => {
                return await db.drive.findUnique({ where: { id: driveId } });
              });

              if (!drive) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Drive introuvable',
                    errorCode: 'DRIVE_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier la disponibilité et les prix des articles
              const itemsToUpdate = [];
              let calculatedTotal = 0;

              for (const item of items) {
                const driveItem = await database.executeWithReconnection(async (db) => {
                  return await db.driveItem.findUnique({ 
                    where: { 
                      id: item.itemId,
                      driveId: driveId
                    }
                  });
                });

                if (!driveItem) {
                  if (callback) {
                    callback({
                      success: false,
                      error: `Article ${item.itemId} introuvable dans ce drive`,
                      errorCode: 'ITEM_NOT_FOUND'
                    });
                  }
                  return;
                }

                if (driveItem.stock < item.quantity) {
                  if (callback) {
                    callback({
                      success: false,
                      error: `Stock insuffisant pour ${driveItem.name} (demandé: ${item.quantity}, disponible: ${driveItem.stock})`,
                      errorCode: 'INSUFFICIENT_STOCK'
                    });
                  }
                  return;
                }

                if (Math.abs(driveItem.price - item.unitPrice) > 0.01) {
                  if (callback) {
                    callback({
                      success: false,
                      error: `Prix incorrect pour ${driveItem.name}`,
                      errorCode: 'PRICE_MISMATCH'
                    });
                  }
                  return;
                }

                calculatedTotal += driveItem.price * item.quantity;
                itemsToUpdate.push({
                  driveItem,
                  quantity: item.quantity
                });
              }

              if (Math.abs(calculatedTotal - totalAmount) > 0.01) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Montant total incorrect',
                    errorCode: 'TOTAL_AMOUNT_MISMATCH'
                  });
                }
                return;
              }

              // Créer la commande et mettre à jour les stocks
              const orderId = generateOrderId();
              
              await database.executeWithReconnection(async (db) => {
                // Créer la commande
                const order = await db.driveOrder.create({
                  data: {
                    id: orderId,
                    driveId,
                    buyerId: buyer.id,
                    totalAmount,
                    status: 'completed',
                    createdAt: new Date()
                  }
                });

                // Créer les items de commande et mettre à jour les stocks
                for (const itemUpdate of itemsToUpdate) {
                  await db.driveOrderItem.create({
                    data: {
                      orderId: order.id,
                      itemId: itemUpdate.driveItem.id,
                      quantity: itemUpdate.quantity,
                      unitPrice: itemUpdate.driveItem.price,
                      totalPrice: itemUpdate.driveItem.price * itemUpdate.quantity
                    }
                  });

                  await db.driveItem.update({
                    where: { id: itemUpdate.driveItem.id },
                    data: { 
                      stock: itemUpdate.driveItem.stock - itemUpdate.quantity,
                      updatedAt: new Date()
                    }
                  });
                }
              });

              logger.info('Drive purchase completed successfully', { orderId, driveId, buyerPseudo });

              // Émettre la confirmation vers le canal approprié
              io.emit('drives:purchase-completed', {
                orderId,
                driveId,
                buyerPseudo,
                items: items.map(item => ({
                  itemId: item.itemId,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice
                })),
                totalAmount,
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Achat effectué avec succès',
                  order: {
                    id: orderId,
                    driveId,
                    totalAmount,
                    itemsCount: items.length
                  }
                });
              }
            }

          } catch (error) {
            logger.error('Error during drive purchase', { error: error.message, driveId, buyerPseudo });
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

  // 2. Route pour ajouter un article dans le drive
  socket.on('drives:add-item',
    withErrorHandling(
      withValidation(
        driveAddItemSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { driveId, itemName, itemDescription, price, stock, category, adderPseudo } = data;
          logger.info('Drive add item request received', { socketId: socket.id, driveId, itemName, adderPseudo });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Vérifier que l'utilisateur existe
              const adder = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: adderPseudo } });
              });

              if (!adder) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Utilisateur introuvable',
                    errorCode: 'USER_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier que le drive existe et que l'utilisateur a les permissions
              const drive = await database.executeWithReconnection(async (db) => {
                return await db.drive.findUnique({ 
                  where: { id: driveId },
                  include: { owner: true }
                });
              });

              if (!drive) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Drive introuvable',
                    errorCode: 'DRIVE_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier les permissions (propriétaire ou employé autorisé)
              const canManage = drive.ownerId === adder.id || await database.executeWithReconnection(async (db) => {
                const employment = await db.employment.findFirst({
                  where: {
                    employeeId: adder.id,
                    company: { drives: { some: { id: driveId } } },
                    endDate: null
                  }
                });
                return !!employment;
              });

              if (!canManage) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Permissions insuffisantes pour gérer ce drive',
                    errorCode: 'UNAUTHORIZED'
                  });
                }
                return;
              }

              // Créer l'article
              const item = await database.executeWithReconnection(async (db) => {
                return await db.driveItem.create({
                  data: {
                    driveId,
                    name: itemName,
                    description: itemDescription || null,
                    price,
                    stock,
                    category: category || null,
                    isActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date()
                  }
                });
              });

              logger.info('Drive item added successfully', { itemId: item.id, driveId });

              // Émettre la confirmation vers le canal approprié
              io.emit('drives:item-added', {
                item: {
                  id: item.id,
                  driveId,
                  name: item.name,
                  description: item.description,
                  price: item.price,
                  stock: item.stock,
                  category: item.category
                },
                adderPseudo,
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Article ajouté avec succès',
                  item: {
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    stock: item.stock
                  }
                });
              }
            }

          } catch (error) {
            logger.error('Error during drive item addition', { error: error.message, driveId, itemName });
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

  // 3. Route pour modifier un article dans le drive
  socket.on('drives:update-item',
    withErrorHandling(
      withValidation(
        driveUpdateItemSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { driveId, itemId, itemName, itemDescription, price, stock, category, updaterPseudo } = data;
          logger.info('Drive update item request received', { socketId: socket.id, driveId, itemId, updaterPseudo });

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

              // Vérifier que l'article existe
              const item = await database.executeWithReconnection(async (db) => {
                return await db.driveItem.findUnique({ 
                  where: { id: itemId, driveId }
                });
              });

              if (!item) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Article introuvable dans ce drive',
                    errorCode: 'ITEM_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier les permissions
              const drive = await database.executeWithReconnection(async (db) => {
                return await db.drive.findUnique({ where: { id: driveId } });
              });

              const canManage = drive.ownerId === updater.id || await database.executeWithReconnection(async (db) => {
                const employment = await db.employment.findFirst({
                  where: {
                    employeeId: updater.id,
                    company: { drives: { some: { id: driveId } } },
                    endDate: null
                  }
                });
                return !!employment;
              });

              if (!canManage) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Permissions insuffisantes',
                    errorCode: 'UNAUTHORIZED'
                  });
                }
                return;
              }

              // Construire les données de mise à jour
              const updateData = { updatedAt: new Date() };
              if (itemName) updateData.name = itemName;
              if (itemDescription !== undefined) updateData.description = itemDescription;
              if (price !== undefined) updateData.price = price;
              if (stock !== undefined) updateData.stock = stock;
              if (category !== undefined) updateData.category = category;

              // Mettre à jour l'article
              const updatedItem = await database.executeWithReconnection(async (db) => {
                return await db.driveItem.update({
                  where: { id: itemId },
                  data: updateData
                });
              });

              logger.info('Drive item updated successfully', { itemId, driveId });

              // Émettre la confirmation vers le canal approprié
              io.emit('drives:item-updated', {
                item: {
                  id: updatedItem.id,
                  driveId,
                  name: updatedItem.name,
                  description: updatedItem.description,
                  price: updatedItem.price,
                  stock: updatedItem.stock,
                  category: updatedItem.category
                },
                updaterPseudo,
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Article modifié avec succès',
                  item: {
                    id: updatedItem.id,
                    name: updatedItem.name,
                    price: updatedItem.price,
                    stock: updatedItem.stock
                  }
                });
              }
            }

          } catch (error) {
            logger.error('Error during drive item update', { error: error.message, driveId, itemId });
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

  // 4. Route pour supprimer un article dans le drive
  socket.on('drives:remove-item',
    withErrorHandling(
      withValidation(
        driveRemoveItemSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { driveId, itemId, removerPseudo, reason } = data;
          logger.info('Drive remove item request received', { socketId: socket.id, driveId, itemId, removerPseudo });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Vérifier que l'utilisateur existe
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

              // Vérifier que l'article existe
              const item = await database.executeWithReconnection(async (db) => {
                return await db.driveItem.findUnique({ 
                  where: { id: itemId, driveId }
                });
              });

              if (!item) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Article introuvable dans ce drive',
                    errorCode: 'ITEM_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier les permissions
              const drive = await database.executeWithReconnection(async (db) => {
                return await db.drive.findUnique({ where: { id: driveId } });
              });

              const canManage = drive.ownerId === remover.id || await database.executeWithReconnection(async (db) => {
                const employment = await db.employment.findFirst({
                  where: {
                    employeeId: remover.id,
                    company: { drives: { some: { id: driveId } } },
                    endDate: null
                  }
                });
                return !!employment;
              });

              if (!canManage) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Permissions insuffisantes',
                    errorCode: 'UNAUTHORIZED'
                  });
                }
                return;
              }

              // Désactiver l'article (soft delete)
              await database.executeWithReconnection(async (db) => {
                await db.driveItem.update({
                  where: { id: itemId },
                  data: { 
                    isActive: false,
                    updatedAt: new Date()
                  }
                });
              });

              logger.info('Drive item removed successfully', { itemId, driveId });

              // Émettre la confirmation vers le canal approprié
              io.emit('drives:item-removed', {
                itemId,
                driveId,
                itemName: item.name,
                removerPseudo,
                reason: reason || null,
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Article supprimé avec succès',
                  itemId,
                  itemName: item.name
                });
              }
            }

          } catch (error) {
            logger.error('Error during drive item removal', { error: error.message, driveId, itemId });
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

  // 5. Route pour retirer des articles du drive
  socket.on('drives:withdraw-items',
    withErrorHandling(
      withValidation(
        driveWithdrawItemsSchema,
        async (data, callback) => {
          if (!socket.connected) return;

          const { driveId, items, withdrawerPseudo, reason } = data;
          logger.info('Drive withdraw items request received', { socketId: socket.id, driveId, withdrawerPseudo, itemsCount: items.length });

          try {
            const prisma = database.getClient();
            
            if (prisma) {
              // Vérifier que l'utilisateur existe
              const withdrawer = await database.executeWithReconnection(async (db) => {
                return await db.user.findUnique({ where: { pseudo: withdrawerPseudo } });
              });

              if (!withdrawer) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Utilisateur introuvable',
                    errorCode: 'USER_NOT_FOUND'
                  });
                }
                return;
              }

              // Vérifier les permissions
              const drive = await database.executeWithReconnection(async (db) => {
                return await db.drive.findUnique({ where: { id: driveId } });
              });

              if (!drive) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Drive introuvable',
                    errorCode: 'DRIVE_NOT_FOUND'
                  });
                }
                return;
              }

              const canManage = drive.ownerId === withdrawer.id || await database.executeWithReconnection(async (db) => {
                const employment = await db.employment.findFirst({
                  where: {
                    employeeId: withdrawer.id,
                    company: { drives: { some: { id: driveId } } },
                    endDate: null
                  }
                });
                return !!employment;
              });

              if (!canManage) {
                if (callback) {
                  callback({
                    success: false,
                    error: 'Permissions insuffisantes',
                    errorCode: 'UNAUTHORIZED'
                  });
                }
                return;
              }

              // Vérifier la disponibilité des articles et préparer les retraits
              const itemsToWithdraw = [];
              
              for (const item of items) {
                const driveItem = await database.executeWithReconnection(async (db) => {
                  return await db.driveItem.findUnique({ 
                    where: { 
                      id: item.itemId,
                      driveId: driveId,
                      isActive: true
                    }
                  });
                });

                if (!driveItem) {
                  if (callback) {
                    callback({
                      success: false,
                      error: `Article ${item.itemId} introuvable dans ce drive`,
                      errorCode: 'ITEM_NOT_FOUND'
                    });
                  }
                  return;
                }

                if (driveItem.stock < item.quantity) {
                  if (callback) {
                    callback({
                      success: false,
                      error: `Stock insuffisant pour ${driveItem.name} (demandé: ${item.quantity}, disponible: ${driveItem.stock})`,
                      errorCode: 'INSUFFICIENT_STOCK'
                    });
                  }
                  return;
                }

                itemsToWithdraw.push({
                  driveItem,
                  quantity: item.quantity
                });
              }

              // Créer le retrait et mettre à jour les stocks
              const withdrawalId = generateOrderId();
              
              await database.executeWithReconnection(async (db) => {
                // Créer l'enregistrement de retrait
                const withdrawal = await db.driveWithdrawal.create({
                  data: {
                    id: withdrawalId,
                    driveId,
                    withdrawerId: withdrawer.id,
                    reason: reason || null,
                    createdAt: new Date()
                  }
                });

                // Créer les items de retrait et mettre à jour les stocks
                for (const itemWithdraw of itemsToWithdraw) {
                  await db.driveWithdrawalItem.create({
                    data: {
                      withdrawalId: withdrawal.id,
                      itemId: itemWithdraw.driveItem.id,
                      quantity: itemWithdraw.quantity
                    }
                  });

                  await db.driveItem.update({
                    where: { id: itemWithdraw.driveItem.id },
                    data: { 
                      stock: itemWithdraw.driveItem.stock - itemWithdraw.quantity,
                      updatedAt: new Date()
                    }
                  });
                }
              });

              logger.info('Drive items withdrawn successfully', { withdrawalId, driveId, withdrawerPseudo });

              // Émettre la confirmation vers le canal approprié
              io.emit('drives:items-withdrawn', {
                withdrawalId,
                driveId,
                withdrawerPseudo,
                items: items.map(item => ({
                  itemId: item.itemId,
                  quantity: item.quantity
                })),
                reason: reason || null,
                timestamp: new Date().toISOString()
              });

              if (callback) {
                callback({
                  success: true,
                  message: 'Articles retirés avec succès',
                  withdrawal: {
                    id: withdrawalId,
                    driveId,
                    itemsCount: items.length
                  }
                });
              }
            }

          } catch (error) {
            logger.error('Error during drive items withdrawal', { error: error.message, driveId, withdrawerPseudo });
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

  logger.info('Drives handler setup complete', { socketId: socket.id });
};