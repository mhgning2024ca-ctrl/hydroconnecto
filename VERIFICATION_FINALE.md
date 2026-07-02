# HydroConnecto ERP Pro v2.2.2.6 — correction Vercel ENOENT

## Problème corrigé
Vercel affichait dans les Runtime Logs :
`Error: ENOENT: no such file or directory`

Cause probable : la fonction serverless Vercel ne retrouvait pas les fichiers du dossier `public` et/ou tentait d'utiliser un dossier d'upload local non adapté à Vercel.

## Corrections
- `vercel.json` force l'inclusion de `public/**` dans la fonction serverless.
- Upload temporaire déplacé vers `/tmp/hydroconnecto-uploads` sur Vercel.
- Route `/` explicite vers `public/index.html`.
- Routes `/admin` et `/admin/login` vers le même fichier.
- Favicon manquant ne provoque plus d'erreur.
- Installation Vercel stabilisée sans package-lock.
- Node.js fixé à 22.x.

## Vérifications
- `node --check server.js` : OK
- `node --check public/app.js` : OK
- `public/**` inclus dans Vercel : OK
- uploads Vercel dans /tmp : OK
- route `/` explicite : OK
- route admin explicite : OK
- `.env` non inclus : OK
- `node_modules` non inclus : OK
