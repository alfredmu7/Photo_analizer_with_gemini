import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import ReportFiller from './ReportFiller';
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

  const analyzeWithGemini = async (imageBlob) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim();
    const base64Data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(imageBlob);
    });

    const modelName = "gemini-2.5-flash"; // Actualizado a la versión estable actual
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
    if (!response.ok) throw new Error(data.error?.message || "Error de conexión");
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

      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 4000));
      }

      try {
        const compressedBlob = await compressImage(file);
        const detectedId = await analyzeWithGemini(compressedBlob);

        if (detectedId && detectedId !== "ERROR" && detectedId.length > 3) {
          const finalId = detectedId.replace(/[^A-Z0-9-]/g, '');
          const masterInfo = queryMaster(finalId); 
          
          currentResults.push({
            id: finalId, 
            fileName: file.name,
            originalFile: file, // Usamos directamente el archivo original
            thumb: thumbUrl,
            isFound: !!masterInfo,
            masterInfo: masterInfo || { ID: finalId, DISPOSITIVO: "N/A", UBICACION: "No encontrado" }
          });
          setResults([...currentResults]);
        }
      } catch (err) {
        setErrors(prev => [...prev, { fileName: file.name, reason: err.message, thumb: thumbUrl }]);
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
      const folderName = res.id.replace(/\//g, '_');
      zip.folder(folderName).file(res.fileName, res.originalFile);
    });
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "Fotos_FADS_Organizadas.zip");
  };

  return (
    <div className="terminal-container">
      <div className="main-card">
        <div className="header-blue">
          IDs Analyzer 
          <span style={{ fontSize: '14px', fontWeight: '500', color: dbReady ? '#22c55e' : '#64748b', marginLeft: '10px' }}>
            {dbReady ? '● Online' : '○ Loading DB...'}
          </span>
        </div>

        <div className="action-bar" style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '25px' }}>
          <input type="file" webkitdirectory="" directory="" multiple onChange={processImages} id="file-input" hidden />
          <button className="btn-platform" onClick={() => document.getElementById('file-input').click()} disabled={loading || !dbReady}>
            📁 Scan Folder
          </button>

          <div className="drop-zone-stamp" onClick={() => document.getElementById('stamp-input').click()}>
            <input type="file" id="stamp-input" multiple accept="image/*" webkitdirectory="" directory="" onChange={(e) => setStampingFiles(Array.from(e.target.files).filter(f => f.type.startsWith('image/')))} hidden />
            {stampingFiles.length === 0 ? (
              <div>
                <p style={{ margin: 0, fontSize: '11px', fontWeight: '800', color: '#3b82f6' }}>📸 WATERMARK TOOL</p>
                <p style={{ margin: 0, fontSize: '10px', color: '#64748b' }}>Click to select folder</p>
              </div>
            ) : (
              <div onClick={(e) => e.stopPropagation()}>
                <p style={{ margin: '0 0 5px 0', fontSize: '11px', color: '#10b981', fontWeight: 'bold' }}>✅ {stampingFiles.length} photos ready</p>
                <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', alignItems: 'center' }}>
                  <input type="date" value={dateStamp} onChange={(e) => setDateStamp(e.target.value)} style={{ fontSize: '10px', border: '1px solid #ddd', borderRadius: '4px' }} />
                  <button className="btn-platform" onClick={handleGenerateStamps} disabled={!dateStamp || loading} style={{ padding: '4px 12px', fontSize: '10px', background: '#10b981' }}>Stamp</button>
                </div>
              </div>
            )}
          </div>

          <div className="action-buttons-container" style={{ display: 'flex', gap: '10px' }}>
  
            <ReportFiller 
              results={results} 
              dateStamp={dateStamp} 
              type="Otrosí 20" 
              templatePath="/Informe_mto_otrosi_fads.docx"
              className="btn-platform"
            />

            <ReportFiller 
              results={results} 
              dateStamp={dateStamp} 
              type="Otrosí 7" 
              templatePath="/Informe_mto_otrosi_fads.docx" 
              className="btn-platform" // <-- Pasamos la clase aquí
            />

          </div>

          <button className="btn-platform" onClick={downloadExcel} disabled={loading || results.length === 0} style={{ marginLeft: 'auto', background: '#fff', color: '#1e293b', border: '1px solid #e2e8f0' }}>♻️ Excel</button>
          <button className="btn-platform" onClick={downloadZip} disabled={loading || results.length === 0}>📂 ZIP</button>
        </div>

        {loading && (
          <div className="progress-wrapper" style={{ marginBottom: '25px' }}>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${(progress.current/progress.total)*100}%` }}></div></div>
            <div className="progress-text">Procesando: {progress.current}/{progress.total}</div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
          <div className="column-section">
            <h3 style={{ fontSize: '14px', color: '#64748b', marginBottom: '15px' }}>Detected Devices ({results.length})</h3>
            <div style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '10px' }}>
              <table className="data-table">
                <thead><tr><th>Photo</th><th>Detected ID</th><th>Location</th></tr></thead>
                <tbody>
                  {results.map((res, i) => (
                    <tr key={i}>
                      <td><img src={res.thumb} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '12px' }} alt="thumb" /></td>
                      <td style={{ color: res.isFound ? '#1e293b' : '#e67e22', fontWeight: '700' }}>{res.id}</td>
                      <td>
                        <div style={{ fontSize: '11px', fontWeight: '600'}}>{res.masterInfo?.UBICACION}</div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>{res.masterInfo?.DISPOSITIVO}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="column-section">
            <h3 style={{ fontSize: '14px', color: '#ef4444', marginBottom: '15px' }}>Issues ({errors.length})</h3>
            <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>File</th><th>Reason</th></tr></thead>
                <tbody>
                  {errors.map((err, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: '10px', color: '#64748b' }}>{err.fileName}</td>
                      <td style={{ fontSize: '10px', color: '#ef4444', fontWeight: '600' }}>{err.reason}</td>
                    </tr>
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