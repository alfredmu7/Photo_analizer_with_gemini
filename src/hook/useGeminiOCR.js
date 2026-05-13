import { useState } from 'react';

export const useGeminiOCR = () => {
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

  const analyzeImage = async (imageBlob) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim();
    
    if (!apiKey) {
      throw new Error("API Key no encontrada. Revisa tu archivo .env");
    }

    const base64Data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(imageBlob);
    });

    // Cambiamos a gemini-1.5-flash que es el más estable para Free Tier
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ... dentro de tu hook useGeminiOCR, en la parte del fetch:

            body: JSON.stringify({
            contents: [{
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
                          - Habrán diferentes ID, patrones diferentes,alfanumericos, con guiones, sin guiones, con letras, sin letras, etc. 

                        3. REGLAS DE SALIDA:
                          - Devuelve ÚNICAMENTE el código alfanumérico. Sin frases, sin "ID:", sin puntos finales.
                          - Si el ID está acompañado del modelo (ej. "RDR2SA 2064-04"), extrae todo completo (RDR2SA2064-04).
                          - Convierte todo a MAYÚSCULAS.
                          - Si no hay un ID claro, responde estrictamente con la frase: "La marquilla no es clara".
                        ` 
                },
                { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                ]
            }],
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            ],
            generationConfig: {
                temperature: 0.1,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 25, 
            }
            })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setIsQuotaExceeded(true);
          // Reseteo automático después de 1 minuto para que la UI se limpie sola
          setTimeout(() => setIsQuotaExceeded(false), 60000);
          throw new Error("Límite de velocidad (429). Google pide una pausa.");
        }
        throw new Error(data.error?.message || "Error desconocido en Google");
      }

      setIsQuotaExceeded(false);
      
      // Manejo de respuesta vacía o bloqueada por seguridad
      if (!data.candidates || data.candidates.length === 0) {
        return "ERROR_NO_CANDIDATE";
      }

      const text = data.candidates[0].content?.parts?.[0]?.text || "ERROR";
      return text.trim().toUpperCase();

    } catch (err) {
      console.error("Gemini Hook Error:", err);
      throw err;
    }
  };

  return { analyzeImage, isQuotaExceeded };
};