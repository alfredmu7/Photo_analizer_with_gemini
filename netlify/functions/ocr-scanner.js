const { GoogleGenAI } = require("@google/genai");

exports.handler = async (event, context) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return { statusCode: 500, body: JSON.stringify({ error: "API Key no configurada en Netlify" }) };
        }

        const { base64Image } = JSON.parse(event.body);
        if (!base64Image) {
            return { statusCode: 400, body: JSON.stringify({ error: "No se recibió la imagen en Base64" }) };
        }

        const ai = new GoogleGenAI({ apiKey });

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: `
                            Analiza la imagen técnica de este dispositivo de seguridad y extrae el identificador (ID) de la marquilla siguiendo estas reglas estrictas:

                            1. IDENTIFICACIÓN DE OBJETIVOS:
                              - Busca etiquetas blancas o pegatinas con texto impreso (marquillas).
                              - Ignora nombres de marcas (como Johnson Controls, Axis, Notifier).
                              - Ignora fechas (como 22-02-2026).

                            2. PATRONES ESPERADOS:
                              - Formatos alfanuméricos como: P[número]L[número]D[número] (ej. P16L8D049).
                              - Formatos con guiones como: [número]-[letra][número] (ej. 012501-N103).
                              - Identificadores de controladores como: 2064-04 o 2-01-08.
                              - Habrán diferentes ID, patrones diferentes, alfanumericos, con guiones, sin guiones, con letras, sin letras, etc. 

                            3. REGLAS DE SALIDA:
                              - Devuelve ÚNICAMENTE el código alfanumérico detectado. Sin frases, sin prefijos como "ID:", sin puntos finales.
                              - Si el ID está acompañado del modelo o sector (ej. "RDR2SA 2064-04"), extrae todo el conjunto respetando sus espacios o guiones originales.
                              - Convierte todo a MAYÚSCULAS.
                              - Si no hay un ID claro o la marquilla no es legible, responde estrictamente con la frase: "ERROR_NOT_FOUND".
                            `
                        },
                        {
                            inlineData: {
                                mimeType: "image/jpeg",
                                data: base64Image
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

        // 🌟 CORRECCIÓN CRÍTICA: Extracción segura de texto compatible con @google/genai
        const rawText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
        let cleanText = rawText ? rawText.replace(/[`\n\r]/g, "").trim() : "ERROR_NOT_FOUND";

        if (cleanText.toUpperCase().includes("ERROR")) {
            cleanText = "ERROR_NOT_FOUND";
        }

        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" // Práctico si estás probando localmente con Netlify Dev
            },
            body: JSON.stringify({ id: cleanText }) 
        };

    } catch (error) {
        console.error("Error en la función de Netlify OCR:", error);
        const status = error.status || 500;
        return {
            statusCode: status,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: error.message || "Error interno procesando OCR" })
        };
    }
};