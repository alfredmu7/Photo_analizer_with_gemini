import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import '../styles/ScannerTerminal.css';

const ScannerTerminal = () => {
  const [loading, setLoading] = useState(false);
  const [dbData, setDbData] = useState([]); 
  const [dbReady, setDbReady] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [timeLeft, setTimeLeft] = useState(0);
  const [results, setResults] = useState([]);
  const [errors, setErrors] = useState([]);

  const API_KEY = 'K84051187988957';

  const regexPatterns = [
    /P\d+L\d+[MD]\d+/i, 
    /\d{4,6}-[A-Z]\d{2,4}/i 
  ];

  const AVG_TIME_PER_IMG = 5.2;

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

  const normalizeId = (id) => {
    if (!id) return "";
    let clean = id.toString().toUpperCase().trim();
    return clean.replace(/0+(?=\d)/g, '');
  };

  const queryMaster = (detectedId) => {
    if (!dbData.length) return null;
    let searchString = detectedId.toUpperCase();
    while (searchString.length >= 5) {
      const normalizedSearch = normalizeId(searchString);
      const found = dbData.find(item => item.ID && normalizeId(item.ID) === normalizedSearch);
      if (found) {
        return {
          ID: found.ID,
          DISPOSITIVO: found.DISPOSITIVO || "N/A",
          UBICACION: found.UBICACION || "N/A",
          PANEL: found.PANEL || "N/A"
        };
      }
      searchString = searchString.slice(0, -1);
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
    const response = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: formData });
    const data = await response.json();
    if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage);
    return data.ParsedResults?.map(res => res.ParsedText).join(' ') || "";
  };

  const processImages = async (event) => {
    const files = Array.from(event.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    setLoading(true);
    setResults([]);
    setErrors([]);
    setProgress({ current: 0, total: files.length });

    const currentResults = [];
    const currentErrors = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setTimeLeft(Math.ceil((files.length - i) * AVG_TIME_PER_IMG));
      const thumbUrl = URL.createObjectURL(file);

      try {
        const compressedBlob = await compressImage(file);
        const rawText = await analyzeWithOCRSpace(compressedBlob);
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (!rawText || rawText.trim() === "") throw new Error("Imagen ilegible");

        const cleanText = rawText.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        let match = null;
        for (const pattern of regexPatterns) {
          const currentMatch = cleanText.match(pattern);
          if (currentMatch) { match = currentMatch[0]; break; }
        }

        if (match) {
          const masterInfo = queryMaster(match);
          if (masterInfo) {
            currentResults.push({
              id: masterInfo.ID,
              fileName: file.name,
              originalFile: file,
              thumb: thumbUrl,
              masterInfo: masterInfo
            });
            setResults([...currentResults]);
          } else {
            throw new Error(`ID '${match}' no está en la base de datos`);
          }
        } else {
          throw new Error("No se detectó ID válido");
        }
      } catch (err) {
        currentErrors.push({ fileName: file.name, reason: err.message, thumb: thumbUrl });
        setErrors([...currentErrors]);
      }
      setProgress(prev => ({ ...prev, current: i + 1 }));
    }
    setLoading(false);
  };

  const downloadExcel = () => {
    const uniqueMap = new Map();
    results.forEach(item => { if (!uniqueMap.has(item.id)) uniqueMap.set(item.id, item); });
    const uniqueResults = Array.from(uniqueMap.values());
    
    const dataToExport = uniqueResults.map(res => ({
      'ID Detectado': String(res.id),
      'ID en Base de datos': String(res.masterInfo.ID),
      'Dispositivo': String(res.masterInfo.DISPOSITIVO),
      'Ubicación': String(res.masterInfo.UBICACION),
      'Panel': String(res.masterInfo.PANEL),
      'Archivo': String(res.fileName),
      'Fecha': new Date().toLocaleString()
    }));

    const workbook = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(dataToExport);
    ws1['!cols'] = [{wch: 20}, {wch: 20}, {wch: 25}, {wch: 40}, {wch: 10}, {wch: 30}, {wch: 20}];
    XLSX.utils.book_append_sheet(workbook, ws1, "Resultados");
    XLSX.writeFile(workbook, "Auditoria_FADS_Completa.xlsx");
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    const idCounters = {}; 
    const globalPairIndex = {};
    let pairCount = 0;

    results.forEach((res) => {
      const id = res.id;
      
      if (!globalPairIndex[id]) {
        pairCount++;
        globalPairIndex[id] = pairCount;
        idCounters[id] = 1;
      } else {
        idCounters[id]++;
      }

      const photoNum = idCounters[id];
      const groupNum = globalPairIndex[id];
      const extension = res.fileName.split('.').pop();
      
      // Mantenemos el nombre exacto anterior: "1.1_ID.jpg"
      const newFileName = `${photoNum}.${groupNum}_${id}.${extension}`;
      
      // CAMBIO SOLICITADO: Se guarda dentro de una carpeta con el nombre del ID
      zip.folder(id).file(newFileName, res.originalFile);
    });

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "Fotos_FADS_Por_ID.zip");
  };

  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className="terminal-container">
      <div className="main-card">
        <div className="header-blue">
            Photo Analizer AI {dbReady ? ' 🟢 Database' : ' 🔘 Loading...'}
        </div>
        
        <div className="action-bar">
          <input type="file" webkitdirectory="" directory="" multiple onChange={processImages} id="file-input" hidden />
          <button className="btn-platform" onClick={() => document.getElementById('file-input').click()} disabled={loading || !dbReady}>
            Upload folder
          </button>
          <button className="btn-platform" onClick={downloadExcel} disabled={loading || results.length === 0}>
            ♻️ Download Excel
          </button>
          <button className="btn-platform" onClick={downloadZip} disabled={loading || results.length === 0}>
            📂 Download ZIP
          </button>
        </div>

        {loading && (
          <div className="progress-wrapper">
            <div className="progress-track"><div className="progress-fill" style={{ width: `${progressPercent}%` }}></div></div>
            <div className="progress-text">Analyzing: {progress.current}/{progress.total} | Time: {timeLeft}s</div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0px', borderTop: '1px solid #ccc' }}>
          <div>
            <div className="header-blue" style={{ backgroundColor: '#005a84' }}>Detected ({results.length})</div>
            <div style={{ maxHeight: '500px', overflowY: 'auto', borderRight: '1px solid #ccc' }}>
              <table className="data-table">
                <thead><tr><th>View</th><th>ID</th><th>Database Status</th></tr></thead>
                <tbody>
                  {results.map((res, i) => (
                    <tr key={i}>
                      <td><img src={res.thumb} style={{ width: '40px', height: '40px', objectFit: 'cover' }} alt="t" /></td>
                      <td><strong>{res.id}</strong></td>
                      <td style={{ fontSize: '10px' }}>{res.masterInfo?.UBICACION}</td>
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
                    <tr key={i} className="row-error">
                      <td style={{ fontSize: '11px' }}>{err.fileName}</td>
                      <td style={{ fontSize: '10px', color: '#d32f2f' }}>{err.reason}</td>
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