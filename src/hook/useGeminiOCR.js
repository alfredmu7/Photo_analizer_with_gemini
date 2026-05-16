import { useState } from 'react';

export const useGeminiOCR = () => {
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

  const analyzeImage = async (imageBlob) => {
    // 1. Transformar el archivo/blob a puro Base64 limpio
    const base64Data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(imageBlob);
    });

    try {
      // 2. Apuntar a la dirección de tu Netlify Function
      const response = await fetch('/.netlify/functions/ocr-scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image: base64Data })
      });

      const data = await response.json();

      // 3. Manejo de estados de cuota y errores de red
      if (!response.ok) {
        if (response.status === 429) {
          setIsQuotaExceeded(true);
          setTimeout(() => setIsQuotaExceeded(false), 60000);
          throw new Error("Límite de velocidad (429). Google pide una pausa.");
        }
        throw new Error(data.error || "Error desconocido en el servidor de análisis");
      }

      setIsQuotaExceeded(false);

      // 4. Validar la respuesta textual
      if (!data.text) {
        return "ERROR_NO_CANDIDATE";
      }

      return data.text.trim().toUpperCase();

    } catch (err) {
      console.error("Gemini Hook Error:", err);
      throw err;
    }
  };

  return { analyzeImage, isQuotaExceeded };
};