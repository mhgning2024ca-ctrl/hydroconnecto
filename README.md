# HydroConnecto ERP Pro v2.2.2.6 PRO

Version corrigée et nettoyée pour usage professionnel.

## Corrections incluses

- Accueil responsive stabilisé avec une seule image et deux boutons propres.
- Footer PDF corrigé : informations regroupées dans le pied de page, sans page blanche supplémentaire.
- Format des montants corrigé : `50 000 FCFA` au lieu de `50 /000 FCFA`.
- Serveur prêt pour hébergement Node.js : écoute sur `0.0.0.0` et `process.env.PORT`.
- Package nettoyé : `node_modules`, `.git`, `.env`, patchs et backups exclus du paquet final.
- `package.json` avec `engines.node = 20.x`.
- Galerie/admin conservés avec actions ajouter, modifier, archiver/réactiver, supprimer quand disponibles.

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
```

En production, ne force pas `PORT=3000` si la plateforme fournit son propre port.

## Base de données

Les fichiers SQL sont dans le dossier `sql/`. Commence par vérifier que les migrations déjà appliquées dans Supabase correspondent à la version actuelle avant de relancer un script.
