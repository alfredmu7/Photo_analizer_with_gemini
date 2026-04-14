import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import '../styles/ScannerTerminal.css';

// IMPORTACIÓN: Asegúrate de que el logo esté en la ruta correcta.
import logoJCI from '../assets/logoJCIcompleto.png';

const ScannerTerminal = () => {
  // --- ESTADOS ---
  const [loading, setLoading] = useState(false);
  const [dbData, setDbData] = useState([]);
  const [dbReady, setDbReady] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [timeLeft, setTimeLeft] = useState(0);
  const [results, setResults] = useState([]);
  const [errors, setErrors] = useState([]);
  const [dateStamp, setDateStamp] = useState("");
  const [stampingFiles, setStampingFiles] = useState([]);
  
  // NUEVO: Estado para el aviso de saturación
  const [showCooldownAlert, setShowCooldownAlert] = useState(false);

  // --- CONSTANTES ---
  const API_KEY = 'K84051187988957';
  
  // 1. REGEX ACTUALIZADO: Ahora acepta "/" o "-" para rangos
  const regexPatterns = [
    /P0*\d+L0*\d+[MD]\d+[\/-]\d+/i, // Agregado [\/-] para soportar ambos
    /P0*\d+L0*\d+[MD]\d+(-TEL|-T)?/i,
    /[A-Z0-9]{4,6}-[A-Z]\d{2,4}/i
  ];

  const AVG_TIME_PER_IMG = 5.2;

  // --- EFECTOS ---
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const response = await fetch('/SQL_fads_oficial_backend.json');
        if (!response.ok) throw new Error("No se pudo cargar el archivo JSON");
        const data = await response.json();
        setDbData(data);
        setDbReady(true);
      } catch (err) {
        console.error("Error cargando el maestro JSON:", err);
      }
    };
    loadMasterData();
  }, []);

 // --- UTILIDADES DE PROCESAMIENTO ---

  const normalizeId = (id) => {
    if (!id) return "";
    let clean = id.toString().toUpperCase().trim();
    // Normaliza eliminando ceros innecesarios (ej: P02 -> P2)
    return clean.replace(/P0+/g, 'P').replace(/L0+/g, 'L');
  };

    // NUEVA FUNCIÓN INTEGRADA: Lógica estricta de 3 dígitos y validación DB
  const getExpandedExcelIds = (matchFound) => {
    // REGEX ACTUALIZADO: [\/-] permite detectar tanto la barra "/" como el guion "-"
    const rangeRegex = /(P0*\d+L0*\d+[MD])(\d{3})[\/-](\d{3})/i;
    const parts = matchFound.match(rangeRegex);
    
    if (parts) {
      const prefix = parts[1];      // Prefijo: P2L1M
      const startStr = parts[2];    // Inicio: 030
      const endStr = parts[3];      // Fin: 034
      
      const startNum = parseInt(startStr);
      const endNum = parseInt(endStr);
      const padding = startStr.length;
      const expanded = [];

      for (let i = startNum; i <= endNum; i++) {
        // Mantiene el formato de 3 dígitos (ej: 031)
        const formattedNum = i.toString().padStart(padding, '0');
        const candidateId = normalizeId(`${prefix}${formattedNum}`);
        
        // Validación contra la base de datos
        const existsInDb = dbData.some(item => item.ID && normalizeId(item.ID) === candidateId);
        
        if (existsInDb) {
          expanded.push(candidateId);
        }
      }
      // Si expandió con éxito devuelve la lista, si no, devuelve el ID base normalizado
      return expanded.length > 0 ? expanded : [normalizeId(`${prefix}${startStr}`)];
    }
    return [normalizeId(matchFound)];
  };

  const queryMaster = (detectedId) => {
    if (!dbData.length) return null;
    const normalizedSearch = normalizeId(detectedId);
    const found = dbData.find(item => item.ID && normalizeId(item.ID) === normalizedSearch);
    if (found) {
      return {
        ID: found.ID,
        DISPOSITIVO: found.DISPOSITIVO || "N/A",
        UBICACION: found.UBICACION || "N/A",
        PANEL: found.PANEL || "N/A"
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
          const MAX_WIDTH = 1800;
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.filter = 'grayscale(1) contrast(1.5) brightness(1.1)';
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7);
        };
      };
    });
  };

  const analyzeWithOCRSpace = async (imageBlob) => {
    const formData = new FormData();
    formData.append('apikey', API_KEY);
    formData.append('file', imageBlob, "image.jpg");
    formData.append('language', 'eng');
    formData.append('OCREngine', '2');
    formData.append('detectOrientation', 'true');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage);
    return data.ParsedResults?.map(res => res.ParsedText).join(' ') || "";
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
          const paddingRight = canvas.width * 0.04;
          const paddingBottom = canvas.height * 0.02;
          const gapBetween = canvas.width * 0.015;

          const [year, month, day] = dateStr.split("-");
          const formattedDate = `${day}-${month}-${year.slice(-2)}`;

          const logo = new Image();
          logo.src = logoJCI;
          logo.onload = () => {
            const fontSize = Math.floor(stampHeight * 0.28);
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.textBaseline = "middle";

            const textMetrics = ctx.measureText(formattedDate);
            const dateWidth = textMetrics.width;
            const dateX = canvas.width - dateWidth - paddingRight;

            const logoH = stampHeight;
            const logoW = logoH * (logo.width / logo.height);
            const logoX = dateX - logoW - gapBetween;
            const logoY = canvas.height - logoH - paddingBottom;
            const dateY = logoY + (stampHeight / 2);

            ctx.strokeStyle = "white";
            ctx.lineWidth = Math.max(1, fontSize * 0.12);
            ctx.strokeText(formattedDate, dateX, dateY);
            ctx.fillStyle = "black";
            ctx.fillText(formattedDate, dateX, dateY);
            ctx.drawImage(logo, logoX, logoY, logoW, logoH);
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
          };
        };
      };
    });
  };

  const processImages = async (event) => {
    const files = Array.from(event.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    setLoading(true);
    setResults([]);
    setErrors([]);
    setProgress({ current: 0, total: files.length });

    const currentResults = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const thumbUrl = URL.createObjectURL(file);

      if (i > 0 && i % 8 === 0) {
        setShowCooldownAlert(true);
        await new Promise(r => setTimeout(r, 5000));
        setShowCooldownAlert(false);
      }

      try {
        const compressedBlob = await compressImage(file);
        const rawText = await analyzeWithOCRSpace(compressedBlob);
        await new Promise(resolve => setTimeout(resolve, 2000));

        const cleanText = rawText.toUpperCase().replace(/[^A-Z0-9-/]/g, '');
        let matchFound = null;

        for (const pattern of regexPatterns) {
          const currentMatch = cleanText.match(pattern);
          if (currentMatch) {
            matchFound = currentMatch[0];
            break;
          }
        }

        if (matchFound) {
          const masterInfo = queryMaster(matchFound.split('/')[0]); 
          currentResults.push({
            id: matchFound, 
            fileName: file.name,
            originalFile: file,
            thumb: thumbUrl,
            masterInfo: masterInfo || { ID: matchFound, DISPOSITIVO: "N/A", UBICACION: "N/A", PANEL: "N/A" }
          });
          setResults([...currentResults]);
        } else throw new Error("ID no detectado");
      } catch (err) {
        setErrors(prev => [...prev, { fileName: file.name, reason: err.message, thumb: thumbUrl }]);
      }
      setProgress(prev => ({ ...prev, current: i + 1 }));
    }
    setLoading(false);
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
    const rows = [];
    // NUEVO: Set para rastrear IDs ya agregados al Excel y evitar duplicados
    const uniqueIdsInExcel = new Set();

    results.forEach(res => {
      // Uso de la expansión estricta integrada
      const ids = getExpandedExcelIds(res.id);
      ids.forEach(singleId => {
        // Solo agregamos la fila si el ID no ha sido procesado antes en este reporte
        if (!uniqueIdsInExcel.has(singleId)) {
          uniqueIdsInExcel.add(singleId);
          
          const info = queryMaster(singleId);
          rows.push({
            'ID Detectado': String(singleId),
            'Dispositivo': String(info?.DISPOSITIVO || "N/A"),
            'Ubicación': String(info?.UBICACION || "N/A"),
            'Archivo': String(res.fileName),
            'Fecha': new Date().toLocaleString()
          });
        }
      });
    });

    if (rows.length === 0) return; // Evita descargar archivos vacíos

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resultados");
    XLSX.writeFile(wb, "Auditoria_FADS.xlsx");
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    results.forEach(res => zip.folder(res.id.replace(/\//g, '_')).file(res.fileName, res.originalFile));
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "Fotos_FADS.zip");
  };

  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className="terminal-container">
      {showCooldownAlert && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#d35400', color: 'white', padding: '10px 25px', borderRadius: '30px',
          zIndex: 10000, fontWeight: 'bold', boxShadow: '0 4px 15px rgba(0,0,0,0.4)', fontSize: '13px'
        }}>
          ⚠️ EVITANDO SOBRECARGA: El sistema descansará 5 segundos...
        </div>
      )}

      <div className="main-card">
        <div className="header-blue">
          FADS SCANNER AI {dbReady ? '🟢 ONLINE' : '🔘 LOADING...'}
        </div>
        
        <div className="action-bar" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <input type="file" webkitdirectory="" directory="" multiple onChange={processImages} id="file-input" hidden />
          <button className="btn-platform" onClick={() => document.getElementById('file-input').click()} disabled={loading || !dbReady}>
            Upload folder
          </button>

          <div 
            className="drop-zone-stamp"
            style={{
              border: '2px dashed #005a84', borderRadius: '8px', padding: '10px 15px',
              backgroundColor: '#f8fbff', cursor: 'pointer', textAlign: 'center', minWidth: '250px'
            }}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.backgroundColor = '#eef7ff'; }}
            onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.backgroundColor = '#f8fbff'; }}
            onDrop={(e) => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
              if (files.length > 0) setStampingFiles(files);
            }}
            onClick={() => document.getElementById('stamp-input-new').click()}
          >
            <input type="file" id="stamp-input-new" multiple accept="image/*" webkitdirectory="" directory="" 
                   onChange={(e) => setStampingFiles(Array.from(e.target.files).filter(f => f.type.startsWith('image/')))} hidden />
            
            {stampingFiles.length === 0 ? (
              <div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#005a84' }}>📸 photo date</p>
                <p style={{ margin: 0, fontSize: '10px' }}>Drag a folder or photos here</p>
              </div>
            ) : (
              <div onClick={(e) => e.stopPropagation()}>
                <p style={{ margin: '0 0 5px 0', fontSize: '11px', color: '#27ae60', fontWeight: 'bold' }}>✅ {stampingFiles.length} fotos listas</p>
                <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                  <input type="date" value={dateStamp} onChange={(e) => setDateStamp(e.target.value)} style={{ padding: '2px', fontSize: '11px' }} />
                  <button className="btn-platform btn-success" onClick={handleGenerateStamps} disabled={!dateStamp || loading} style={{ padding: '2px 8px', fontSize: '11px' }}>Sellar</button>
                </div>
              </div>
            )}
          </div>

          <button className="btn-platform" onClick={downloadExcel} disabled={loading || results.length === 0} style={{ marginLeft: 'auto' }}>♻️ Excel</button>
          <button className="btn-platform" onClick={downloadZip} disabled={loading || results.length === 0}>📂 ZIP</button>
        </div>

        {loading && (
          <div className="progress-wrapper">
            <div className="progress-track"><div className="progress-fill" style={{ width: `${progressPercent}%` }}></div></div>
            <div className="progress-text">Procesando: {progress.current}/{progress.total} | {progressPercent.toFixed(0)}%</div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0px', borderTop: '1px solid #ccc' }}>
          <div>
            <div className="header-blue" style={{ backgroundColor: '#005a84' }}>Detected ({results.length})</div>
            <div style={{ maxHeight: '500px', overflowY: 'auto', borderRight: '1px solid #ccc' }}>
              <table className="data-table">
                <thead><tr><th>View</th><th>ID</th><th>Status</th></tr></thead>
                <tbody>
                  {results.map((res, i) => (
                    <tr key={i}>
                      <td><img src={res.thumb} style={{ width: '40px', height: '40px', objectFit: 'cover' }} alt="t" /></td>
                      <td><strong>{res.id}</strong></td>
                      <td style={{ fontSize: '11px' }}>{res.masterInfo?.UBICACION}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div className="header-blue" style={{ backgroundColor: '#8d2917' }}>Unidentified ({errors.length})</div>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Archive</th><th>Reason</th></tr></thead>
                <tbody>
                  {errors.map((err, i) => (
                    <tr key={i} className="row-error"><td style={{ fontSize: '11px' }}>{err.fileName}</td><td style={{ fontSize: '11px' }}>{err.reason}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScannerTerminal;