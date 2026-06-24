// Archivo: netlify/functions/ocr-scanner.js
const { GoogleGenAI } = require("@google/genai"); 

// Se inicializa el SDK usando la variable de entorno que configuraste en el panel de Netlify
const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });

exports.handler = async (event, context) => {
  // 1. Manejo del Preflight OPTIONS para solucionar CORS definitivamente
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({ message: "CORS preflight exitoso" }),
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const data = JSON.parse(event.body);
    const base64Image = data.base64Image;

    if (!base64Image) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "No se recibió imagen en base64" }),
      };
    }

    // 2. Aquí está tu lógica real con el Prompt optimizado para las etiquetas industriales
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image
          }
        },
        "Extrae únicamente el código de identificación o ID de dispositivo industrial visible en la etiqueta blanca con letras negras (ejemplo: P11L2). No agregues texto adicional, saludos ni explicaciones, solo devuelve el ID en texto limpio."
      ],
    });

    const textoDetectadoIA = response.text ? response.text.trim() : "ERROR_NO_CANDIDATE";

    // 3. Devolución del ID real al Frontend con las cabeceras CORS de autorización
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: textoDetectadoIA }),
    };

  } catch (error) {
    console.error("Error en la API de Gemini Backend:", error);
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