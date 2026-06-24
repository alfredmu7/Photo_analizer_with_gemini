// Archivo: netlify/functions/ocr-scanner.js
const { GoogleGenAI } = require("@google/genai"); // O la librería exacta que uses para Gemini

exports.handler = async (event, context) => {
  // 1. RESPONDER CON UN "HTTP OK STATUS (200)" A LAS PETICIONES PREFLIGHT OPTIONS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({ message: "Successful preflight" }),
    };
  }

  // 2. CONTROLAR QUE SOLO SE PROCESEN PETICIONES POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  try {
    // 3. TU LÓGICA DE GEMINI 
    // Parseamos la imagen que viene desde tu hook useGeminiOCR
    const body = JSON.parse(event.body);
    const base64Image = body.base64Image;

    if (!base64Image) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "No se proporcionó ninguna imagen base64" }),
      };
    }

    // --- Aquí colocas tu inicialización y llamada a la API de Gemini ---
    // Ejemplo rápido (ajústalo según tus variables de entorno y SDK):
    // const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    // const response = await ai.models.generateContent({ ... });
    // const textoDetectado = response.text;
    
    // Marcador de posición (reemplázalo con tu lógica real de Gemini):
    const textoDetectado = "TEXTO_PROCESADO_POR_GEMINI"; 

    // 4. RETORNO EXITOSO CON ESTADO 200 OK Y SU CABECERA CORS
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: textoDetectado }),
    };

  } catch (error) {
    console.error("Error en ocr-scanner:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};