# Loyverse Receipts Exporter

Extension Chrome (Manifest V3, TypeScript) qui exporte les reçus de votre compte
[Loyverse](https://r.loyverse.com) en **CSV** ou **JSON**.

L'export ne fonctionne **que lorsque vous êtes connecté** à `r.loyverse.com` :
l'extension réutilise les cookies de session de l'onglet actif, vérifie l'état de
connexion avant chaque export, et désactive les boutons tant que la session n'est
pas valide. Aucun mot de passe, token ou clé API n'est demandé ni stocké.

---

## Fonctionnalités

- Sélection de la période (date début / date fin) — pré-remplie sur 30 jours.
- Choix du fuseau horaire (Africa/Abidjan, Africa/Lagos, Europe/Paris, UTC).
- Pagination automatique (récupère tous les reçus, 100 par page).
- Conversion automatique des unités Loyverse :
  - montants en **centimes** → FCFA (÷100) ;
  - quantités en **millièmes** → unités réelles (÷1000).
- Numéro de reçu reconstruit au format `caisse-numéro` (ex. `1-0134`).
- Export **CSV** (avec BOM UTF-8 pour Excel) ou **JSON** normalisé.
- Détection de connexion : message clair si vous n'êtes pas authentifié.

---

## Prérequis

- [Node.js](https://nodejs.org) 18+ et npm.
- Google Chrome (ou tout navigateur Chromium) 120+.

---

## Installation (développement)

```bash
# 1. Installer les dépendances
npm install

# 2. Compiler l'extension (TypeScript -> dist/)
npm run build
```

Puis charger l'extension dans Chrome :

1. Ouvrir `chrome://extensions/`.
2. Activer le **Mode développeur** (en haut à droite).
3. Cliquer **Charger l'extension non empaquetée**.
4. Sélectionner le dossier **`dist/`** (et non la racine du projet).

---

## Utilisation

1. Se connecter sur <https://r.loyverse.com> dans un onglet.
2. Cliquer sur l'icône de l'extension dans la barre Chrome.
3. L'extension vérifie automatiquement que vous êtes connecté.
4. Choisir les **dates** de début et de fin, et le **fuseau horaire**.
5. Cliquer **Exporter CSV** ou **Exporter JSON**.
6. Le fichier est téléchargé automatiquement
   (`recus-loyverse-<début>-au-<fin>.csv` / `.json`).

> Si l'extension indique que vous n'êtes pas connecté, connectez-vous à
> Loyverse, rafraîchissez la page, puis rouvrez la fenêtre de l'extension.

---

## Scripts npm

| Script              | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `npm run build`     | Compile et bundle l'extension dans `dist/`.          |
| `npm run watch`     | Recompile à chaque modification (dev).               |
| `npm run typecheck` | Vérifie les types sans émettre de fichiers.          |
| `npm run lint`      | Alias de `typecheck`.                                |
| `npm run zip`       | Build + crée `loyverse-receipts-exporter.zip`.       |
| `npm run clean`     | Supprime `dist/`.                                    |

---

## Structure du projet

```
loyverse-export/
├── manifest.json        # Manifest V3 (copié tel quel dans dist/)
├── build.mjs            # Script de build esbuild + copie des assets
├── tsconfig.json        # Configuration TypeScript (strict)
├── package.json
├── public/
│   ├── popup.html       # Interface du popup
│   └── icons/           # Icônes 16/32/48/128
├── scripts/
│   └── zip.mjs          # Génère l'archive pour le Chrome Web Store
└── src/
    ├── types.ts         # Types partagés (reçus bruts/normalisés, messages)
    ├── api.ts           # Appels API Loyverse + normalisation + auth
    ├── content.ts       # Content script (contexte r.loyverse.com)
    └── popup.ts         # Logique du popup (UI, export, téléchargement)
```

**Flux de données :**

```
popup.ts  ──message──▶  content.ts  ──fetch──▶  API Loyverse
popup.ts  ◀──données──  content.ts
popup.ts  ──téléchargement──▶  fichier CSV/JSON
```

Le `fetch` est effectué par le content script car il s'exécute dans le contexte
de `r.loyverse.com` : les cookies de session sont alors envoyés automatiquement.
Le popup n'a pas accès à ces cookies.

---

## Détails techniques de l'API

- **Endpoint** : `POST https://r.loyverse.com/data/ownercab/getreceiptsarchive`
- **Authentification** : cookies de session (`JSESSIONID`, `ownercub-lls`).
- **Pagination** : 100 reçus max par requête, `offset` incrémenté de 100.
- **Format des dates** : chaîne `"YYYY-MM-DD HH:mm:ss"`.
- `paymentType: null` → paiement en espèces.
- `type: "REFUND"` → remboursement.

Voir [`CLAUDE.md`](./CLAUDE.md) pour la documentation complète de l'API et des
conventions du code.

---

## Confidentialité

L'extension ne communique qu'avec `r.loyverse.com`. Aucune donnée n'est envoyée
à un serveur tiers. Les reçus restent dans votre navigateur et ne sortent que
sous la forme du fichier que vous téléchargez vous-même.

---

## Licence

MIT.
