import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import ReportFiller from './ReportFiller';
import AccessGatekeeper from './AccessGatekeeper'; 
import ReportSystemsManager from './ReportSystemsManager';
import { db } from '../db/db';
import '../styles/ScannerTerminal.css';

import logoJCI from '../assets/logoJCIcompleto.png';
import excelIcon from '../assets/excel.png';

const ScannerTerminal = () => {
  // --- ESTADOS DE CONTROL DE ACCESO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessMode, setAccessMode] = useState(null); 

  // --- ESTADOS ---
  const [loading, setLoading] = useState(false);
  const [dbData, setDbData] = useState([]);
  const [dbReady, setDbReady] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [errors, setErrors] = useState([]);
  const [dateStamp, setDateStamp] = useState("");
  const [stampingFiles, setStampingFiles] = useState([]);
  const [lotePendiente, setLotePendiente] = useState(null);

  const createdBlobUrls = useRef([]);

  const trackBlobUrl = (url) => {
    createdBlobUrls.current.push(url);
    return url;
  };

  const clearBlobUrls = () => {
    createdBlobUrls.current.forEach(url => URL.revokeObjectURL(url));
    createdBlobUrls.current = [];
  };

  useEffect(() => {
    return () => {
      clearBlobUrls();
    };
  }, []);

  // Sync desde Dexie mapeando con la clave primaria autogenerada (idDexie)
  useEffect(() => {
    const syncFromDexie = async () => {
      try {
        const localData = await db.resultadosOCR.toArray();
        if (localData && localData.length > 0) {
          const formatted = localData.map(item => ({
            ...item,
            id: item.idDetectado || "N/A",
            originalFile: item.originalFile || null
          }));
          setResults(formatted);
        }
      } catch (err) {
        console.error("Error al sincronizar desde IndexedDB:", err);
      }
    };
    syncFromDexie();
  }, []);

  // --- CARGA DE MASTER DB ---
  useEffect(() => {
    if (isAuthenticated && accessMode === 'full') {
      const loadMasterData = async () => {
        try {
          const urls = [
            '/SQL_sacs_backend.json',
            '/SQL_cctv_backend.json',
            '/SQL_fads_oficial_backend.json'
          ];
          
          const resultsData = await Promise.allSettled(urls.map(url => fetch(url)));
          let combinedData = [];

          for (const resStatus of resultsData) {
            if (resStatus.status === 'fulfilled' && resStatus.value.ok) {
              try {
                const data = await resStatus.value.json();
                if (Array.isArray(data)) combinedData = [...combinedData, ...data];
              } catch (parseErr) {
                console.error(`Error procesando JSON:`, parseErr);
              }
            }
          }

          if (combinedData.length > 0) {
            setDbData(combinedData);
            setDbReady(true);
          } else {
            throw new Error("No se cargó ninguna base de datos máster.");
          }
        } catch (err) {
          console.error("Error cargando BD:", err);
          setDbReady(false);
        }
      };
      
      loadMasterData();
    }
  }, [isAuthenticated, accessMode]);

  const handleAccessGranted = (mode) => {
    setAccessMode(mode);
    setIsAuthenticated(true);
  };

  const handleWatermarkDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (droppedFiles.length > 0) setStampingFiles(droppedFiles);
    }
  };

  const clearAllAnalyzedData = async () => {
    clearBlobUrls();
    setResults([]);
    setErrors([]);
    setLotePendiente(null);
    setProgress({ current: 0, total: 0 });
    
    try {
      await db.resultadosOCR.clear();
    } catch (err) {
      console.error("Error al borrar Dexie DB:", err);
    }

    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = "";
  };

  const getSimilarityScore = (str1, str2) => {
    const s1 = str1.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const s2 = str2.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s1 === s2) return 100;
    if (!s1 || !s2) return 0;

    const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
    for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;

    for (let j = 1; j <= s2.length; j += 1) {
      for (let i = 1; i <= s1.length; i += 1) {
        const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
        track[j][i] = Math.min(
          track[j][i - 1] + 1,
          track[j - 1][i] + 1,
          track[j - 1][i - 1] + indicator
        );
      }
    }
    const distance = track[s2.length][s1.length];
    const maxLength = Math.max(s1.length, s2.length);
    return ((maxLength - distance) / maxLength) * 100;
  };

  const queryMaster = (detectedId) => {
    if (!dbData.length || !detectedId) return null;
    const searchClean = detectedId.toUpperCase().trim();
    
    const exactMatch = dbData.find(item => {
      const dbIdRaw = item.ID_PUERTA || item.ID || item.id || item.CODIGO || item.ID_DISPOSITIVO;
      if (!dbIdRaw) return false;
      const dbClean = dbIdRaw.toString().toUpperCase().trim();
      return searchClean.includes(dbClean) || dbClean.includes(searchClean);
    });

    if (exactMatch) {
      return {
        ID: exactMatch.ID_PUERTA || exactMatch.ID || exactMatch.id || exactMatch.CODIGO,
        DISPOSITIVO: exactMatch.TIPO_DE_EQUIPO || exactMatch.TIPO || exactMatch.tipo || exactMatch.DISPOSITIVO || "DISPOSITIVO",
        UBICACION: exactMatch.UBICACION || exactMatch.ubicacion || exactMatch.ZONA || "N/A",
        score: 100 
      };
    }

    let bestMatch = null;
    let highestScore = 0;
    const UMBRAL_MINIMO = 70; 

    for (let i = 0; i < dbData.length; i++) {
      const item = dbData[i];
      const dbIdRaw = item.ID_PUERTA || item.ID || item.id || item.CODIGO || item.ID_DISPOSITIVO;
      if (!dbIdRaw) continue;
      const dbClean = dbIdRaw.toString().toUpperCase().trim();
      const score = getSimilarityScore(searchClean, dbClean);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = item;
      }
    }

    if (bestMatch && highestScore >= UMBRAL_MINIMO) {
      return {
        ID: bestMatch.ID_PUERTA || bestMatch.ID || bestMatch.id || bestMatch.CODIGO,
        DISPOSITIVO: bestMatch.TIPO_DE_EQUIPO || bestMatch.TIPO || bestMatch.tipo || bestMatch.DISPOSITIVO || "DISPOSITIVO",
        UBICACION: bestMatch.UBICACION || bestMatch.ubicacion || bestMatch.ZONA || "N/A",
        score: highestScore
      };
    }
    return null;
  };

  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Error leyendo el archivo"));
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error("Error al cargar imagen"));
        img.src = e.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1920; 
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.filter = 'contrast(1.1) brightness(1.0)';
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
        };
      };
    });
  };

  const analyzeWithGemini = async (imageBlob) => {
    const base64Image = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(imageBlob);
    });

    const cleanBase64 = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;
    const url = 'https://id-analizer.netlify.app/.netlify/functions/ocr-scanner';

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image: cleanBase64 })
    });

    if (!response.ok) {
      throw new Error(`Error en servidor OCR (${response.status})`);
    }

    const data = await response.json();
    const detectedText = data.text || data.detectedText || data.id;
    if (!detectedText || detectedText.toUpperCase().includes("ERROR")) {
      throw new Error("No se detectaron caracteres legibles.");
    }

    return detectedText.trim();
  };

  // --- ASIGNACIÓN DE LOTE A SISTEMA SELECCIONADO ---
  const asignarLoteASistema = async (sistemaElegido) => {
    if (!lotePendiente || lotePendiente.length === 0) return;

    try {
      // 1. Actualizamos IndexedDB en segundo plano para persistencia
      await db.transaction('rw', db.resultadosOCR, async () => {
        for (const foto of lotePendiente) {
          if (foto.idDexie) {
            await db.resultadosOCR.update(foto.idDexie, { sistemaAsignado: sistemaElegido });
          }
        }
      });

      // 2. Mapeamos el arreglo en memoria actualizando el sistema
      const idsPendientesDexie = new Set(lotePendiente.map(item => item.idDexie));

      setResults(prevResults => 
        prevResults.map(item => {
          if (idsPendientesDexie.has(item.idDexie)) {
            return { ...item, sistemaAsignado: sistemaElegido };
          }
          return item;
        })
      );

      // 3. Limpiamos el banner del lote pendiente
      setLotePendiente(null);

    } catch (err) {
      console.error("Error al asignar el lote al sistema en Dexie:", err);
      alert("Ocurrió un error al guardar la asignación del sistema.");
    }
  };

  const processImages = async (event) => {
    if (!event.target.files) return;
    const files = Array.from(event.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    setLoading(true);
    setErrors([]);
    setProgress({ current: 0, total: files.length });

    const currentResults = [];
    let completedCount = 0;

    const CONCURRENCY_LIMIT = 3; 
    const MAX_RETRIES = 2;       

    const pool = files.map((file, index) => ({ file, index }));

    const worker = async () => {
      while (pool.length > 0) {
        const task = pool.shift();
        if (!task) break;

        const { file } = task;
        const thumbUrl = trackBlobUrl(URL.createObjectURL(file));
        let currentDelay = 2000; 

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            const compressedBlob = await compressImage(file);
            const detectedId = await analyzeWithGemini(compressedBlob);
            const finalId = detectedId.toUpperCase().trim(); 
            const masterInfo = queryMaster(finalId); 
            
            const itemParaGuardar = {
              idDetectado: finalId,
              fileName: file.name,
              thumb: thumbUrl,
              isFound: !!masterInfo,
              masterInfo: masterInfo || { ID: finalId, DISPOSITIVO: "N/A", UBICACION: "No encontrado en Base de Datos" },
              sistemaAsignado: null,
              fechaGuardado: new Date().toISOString()
            };

            const idDexie = await db.resultadosOCR.add(itemParaGuardar);
            
            const itemResultado = {
              ...itemParaGuardar,
              id: finalId,
              idDexie,
              originalFile: file
            };

            currentResults.push(itemResultado);
            break; 

          } catch (err) {
            if (attempt < MAX_RETRIES) {
              await new Promise(resolve => setTimeout(resolve, currentDelay));
              currentDelay *= 2; 
            } else {
              setErrors(prev => [
                ...prev,
                { 
                  fileName: file.name, 
                  reason: err.message || "Error al procesar la imagen.", 
                  thumb: thumbUrl 
                }
              ]);
            }
          }
        }

        completedCount++;
        setProgress(prev => ({ ...prev, current: completedCount }));
      }
    };

    const workers = Array(Math.min(CONCURRENCY_LIMIT, pool.length))
      .fill(null)
      .map(() => worker());

    await Promise.all(workers);
    
    if (currentResults.length > 0) {
      setResults(prev => [...prev, ...currentResults]);
      setLotePendiente(currentResults);
    }

    setLoading(false);
  };

  const applyWatermark = (file, dateStr) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Error leyendo el archivo"));
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error("Error al cargar la imagen original"));
        img.src = e.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          
          const stampHeight = canvas.height * 0.15;
          const [year, month, day] = dateStr.split("-");
          const formattedDate = `${day}-${month}-${year.slice(-2)}`;
          
          const logo = new Image();
          logo.onerror = () => reject(new Error("Error al cargar el logo de la marca de agua"));
          logo.src = logoJCI;
          logo.onload = () => {
            const fontSize = Math.floor(stampHeight * 0.28);
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.textBaseline = "middle";
            const dateWidth = ctx.measureText(formattedDate).width;
            const dateX = canvas.width - dateWidth - (canvas.width * 0.04);
            const logoH = stampHeight;
            const logoW = logoH * (logo.width / logo.height);
            const logoX = dateX - logoW - (canvas.width * 0.015);
            const logoY = canvas.height - logoH - (canvas.height * 0.02);
            
            ctx.strokeStyle = "white";
            ctx.lineWidth = fontSize * 0.12;
            ctx.strokeText(formattedDate, dateX, logoY + (stampHeight / 2));
            ctx.fillStyle = "black";
            ctx.fillText(formattedDate, dateX, logoY + (stampHeight / 2));
            ctx.drawImage(logo, logoX, logoY, logoW, logoH);
            
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
          };
        };
      };
    });
  };

  const handleGenerateStamps = async () => {
    setLoading(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < stampingFiles.length; i++) {
        const file = stampingFiles[i];
        const stampedBlob = await applyWatermark(file, dateStamp);
        zip.file(`FECHADA_${file.name}`, stampedBlob);
        setProgress({ current: i + 1, total: stampingFiles.length });
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `Inspeccion_JCI_Fechada_${dateStamp}.zip`);
    } catch (err) {
      console.error("Error al generar estampas:", err);
    } finally {
      setLoading(false);
      setStampingFiles([]);
      setDateStamp("");
    }
  };

  const downloadExcel = () => {
    const uniqueResultsMap = new Map();
    results.forEach(res => {
      const key = res.idDexie || res.idDetectado || res.fileName;
      if (!uniqueResultsMap.has(key)) uniqueResultsMap.set(key, res);
    });

    const uniqueResultsArray = Array.from(uniqueResultsMap.values());
    const rows = uniqueResultsArray.map(res => ({
      'ID Detectado': res.idDetectado || res.id || 'N/A',
      'Dispositivo': res.masterInfo?.DISPOSITIVO || 'N/A',
      'Ubicación': res.masterInfo?.UBICACION || 'N/A',
      'Sistema Asignado': res.sistemaAsignado || 'Ninguno',
      'Archivo Original': res.fileName || 'N/A',
      'Fecha Procesado': res.fechaGuardado ? new Date(res.fechaGuardado).toLocaleString() : new Date().toLocaleString()
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resultados");
    XLSX.writeFile(wb, "Reporte_FADS.xlsx");
  }; 

  const downloadZip = async () => {
    const zip = new JSZip();
    let hasFiles = false;

    results.forEach(res => {
      if (res.originalFile) {
        const folderName = (res.idDetectado || res.id || "SIN_ID").replace(/\//g, '_');
        zip.folder(folderName).file(res.fileName, res.originalFile);
        hasFiles = true;
      }
    });

    if (!hasFiles) {
      alert("No hay archivos originales en memoria para empaquetar. Si recargaste la página, debes volver a cargar la carpeta.");
      return;
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "Fotos_FADS_Organizadas.zip");
  };

  const handleOpenHighRes = (file) => {
    if (!file) {
      alert("La imagen original no está disponible en la sesión actual.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const newTab = window.open();
      if (newTab) {
        newTab.document.write(`<img src="${e.target.result}" style="max-width: 100%; height: auto;" />`);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      {!isAuthenticated && <AccessGatekeeper onAccessGranted={handleAccessGranted} />}

      <div className={`terminal-container ${!isAuthenticated ? 'app-blurred' : ''}`}>
        <div className="main-card">
          <div className="header-blue">
            IDs Analyzer 
            <span style={{ fontSize: '11px', fontWeight: '400', color: '#fff', marginLeft: '10px', background: accessMode === 'full' ? '#22c55e' : '#eab308', padding: '8px 8px', borderRadius: '25px' }}>
              {accessMode === 'full' ? 'Acceso Total 🟢' : 'Core 🕓 Watermark & Date'}
            </span>
          </div>

          <div className="action-bar" style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px' }}>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'stretch', flexWrap: 'wrap' }}>
              <input type="file" webkitdirectory="" directory="" multiple onChange={processImages} id="file-input" hidden />
              <button 
                className="btn-platform" 
                onClick={() => document.getElementById('file-input').click()} 
                disabled={loading || !dbReady || accessMode !== 'full'}
                style={{ 
                  opacity: accessMode === 'full' ? 1 : 0.4, 
                  cursor: accessMode === 'full' ? 'pointer' : 'not-allowed',
                  padding: '8px 18px'
                }}
              >
                📁 Cargar carpeta
              </button>

              <div 
                className="drop-zone-stamp" 
                onClick={() => document.getElementById('stamp-input').click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleWatermarkDrop}
                style={{ cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 20px' }}
              >
                <input 
                  type="file" 
                  id="stamp-input" 
                  multiple 
                  accept="image/*" 
                  webkitdirectory="" 
                  directory="" 
                  onChange={(e) => e.target.files && setStampingFiles(Array.from(e.target.files).filter(f => f.type.startsWith('image/')))} 
                  hidden 
                />
                {stampingFiles.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: '800', color: '#3b82f6' }}>🕓 LOGO & FECHA</p>
                    <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>• Click o arrastra las fotos aquí</p>
                  </div>
                ) : (
                  <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <p style={{ margin: 0, fontSize: '11px', color: '#10b981', fontWeight: 'bold' }}>✅ {stampingFiles.length} fotos listas</p>
                      <button 
                        onClick={() => { setStampingFiles([]); setDateStamp(""); }} 
                        style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '16px', height: '16px', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
                        title="Quitar fotos"
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                      <input type="date" value={dateStamp} onChange={(e) => setDateStamp(e.target.value)} style={{ fontSize: '11px', border: '1px solid #ddd', borderRadius: '4px', padding: '2px 4px' }} />
                      <button className="btn-platform" onClick={handleGenerateStamps} disabled={!dateStamp || loading} style={{ padding: '4px 10px', fontSize: '11px', background: '#10b981' }}>Estampar</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '12px' }}>
              {accessMode === 'full' && (
                <ReportSystemsManager 
                  resultadosOCR={results} 
                  lotePendiente={lotePendiente}
                  asignarLoteASistema={asignarLoteASistema}
                />
              )}

              <button 
                className="btn-platform" 
                onClick={downloadExcel} 
                disabled={loading || results.length === 0 || accessMode !== 'full'} 
                style={{ 
                  marginLeft: 'auto', 
                  background: '#fff', 
                  color: '#1e293b', 
                  border: '1px solid #e2e8f0', 
                  opacity: accessMode === 'full' ? 1 : 0.4,
                  display: 'flex',          
                  alignItems: 'center', 
                  gap: '4px',              
                  padding: '6px 14px',
                  fontSize: '13px'
                }}
              >
                <img src={excelIcon} alt="Excel Icon" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
                Excel
              </button>
              
              <button 
                className="btn-platform" 
                onClick={downloadZip} 
                disabled={loading || results.length === 0 || accessMode !== 'full'}
                style={{ opacity: accessMode === 'full' ? 1 : 0.4, padding: '6px 14px', fontSize: '13px' }}
              >
                📂 ZIP
              </button>
            </div>
          </div>

          {loading && (
            <div className="progress-wrapper" style={{ marginBottom: '25px' }}>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}></div>
              </div>
              <div className="progress-text">Procesando: {progress.current}/{progress.total}</div>
            </div>
          )}

          {lotePendiente && (
            <div style={{ 
              background: '#f0f7ff', 
              border: '1px dashed #3b82f6', 
              borderRadius: '16px', 
              padding: '6px 20px', 
              marginBottom: '25px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '15px',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '13px', color: '#1e3a8a', fontWeight: '600' }}>
                  ¡{lotePendiente.length} fotos analizadas con éxito! Elige un sistema en el selector.
                </span>
              </div>
              
              <button 
                onClick={() => setLotePendiente(null)} 
                style={{ 
                  background: '#fca5a569', 
                  border: 'none', 
                  color: '#ef4444', 
                  cursor: 'pointer', 
                  fontSize: '11px', 
                  fontWeight: '700',
                  padding: '6px 12px',
                  borderRadius: '9px',
                  transition: 'all 0.2s ease'
                }}
              >
                No registrar
              </button>
            </div>
          )}

          {accessMode === 'full' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px', position: 'relative' }}>
              
              {(results.length > 0 || errors.length > 0) && (
                <button
                  onClick={clearAllAnalyzedData}
                  disabled={loading}
                  style={{
                    position: 'absolute',
                    top: '-12px',
                    right: 'calc(40% + 10px)',
                    background: '#fee2e2',
                    color: '#ef4444',
                    border: '1px solid #fca5a5',
                    borderRadius: '10px',
                    width: '38px',
                    height: '38px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.1)',
                    zIndex: 10,
                    transition: 'all 0.2s ease'
                  }}
                  title="Limpiar todas las fotos analizadas y liberar memoria local"
                >
                  ✕
                </button>
              )}

              <div className="column-section" style={{ background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', marginBottom: '15px' }}>
                  Dispositivos detectados ({results.length})
                </h3>
                <div style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '10px' }}>
                  <table className="data-table">
                    <thead><tr><th>Foto</th><th>ID Detectado</th><th>Ubicación</th></tr></thead>
                    <tbody>
                      {results.map((res, i) => (
                        <tr key={res.idDexie || i}>
                          <td>
                            {res.originalFile ? (
                              <img 
                                src={res.thumb} 
                                onClick={() => handleOpenHighRes(res.originalFile)}
                                style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #e2e8f0', cursor: 'pointer' }} 
                                alt="thumb" 
                                title="Haz clic para ver la imagen original en alta resolución"
                              />
                            ) : (
                              <img 
                                src={res.thumb} 
                                style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #e2e8f0', opacity: 0.8 }} 
                                alt="thumb" 
                                title="Imagen sincronizada de la sesión previa"
                              />
                            )}
                          </td>
                          <td style={{ color: res.isFound ? '#1e293b' : '#e67e22', fontWeight: '700', fontSize: '13px' }}>
                            {res.idDetectado || res.id}
                          </td>
                          <td>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b' }}>{res.masterInfo?.UBICACION}</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                              {res.masterInfo?.DISPOSITIVO} {res.sistemaAsignado && `[${res.sistemaAsignado}]`}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="column-section" style={{ background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#ef4444', marginBottom: '15px' }}>
                  No detectados ({errors.length})
                </h3>
                <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Foto</th>
                        <th>Archivo</th>
                        <th>Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.map((err, i) => (
                        <tr key={i}>
                          <td>
                            {err.thumb ? (
                              <img src={err.thumb} style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #fee2e2' }} alt="error thumb" />
                            ) : (
                              <div style={{ width: '55px', height: '55px', borderRadius: '10px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>⚠️</div>
                            )}
                          </td>
                          <td style={{ fontSize: '11px', color: '#475569', fontWeight: '500', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {err.fileName}
                          </td>
                          <td style={{ fontSize: '11px', color: '#ef4444', fontWeight: '600' }}>
                            {err.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', border: '2px dashed #cbd5e1', borderRadius: '12px', background: '#f8fafc' }}>
              <p style={{ fontSize: '14px', color: '#64748b', margin: 0, fontWeight: '500' }}>
                🔒 El acceso para usar el analizador y generador de informes está restringido para tu perfil.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ScannerTerminal;