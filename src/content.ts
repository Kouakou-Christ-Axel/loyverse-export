// Content script injecté dans r.loyverse.com. S'exécutant dans le contexte de la
// page, il bénéficie automatiquement des cookies de session pour appeler l'API.

import { AuthError, fetchAllReceipts, isLoggedIn } from "./api.js";
import type {
  CheckAuthResponse,
  ExtensionRequest,
  GetReceiptsResponse,
} from "./types.js";

chrome.runtime.onMessage.addListener(
  (
    request: ExtensionRequest,
    _sender,
    sendResponse: (
      response: CheckAuthResponse | GetReceiptsResponse,
    ) => void,
  ) => {
    if (request.action === "checkAuth") {
      isLoggedIn()
        .then((loggedIn) => sendResponse({ success: true, loggedIn }))
        .catch((err: unknown) =>
          sendResponse({ success: false, error: messageOf(err) }),
        );
      return true; // réponse asynchrone
    }

    if (request.action === "getReceipts") {
      fetchAllReceipts(request.startDate, request.endDate, request.tzName)
        .then((receipts) => sendResponse({ success: true, receipts }))
        .catch((err: unknown) => {
          if (err instanceof AuthError) {
            sendResponse({ success: false, error: "NOT_LOGGED_IN" });
          } else {
            sendResponse({ success: false, error: messageOf(err) });
          }
        });
      return true; // réponse asynchrone
    }

    return false;
  },
);

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
