// netlify/functions/ocr-scanner.js
const { GoogleGenAI } = require("@google/genai");

exports.handler = async (event, context) => {
    // 1. Validar de manera estricta que solo se admitan peticiones POST
    if (event.httpMethod !== "POST") {
        return { 
            statusCode: 405, 
            headers: { 
                "Content-Type": "application/json", 
                "Access-Control-Allow-Origin": "*" 
            },
            body: JSON.stringify({ error: "Método no permitido" }) 
        };
    }

    try {
        // 2. Validar la existencia de la API Key en las variables de entorno de Netlify
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return { 
                statusCode: 500, 
                headers: { 
                    "Content-Type": "application/json", 
                    "Access-Control-Allow-Origin": "*" 
                },
                body: JSON.stringify({ error: "API Key no configurada en Netlify" }) 
            };
        }

        // 3. Parsear el body de la petición enviado por el frontend
        const { base64Image } = JSON.parse(event.body);
        if (!base64Image) {
            return { 
                statusCode: 400, 
                headers: { 
                    "Content-Type": "application/json", 
                    "Access-Control-Allow-Origin": "*" 
                },
                body: JSON.stringify({ error: "No se recibió la imagen en Base64" }) 
            };
        }

        // LIMPIEZA PREVENTIVA: Remover encabezados Data URL si existen
        const cleanBase64 = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;

        // 4. Inicializar el SDK oficial de Google
        const ai = new GoogleGenAI({ apiKey });

        // 5. Ejecución con la estructura nativa del SDK y el modelo optimizado
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview", // Modelo de alta fidelidad visual espacial
            contents: [
                {
                    role: "user",
                    parts: [
                        { 
                            // Tu prompt original exacto en inglés que lee sin fallar
                            text: "Extract the device ID from the label. Return ONLY the ID." 
                        },
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
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 25,
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            }
        });

        // 6. Extracción directa del texto usando la propiedad nativa del SDK
        const detectedText = response.text ? response.text.trim() : "ERROR";

        // Retornamos la respuesta mapeada con la propiedad "id" que espera el frontend
        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ id: detectedText }) 
        };

    } catch (error) {
        console.error("Error en la función de Netlify OCR:", error);
        const status = error.status || 500;
        return {
            statusCode: status,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: error.message || "Error interno procesando OCR" })
        };
    }
};