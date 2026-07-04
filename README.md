# HydroConnecto ERP Pro v2.2.2.6 PRO

Version corrigée et nettoyée pour usage professionnel.

## Corrections incluses

- Accueil responsive stabilisé avec une seule image et deux boutons propres.
- Footer PDF corrigé : informations regroupées dans le pied de page, sans page blanche supplémentaire.
- Format des montants corrigé : `50 000 FCFA` au lieu de `50 /000 FCFA`.
- Serveur prêt pour hébergement Node.js : écoute sur `0.0.0.0` et `process.env.PORT`.
- Package nettoyé : `node_modules`, `.git`, `.env`, patchs et backups exclus du paquet final.
- `package.json` avec `engines.node = 22.x`.
- Galerie/admin conservés avec actions ajouter, modifier, archiver/réactiver, supprimer quand disponibles.
- Sécurité renforcée : cookies stricts, anti-CSRF, limitation des tentatives de connexion, mots de passe hashés, stockage privé pour documents sensibles.
- Intégrations configurables : notifications WhatsApp et API de paiement via variables d’environnement.

## Installation locale

```powershell
npm install
copy .env.example .env
notepad .env
npm start
```

Site public : `http://localhost:3000`  
Admin : `http://localhost:3000/admin/login`

## Variables nécessaires

```env
SUPABASE_URL=...
SUPABASE_KEY=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
ADMIN_NAME=Moustapha Gning
ADMIN_ROLE=directeur
COOKIE_SECRET=...
NODE_ENV=production
APP_URL=https://votre-domaine
ALLOWED_ORIGINS=https://votre-domaine
SUPABASE_SERVICE_ROLE_KEY=...
NOTIFICATION_WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=meta
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_TO=221777436153
PAYMENT_PROVIDER=generic
PAYMENT_API_URL=...
PAYMENT_API_KEY=...
PAYMENT_SECRET=...
PAYMENT_WEBHOOK_SECRET=...
```

En production, ne force pas `PORT=3000` si la plateforme fournit son propre port.
En production, utilise un `COOKIE_SECRET` long et unique. Le mot de passe par défaut `change-moi-123` est refusé.

## Base de données

Les fichiers SQL sont dans le dossier `sql/`. Commence par vérifier que les migrations déjà appliquées dans Supabase correspondent à la version actuelle avant de relancer un script.

Pour le niveau sécurité/paiement/notifications, exécute aussi :

```sql
sql/hydroconnecto_security_payments_notifications_v2227.sql
```
