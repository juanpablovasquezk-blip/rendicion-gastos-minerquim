// IndexedDB Manager para almacenamiento de gastos sin conexión en terreno

export type OfflineExpenseDraft = {
  id: string;
  created_at: string;
  report_type: "reimbursement" | "fund_rendition";
  fund_id?: string;
  total_amount: number;
  tax_amount: number;
  supplier_name: string;
  supplier_rut: string;
  invoice_number: string;
  description: string;
  date: string;
  company_id: string;
  company_name?: string;
  department_id: string;
  department_name?: string;
  category_id: string;
  category_name?: string;
  receipt_type_id: string;
  receipt_type_name?: string;
  receipt_base64?: string;
  receipt_name?: string;
  receipt_type_mime?: string;
  status: "pending" | "syncing" | "error";
  errorMessage?: string;
};

const DB_NAME = "minerquim_offline_db";
const DB_VERSION = 1;
const STORE_EXPENSES = "expenses_queue";
const STORE_CATALOGS = "catalogs_cache";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB no disponible en este entorno"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_EXPENSES)) {
        db.createObjectStore(STORE_EXPENSES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CATALOGS)) {
        db.createObjectStore(STORE_CATALOGS, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 1. Guardar gasto en cola offline
export async function saveOfflineExpense(expense: Omit<OfflineExpenseDraft, "id" | "created_at" | "status">): Promise<string> {
  const db = await openDB();
  const id = `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record: OfflineExpenseDraft = {
    ...expense,
    id,
    created_at: new Date().toISOString(),
    status: "pending",
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_EXPENSES, "readwrite");
    const store = tx.objectStore(STORE_EXPENSES);
    const req = store.add(record);

    req.onsuccess = () => {
      window.dispatchEvent(new CustomEvent("offline-expenses-changed"));
      resolve(id);
    };
    req.onerror = () => reject(req.error);
  });
}

// 2. Obtener todos los gastos offline guardados
export async function getOfflineExpenses(): Promise<OfflineExpenseDraft[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_EXPENSES, "readonly");
      const store = tx.objectStore(STORE_EXPENSES);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

// 3. Obtener cantidad de gastos offline pendientes
export async function getOfflineExpenseCount(): Promise<number> {
  const list = await getOfflineExpenses();
  return list.length;
}

// 4. Eliminar gasto sincronizado
export async function deleteOfflineExpense(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_EXPENSES, "readwrite");
    const store = tx.objectStore(STORE_EXPENSES);
    const req = store.delete(id);

    req.onsuccess = () => {
      window.dispatchEvent(new CustomEvent("offline-expenses-changed"));
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

// 5. Cachear catálogos para funcionamiento sin conexión
export type OfflineCatalogs = {
  companies: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string; code: string }>;
  categories: Array<{ id: string; name: string }>;
  receiptTypes: Array<{ id: string; name: string; code: string; requires_receipt: boolean }>;
  activeFunds: Array<{ id: string; purpose: string; current_balance: number }>;
};

export async function cacheCatalogs(catalogs: OfflineCatalogs): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_CATALOGS, "readwrite");
    const store = tx.objectStore(STORE_CATALOGS);
    store.put({ key: "master_catalogs", data: catalogs, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.warn("No se pudieron cachear catálogos offline:", err);
  }
}

export async function getCachedCatalogs(): Promise<OfflineCatalogs | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_CATALOGS, "readonly");
      const store = tx.objectStore(STORE_CATALOGS);
      const req = store.get("master_catalogs");

      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// 6. Convertir base64 a File para subida
export function base64ToFile(base64Data: string, filename: string, mimeType: string): File {
  const byteString = atob(base64Data.split(",")[1] || base64Data);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new File([ab], filename, { type: mimeType });
}
