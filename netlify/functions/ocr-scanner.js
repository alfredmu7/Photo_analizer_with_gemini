const { GoogleGenAI } = require("@google/genai");

exports.handler = async (event, context) => {
    // 1. Validar de manera estricta que solo se admitan peticiones POST
    if (event.httpMethod !== "POST") {
        return { 
            statusCode: 405, 
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: "Método no permitido" }) 
        };
    }

    try {
        // 2. Validar la existencia de la API Key en las variables de entorno de Netlify
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return { 
                statusCode: 500, 
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "API Key no configurada en Netlify" }) 
            };
        }

        // 3. Parsear el body de la petición enviado por el frontend
        const { base64Image } = JSON.parse(event.body);
        if (!base64Image) {
            return { 
                statusCode: 400, 
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "No se recibió la imagen en Base64" }) 
            };
        }

        // LIMPIEZA PREVENTIVA: Remover encabezados Data URL si bajan desde el hook de React
        const cleanBase64 = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;

        // 4. Inicializar el SDK oficial de Google
        const ai = new GoogleGenAI({ apiKey });

        // 5. El motor de ejecución idéntico al que te funciona bien
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", // Usando el modelo de alta precisión visual
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: `Analiza la imagen técnica de este dispositivo de seguridad y extrae el identificador (ID) de la marquilla siguiendo estas reglas estrictas:

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
                              - Devuelve ÚNICAMENTE el código alfanumérico. Sin frases, sin "ID:", sin puntos finales.
                              - Si el ID está acompañado del modelo (ej. "RDR2SA 2064-04"), extrae todo completo (RDR2SA2064-04).
                              - Convierte todo a MAYÚSCULAS.
                              - Si no hay un ID claro, responde estrictamente con la frase: "La marquilla no es clara".`
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

        // 6. Extracción nativa directa e infalible (Removiendo saltos de línea molestos)
        const detectedText = response.text ? response.text.replace(/[`\n\r]/g, "").trim() : "La marquilla no es clara";

        // Mapeamos el resultado al parámetro esperado por tu frontend ("id")
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