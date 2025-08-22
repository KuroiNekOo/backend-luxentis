# Stratégies de Reconnexion - Redis & Prisma

## Vue d'ensemble

Ce document décrit les stratégies de reconnexion automatique mises en place pour Redis et Prisma dans le backend Semirp, avec la distinction entre comportement au **démarrage** et en **runtime**.

## Redis - Reconnexion Automatique Native

### Configuration

```javascript
reconnectStrategy: (retries) => {
  if (retries > 10) {
    logger.error('Redis reconnection failed after all attempts - running in degraded mode');
    return false; // Arrêter les tentatives, passer en mode dégradé
  }
  
  logger.info(`Redis reconnection attempt ${retries}/10`);
  // Backoff exponentiel: 100ms, 200ms, 400ms, 800ms, 1600ms, puis max 5s
  return Math.min(retries * 100, 5000);
},

retryDelayOnFailover: 100,    // 100ms entre les tentatives lors d'un failover
maxRetriesPerRequest: 3,      // 3 tentatives par commande Redis
lazyConnect: false            // Connexion immédiate au démarrage
```

## Comportements selon les phases

### 🚀 Phase de Démarrage

**Objectif** : Déterminer si l'application peut démarrer selon les services requis.

#### REDIS_REQUIRED=false (défaut)
```
Redis indisponible au démarrage
↓
❌ Connexion échoue (1 seule tentative)
↓ 
⚠️  "Redis failed but not required, continuing without it"
↓
✅ Application démarre en mode dégradé
```

#### REDIS_REQUIRED=true
```
Redis indisponible au démarrage
↓
❌ Connexion échoue (1 seule tentative)
↓
🛑 "Redis is required but connection failed at startup"
↓
💥 Application refuse de démarrer (process.exit)
```

### ⚡ Phase Runtime (après démarrage réussi)

**Objectif** : Maintenir la résilience de l'application en cas de panne service.

#### Redis plante en cours d'exécution (peu importe REQUIRED)
```
Redis fonctionne normalement
↓
💥 Redis crash/redémarre/réseau coupé
↓
🔔 Event 'disconnect' émis
↓
🔄 reconnectStrategy démarre automatiquement
↓
📈 REDIS_MAX_RETRIES tentatives avec backoff exponentiel (100ms → 5s)
↓
Case A: ✅ Reconnexion réussie → Mode normal restauré automatiquement
Case B: ❌ Toutes tentatives échouées → Mode dégradé + Heartbeat périodique
```

**Mode dégradé avec heartbeat périodique :**
```
❌ Échec de la reconnectStrategy
↓
🔄 "Redis degraded mode activated: sessions will use memory store, cache operations disabled"
↓
⏰ Tentatives automatiques toutes les 30 secondes
↓
✅ Dès que Redis revient → "Periodic reconnection successful - Redis back online!"
↓
🔄 Mode normal restauré automatiquement (sessions Redis, cache activé)
```

**Important** : Même avec `REQUIRED=true`, l'application **ne crash jamais** en runtime. Elle passe en mode dégradé et tente continuellement de se reconnecter.

### Events gérés et restauration automatique

- `connect` : Connexion établie/restaurée → **Restaure automatiquement le mode normal**
- `disconnect` : Connexion perdue → Déclenche reconnectStrategy
- `reconnecting` : Tentative de reconnexion en cours
- `error` : Erreur de connexion (loggée uniquement)

**Restauration automatique du mode normal :**
1. **Event `connect`** émis quand Redis revient
2. **`isConnected = true`** automatiquement
3. **Sessions Express** automatiquement remises sur Redis store
4. **Opérations cache** redeviennent fonctionnelles
5. **Heartbeat périodique** s'arrête automatiquement

## Prisma - Wrapper Pattern pour Reconnexion

### Problématique

Prisma **ne propose pas** de reconnexion automatique native. Le pool de connexions gère les connexions individuelles, mais pas la perte du serveur de base de données.

## Comportements selon les phases

### 🚀 Phase de Démarrage

**Objectif** : S'assurer que la base de données est accessible si requise.

#### DATABASE_REQUIRED=false (défaut)
```
MySQL indisponible au démarrage
↓
❌ Connexion échoue après 3 tentatives (retry manuel)
↓
⚠️  "Database failed but not required, continuing without it"
↓
✅ Application démarre sans base de données
```

#### DATABASE_REQUIRED=true
```
MySQL indisponible au démarrage
↓
❌ Connexion échoue après 3 tentatives (retry manuel)
↓
🛑 "Database is required but connection failed after all retries"
↓
💥 Application refuse de démarrer (process.exit)
```

### ⚡ Phase Runtime (après démarrage réussi)

**Objectif** : Reconnexion intelligente lors de la perte de connexion serveur.

#### Base de données plante en cours d'exécution
```javascript
// Opération normale
const users = await database.executeWithReconnection(async (prisma) => {
  return await prisma.user.findMany();
});
```

```
Opération Prisma lancée
↓
💥 MySQL crash/redémarre (erreur P1001/P1017/P1008)
↓
🔍 executeWithReconnection détecte l'erreur
↓
🔄 database.reconnect() automatique
↓
✅ Reconnexion réussie → Retry de l'opération 1 fois
OU
❌ Reconnexion échouée → Erreur propagée à l'appelant
```

### Solution : `executeWithReconnection()`

