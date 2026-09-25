import Dexie from 'dexie';

export const db = new Dexie('FadsDatabase');

// Definimos la versión y las tablas
db.version(1).stores({
    // '&idOriginal' actúa como Clave Primaria Única (Primary Key).
    reportesProgreso: '&idOriginal, sistemaAsignado, tipo',
    
    // Tabla para guardar los resultados del OCR y scanner de fotos
    resultadosOCR: '++id, idDetectado, fileName, sistemaAsignado'
});