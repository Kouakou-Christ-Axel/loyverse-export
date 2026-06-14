// Logique de l'interface popup : sélection de la période, vérification de la
// connexion, déclenchement de l'export et téléchargement du fichier généré.

import type {
  CheckAuthResponse,
  ExtensionRequest,
  GetReceiptsResponse,
  NormalizedReceipt,
} from "./types.js";

type ExportFormat = "csv" | "json";
type StatusType = "loading" | "success" | "error";

const LOYVERSE_PREFIX = "https://r.loyverse.com/";

document.addEventListener("DOMContentLoaded", () => {
  const btnCSV = byId<HTMLButtonElement>("btnCSV");
  const btnJSON = byId<HTMLButtonElement>("btnJSON");
  const statusDiv = byId<HTMLDivElement>("status");
  const warningDiv = byId<HTMLDivElement>("warning");
  const startDateInput = byId<HTMLInputElement>("startDate");
  const endDateInput = byId<HTMLInputElement>("endDate");
  const tzNameSelect = byId<HTMLSelectElement>("tzName");

  // Pré-remplissage : 30 derniers jours.
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  endDateInput.value = toDateInput(today);
  startDateInput.value = toDateInput(thirtyDaysAgo);

  setButtonsEnabled(false);
  btnCSV.addEventListener("click", () => void exportReceipts("csv"));
  btnJSON.addEventListener("click", () => void exportReceipts("json"));

  void init();

  /** Vérifie l'onglet actif puis l'état de connexion Loyverse. */
  async function init(): Promise<void> {
    const tab = await getActiveTab();
    const onLoyverse = !!tab?.url?.startsWith(LOYVERSE_PREFIX);

    if (!tab?.id || !onLoyverse) {
      showWarning(
        "Ouvrez d'abord une page Loyverse (r.loyverse.com) dans cet onglet.",
      );
      return;
    }

    showStatus("Vérification de la connexion…", "loading");
    try {
      const res = (await chrome.tabs.sendMessage(tab.id, {
        action: "checkAuth",
      } satisfies ExtensionRequest)) as CheckAuthResponse | undefined;

      if (!res?.success) {
        throw new Error(res?.error ?? "Pas de réponse du content script.");
      }
      if (!res.loggedIn) {
        showWarning(
          "Vous n'êtes pas connecté à Loyverse. Connectez-vous puis rouvrez cette fenêtre.",
        );
        hideStatus();
        return;
      }

      hideStatus();
      hideWarning();
      setButtonsEnabled(true);
    } catch (err) {
      // Le content script peut ne pas être encore injecté si la page vient
      // d'être chargée : on invite l'utilisateur à rafraîchir.
      showWarning(
        "Impossible de communiquer avec la page Loyverse. Rafraîchissez la page puis réessayez.",
      );
      hideStatus();
      console.error(err);
    }
  }

  async function exportReceipts(format: ExportFormat): Promise<void> {
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const tzName = tzNameSelect.value;

    if (!startDate || !endDate) {
      showStatus("Sélectionnez les dates.", "error");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      showStatus("La date de début doit précéder la date de fin.", "error");
      return;
    }

    const tab = await getActiveTab();
    if (!tab?.id) {
      showStatus("Onglet Loyverse introuvable.", "error");
      return;
    }

    setButtonsEnabled(false);
    showStatus("Récupération en cours…", "loading");

    try {
      const res = (await chrome.tabs.sendMessage(tab.id, {
        action: "getReceipts",
        startDate: `${startDate} 00:00:00`,
        endDate: `${endDate} 23:59:59`,
        tzName,
      } satisfies ExtensionRequest)) as GetReceiptsResponse | undefined;

      if (!res?.success) {
        if (res?.error === "NOT_LOGGED_IN") {
          showWarning(
            "Session expirée. Reconnectez-vous à Loyverse puis réessayez.",
          );
          setButtonsEnabled(false);
          return;
        }
        throw new Error(res?.error ?? "Pas de réponse du content script.");
      }

      const receipts = res.receipts ?? [];
      const filename = `recus-loyverse-${startDate}-au-${endDate}`;

      if (receipts.length === 0) {
        showStatus("Aucun reçu trouvé pour cette période.", "error");
        return;
      }

      if (format === "csv") {
        downloadCSV(receipts, filename);
      } else {
        downloadJSON(receipts, filename);
      }

      showStatus(`${receipts.length} reçus exportés avec succès.`, "success");
    } catch (err) {
      showStatus(`Erreur : ${messageOf(err)}`, "error");
      console.error(err);
    } finally {
      setButtonsEnabled(true);
    }
  }

  // --- Helpers UI -----------------------------------------------------------

  function setButtonsEnabled(enabled: boolean): void {
    btnCSV.disabled = !enabled;
    btnJSON.disabled = !enabled;
  }

  function showStatus(message: string, type: StatusType): void {
    statusDiv.textContent = message;
    statusDiv.className = type;
  }

  function hideStatus(): void {
    statusDiv.textContent = "";
    statusDiv.className = "";
  }

  function showWarning(message: string): void {
    warningDiv.textContent = message;
    warningDiv.style.display = "block";
  }

  function hideWarning(): void {
    warningDiv.style.display = "none";
  }
});

// --- Export helpers ---------------------------------------------------------

function downloadCSV(receipts: NormalizedReceipt[], filename: string): void {
  const rows: (string | number)[][] = [];
  rows.push([
    "DATE",
    "N° REÇU",
    "Id Loyverse",
    "TYPE PRODUIT",
    "DÉSIGNATION",
    "CLIENT",
    "QUANTITÉ",
    "PRIX UNITAIRE (FCFA)",
    "MONTANT (FCFA)",
    "MODE PAIEMENT",
  ]);

  for (const r of receipts) {
    const date = formatDateFr(r.date);
    const payment = formatPayment(r.paymentType);
    const client = r.clientName ?? "";
    // La colonne « N° REÇU » est volontairement laissée vide ; tout le reste est
    // répété sur chaque ligne d'article pour faciliter filtres / tableaux croisés.
    if (r.items.length === 0) {
      rows.push([date, "", r.receiptId, "", "", client, "", "", r.amount, payment]);
    } else {
      for (const item of r.items) {
        rows.push([
          date,
          "",
          r.receiptId,
          item.productType,
          item.name,
          client,
          item.quantity,
          item.unitPrice,
          item.amount,
          payment,
        ]);
      }
    }
  }

  // BOM (﻿) pour qu'Excel détecte l'UTF-8.
  const csv =
    "﻿" +
    rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\r\n");

  triggerDownload(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    `${filename}.csv`,
  );
}

function downloadJSON(receipts: NormalizedReceipt[], filename: string): void {
  const json = JSON.stringify(receipts, null, 2);
  triggerDownload(
    new Blob([json], { type: "application/json" }),
    `${filename}.json`,
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- Misc helpers -----------------------------------------------------------

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Élément introuvable: #${id}`);
  return el as T;
}

function toDateInput(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Formate une date ISO ("2026-06-13T19:32:35.000+00:00") en "JJ/MM/AAAA". */
function formatDateFr(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Traduit le mode de paiement pour l'export :
 * - null (pas de type) → "ESPÈCES" ;
 * - "ORANGE MONEY" → "OM" ;
 * - sinon, libellé d'origine (ex. "WAVE").
 */
function formatPayment(paymentType: string | null): string {
  if (!paymentType) return "ESPÈCES";
  if (paymentType.toUpperCase() === "ORANGE MONEY") return "OM";
  return paymentType;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
