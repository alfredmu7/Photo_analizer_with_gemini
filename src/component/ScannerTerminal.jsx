import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import ReportFiller from './ReportFiller';
import AccessGatekeeper from './AccessGatekeeper'; 
import '../styles/ScannerTerminal.css';

// IMPORTACIÓN: Asegúrate de que el logo esté en la ruta correcta.
import logoJCI from '../assets/logoJCIcompleto.png';

const ScannerTerminal = () => {
  // --- ESTADOS DE CONTROL DE ACCESO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessMode, setAccessMode] = useState(null); // 'full' o 'watermark'

  // --- ESTADOS ---
  const [loading, setLoading] = useState(false);
  const [dbData, setDbData] = useState([]);
  const [dbReady, setDbReady] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [errors, setErrors] = useState([]);
  const [dateStamp, setDateStamp] = useState("");
  const [stampingFiles, setStampingFiles] = useState([]);

  // --- EFECTOS ---
  useEffect(() => {
    if (isAuthenticated && accessMode === 'full') {
      const loadMasterData = async () => {
        try {
          console.log("Iniciando carga de las 3 bases de datos (SACS, CCTV, FADS)...");
          
          const urls = [
            '/SQL_sacs_backend.json',
            '/SQL_cctv_backend.json',
            '/SQL_fads_oficial_backend.json'
          ];
          
          const results = await Promise.allSettled(urls.map(url => fetch(url)));
          
          let combinedData = [];
          let loadedCount = 0;

          for (let i = 0; i < results.length; i++) {
            const resStatus = results[i];
            const url = urls[i];

            if (resStatus.status === 'fulfilled' && resStatus.value.ok) {
              try {
                const data = await resStatus.value.json();
                if (Array.isArray(data)) {
                  combinedData = [...combinedData, ...data];
                  loadedCount++;
                  console.log(`✅ Cargado con éxito: ${url} (${data.length} registros)`);
                } else {
                  console.warn(`⚠️ El archivo ${url} no contiene un array válido.`);
                }
              } catch (parseErr) {
                console.error(`❌ Error al procesar el formato JSON de ${url}:`, parseErr);
              }
            } else {
              console.error(`❌ No se pudo conectar o encontrar el archivo: ${url}`);
            }
          }

          if (combinedData.length > 0) {
            setDbData(combinedData);
            setDbReady(true);
            console.log(`🚀 Base de datos unificada lista. Total registros en memoria: ${combinedData.length} (Origen: ${loadedCount}/3 archivos).`);
          } else {
            throw new Error("Ninguno de los 3 archivos JSON pudo ser cargado o mapeado.");
          }

        } catch (err) {
          console.error("Error crítico en el ecosistema de almacenamiento local:", err);
          setDbReady(false);
        }
      };
      
      loadMasterData();
    }
  }, [isAuthenticated, accessMode]);

  // --- MANEJADOR RETORNO DE AUTENTICACIÓN ---
  const handleAccessGranted = (mode) => {
    setAccessMode(mode);
    setIsAuthenticated(true);
  };

  // --- MANEJADOR DRAG & DROP PARA MARCA DE AGUA ---
  const handleWatermarkDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (droppedFiles.length > 0) {
        setStampingFiles(droppedFiles);
      }
    }
  };

  // --- FUNCIÓN PARA LIMPIAR EL TOTAL DE LAS FOTOS ANALIZADAS ---
  const clearAllAnalyzedData = () => {
    setResults([]);
    setErrors([]);
    setProgress({ current: 0, total: 0 });
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = "";
  };

  // --- UTILIDADES DE PROCESAMIENTO ---
  const normalizeId = (id) => {
    if (!id) return "";
    let clean = id.toString().toUpperCase().trim();
    return clean.replace(/P0+/g, 'P').replace(/L0+/g, 'L');
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

    dbData.forEach(item => {
      const dbIdRaw = item.ID_PUERTA || item.ID || item.id || item.CODIGO || item.ID_DISPOSITIVO;
      if (!dbIdRaw) return;
      const dbClean = dbIdRaw.toString().toUpperCase().trim();
      const score = getSimilarityScore(searchClean, dbClean);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = item;
      }
    });

    if (bestMatch && highestScore >= UMBRAL_MINIMO) {
      const finalDbId = bestMatch.ID_PUERTA || bestMatch.ID || bestMatch.id || bestMatch.CODIGO;
      return {
        ID: finalDbId,
        DISPOSITIVO: bestMatch.TIPO_DE_EQUIPO || bestMatch.TIPO || bestMatch.tipo || bestMatch.DISPOSITIVO || "DISPOSITIVO",
        UBICACION: bestMatch.UBICACION || bestMatch.ubicacion || bestMatch.ZONA || "N/A",
        score: highestScore
      };
    }
    return null;
  };

  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.filter = 'contrast(1.2) brightness(1.0)';
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
        };
      };
    });
  };

  // --- FUNCIÓN ADAPTADA PARA LA MIGRACIÓN HACIA TU PRODUCCIÓN EN NETLIFY ---
  const analyzeWithGemini = async (imageBlob) => {
    const base64Image = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(imageBlob);
    });

    const cleanBase64 = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;
    
    // Apuntamos directamente a tu dominio en Netlify para procesar en la nube de forma segura
    const url = 'https://id-analizer.netlify.app/.netlify/functions/ocr-scanner';

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image: cleanBase64 })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("Error detallado devuelto por Netlify Function:", errData);
      throw new Error(`Error en Netlify Serverless (${response.status})`);
    }

    const data = await response.json();
    
    // Extraemos el string detectado devuelto por tu Backend
    const detectedText = data.text || data.detectedText || data.id;
    if (!detectedText || detectedText.toUpperCase().includes("ERROR")) {
      throw new Error("La IA no devolvió caracteres legibles.");
    }

    return detectedText.trim();
  };

  // --- LÓGICA REINCORPORADA Y OPTIMIZADA CON REINTENTOS + CONCURRENCIA ---
  const processImages = async (event) => {
    const files = Array.from(event.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    setLoading(true);
    setResults([]);
    setErrors([]);
    setProgress({ current: 0, total: files.length });

    const currentResults = [];
    const currentErrors = [];
    let completedCount = 0;

    const CONCURRENCY_LIMIT = 6; // Procesamiento en ráfagas de 6 imágenes en simultáneo
    const MAX_RETRIES = 3;       // Intentos máximos por imagen si falla la red o cuota

    // Trabajamos con una copia indexada de archivos para coordinar el paralelismo
    const pool = files.map((file, index) => ({ file, index }));

    const worker = async () => {
      while (pool.length > 0) {
        const task = pool.shift();
        if (!task) break;

        const { file } = task;
        const thumbUrl = URL.createObjectURL(file);
        let currentDelay = 3000; // Iniciamos con 3 segundos de espera exponencial en fallos
        let success = false;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            // 1. Compresión local
            const compressedBlob = await compressImage(file);
            
            // 2. Análisis con la función segura en la nube (Netlify)
            const detectedId = await analyzeWithGemini(compressedBlob);
            const finalId = detectedId.toUpperCase().trim(); 
            const masterInfo = queryMaster(finalId); 
                        
            currentResults.push({
              id: finalId, 
              fileName: file.name,
              originalFile: file,
              thumb: thumbUrl,
              isFound: !!masterInfo,
              masterInfo: masterInfo || { ID: finalId, DISPOSITIVO: "N/A", UBICACION: "No encontrado en Base de Datos" }
            });
            
            // Actualización de resultados en tiempo real
            setResults([...currentResults]);
            success = true;
            break; // Salimos exitosamente del bucle de reintentos para esta foto

          } catch (err) {
            console.warn(`⚠️ [Intento ${attempt}/${MAX_RETRIES}] Falló la foto ${file.name}: ${err.message}`);
            
            if (attempt < MAX_RETRIES) {
              // Espera exponencial antes del siguiente reintento
              await new Promise(resolve => setTimeout(resolve, currentDelay));
              currentDelay *= 2; // Duplica el tiempo (3s -> 6s)
            } else {
              // Si agotó los 3 intentos, la mandamos definitivamente a fallidos
              currentErrors.push({ 
                fileName: file.name, 
                reason: err.message || "Agotó los intentos de conexión.", 
                thumb: thumbUrl 
              });
              setErrors([...currentErrors]);
            }
          }
        }

        completedCount++;
        setProgress(prev => ({ ...prev, current: completedCount }));
      }
    };

    // Lanzamos las funciones de procesamiento en paralelo limitado
    const workers = Array(Math.min(CONCURRENCY_LIMIT, pool.length))
      .fill(null)
      .map(() => worker());

    await Promise.all(workers);
    setLoading(false);
  };

  const applyWatermark = (file, dateStr) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
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
    const zip = new JSZip();
    for (let i = 0; i < stampingFiles.length; i++) {
      const file = stampingFiles[i];
      const stampedBlob = await applyWatermark(file, dateStamp);
      zip.file(`FECHADA_${file.name}`, stampedBlob);
      setProgress({ current: i + 1, total: stampingFiles.length });
    }
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `Inspeccion_JCI_Fechada_${dateStamp}.zip`);
    setLoading(false);
    setStampingFiles([]);
    setDateStamp("");
  };

  const downloadExcel = () => {
    const rows = results.map(res => ({
      'ID Detectado': res.id,
      'Dispositivo': res.masterInfo?.DISPOSITIVO,
      'Ubicación': res.masterInfo?.UBICACION,
      'Archivo Original': res.fileName,
      'Fecha Procesado': new Date().toLocaleString()
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resultados");
    XLSX.writeFile(wb, "Reporte_FADS.xlsx");
  }; 

  const downloadZip = async () => {
    const zip = new JSZip();
    results.forEach(res => {
      const folderName = res.id.replace(/\//g, '_');
      zip.folder(folderName).file(res.fileName, res.originalFile);
    });
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "Fotos_FADS_Organizadas.zip");
  };

  return (
    <>
      {!isAuthenticated && <AccessGatekeeper onAccessGranted={handleAccessGranted} />}

      <div className={`terminal-container ${!isAuthenticated ? 'app-blurred' : ''}`}>
        <div className="main-card">
          <div className="header-blue">
            IDs Analyzer 
            <span style={{ fontSize: '12px', fontWeight: '500', color: '#fff', marginLeft: '12px', background: accessMode === 'full' ? '#22c55e' : '#eab308', padding: '2px 5px', borderRadius: '4px' }}>
              {accessMode === 'full' ? '⚡ Acceso Total' : 'Core 🕓 Watermark & Date'}
            </span>
            {accessMode === 'full' && (
              <span style={{ fontSize: '14px', fontWeight: '500', color: dbReady ? '#22c55e' : '#64748b', marginLeft: '10px' }}>
                {dbReady ? '● Online' : '○ Loading DB...'}
              </span>
            )}
          </div>

          <div className="action-bar" style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '25px' }}>
            <input type="file" webkitdirectory="" directory="" multiple onChange={processImages} id="file-input" hidden />
            <button 
              className="btn-platform" 
              onClick={() => document.getElementById('file-input').click()} 
              disabled={loading || !dbReady || accessMode !== 'full'}
              style={{ opacity: accessMode === 'full' ? 1 : 0.4, cursor: accessMode === 'full' ? 'pointer' : 'not-allowed' }}
            >
              📁 Analizar carpeta
            </button>

            {/* ZONA DE MARCA DE AGUA */}
            <div 
              className="drop-zone-stamp" 
              onClick={() => document.getElementById('stamp-input').click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleWatermarkDrop}
              style={{ cursor: 'pointer', position: 'relative' }}
            >
              <input 
                type="file" 
                id="stamp-input" 
                multiple 
                accept="image/*" 
                webkitdirectory="" 
                directory="" 
                onChange={(e) => setStampingFiles(Array.from(e.target.files).filter(f => f.type.startsWith('image/')))} 
                hidden 
              />
              {stampingFiles.length === 0 ? (
                <div>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: '800', color: '#3b82f6' }}>🕓 WATERMARK & DATE</p>
                  <p style={{ margin: 0, fontSize: '10px', color: '#64748b' }}>Click o arrastra las fotos aquí</p>
                </div>
              ) : (
                <div onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', margin: '0 0 5px 0' }}>
                    <p style={{ margin: 0, fontSize: '11px', color: '#10b981', fontWeight: 'bold' }}>✅ {stampingFiles.length} photos ready</p>
                    <button 
                      onClick={() => { setStampingFiles([]); setDateStamp(""); }} 
                      style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '16px', height: '16px', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
                      title="Quitar fotos"
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', alignItems: 'center' }}>
                    <input type="date" value={dateStamp} onChange={(e) => setDateStamp(e.target.value)} style={{ fontSize: '10px', border: '1px solid #ddd', borderRadius: '4px' }} />
                    <button className="btn-platform" onClick={handleGenerateStamps} disabled={!dateStamp || loading} style={{ padding: '4px 12px', fontSize: '10px', background: '#10b981' }}>Stamp</button>
                  </div>
                </div>
              )}
            </div>

            {accessMode === 'full' && (
              <div className="action-buttons-container" style={{ display: 'flex', gap: '10px' }}>
                <ReportFiller results={results} type="Otrosí 20" templatePath="/Informe_mto_otrosi_fads.docx" className="btn-platform" />
                <ReportFiller results={results} type="Otrosí 7" templatePath="/Informe_mto_otrosi_fads.docx" className="btn-platform" />
              </div>
            )}

            <button 
              className="btn-platform" 
              onClick={downloadExcel} 
              disabled={loading || results.length === 0 || accessMode !== 'full'} 
              style={{ marginLeft: 'auto', background: '#fff', color: '#1e293b', border: '1px solid #e2e8f0', opacity: accessMode === 'full' ? 1 : 0.4 }}
            >
              ♻️ Excel
            </button>
            <button 
              className="btn-platform" 
              onClick={downloadZip} 
              disabled={loading || results.length === 0 || accessMode !== 'full'}
              style={{ opacity: accessMode === 'full' ? 1 : 0.4 }}
            >
              📂 ZIP
            </button>
          </div>

          {loading && (
            <div className="progress-wrapper" style={{ marginBottom: '25px' }}>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${(progress.current/progress.total)*100}%` }}></div></div>
              <div className="progress-text">Procesando: {progress.current}/{progress.total}</div>
            </div>
          )}

          {accessMode === 'full' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px', position: 'relative' }}>
              
              {/* BOTÓN DE LIMPIEZA TOTAL */}
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
                    border: '1.5px solid #fca5a5',
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
                  title="Limpiar todas las fotos analizadas"
                  onMouseEnter={(e) => { if(!loading) e.target.style.background = '#fecaca'; }}
                  onMouseLeave={(e) => { if(!loading) e.target.style.background = '#fee2e2'; }}
                >
                  ✕
                </button>
              )}

              {/* COLUMNA: DETECTADOS */}
              <div className="column-section" style={{ background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', marginBottom: '15px' }}>
                  Dispositivos detectados ({results.length})
                </h3>
                <div style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '10px' }}>
                  <table className="data-table">
                    <thead><tr><th>Foto</th><th>ID Detectado</th><th>Ubicación</th></tr></thead>
                    <tbody>
                      {results.map((res, i) => (
                        <tr key={i}>
                          <td><img src={res.thumb} style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #e2e8f0' }} alt="thumb" /></td>
                          <td style={{ color: res.isFound ? '#1e293b' : '#e67e22', fontWeight: '700', fontSize: '13px' }}>{res.id}</td>
                          <td>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b'}}>{res.masterInfo?.UBICACION}</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{res.masterInfo?.DISPOSITIVO}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* COLUMNA: NO DETECTADOS CON PREVISUALIZACIÓN */}
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
                              <img 
                                src={err.thumb} 
                                style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #fee2e2' }} 
                                alt="error thumb" 
                              />
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
              <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '5px' }}>
                Usa la herramienta de marca de agua y fecha para procesar tus imágenes de inspección.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ScannerTerminal;