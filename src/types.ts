// Types partagés entre le content script et le popup.

/** Fuseaux horaires proposés dans l'interface. */
export type TzName = string;

/** Item brut tel que renvoyé par l'API Loyverse (valeurs en centimes/millièmes). */
export interface RawItemRow {
  wareId: number;
  name: string;
  quantity: number; // millièmes (÷1000)
  amount: number; // prix UNITAIRE en centimes (÷100), pas le total de la ligne
  salePrice: number; // centimes (÷100) ; souvent 0 selon la config
  primeCost: number; // centimes (÷100)
}

/** Reçu brut tel que renvoyé par l'API Loyverse. */
export interface RawReceipt {
  date: string;
  dateTS: number;
  printedNo: number;
  ownerCashRegisterNo: number;
  receiptId: number;
  type: "SALE" | "REFUND" | string;
  totalAmount: number; // centimes
  cashAmount: number; // centimes
  cardAmount: number; // centimes
  discountAmount: number; // centimes
  paymentTypeName: string | null;
  outletName: string;
  clientName: string | null;
  itemRows: RawItemRow[];
}

/** Réponse brute de l'endpoint getreceiptsarchive. */
export interface RawReceiptsResponse {
  result: string;
  startDate?: number;
  endDate?: number;
  periodAllowed?: boolean;
  receipts?: RawReceipt[];
}

/** Item normalisé (unités réelles). */
export interface NormalizedItem {
  name: string;
  productType: string; // catégorie déduite du nom (boisson, crêpe, gboflôto…)
  quantity: number;
  unitPrice: number;
  amount: number;
}

/** Reçu normalisé prêt pour l'export. */
export interface NormalizedReceipt {
  receiptNo: string;
  receiptId: number; // identifiant Loyverse du reçu
  date: string;
  amount: number;
  cashAmount: number;
  cardAmount: number;
  discountAmount: number;
  type: string;
  paymentType: string | null;
  outletName: string;
  clientName: string | null;
  items: NormalizedItem[];
}

/** Messages échangés entre popup et content script. */
export type ExtensionRequest =
  | { action: "checkAuth" }
  | {
      action: "getReceipts";
      startDate: string;
      endDate: string;
      tzName: TzName;
    };

export interface CheckAuthResponse {
  success: boolean;
  loggedIn?: boolean;
  error?: string;
}

export interface GetReceiptsResponse {
  success: boolean;
  receipts?: NormalizedReceipt[];
  error?: string;
}