```javascript
async executeWithReconnection(operation) {
  try {
    return await operation(this.prisma);
  } catch (error) {
    // Détecter les erreurs de connexion Prisma
    if (error.code === 'P1001' || error.code === 'P1017' || error.code === 'P1008') {
      logger.warn('Database connection lost, attempting reconnection...', { 
        errorCode: error.code 
      });
      
      // Tentative de reconnexion automatique
      const reconnected = await this.reconnect();
      
      if (reconnected) {
        logger.info('Database reconnected successfully, retrying operation...');
        return await operation(this.prisma); // Une seule tentative de retry
      }
    }
    
    throw error; // Propager l'erreur si pas de reconnexion possible
  }
}
```

### Codes d'erreur Prisma détectés

- **P1001** : Can't reach database server
- **P1017** : Server has closed the connection  
- **P1008** : Operations timed out

**Important** : Contrairement à Redis, Prisma ne se reconnecte **que quand une opération échoue**, pas en arrière-plan.

## Configuration Environnement

### Variables Redis

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_ENABLED=true
REDIS_REQUIRED=false
REDIS_MAX_RETRIES=3
```

### Variables Database

```env
DATABASE_URL="mysql://root:password@localhost:3306/semirp_db"
DATABASE_ENABLED=true
DATABASE_REQUIRED=false
DATABASE_MAX_RETRIES=3
```

## Mode Dégradé

### Qu'est-ce que le mode dégradé ?

Le **mode dégradé** signifie que l'application continue de fonctionner avec des fonctionnalités réduites lorsqu'un service n'est pas disponible.

### Redis - Exemples concrets

#### Mode Normal (Redis connecté)
```javascript
// Sessions stockées dans Redis (persistantes)
app.use(session({ store: redisStore }));

// Cache des données utilisateur
const userData = await redisClient.get(`user:${id}`);
if (!userData) {
  userData = await database.user.findById(id);
  await redisClient.set(`user:${id}`, userData, 300); // Cache 5min
}
return userData;
```

#### Mode Dégradé (Redis déconnecté)
```javascript
// Sessions en mémoire (perdues au restart)
app.use(session({ store: memoryStore }));

// Pas de cache, requête directe en base
const userData = await database.user.findById(id); // Toujours hit sur DB
return userData; // Plus lent mais fonctionnel
```

### Database - Exemples concrets

#### Mode Normal (MySQL connecté)
```javascript
// Toutes les fonctionnalités disponibles
const users = await database.executeWithReconnection(async (prisma) => {
  return await prisma.user.findMany();
});
// Retourne les utilisateurs
```

#### Mode Dégradé (MySQL déconnecté)
```javascript
// Health check retourne 'disabled'
const health = await database.healthCheck();
// { status: 'disabled', message: 'Database not connected' }

// Les opérations échouent gracieusement
const users = await database.executeWithReconnection(async (prisma) => {
  return await prisma.user.findMany();
});
// Retourne null ou throw une erreur selon le contexte
```

## Scénarios Complets

### Scénario 1 : Démarrage avec services indisponibles

#### REQUIRED=false (recommandé en développement)
```
npm start
↓
❌ Redis ECONNREFUSED
❌ MySQL P1000 (auth failed)
↓
⚠️  Mode dégradé activé pour les deux services
↓
✅ Application démarre quand même
↓
🌐 API disponible sur localhost:3000
```

#### REQUIRED=true (production avec monitoring)
```
npm start
↓
❌ Redis ECONNREFUSED  
↓
💥 "Redis is required but connection failed at startup"
↓
🛑 Application refuse de démarrer (exit code 1)
```

### Scénario 2 : Crash en cours d'exécution

#### Redis crash pendant que l'app tourne
```
Application fonctionne normalement
↓
💥 Redis serveur crash
↓
🔔 Event 'disconnect' automatique
↓
🔄 reconnectStrategy: 10 tentatives (100ms → 5s)
↓
Case A: ✅ Redis redémarre → reconnexion OK → mode normal
Case B: ❌ Redis reste down → mode dégradé permanent
```

#### MySQL crash pendant une opération
```
const users = await database.executeWithReconnection(async (prisma) => {
  return await prisma.user.findMany(); // ← Ici MySQL crash
});
↓
💥 P1017: "Server has closed the connection"
↓
🔍 executeWithReconnection détecte l'erreur
↓
🔄 database.reconnect() → recréer PrismaClient
↓
Case A: ✅ Reconnexion OK → retry de l'opération → résultat OK
Case B: ❌ Reconnexion KO → throw error → à gérer par l'appelant
```

## Monitoring

### Health Check

- **Endpoint** : `/api/health`
- **Redis** : Test via `ping()`
- **Database** : Test via `SELECT 1` (avec reconnexion automatique)

### Logs

```javascript
// Redis
logger.info('Redis Client Connected');
logger.warn('Redis Client Disconnected');
logger.info('Redis Client Reconnecting');

// Database
logger.warn('Database connection lost, attempting reconnection...');
logger.info('Database reconnected successfully, retrying operation...');
```

## Recommandations

### Production

- Activer le monitoring des reconnexions
- Configurer des alertes sur les échecs de reconnexion
- Tester régulièrement les scénarios de panne
- Ajuster les timeouts selon la charge

### Développement

- Utiliser `REQUIRED=false` pour un développement plus fluide
- Surveiller les logs pour détecter les problèmes de connexion
- Tester manuellement les pannes avec Docker

## Limitations

### Redis

- Maximum 10 tentatives de reconnexion
- Pas de retry infini (évite les boucles)
- Les commandes en cours peuvent échouer pendant la reconnexion

### Prisma

- Une seule tentative de retry après reconnexion
- Nécessite de wrapper chaque opération critique
- Les transactions en cours sont perdues lors de la reconnexion