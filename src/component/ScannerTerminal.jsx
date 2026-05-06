import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { GoogleGenerativeAI } from "@google/generative-ai";
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
  const [showCooldownAlert, setShowCooldownAlert] = useState(false);

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
    return clean.replace(/P0+/g, 'P').replace(/L0+/g, 'L');
  };

  const getExpandedExcelIds = (matchFound) => {
    const rangeRegex = /(P0*\d+L0*\d+[MD])(\d{3})[\/-](\d{3})/i;
    const parts = matchFound.match(rangeRegex);
    
    if (parts) {
      const prefix = parts[1];
      const startStr = parts[2];
      const endStr = parts[3];
      const startNum = parseInt(startStr);
      const endNum = parseInt(endStr);
      const padding = startStr.length;
      const expanded = [];

      for (let i = startNum; i <= endNum; i++) {
        const formattedNum = i.toString().padStart(padding, '0');
        const candidateId = normalizeId(`${prefix}${formattedNum}`);
        const existsInDb = dbData.some(item => item.ID && normalizeId(item.ID) === candidateId);
        if (existsInDb) expanded.push(candidateId);
      }
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
          ctx.filter = 'grayscale(1) contrast(1.2) brightness(1.1)';
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7);
        };
      };
    });
  };

 const analyzeWithGemini = async (imageBlob) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  const base64Data = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(imageBlob);
  });

  // URL DIRECTA - Saltamos el localhost para evitar problemas de configuración en Vite
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "Extract the device ID (e.g., P1L1M001). Return ONLY the ID string. If not found, return ERROR." },
          { inlineData: { mimeType: "image/jpeg", data: base64Data } }
        ]
      }]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Error de Google:", data);
    throw new Error(data.error?.message || "Error en la comunicación con Gemini");
  }

  return data.candidates[0].content.parts[0].text.trim().toUpperCase();
};

const handleCapture = async (blob) => {
  try {
    setLoading(true);
    const deviceId = await analyzeWithGemini(blob);
    console.log("ID detectado:", deviceId);
    // Aquí puedes actualizar tu estado o guardar el ID en tu lista
    setDetectedId(deviceId);
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(false);
  }
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

    // --- NUEVA LÓGICA DE ESPERA ---
    // Esperamos 4 segundos entre cada imagen para no saturar la cuenta gratuita
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 4000));
    }

    try {
      const compressedBlob = await compressImage(file);
      const detectedId = await analyzeWithGemini(compressedBlob);

      if (detectedId && detectedId !== "ERROR" && detectedId.length > 3) {
        const finalId = detectedId.replace(/[^A-Z0-9-/]/g, '');
        const masterInfo = queryMaster(finalId); 
        
        currentResults.push({
          id: finalId, 
          fileName: file.name,
          originalFile: file,
          thumb: thumbUrl,
          masterInfo: masterInfo || { ID: finalId, DISPOSITIVO: "N/A", UBICACION: "N/A", PANEL: "N/A" }
        });
        setResults([...currentResults]);
      } else {
        throw new Error("ID no detectado claramente");
      }
    } catch (err) {
      // Si el error es de cuota, lo informamos mejor
      const reason = err.message.includes("quota") || err.message.includes("429") 
        ? "Límite de velocidad: Reintentando en breve..." 
        : err.message;
        
      setErrors(prev => [...prev, { fileName: file.name, reason, thumb: thumbUrl }]);
      
      // Si falló por cuota, esperamos un poco más antes de la siguiente
      if (err.message.includes("quota")) {
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    setProgress(prev => ({ ...prev, current: i + 1 }));
  }
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
  };

  const downloadExcel = () => {
    const rows = [];
    const uniqueIdsInExcel = new Set();
    results.forEach(res => {
      const ids = getExpandedExcelIds(res.id);
      ids.forEach(singleId => {
        if (!uniqueIdsInExcel.has(singleId)) {
          uniqueIdsInExcel.add(singleId);
          const info = queryMaster(singleId);
          rows.push({
            'ID Detectado': singleId,
            'Dispositivo': info?.DISPOSITIVO || "N/A",
            'Ubicación': info?.UBICACION || "N/A",
            'Archivo': res.fileName,
            'Fecha': new Date().toLocaleString()
          });
        }
      });
    });
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

  return (
    <div className="terminal-container">
      {showCooldownAlert && (
        <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#d35400', color: 'white', padding: '10px 25px', borderRadius: '30px', zIndex: 10000, fontWeight: 'bold' }}>
          ⚠️ EVITANDO SOBRECARGA: Pausa de seguridad...
        </div>
      )}

      <div className="main-card">
        <div className="header-blue">FADS SCANNER AI {dbReady ? '🟢 ONLINE' : '🔘 LOADING...'}</div>
        
        <div className="action-bar" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <input type="file" webkitdirectory="" directory="" multiple onChange={processImages} id="file-input" hidden />
          <button className="btn-platform" onClick={() => document.getElementById('file-input').click()} disabled={loading || !dbReady}>Upload folder</button>

          <div className="drop-zone-stamp" style={{ border: '2px dashed #005a84', borderRadius: '8px', padding: '10px 15px', backgroundColor: '#f8fbff', cursor: 'pointer', textAlign: 'center', minWidth: '250px' }} onClick={() => document.getElementById('stamp-input').click()}>
            <input type="file" id="stamp-input" multiple accept="image/*" webkitdirectory="" directory="" onChange={(e) => setStampingFiles(Array.from(e.target.files).filter(f => f.type.startsWith('image/')))} hidden />
            {stampingFiles.length === 0 ? (
              <div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#005a84' }}>📸 PHOTO DATE</p>
                <p style={{ margin: 0, fontSize: '10px' }}>Click or drag folder</p>
              </div>
            ) : (
              <div onClick={(e) => e.stopPropagation()}>
                <p style={{ margin: '0 0 5px 0', fontSize: '11px', color: '#27ae60', fontWeight: 'bold' }}>✅ {stampingFiles.length} fotos</p>
                <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                  <input type="date" value={dateStamp} onChange={(e) => setDateStamp(e.target.value)} style={{ fontSize: '11px' }} />
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
            <div className="progress-track"><div className="progress-fill" style={{ width: `${(progress.current/progress.total)*100}%` }}></div></div>
            <div className="progress-text">Procesando: {progress.current}/{progress.total}</div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #ccc' }}>
          <div>
            <div className="header-blue" style={{ backgroundColor: '#005a84' }}>Detected ({results.length})</div>
            <div style={{ maxHeight: '500px', overflowY: 'auto', borderRight: '1px solid #ccc' }}>
              <table className="data-table">
                <thead><tr><th>View</th><th>ID</th><th>Location</th></tr></thead>
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
            <div className="header-blue" style={{ backgroundColor: '#8d2917' }}>Errors ({errors.length})</div>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>File</th><th>Reason</th></tr></thead>
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