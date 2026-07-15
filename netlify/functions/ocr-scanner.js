// Archivo: netlify/functions/ocr-scanner.js
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);

export const handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "CORS preflight OK" }),
    };
  }

  if (event.httpMethod !== "POST") {
    return { 
      statusCode: 405, 
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" }) 
    };
  }

  try {
    const data = JSON.parse(event.body);
    const base64Image = data.base64Image;

    if (!base64Image) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "No se recibió imagen en base64" }),
      };
    }

    // Usamos el SDK clásico e infalible en Netlify
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const response = await model.generateContent([
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image
        }
      },
      "Extrae únicamente el código de identificación o ID de dispositivo industrial visible en la etiqueta blanca con letras negras (ejemplo: P11L2). No agregues texto adicional, saludos ni explicaciones, solo devuelve el ID en texto limpio."
    ]);

    const textoDetectadoIA = response.response.text() ? response.response.text().trim() : "ERROR_NO_CANDIDATE";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: textoDetectadoIA }),
    };

  } catch (error) {
    console.error("Error en la API de Gemini Backend:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};