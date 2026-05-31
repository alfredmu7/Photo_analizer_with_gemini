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

        // =================================================================
        // EXTRAER TEXTO DE FORMA INFALIBLE (Compatibilidad estricta SDK @google/genai)
        // =================================================================
        let rawText = "";

        if (!response) {
            console.error("La respuesta del modelo llegó completamente vacía.");
        } else if (typeof response.text === "function") {
            // En algunas configuraciones del nuevo SDK, .text es una función/método
            rawText = response.text();
        } else if (typeof response.text === "string") {
            // En otras, es un getter de string directo
            rawText = response.text;
        } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
            // Ruta nativa JSON de la API de Google por si falla el envoltorio del SDK
            rawText = response.candidates[0].content.parts[0].text;
        }

        // Si después de todos los intentos sigue vacío, asignamos el error de control
        let cleanText = rawText ? rawText.replace(/[`\n\r]/g, "").trim() : "ERROR_NOT_FOUND";

        // Imprimimos en los logs para verificar el cambio en tiempo real
        console.log("=== AUDITORÍA OCR (CORREGIDO) ===");
        console.log("¿Se capturó texto?:", rawText ? "SÍ" : "NO");
        console.log("Contenido extraído:", rawText);
        console.log("Texto limpio enviado al UI:", cleanText);
        console.log("=================================");

        // Si Gemini explícitamente leyó o devolvió un mensaje de error
        if (cleanText.toUpperCase().includes("ERROR")) {
            cleanText = "ERROR_NOT_FOUND";
        }

        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
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