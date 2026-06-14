// Logique d'accès à l'API Loyverse. Ce module est bundlé dans le content script
// (et donc exécuté dans le contexte de r.loyverse.com), ce qui garantit que les
// cookies de session sont envoyés automatiquement avec chaque requête.

import type {
  NormalizedReceipt,
  RawReceipt,
  RawReceiptsResponse,
} from "./types.js";

const ENDPOINT = "https://r.loyverse.com/data/ownercab/getreceiptsarchive";
const PAGE_SIZE = 100;

/** Construit le corps de requête attendu par l'API. */
function buildBody(
  startDate: string,
  endDate: string,
  tzName: string,
  offset: number,
  limit: number,
): string {
  return JSON.stringify({
    limit: limit.toString(), // l'API attend une chaîne, pas un entier
    offset,
    receiptType: null,
    payType: null,
    startDate,
    endDate,
    search: null,
    tzOffset: 0,
    tzName,
    startTime: null,
    endTime: null,
    startWeek: 0,
    receiptId: null,
    // `customPeriod` DOIT être true pour que `startDate`/`endDate` soient pris
    // en compte. Avec `customPeriod: false`, l'API ignore les dates et renvoie
    // toujours la période prédéfinie (les 30 derniers jours).
    predefinedPeriod: null,
    customPeriod: true,
    merchantsIds: "all",
    outletsIds: "all",
  });
}

/** Exécute un appel à l'endpoint et renvoie la réponse JSON typée. */
async function postReceipts(
  startDate: string,
  endDate: string,
  tzName: string,
  offset: number,
  limit: number,
): Promise<RawReceiptsResponse> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    redirect: "manual", // une redirection signifie une session expirée
    body: buildBody(startDate, endDate, tzName, offset, limit),
  });

  // Une redirection (vers la page de connexion) ou un 401/403 = non connecté.
  if (response.type === "opaqueredirect" || response.status === 0) {
    throw new AuthError();
  }
  if (response.status === 401 || response.status === 403) {
    throw new AuthError();
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  let data: RawReceiptsResponse;
  try {
    data = (await response.json()) as RawReceiptsResponse;
  } catch {
    // Réponse non JSON (probablement une page HTML de login) => non connecté.
    throw new AuthError();
  }

  if (data.result && data.result !== "ok") {
    throw new Error(`API result: ${data.result}`);
  }
  return data;
}

/** Erreur levée quand la session Loyverse n'est pas (ou plus) valide. */
export class AuthError extends Error {
  constructor() {
    super("NOT_LOGGED_IN");
    this.name = "AuthError";
  }
}

/** Normalise un reçu brut : conversion centimes -> FCFA et millièmes -> unités. */
export function normalizeReceipt(r: RawReceipt): NormalizedReceipt {
  return {
    receiptNo: `${r.ownerCashRegisterNo}-${String(r.printedNo).padStart(4, "0")}`,
    date: r.date,
    amount: r.totalAmount / 100,
    cashAmount: r.cashAmount / 100,
    cardAmount: r.cardAmount / 100,
    discountAmount: r.discountAmount / 100,
    type: r.type,
    paymentType: r.paymentTypeName,
    outletName: r.outletName,
    items: (r.itemRows ?? []).map((item) => {
      const quantity = item.quantity / 1000;
      // Dans la réponse de l'API, `amount` correspond au prix UNITAIRE (en
      // centimes), pas au total de la ligne : on l'a vérifié en recoupant avec
      // `totalAmount` du reçu (prix unitaire × quantité = total du reçu).
      // `salePrice` est souvent renseigné à 0 ; on l'utilise s'il est > 0,
      // sinon on se rabat sur `amount`. Le total de la ligne est ensuite
      // recalculé (prix unitaire × quantité).
      const unitPrice = (item.salePrice > 0 ? item.salePrice : item.amount) / 100;
      return {
        name: item.name,
        quantity,
        unitPrice,
        amount: unitPrice * quantity,
      };
    }),
  };
}

/**
 * Vérifie que l'utilisateur est connecté en effectuant une requête minimale.
 * Renvoie true si la session est valide, false sinon.
 */
export async function isLoggedIn(): Promise<boolean> {
  const now = new Date();
  const start = `${now.toISOString().split("T")[0]} 00:00:00`;
  const end = `${now.toISOString().split("T")[0]} 23:59:59`;
  try {
    await postReceipts(start, end, "UTC", 0, 1);
    return true;
  } catch (err) {
    if (err instanceof AuthError) return false;
    // Toute autre erreur (réseau, HTTP) est remontée pour affichage.
    throw err;
  }
}

/**
 * Récupère tous les reçus de la période en gérant la pagination.
 * Lève AuthError si la session n'est pas valide.
 */
export async function fetchAllReceipts(
  startDate: string,
  endDate: string,
  tzName: string,
): Promise<NormalizedReceipt[]> {
  const all: NormalizedReceipt[] = [];
  let offset = 0;

  while (true) {
    const data = await postReceipts(
      startDate,
      endDate,
      tzName,
      offset,
      PAGE_SIZE,
    );
    const receipts = data.receipts ?? [];
    if (receipts.length === 0) break;

    all.push(...receipts.map(normalizeReceipt));

    if (receipts.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}
