# Documentation AuthHandler - Authentification Minecraft

Cette documentation décrit le fonctionnement de toutes les routes d'authentification websocket pour l'intégration avec Minecraft.

## Vue d'ensemble

Le système d'authentification fonctionne avec deux types de clients :
- **Serveur Minecraft** : Envoie les demandes d'inscription/connexion/changement de mot de passe
- **Interface Web** : Permet aux joueurs de finaliser leur inscription/changement de mot de passe avec un code

## Configuration Redis

- **TTL des codes** : 300 secondes (5 minutes)
- **Format des clés** :
  - Inscription : `user:signup:${pseudo}`
  - Changement mot de passe : `user:password-change:${pseudo}`

---

## Routes d'écoute (socket.on)

### 1. 📥 `web:signup-request`

**Origine** : Interface Web  
**Description** : Un joueur demande à s'inscrire avec son pseudo

#### Données reçues
```javascript
{
  pseudo: string // Le pseudo du joueur (3-20 caractères)
}
```

#### Processus
1. Vérifie si le pseudo existe déjà en base de données
2. Si le pseudo n'existe pas :
   - Génère un code à 6 chiffres
   - Stocke le code dans Redis avec la clé `user:signup:${pseudo}` (TTL: 5 min)
   - Émet le code vers `auth:code-generated`

#### Callback de réponse
```javascript
// Succès
{
  success: true,
  message: "Code généré pour inscription",
  pseudo: string
}

// Erreur - Pseudo déjà utilisé
{
  success: false,
  error: "Ce pseudo est déjà utilisé",
  errorCode: "PSEUDO_ALREADY_EXISTS"
}

// Erreur serveur
{
  success: false,
  error: "Erreur serveur",
  errorCode: "SERVER_ERROR"
}
```

#### Émissions (io.emit)
- `auth:code-generated` : Envoie le code au serveur Minecraft

---

### 2. 📥 `web:complete-signup`

**Origine** : Interface Web  
**Description** : Le joueur finalise son inscription avec le code reçu et son mot de passe

#### Données reçues
```javascript
{
  pseudo: string,           // Le pseudo (3+ caractères)
  code: string,            // Code à 6 chiffres
  password: string,        // Mot de passe (8+ caractères)
  confirmPassword: string  // Confirmation mot de passe
}
```

#### Processus
1. Vérifie que `password` === `confirmPassword`
2. Récupère le code stocké dans Redis (`user:signup:${pseudo}`)
3. Vérifie que le code reçu correspond au code stocké
4. Hashe le mot de passe avec bcrypt (12 rounds)
5. Crée l'utilisateur en base de données
6. Supprime le code de Redis

#### Callback de réponse
```javascript
// Succès
{
  success: true,
  message: "Inscription terminée avec succès",
  pseudo: string
}

// Erreur - Mots de passe différents
{
  success: false,
  error: "Les mots de passe ne correspondent pas",
  errorCode: "PASSWORD_MISMATCH"
}

// Erreur - Code invalide
{
  success: false,
  error: "Code invalide ou expiré",
  errorCode: "INVALID_CODE"
}
```

---

### 3. 📥 `minecraft:player-connect`

**Origine** : Serveur Minecraft  
**Description** : Un joueur se connecte au serveur

#### Données reçues
```javascript
{
  pseudo: string // Le pseudo du joueur
}
```

#### Processus
1. Vérifie si le pseudo existe en base de données
2. Si l'utilisateur existe :
   - Met à jour le champ `lastLoginAt` avec la date actuelle
   - Émet l'information de connexion via `player:connected`

#### Callback de réponse
```javascript
// Succès
{
  success: true,
  message: "Connexion enregistrée",
  pseudo: string
}

// Erreur - Utilisateur non trouvé
{
  success: false,
  error: "Utilisateur non trouvé",
  errorCode: "USER_NOT_FOUND"
}
```

#### Émissions (io.emit)
- `player:connected` : Notifie la connexion du joueur à tous les clients

---

### 4. 📥 `minecraft:player-disconnect`

**Origine** : Serveur Minecraft  
**Description** : Un joueur se déconnecte du serveur

#### Données reçues
```javascript
{
  pseudo: string // Le pseudo du joueur
}
```

#### Processus
1. Émet directement l'information de déconnexion (pas de vérification BDD nécessaire)

#### Callback de réponse
```javascript
// Succès
{
  success: true,
  message: "Déconnexion enregistrée",
  pseudo: string
}
```

#### Émissions (io.emit)
- `player:disconnected` : Notifie la déconnexion du joueur à tous les clients

---

### 5. 📥 `web:password-change-request`

**Origine** : Interface Web  
**Description** : Un joueur demande à changer son mot de passe

