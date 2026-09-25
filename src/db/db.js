import Dexie from 'dexie';

export const db = new Dexie('IDsAnalyzerDB');

db.version(1).stores({
  // ++idDexie asegura que cada registro tenga una clave primaria única autogenerada
  resultadosOCR: '++idDexie, idDetectado, fileName, fechaGuardado'
});