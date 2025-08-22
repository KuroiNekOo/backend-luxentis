# Semirp Backend

Backend API pour l'application semirp - Communication entre frontend et serveur Minecraft.

## 🚀 Fonctionnalités

- **API REST** avec Express.js
- **API WebSocket** avec Socket.IO
- **Authentification** par sessions (Redis)
- **Autorisation** basée sur les rôles et permissions
- **Base de données** MySQL avec Prisma ORM
- **Cache** Redis
- **Sécurité** intégrée (Helmet, CORS, Rate limiting, XSS protection)
- **Logging** structuré avec Winston
- **Validation** des données avec Zod

## 📋 Prérequis

- Node.js 18+
- MySQL 8.0 (optionnel en développement)
- Redis (optionnel en développement)
- npm ou yarn

## 🔧 Mode Fallback

L'application peut fonctionner sans MySQL et/ou Redis en mode dégradé :
- **Sans Redis** : Sessions en mémoire (perdues au redémarrage)
- **Sans MySQL** : Mode lecture seule avec utilisateur admin par défaut
- **Admin fallback** : `admin@semirp.com` / `password123`

## 🛠️ Installation

1. **Cloner le projet**
```bash
git clone <repository-url>
cd semirp-backend
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configuration**
```bash
cp .env.example .env
# Modifier le fichier .env avec vos configurations
```

4. **Base de données**
```bash
# Générer le client Prisma
npm run db:generate

# Appliquer les migrations
npm run db:migrate

# Peupler la base avec des données de test
npm run db:seed
```

## 🏃‍♂️ Démarrage

### Développement
```bash
npm run dev
```

### Production
```bash
npm start
```

Le serveur démarre sur le port défini dans `.env` (par défaut 3000).

## 📚 API Documentation

### Endpoints principaux

- **Health Check**: `GET /api/health`
- **Authentification**: `POST /api/auth/login`
- **Inscription**: `POST /api/auth/register`
- **Profil**: `GET /api/auth/me`

### WebSocket Events

- **Authentification**: `auth:authenticate`
- **Minecraft**: `minecraft:join-server`, `minecraft:chat-message`

## 🗂️ Structure du projet

```
src/
├── config/          # Configurations (DB, Redis, Logger)
├── controllers/     # Contrôleurs Express
├── middlewares/     # Middlewares (Auth, Validation, Sécurité)
├── repositories/    # Couche d'accès aux données
├── routes/          # Routes API
├── services/        # Logique métier
├── sockets/         # Handlers WebSocket
├── seeders/         # Scripts de peuplement
├── utils/           # Utilitaires
└── server.js        # Point d'entrée
```

## 🔐 Authentification

L'application utilise des sessions Redis pour l'authentification. Les utilisateurs peuvent se connecter via l'API REST et utiliser la même session pour Socket.IO.

### Utilisateur admin par défaut
- Email: `admin@semirp.com`
- Mot de passe: `password123`

## 🔑 Rôles et Permissions

- **admin**: Accès complet au système
- **moderator**: Accès limité à l'administration
- **user**: Accès utilisateur de base
- **minecraft_admin**: Administration serveur Minecraft

## 🎮 Intégration Minecraft

Le backend expose des APIs WebSocket pour communiquer avec les serveurs Minecraft :

- Connexion aux serveurs
- Chat en temps réel
- Exécution de commandes
- Statut des serveurs

## 🛡️ Sécurité

- Headers sécurisés avec Helmet
- Protection CORS configurée
- Rate limiting par IP
- Sanitisation des inputs XSS
- Sessions sécurisées
- Validation stricte des données

## 📊 Logging

Tous les événements sont loggés avec Winston :
- Fichiers de logs rotatifs
- Logs structurés en JSON
- Niveaux appropriés selon l'environnement

## 🚀 Déploiement

1. **Variables d'environnement**
```bash
NODE_ENV=production
DATABASE_URL=mysql://...
DATABASE_REQUIRED=true  # Pour forcer MySQL en production
REDIS_HOST=...
REDIS_REQUIRED=true     # Pour forcer Redis en production
SESSION_SECRET=...
```

2. **Migration de la base**
```bash
npm run db:migrate
```

3. **Démarrage**
```bash
npm start
```

## 🔧 Scripts disponibles

```bash
npm run dev          # Développement avec watch
npm start            # Production
npm run db:generate  # Générer le client Prisma
npm run db:migrate   # Appliquer les migrations
npm run db:seed      # Peupler la base de données
npm run db:reset     # Reset et seed de la base
```

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/amazing-feature`)
3. Commit les changements (`git commit -m 'Add amazing feature'`)
4. Push la branche (`git push origin feature/amazing-feature`)
5. Ouvrir une Pull Request

## 📝 License

Ce projet est sous licence ISC.