#### Données reçues
```javascript
{
  pseudo: string // Le pseudo du joueur
}
```

#### Processus
1. Vérifie si le pseudo existe en base de données
2. Si l'utilisateur existe :
   - Génère un code à 6 chiffres
   - Stocke le code dans Redis avec la clé `user:password-change:${pseudo}` (TTL: 5 min)
   - Émet le code vers `auth:code-generated`

#### Callback de réponse
```javascript
// Succès
{
  success: true,
  message: "Code généré pour changement de mot de passe",
  pseudo: string
}

// Erreur - Utilisateur non trouvé
{
  success: false,
  error: "Utilisateur non trouvé",
  errorCode: "USER_NOT_FOUND"
}
```

#### Émissions (io.emit)
- `auth:code-generated` : Envoie le code au serveur Minecraft

---

### 6. 📥 `web:complete-password-change`

**Origine** : Interface Web  
**Description** : Le joueur finalise son changement de mot de passe avec le code reçu et son nouveau mot de passe

#### Données reçues
```javascript
{
  pseudo: string,           // Le pseudo
  code: string,            // Code à 6 chiffres
  password: string,        // Nouveau mot de passe (8+ caractères)
  confirmPassword: string  // Confirmation nouveau mot de passe
}
```

#### Processus
1. Vérifie que `password` === `confirmPassword`
2. Récupère le code stocké dans Redis (`user:password-change:${pseudo}`)
3. Vérifie que le code reçu correspond au code stocké
4. Hashe le nouveau mot de passe avec bcrypt (12 rounds)
5. Met à jour le mot de passe en base de données
6. Supprime le code de Redis

#### Callback de réponse
```javascript
// Succès
{
  success: true,
  message: "Mot de passe changé avec succès",
  pseudo: string
}

// Erreur - Mots de passe différents
{
  success: false,
  error: "Les mots de passe ne correspondent pas",
  errorCode: "PASSWORD_MISMATCH"
}

// Erreur - Code invalide
{
  success: false,
  error: "Code invalide ou expiré",
  errorCode: "INVALID_CODE"
}
```

---

## Émissions sortantes (io.emit)

### 📤 `auth:code-generated`

**Destinataire** : Serveur Minecraft  
**Émis lors** : Génération d'un code d'inscription ou de changement de mot de passe

```javascript
{
  pseudo: string,
  code: string,      // Code à 6 chiffres
  type: string       // "signup" ou "password-change"
}
```

### 📤 `player:connected`

**Destinataire** : Tous les clients connectés  
**Émis lors** : Connexion réussie d'un joueur

```javascript
{
  pseudo: string,
  timestamp: string // ISO string
}
```

### 📤 `player:disconnected`

**Destinataire** : Tous les clients connectés  
**Émis lors** : Déconnexion d'un joueur

```javascript
{
  pseudo: string,
  timestamp: string // ISO string
}
```

---

## Flux d'authentification

### Inscription complète
1. **Web** → `web:signup-request` avec `{pseudo}`
2. **Backend** → Génère code, stocke dans Redis
3. **Backend** → `auth:code-generated` vers Minecraft
4. **Minecraft** → Affiche le code au joueur
5. **Joueur** → Saisit code + mot de passe sur interface web
6. **Web** → `web:complete-signup` avec `{pseudo, code, password, confirmPassword}`
7. **Backend** → Vérifie code, crée utilisateur, supprime code Redis

### Changement de mot de passe complet
1. **Web** → `web:password-change-request` avec `{pseudo}`
2. **Backend** → Génère code, stocke dans Redis
3. **Backend** → `auth:code-generated` vers Minecraft
4. **Minecraft** → Affiche le code au joueur
5. **Joueur** → Saisit code + nouveau mot de passe sur interface web
6. **Web** → `web:complete-password-change` avec `{pseudo, code, password, confirmPassword}`
7. **Backend** → Vérifie code, met à jour mot de passe, supprime code Redis

### Connexion/Déconnexion joueur
1. **Minecraft** → `minecraft:player-connect` avec `{pseudo}`
2. **Backend** → Vérifie utilisateur, met à jour `lastLoginAt`
3. **Backend** → `player:connected` vers tous les clients
4. **Minecraft** → `minecraft:player-disconnect` avec `{pseudo}`
5. **Backend** → `player:disconnected` vers tous les clients

---

## Validation des données

Tous les handlers utilisent la validation Zod avec les schémas suivants :
- `minecraftSignupRequestSchema`
- `webCompleteSignupSchema` 
- `minecraftPlayerConnectSchema`
- `minecraftPlayerDisconnectSchema`
- `minecraftPasswordChangeRequestSchema`
- `webCompletePasswordChangeSchema`

Les erreurs de validation sont automatiquement gérées par le middleware `withValidation`.