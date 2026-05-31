// netlify/functions/ocr-scanner.js
const { GoogleGenAI } = require("@google/genai");

exports.handler = async (event, context) => {
    // Validar de manera estricta que solo se admitan peticiones POST
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
    }

    try {
        // Validar la existencia de la API Key en las variables de entorno de Netlify
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return { statusCode: 500, body: JSON.stringify({ error: "API Key no configurada en Netlify" }) };
        }

        // Parsear el body de la petición enviado por el frontend
        const { base64Image } = JSON.parse(event.body);
        if (!base64Image) {
            return { statusCode: 400, body: JSON.stringify({ error: "No se recibió la imagen en Base64" }) };
        }

        // LIMPIEZA PREVENTIVA: Remover encabezados Data URL (ej: "data:image/jpeg;base64,") si existen
        const cleanBase64 = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;

        // Inicializar el SDK oficial de Google con la llave segura
        const ai = new GoogleGenAI({ apiKey });

        // Ejecutar la llamada multimodal usando la estructura de datos nativa del SDK
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", // Modelo óptimo, veloz y con soporte OCR nativo de alta precisión
            contents: [
                // Elemento 1: Las instrucciones de procesamiento de la imagen (Prompt técnico)
                `Analiza la imagen técnica de este dispositivo de seguridad y extrae el identificador (ID) de la marquilla siguiendo estas reglas estrictas:

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
                  - Si no hay un ID claro o la marquilla no es legible, responde estrictamente con la frase: "ERROR_NOT_FOUND".`,
                
                // Elemento 2: El buffer de la imagen en formato estructurado inlineData
                {
                    inlineData: {
                        mimeType: "image/jpeg",
                        data: cleanBase64
                    }
                }
            ],
            config: {
                temperature: 0.1, // Baja creatividad para evitar alucinaciones en caracteres alfanuméricos
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 25, // Limitar la salida para optimizar costos y tiempos de respuesta
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            }
        });

        // EXTRAER TEXTO DE FORMA INFALIBLE (Validando métodos del objeto instanciado por @google/genai)
        let rawText = "";

        if (!response) {
            console.error("La respuesta del modelo llegó completamente vacía.");
        } else if (typeof response.text === "function") {
            rawText = response.text();
        } else if (typeof response.text === "string") {
            rawText = response.text;
        } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
            rawText = response.candidates[0].content.parts[0].text;
        }

        // Limpiar saltos de línea extraños o tildes invertidas generadas por respuestas Markdown
        let cleanText = rawText ? rawText.replace(/[`\n\r]/g, "").trim() : "ERROR_NOT_FOUND";

        // Logs de auditoría visibles en la consola de administración de Netlify
        console.log("=== AUDITORÍA OCR (CORREGIDO) ===");
        console.log("¿Se capturó texto?:", rawText ? "SÍ" : "NO");
        console.log("Contenido extraído:", rawText);
        console.log("Texto limpio enviado al UI:", cleanText);
        console.log("=================================");

        // Manejo estricto de respuestas erróneas
        if (cleanText.toUpperCase().includes("ERROR")) {
            cleanText = "ERROR_NOT_FOUND";
        }

        // Retorno exitoso al cliente con las cabeceras CORS habilitadas y la propiedad "id" mapeada
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