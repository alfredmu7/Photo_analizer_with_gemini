import { db } from '../db/db';

// Genera una imagen en Blob de alta resolución HD (1920x1080)
const generateHDHorizontalPhoto = (index) => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;   // Ancho horizontal 1080p
    canvas.height = 1080;  // Alto horizontal 1080p
    const ctx = canvas.getContext('2d');

    // 1. Fondo dinámico con variación de color para evitar compresión excesiva
    const hue = (index * 13) % 360;
    ctx.fillStyle = `hsl(${hue}, 40%, 20%)`;
    ctx.fillRect(0, 0, 1920, 1080);

    // 2. Ruido/Textura aleatoria para simular el peso de detalles de una foto real
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.15)`;
      ctx.fillRect(Math.random() * 1920, Math.random() * 1080, 40, 40);
    }

    // 3. Detalles gráficos simulados de etiqueta
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 10;
    ctx.strokeRect(50, 50, 1820, 980);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`DISPOSITIVO: SIM-${1000 + index}`, 960, 480);

    ctx.fillStyle = '#f59e0b';
    ctx.font = '36px Arial';
    ctx.fillText(`FOTO DE CELULAR SIMULADA HD (1920x1080)`, 960, 560);

    // 4. Convertir a Blob JPEG real de alta calidad (0.95 = ~2 MB a 3 MB por foto)
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/jpeg', 0.95);
  });
};

export const inject200MockPhotos = async (onProgress) => {
  console.log("🚀 Generando e inyectando 200 fotos con peso binario real en IndexedDB...");
  console.time("⏱️ Tiempo total de inyección");

  // Limpiar registros previos en IndexedDB
  await db.resultadosOCR.clear();

  const totalRegistros = 500;
  const mockRecords = [];

  for (let i = 1; i <= totalRegistros; i++) {
    const detectedId = `SIM-${1000 + i}`;
    
    // Generamos un Blob binario único para cada registro
    const fotoBlob = await generateHDHorizontalPhoto(i);

    mockRecords.push({
      id: detectedId,
      idDetectado: detectedId,
      fileName: `simulacion_foto_${i}.jpg`,
      fotoBlob: fotoBlob, // <- AQUÍ SE GUARDA EL ARCHIVO BINARIO REAL
      isFound: i % 2 === 0,
      masterInfo: {
        ID: detectedId,
        DISPOSITIVO: i % 2 === 0 ? "Detector de Humo Photo-Electric" : "Módulo Monitor de Control",
        UBICACION: `Piso ${(i % 5) + 1} - Zona ${(i % 10) + 1}`
      },
      sistemaAsignado: "FADS",
      fechaGuardado: new Date().toISOString()
    });

    // Reportar progreso
    if (onProgress && i % 10 === 0) {
      onProgress(Math.round((i / totalRegistros) * 100));
    }
  }

  // Guardar en la base de datos de Dexie
  await db.resultadosOCR.bulkPut(mockRecords);

  console.timeEnd("⏱️ Tiempo total de inyección");
  console.log(`✅ ¡200 fotos binarias guardadas exitosamente en IndexedDB!`);

  // Comprobar espacio real consumido
  const estimate = await navigator.storage.estimate();
  const usageMB = (estimate.usage / (1024 * 1024)).toFixed(2);
  console.log(`💾 Almacenamiento ocupado real en IndexedDB: ${usageMB} MB`);

  return mockRecords;
};