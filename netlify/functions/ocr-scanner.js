// netlify/functions/ocr-scanner.js
const { GoogleGenAI } = require("@google/genai");

exports.handler = async (event, context) => {
    // Configuración obligatoria de cabeceras CORS para producción
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, headers, body: JSON.stringify({ error: "Método no permitido" }) };
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: "API Key no configurada en Netlify" }) };
        }

        const { base64Image } = JSON.parse(event.body);
        if (!base64Image) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "No se recibió la imagen" }) };
        }

        // Remover de raíz cualquier encabezado Data-URL (ej: data:image/jpeg;base64,)
        const cleanBase64 = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;

        const ai = new GoogleGenAI({ apiKey });

        // Invocación usando la estructura exacta que repara la lectura espacial
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: "Extract the device ID code from the label. Return ONLY the raw ID code. No conversational text, no markdown." },
                        {
                            inlineData: {
                                mimeType: "image/jpeg",
                                data: cleanBase64
                            }
                        }
                    ]
                }
            ],
            config: {
                temperature: 0.1,
                maxOutputTokens: 25
            }
        });

        const detectedText = response.text ? response.text.trim() : "ERROR_NOT_FOUND";

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ id: detectedText }) 
        };

    } catch (error) {
        console.error("Error en Netlify OCR:", error);
        return {
            statusCode: error.status || 500,
            headers,
            body: JSON.stringify({ error: error.message || "Error procesando OCR" })
        };
    }
};