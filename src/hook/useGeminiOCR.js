// Archivo: netlify/functions/ocr-scanner.cjs
// Forzamos CommonJS puro y duro para asegurar máxima estabilidad en Netlify
const { GoogleGenAI } = require("@google/genai"); 

const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });

exports.handler = async (event, context) => {
  // 1. Cabeceras CORS obligatorias para todas las respuestas
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  // 2. Manejo inmediato del Preflight OPTIONS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: "CORS preflight exitoso" }),
    };
  }

  if (event.httpMethod !== "POST") {
    return { 
      statusCode: 405, 
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method Not Allowed" }) 
    };
  }

  try {
    const data = JSON.parse(event.body);
    const base64Image = data.base64Image;

    if (!base64Image) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "No se recibió imagen en base64" }),
      };
    }

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

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ text: textoDetectadoIA }),
    };

  } catch (error) {
    console.error("Error en la API de Gemini Backend:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};