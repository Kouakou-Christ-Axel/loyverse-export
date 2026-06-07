# CLAUDE.md

Guide pour Claude Code (et tout contributeur) travaillant sur ce dépôt.

## Présentation

Extension Chrome **Manifest V3** écrite en **TypeScript** qui exporte les reçus
Loyverse en CSV/JSON, **uniquement lorsque l'utilisateur est connecté** à
`r.loyverse.com`. Le build est assuré par **esbuild** ; la vérification de types
par **tsc** (`--noEmit`).

## Commandes

```bash
npm install          # installer les dépendances
npm run build        # compiler + bundler dans dist/
npm run watch        # rebuild incrémental (dev)
npm run typecheck    # vérification de types stricte (tsc --noEmit)
npm run zip          # build + archive Chrome Web Store
```

Après modification de code, lancer **`npm run typecheck`** puis **`npm run build`**
avant de committer. Charger/recharger le dossier **`dist/`** dans
`chrome://extensions/` pour tester.

## Architecture

```
src/
├── types.ts    # Types partagés : RawReceipt, NormalizedReceipt, messages
├── api.ts      # fetch API Loyverse, normalisation, détection de session
├── content.ts  # Content script : écoute les messages, appelle api.ts
└── popup.ts    # UI du popup : dates, export CSV/JSON, téléchargement
```

- `build.mjs` bundle `src/content.ts` → `dist/content.js` et `src/popup.ts` →
  `dist/popup.js` (format IIFE, pas de modules ES côté navigateur), puis copie
  `manifest.json`, `public/popup.html` et `public/icons/` dans `dist/`.
- Les chemins dans `manifest.json` et `popup.html` sont **relatifs à `dist/`**
  (`content.js`, `popup.js`, `icons/...`), pas aux dossiers source.

### Pourquoi le fetch est dans le content script

Le content script s'exécute dans le contexte de `r.loyverse.com`, donc les
cookies de session (`JSESSIONID`, `ownercub-lls`) partent automatiquement avec
`credentials: "include"`. Le popup (contexte extension) n'a pas accès à ces
cookies ; il délègue via `chrome.tabs.sendMessage`.

### Contrainte critique : réponses asynchrones

Dans `chrome.runtime.onMessage`, **retourner `true`** pour garder le canal
ouvert le temps de la réponse asynchrone (sinon `sendResponse` est ignoré).

## Détection de connexion ("seulement quand connecté")

- `api.ts > isLoggedIn()` fait une requête minimale (limit 1) et interprète :
  - redirection (`opaqueredirect`) / `401` / `403` / réponse non-JSON → **non
    connecté** (`AuthError`) ;
  - JSON avec `result === "ok"` → **connecté**.
- `popup.ts` appelle `checkAuth` à l'ouverture : les boutons d'export restent
  **désactivés** tant que la session n'est pas confirmée.
- Pendant un export, une `AuthError` (`error === "NOT_LOGGED_IN"`) affiche un
  message « session expirée » et redésactive les boutons.

## API Loyverse

- **Endpoint** : `POST https://r.loyverse.com/data/ownercab/getreceiptsarchive`
- **Auth** : cookies de session uniquement (pas de Bearer, pas de clé API).
- **Corps** : voir `buildBody()` dans `api.ts`. Points d'attention :
  - `limit` est une **chaîne** (`"100"`), pas un entier.
  - `startDate` / `endDate` au format **`"YYYY-MM-DD HH:mm:ss"`** (pas ISO 8601).
- **Pagination** : 100 max par page ; incrémenter `offset` de 100 tant que
  `receipts.length === 100`.

### Conversion des unités (NE JAMAIS OUBLIER)

| Champ API                         | Unité brute | Opération | Valeur réelle |
| --------------------------------- | ----------- | --------- | ------------- |
| `totalAmount`, `cashAmount`, …    | centimes    | ÷ 100     | FCFA          |
| `itemRows[].amount` / `salePrice` | centimes    | ÷ 100     | FCFA          |
| `itemRows[].quantity`             | millièmes   | ÷ 1000    | unités        |

Exemple : `totalAmount: 500000` → `5000` FCFA ; `quantity: 5000` → `5` unités.

### Numéro de reçu

```ts
`${ownerCashRegisterNo}-${String(printedNo).padStart(4, "0")}` // ex. "1-0134"
```

### Sémantique des champs

- `paymentType` (`paymentTypeName`) `null` → paiement en **espèces**.
- `type: "REFUND"` → remboursement (montant à traiter comme négatif côté analyse).
- `type: "SALE"` → vente.

## Conventions de code

- TypeScript **strict** (voir `tsconfig.json`) : pas de variables/paramètres
  inutilisés, retours explicites. `npm run typecheck` doit passer.
- Commentaires et libellés UI **en français** (cohérence avec l'existant).
- Garder la logique réseau dans `api.ts`, l'UI dans `popup.ts`, le routage de
  messages dans `content.ts`.
- Types partagés dans `types.ts` ; importer avec `import type` quand c'est
  possible (les imports `.js` dans les sources sont normaux : esbuild résout les
  fichiers `.ts` correspondants).

## Permissions du manifest

`activeTab`, `scripting`, `storage`, `downloads` + `host_permissions` limité à
`https://r.loyverse.com/*`. Ne pas élargir le scope sans raison.

## Pièges connus

- Si le content script n'est pas encore injecté (page tout juste chargée),
  `chrome.tabs.sendMessage` échoue : le popup invite alors à rafraîchir la page.
- Toujours recharger l'extension après un build pour prendre en compte `dist/`.
