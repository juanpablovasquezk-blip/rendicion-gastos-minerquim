import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "image/jpeg";
    const fileName = file.name.toLowerCase();

    // 1. SI ES UN ARCHIVO XML (DTE Facturación Electrónica SII) -> Parser nativo instantáneo
    if (fileName.endsWith(".xml") || mimeType.includes("xml")) {
      const xmlText = buffer.toString("utf-8");
      const dteData = parseChileanDteXml(xmlText);
      return NextResponse.json({ success: true, data: dteData, method: "xml_dte" });
    }

    // 2. SI ES IMAGEN O PDF -> Procesar con Gemini API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "GEMINI_API_KEY no configurada en .env.local. Configúrala para habilitar el OCR automático.",
          method: "none",
        },
        { status: 503 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const base64Data = buffer.toString("base64");

    const prompt = `Analiza este comprobante tributario chileno (factura electrónica, boleta electrónica, boleta de honorarios o voucher).
Extrae los siguientes datos con máxima precisión:
- supplier_name: Razón social o nombre del comercio/proveedor emisor (ej: DISTRIBUIDORA ASTORGA SPA).
- supplier_rut: RUT del emisor/vendedor en formato sin puntos y con guión (ej: 77531764-7).
- buyer_name: Razón social o nombre de la empresa compradora / cliente / receptor si aparece indicada en el documento (ej: COM Y SERV DE INGENIERIA MINERQUIM LIMITADA).
- buyer_rut: RUT de la empresa compradora / receptor si aparece (ej: 76135448-5).
- invoice_number: Número de folio o boleta o comprobante (ej: 35814).
- date: Fecha de emisión en formato YYYY-MM-DD (ej: 2026-09-24).
- total_amount: Monto TOTAL BRUTO final pagado (en pesos chilenos, número entero). IMPORTANTE: Este es el monto final que ya incluye el IVA (ej: 31690).
- tax_amount: Monto del IVA (19%) especificado en el documento. Si no aparece explícito pero está afecto, calcula: Total - round(Total / 1.19).
- receipt_type_code: Uno de estos valores exactos: 'factura_electronica', 'boleta_electronica', 'factura_exenta', 'boleta_honorarios', 'nota_credito', 'boleta_manual'.
- category_suggestion: Sugerencia de categoría entre: 'Repuestos', 'Artículos de aseo', 'Uniformes', 'EPP', 'Combustible', 'Alimentación', 'Peajes y estacionamiento', 'Locomoción', 'Propinas', 'Otros'.
- description: Resumen breve de los productos o servicios principales listados (máximo 15 palabras).`;

    const modelsToTry = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"];
    let responseText = "";
    let lastError: unknown = null;

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: mimeType.startsWith("image/") ? mimeType : "application/pdf",
                  },
                },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
          },
        });
        if (response.text) {
          responseText = response.text;
          break;
        }
      } catch (e) {
        console.warn(`Intento con ${model} falló, probando siguiente modelo...`, e);
        lastError = e;
      }
    }

    if (!responseText) {
      throw lastError || new Error("No fue posible obtener respuesta del servicio de IA.");
    }

    const parsedJson = JSON.parse(responseText || "{}");

    // Limpieza y normalización de montos
    if (parsedJson.total_amount) {
      parsedJson.total_amount = Number(String(parsedJson.total_amount).replace(/\D/g, "")) || 0;
    }
    if (parsedJson.tax_amount) {
      parsedJson.tax_amount = Number(String(parsedJson.tax_amount).replace(/\D/g, "")) || 0;
    }

    return NextResponse.json({ success: true, data: parsedJson, method: "gemini_vision" });
  } catch (err: unknown) {
    console.error("Error en OCR:", err);
    const msg = err instanceof Error ? err.message : "Error desconocido al procesar OCR";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Parser nativo de XML DTE chileno (Factura 33, 34, Boleta 39, etc.) */
function parseChileanDteXml(xml: string) {
  const getTag = (tag: string) => {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, "i"));
    return match ? match[1].trim() : null;
  };

  const rutEmisor = getTag("RUTEmisor");
  const rznSoc = getTag("RznSoc") || getTag("RznSocEmisor");
  const folio = getTag("Folio");
  const fchEmis = getTag("FchEmis"); // YYYY-MM-DD
  const tipoDTE = getTag("TipoDTE");
  const mntTotal = getTag("MntTotal");
  const iva = getTag("IVA");

  let receipt_type_code = "factura_electronica";
  if (tipoDTE === "39" || tipoDTE === "41") receipt_type_code = "boleta_electronica";
  if (tipoDTE === "34") receipt_type_code = "factura_exenta";
  if (tipoDTE === "61") receipt_type_code = "nota_credito";

  const total = mntTotal ? parseInt(mntTotal, 10) : 0;
  const tax = iva ? parseInt(iva, 10) : Math.round(total - total / 1.19);

  return {
    supplier_name: rznSoc,
    supplier_rut: rutEmisor,
    invoice_number: folio,
    date: fchEmis,
    total_amount: total,
    tax_amount: tax,
    receipt_type_code,
    description: "Factura electrónica cargada desde XML DTE",
  };
}
