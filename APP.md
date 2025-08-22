# APP

## INTRO

Je souhaite faire une application backend

Je vais t'expliquer ce que je souhaite faire afin de t'expliquer au mieux mes attentes en un seul texte.

J'ai un serveur Minecraft (Java) et un frontend (JavaScript) et je souhaite donc créer un backend qui va permettre au frontend de communiquer avec Minecraft et inversement

Le backend va devoir posséder une API REST (http) et une API WebSocket car le frontend et Minecraft vont communiquer en HTTP et en websocket

Il faut un backend sécurisé et voici déjà une liste de frameworks et librairies que je souhaite utiliser :
* NodeJS
* Express
* SocketIO
* Prisma (MySQL 8.0)
* dotenv
* express-session
* redis
* connect-redis (pour express-session)
* bcrypt
* cors
* http-status-codes
* zod (pour la validation des données)
* xss (fusionner ceci avec zod pour la protection xss)
* helmet
* express-rate-limit
* winston ou pino - Logging structuré professionnel
* morgan - Logging des requêtes HTTP pour Express

Tu peux en utiliser d'autres si tu vois l'utilité

## Authentification

express-session + connect-redis
Utilisation des sessions avec redis
L'avantage, c'est que je pourrais utiliser cette authentification avec express et socket.io
Donc un utilisateur peut s'authentifier avec les sessions
Il faut donc un middleware pour gérer l'authentification et que les informations soient disponibles dans les controllers express et socket.io

## Autorisation

Utilisation des Permissions et des Rôles
Il faut un middleware que je pourrais utiliser dans mes routers afin de valider avec un tableau de rôles / permissions

## Serveur web Express

Il faut initialisation du serveur web avec node:http
Ensuite initialisation le serveur express et ajouter les middleware par défaut

## Serveur web socketIO

Il faut initialiser le serveur websocket avec le serveur web préalablement initialisé, je ne sais plus s'il faut utiliser directement le serveur web node:http ou celui d'express mais toi tu sauras

## Redis

Il faut utiliser redis pour les sessions mais si tu vois l'utilité autre part, n'hésite pas

## Notes

Il va falloir ensuite créer les repositories pour la bdd mysql et pour redis, donc du crud pour chaque entité, je te laisserais juste en faire un d'exemple pour le bdd mysql et un d'exemple avec redis et ça fera l'affaire

Il faut également faire les middlewares nécessaires (authentification, autorisation, errors, validations, etc.)

Intégrer un système de loggings et pareil pour les calls HTTP, et websockets

Pour l'api REST, je te laisse faire un controller, service, etc. pour l'exemple et pareil pour les websockets

Je te laisse globalement utiliser les pattern que tu veux en me justifiant le choix

Et pour finir, si tu as d'autres questions n'hésite pas et tu peux prendre des initiative

Je te laisse le choix sur l'architecture des dossiers, fichiers, etc.

Tout doit être en JavaScript et je reviendrais au fur et à mesure pour ajouter des fonctionnalités

Pour le schéma prisma, je te laisse juger à ta guise, c'est surtout pour faire fonctionner tes exemples et ensuite nous repasserons dessus quand j'aurais le schéma complet

Il faut également un ou plusieurs scripts de seeding en utilisant faker par exemple
