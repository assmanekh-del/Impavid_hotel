====================================================
  IMPAVID HOTEL — Structure du projet
====================================================

impavid-hotel/
│
├── index.html              ← Page d'accueil → redirige vers admin/
│
├── admin/
│   └── index.html          ← Application de gestion complète
│
├── client/
│   └── index.html          ← Site réservation clients (en construction)
│
└── assets/
    ├── config.js            ← ⭐ CONFIGURATION CENTRALE
    │                           Modifiez ici : prix, chambres, clés Supabase
    ├── supabase-helpers.js  ← Fonctions utilitaires partagées
    └── style.css            ← Styles CSS communs

====================================================
  DÉPLOIEMENT NETLIFY DROP
====================================================
1. Téléchargez le dossier "impavid-hotel"
2. Allez sur netlify.com/drop
3. Glissez le dossier entier
4. C'est tout !

Pour les mises à jour : re-glissez le dossier sur Netlify.

====================================================
  MODIFIER UN PRIX DE CHAMBRE
====================================================
Ouvrez assets/config.js et changez la valeur "price"
de la chambre concernée. Les prix sont TTC (TVA incluse).
