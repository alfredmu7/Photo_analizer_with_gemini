import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import MaintenancePopup from './MaintenancePopup'; 
import '../styles/ScannerTerminal.css';

// IMPORTACIÓN: Asegúrate de que el logo esté en la ruta correcta.
import logoJCI from '../assets/logoJCIcompleto.png';

const ScannerTerminal = () => {
  // --- ESTADOS ---
  const [loading, setLoading] = useState(false);
  const [dbData, setDbData] = useState([]);
  const [dbReady, setDbReady] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [errors, setErrors] = useState([]);
  const [dateStamp, setDateStamp] = useState("");
  const [stampingFiles, setStampingFiles] = useState([]);
  const [showMaint, setShowMaint] = useState(true);

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
    // Normaliza formatos como P01 a P1 para coincidir con el JSON
    return clean.replace(/P0+/g, 'P').replace(/L0+/g, 'L');
  };

  const queryMaster = (detectedId) => {
    if (!dbData.length) return null;
    const normalizedSearch = normalizeId(detectedId);
    const found = dbData.find(item => item.ID && normalizeId(item.ID) === normalizedSearch);
    return found ? {
      ID: found.ID,
      DISPOSITIVO: found.DISPOSITIVO || "N/A",
      UBICACION: found.UBICACION || "N/A",
    } : null;
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
          const MAX_WIDTH = 1200; // Optimizado para la API
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          // Filtros para mejorar lectura de etiquetas blancas con letras negras
          ctx.filter = 'contrast(1.2) brightness(1.0)';
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
        };
      };
    });
  };

  const analyzeWithGemini = async (imageBlob) => {
    // 1. Usa la NUEVA llave que creaste en el paso anterior
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim();
    
    const base64Data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(imageBlob);
    });

    // 2. USA ESTE MODELO EXACTO: Es el más estable para el Free Tier
    const modelName = "gemini-3-flash-preview" 
    
    // 3. USA v1beta: Es la que mejor maneja las llaves gratuitas nuevas
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Extract the device ID from the label. Return ONLY the ID." },
            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      // Si sale error aquí, el log nos dirá si es por la Key o por el modelo
      console.error("Respuesta de Google:", data);
      throw new Error(data.error?.message || "Error de conexión");
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase() || "ERROR";
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

      // --- COOLDOWN PARA NIVEL 1 (GRATIS) ---
      // Esperamos 4 segundos entre fotos para no recibir el error 429
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 4000));
      }

      try {
        const compressedBlob = await compressImage(file);
        const detectedId = await analyzeWithGemini(compressedBlob);

        if (detectedId && detectedId !== "ERROR" && detectedId.length > 3) {
          // Limpiar caracteres extraños que Gemini a veces añade
          const finalId = detectedId.replace(/[^A-Z0-9-]/g, '');
          const masterInfo = queryMaster(finalId); 
          
          currentResults.push({
            id: finalId, 
            fileName: file.name,
            originalFile: file,
            thumb: thumbUrl,
            isFound: !!masterInfo, // true si existe en DB, false si no
            masterInfo: masterInfo || { ID: finalId, DISPOSITIVO: "N/A", UBICACION: "No encontrado en DB" }
        });
          setResults([...currentResults]);
        } else {
          throw new Error("ID no legible en la imagen");
        }
      } catch (err) {
        setErrors(prev => [...prev, { 
          fileName: file.name, 
          reason: err.message, 
          thumb: thumbUrl 
        }]);
      }
      setProgress(prev => ({ ...prev, current: i + 1 }));
    }
    setLoading(false);
  };

  // --- UTILIDADES DE EXPORTACIÓN ---

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
    XLSX.writeFile(wb, "Reporte_FADS_Gemini.xlsx");
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    results.forEach(res => {
      // Crea carpetas por ID para organizar las fotos
      const folderName = res.id.replace(/\//g, '_');
      zip.folder(folderName).file(res.fileName, res.originalFile);
    });
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "Fotos_FADS_Organizadas.zip");
  };

  return (
    <div className="terminal-container">
      <MaintenancePopup isOpen={showMaint} onClose={() => setShowMaint(false)} />

      <div className="main-card">
        {/* Tu contenido de siempre */}
    
    <div className="terminal-container">
      <div className="main-card">
        <div className="header-blue">
          IDs Analizer {dbReady ? '🟢 Online' : '🔘 Loading DB...'}
        </div>
        
        <div className="action-bar" style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', padding: '20px' }}>
          <input type="file" webkitdirectory="" directory="" multiple onChange={processImages} id="file-input" hidden />
          <button className="btn-platform" onClick={() => document.getElementById('file-input').click()} disabled={loading || !dbReady}>
            📁 Scan Folder
          </button>

          {/* Módulo de Sellado de Fecha */}
          <div className="drop-zone-stamp" style={{ border: '2px dashed #005a84', borderRadius: '8px', padding: '10px 15px', backgroundColor: '#f8fbff', cursor: 'pointer', textAlign: 'center', minWidth: '250px' }} onClick={() => document.getElementById('stamp-input').click()}>
            <input type="file" id="stamp-input" multiple accept="image/*" webkitdirectory="" directory="" onChange={(e) => setStampingFiles(Array.from(e.target.files).filter(f => f.type.startsWith('image/')))} hidden />
            {stampingFiles.length === 0 ? (
              <div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#005a84' }}>📸 WATERMARK TOOL</p>
                <p style={{ margin: 0, fontSize: '10px' }}>Click to select folder to date-stamp</p>
              </div>
            ) : (
              <div onClick={(e) => e.stopPropagation()}>
                <p style={{ margin: '0 0 5px 0', fontSize: '11px', color: '#27ae60', fontWeight: 'bold' }}>✅ {stampingFiles.length} photos ready</p>
                <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                  <input type="date" value={dateStamp} onChange={(e) => setDateStamp(e.target.value)} style={{ fontSize: '11px' }} />
                  <button className="btn-platform btn-success" onClick={handleGenerateStamps} disabled={!dateStamp || loading} style={{ padding: '2px 8px', fontSize: '11px' }}>Stamp</button>
                </div>
              </div>
            )}
          </div>

          <button className="btn-platform" onClick={downloadExcel} disabled={loading || results.length === 0} style={{ marginLeft: 'auto' }}>♻️ Excel</button>
          <button className="btn-platform" onClick={downloadZip} disabled={loading || results.length === 0}>📂 ZIP</button>
        </div>

        {loading && (
          <div className="progress-wrapper" style={{ padding: '0 20px 20px' }}>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${(progress.current/progress.total)*100}%` }}></div></div>
            <div className="progress-text">Procesando con Gemini AI: {progress.current}/{progress.total}</div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', borderTop: '1px solid #ccc' }}>
          {/* Columna de Resultados */}
          <div>
            <div className="header-blue" style={{ backgroundColor: '#005a84', fontSize: '12px' }}>Detected Devices ({results.length})</div>
            <div style={{ maxHeight: '600px', overflowY: 'auto', borderRight: '1px solid #ccc' }}>
              <table className="data-table">
                <thead><tr><th>Photo</th><th>Detected ID</th><th>Location</th></tr></thead>
                <tbody>
                 {results.map((res, i) => (
                    <tr key={i}>
                      <td>
                        <img src={res.thumb} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px' }} alt="thumb" />
                      </td>
                      <td style={{ 
                        // Si no se encontró en la DB, ponemos color naranja (DarkOrange)
                        color: res.isFound ? '#646464' : '#e67e22', fontWeight: 'bold' 
                      }}>
                        {res.id}
                      </td>
                      <td style={{ fontSize: '11px', color: res.isFound ? 'inherit' : '#e67e22' }}>
                        <div style={{ fontSize: '10px'}}>{res.masterInfo?.UBICACION}</div>
                        <div style={{ fontSize: '9px', fontStyle: 'italic' }}>{res.masterInfo?.DISPOSITIVO}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Columna de Errores */}
          <div>
            <div className="header-blue" style={{ backgroundColor: '#8d2917', fontSize: '12px' }}>Issues / Not Found ({errors.length})</div>
            <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>File</th><th>Reason</th></tr></thead>
                <tbody>
                  {errors.map((err, i) => (
                    <tr key={i} className="row-error">
                      <td style={{ fontSize: '10px' }}>{err.fileName}</td>
                      <td style={{ fontSize: '10px', color: '#c0392b' }}>{err.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
      </div>
    </div>
  );
};
  

export default ScannerTerminal;