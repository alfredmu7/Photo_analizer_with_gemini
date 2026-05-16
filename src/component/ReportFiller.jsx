import React, { useState } from 'react';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free'; 
import { saveAs } from 'file-saver';
import logoJCI from '../assets/logoJCIcompleto.png';
import '../styles/ReportFiller.css'; 

// --- ALGORITMO MATEMÁTICO DE SIMILITUD (Distancia de Levenshtein) ---
const calcularDistanciaTexto = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // Sustitución
                    matrix[i][j - 1] + 1,     // Inserción
                    matrix[i - 1][j] + 1      // Eliminación
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

const ReportFiller = ({ results, type, templatePath, className }) => {
    const [showModal, setShowModal] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [alertasSospechosos, setAlertasSospechosos] = useState([]); // Estado para los IDs parecidos
    const [isProcessing, setIsProcessing] = useState(false);

    // --- FUNCIÓN DE SELLADO: BASE64 DIRECTO ---
    const applyWatermark = (file, dateStr) => {
        return new Promise((resolve) => {
            if (!file || !dateStr) return resolve(null);

            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1280; 
                    const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const logo = new Image();
                    logo.src = logoJCI;
                    logo.onload = () => {
                        const stampHeight = canvas.height * 0.15;
                        const [year, month, day] = dateStr.split("-");
                        const formattedDate = `${day}-${month}-${year?.slice(-2) || ""}`;
                        
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

                        const base64Result = canvas.toDataURL('image/jpeg', 0.85);
                        resolve(base64Result);
                    };
                    logo.onerror = () => resolve(canvas.toDataURL('image/jpeg', 0.85));
                };
            };
            reader.onerror = () => resolve(null);
        });
    };

    // --- PROCESAMIENTO Y DETECCIÓN AL ABRIR EL POPUP (CON FILTRO DE VECINOS) ---
    const openConfig = () => {
        if (!results || results.length === 0) return;

        const limit = type === "Otrosí 7" ? 30 : 10;
        const grouped = [];
        const seen = new Set();
        const today = new Date().toISOString().split('T')[0];

        // 1. Agrupar fotos por ID único
        for (let i = 0; i < results.length; i++) {
            const res = results[i];
            if (res && res.id && !seen.has(res.id) && grouped.length < limit) {
                const todasLasFotosDelId = results.filter(r => r.id === res.id);
                
                const fotosEstructuradas = todasLasFotosDelId.map((foto, index) => ({
                    originalFile: foto.originalFile,
                    thumb: foto.thumb,
                    rol: index === 0 ? 'antes' : index === 1 ? 'despues' : 'ninguno'
                }));

                grouped.push({
                    id: res.id,
                    ubi: res.masterInfo?.UBICACION || "No encontrado",
                    fecha: today,
                    fotos: fotosEstructuradas
                });
                seen.add(res.id);
            }
        }

        // 2. Escanear en busca de IDs Sospechosos con filtro inteligente de fotos
        const sospechososDetectados = [];
        for (let i = 0; i < grouped.length; i++) {
            for (let j = i + 1; j < grouped.length; j++) {
                const bloqueA = grouped[i];
                const bloqueB = grouped[j];
                
                const distancia = calcularDistanciaTexto(bloqueA.id, bloqueB.id);

                if (distancia > 0 && distancia <= 2) {
                    const totalFotosAmbosId = bloqueA.fotos.length + bloqueB.fotos.length;
                    if (totalFotosAmbosId < 4) {
                        sospechososDetectados.push({
                            idxA: i,
                            idxB: j,
                            idA: bloqueA.id,
                            idB: bloqueB.id
                        });
                    }
                }
            }
        }

        setAlertasSospechosos(sospechososDetectados);
        setPreviewData(grouped);
        setShowModal(true);
    };

    // --- ACCIÓN DE UNIFICAR DISPOSITIVOS ---
    const fusionarIds = (alertIdx, idCorrecto, idIncorrecto) => {
        const alerta = alertasSospechosos[alertIdx];
        let newData = [...previewData];

        const bloqueCorrecto = newData.find(item => item.id === idCorrecto);
        const bloqueIncorrecto = newData.find(item => item.id === idIncorrecto);

        if (bloqueCorrecto && bloqueIncorrecto) {
            bloqueCorrecto.fotos = [...bloqueCorrecto.fotos, ...bloqueIncorrecto.fotos];
            bloqueCorrecto.fotos.forEach((f, idx) => {
                f.rol = idx === 0 ? 'antes' : idx === 1 ? 'despues' : 'ninguno';
            });
            newData = newData.filter(item => item.id !== idIncorrecto);
        }

        const nuevasAlertas = alertasSospechosos.filter((_, idx) => idx !== alertIdx);
        
        setPreviewData(newData);
        setAlertasSospechosos(nuevasAlertas);
    };

    const handleRoleChange = (idIdx, fotoIdx, nuevoRol) => {
        const newData = [...previewData];
        const dispositivo = newData[idIdx];

        if (nuevoRol !== 'ninguno') {
            dispositivo.fotos.forEach((f, idx) => {
                if (idx !== fotoIdx && f.rol === nuevoRol) {
                    f.rol = 'ninguno';
                }
            });
        }
        dispositivo.fotos[fotoIdx].rol = nuevoRol;
        setPreviewData(newData);
    };

    const generateFinalReport = async () => {
        setIsProcessing(true);
        try {
            const response = await fetch(templatePath);
            const content = await response.arrayBuffer();
            const zip = new PizZip(content);

            const transparentPixelBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

            const imageOptions = {
                centered: true,
                getImage: function(tagValue) {
                    const base64Data = tagValue || transparentPixelBase64;
                    const stringBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, "");
                    return window.atob(stringBase64); 
                },
                getSize: function(img, tagValue) {
                    if (!tagValue || tagValue === transparentPixelBase64) {
                        return [1, 1];
                    }
                    const ALTURA_FIJA = 85; 
                    if (img && img.width && img.height) {
                        const relacionAspecto = img.width / img.height;
                        const anchoProporcional = Math.round(ALTURA_FIJA * relacionAspecto);
                        
                        const ANCHO_MAXIMO = 120;
                        if (anchoProporcional > ANCHO_MAXIMO) {
                            return [ANCHO_MAXIMO, Math.round(ANCHO_MAXIMO / relacionAspecto)];
                        }
                        return [anchoProporcional, ALTURA_FIJA];
                    }
                    return [115, 85]; 
                }
            };

            const imgModule = new ImageModule(imageOptions);
            imgModule.options.dataType = 'string'; 

            const doc = new Docxtemplater();
            doc.attachModule(imgModule); 
            doc.loadZip(zip);

            const cleanReportData = [];
            for (const item of previewData) {
                const fotoAntesObj = item.fotos.find(f => f.rol === 'antes');
                const fotoDespuesObj = item.fotos.find(f => f.rol === 'despues');

                const base64Antes = fotoAntesObj ? await applyWatermark(fotoAntesObj.originalFile, item.fecha) : null;
                const base64Despues = fotoDespuesObj ? await applyWatermark(fotoDespuesObj.originalFile, item.fecha) : null;

                // --- FORMATEO EXCLUSIVO PARA LA TABLA DEL INFORME (aaaa-mm-dd -> dd-mm-aa) ---
                // --- FORMATEO EXCLUSIVO PARA LA TABLA DEL INFORME (aaaa-mm-dd -> dd-mm-aaaa) ---
                let fechaFormateadaTabla = "";
                if (item.fecha) {
                    const [year, month, day] = item.fecha.split("-");
                    // Quitamos el .slice(-2) para que deje el año completo (2026)
                    fechaFormateadaTabla = `${day}-${month}-${year || ""}`;
                }

                cleanReportData.push({
                    item: (cleanReportData.length + 1).toString().padStart(3, '0'),
                    fecha: fechaFormateadaTabla,
                    id: item.id || "",
                    ubi: item.ubi || "",
                    foto_antes: base64Antes || transparentPixelBase64,
                    foto_despues: base64Despues || transparentPixelBase64
                });
            }

            // --- FORMATEO PARA LA FECHA GLOBAL DE GENERACIÓN (dd-mm-aaaa) ---
                const hoy = new Date();
                const diaGlobal = String(hoy.getDate()).padStart(2, '0');
                const mesGlobal = String(hoy.getMonth() + 1).padStart(2, '0');
                const anioGlobal = String(hoy.getFullYear()); // Quitamos el .slice(-2) aquí también

                const fechaGeneracionFormateada = `${diaGlobal}-${mesGlobal}-${anioGlobal}`;

            doc.setData({
                reporte: cleanReportData,
                tipo_otrosi: type,
                fecha_generacion: fechaGeneracionFormateada
            });

            doc.render();

            const out = doc.getZip().generate({
                type: 'blob',
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            });

            saveAs(out, `Informe_JCI_${type}.docx`);
            setShowModal(false);

        } catch (error) {
            console.error("Error crítico detallado en la compilación:", error);
            alert("No se pudo generar el reporte. Revisa la consola.");
        } document.body.style.cursor = 'default';
        setIsProcessing(false);
    };

    return (
        <>
            <button className={className} onClick={openConfig} disabled={results.length === 0}>
                📄 {type}
            </button>

            {showModal && (
                <div className="report-modal-overlay">
                    <div className="report-modal-content">
                        <h3>Asignación de Fotos para Informe: {type}</h3>
                        
                        {/* --- BANNER DE DETECCIÓN INTELIGENTE DE IDS SOSPECHOSOS --- */}
                        {alertasSospechosos.length > 0 && (
                            <div className="report-alert-container">
                                <span className="report-alert-title">
                                    🔍 IDs Sospechosos de Duplicidad (Revisa las fotos antes de unificar):
                                </span>
                                
                                {alertasSospechosos.map((alerta, alertIdx) => {
                                    const bloqueA = previewData[alerta.idxA];
                                    const bloqueB = previewData[alerta.idxB];

                                    if (!bloqueA || !bloqueB) return null;

                                    return (
                                        <div key={alertIdx} className="report-alert-card">
                                            <div className="report-alert-row-main">
                                                <span className="report-alert-text">
                                                    ¿Es el mismo dispositivo? El ID <strong className="report-id-highlight">{alerta.idA}</strong> se parece mucho a <strong className="report-id-highlight">{alerta.idB}</strong>.
                                                </span>
                                                <div className="report-alert-actions">
                                                    <button 
                                                        onClick={() => fusionarIds(alertIdx, alerta.idA, alerta.idB)}
                                                        className="report-btn-action-absorb"
                                                    >
                                                        Mantener {alerta.idA} y absorber {alerta.idB}
                                                    </button>
                                                    <button 
                                                        onClick={() => fusionarIds(alertIdx, alerta.idB, alerta.idA)}
                                                        className="report-btn-action-absorb"
                                                    >
                                                        Mantener {alerta.idB} y absorber {alerta.idA}
                                                    </button>
                                                    <button 
                                                        onClick={() => setAlertasSospechosos(alertasSospechosos.filter((_, idx) => idx !== alertIdx))}
                                                        className="report-btn-action-ignore"
                                                    >
                                                        Ignorar
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="report-alert-row-photos">
                                                <div className="report-alert-photo-group">
                                                    <span className="report-alert-group-label">Fotos de {alerta.idA}:</span>
                                                    {bloqueA.fotos.map((f, fIdx) => (
                                                        <img key={fIdx} src={f.thumb} alt="Preview A" className="report-alert-thumb" />
                                                    ))}
                                                </div>

                                                <div className="report-alert-divider"></div>

                                                <div className="report-alert-photo-group">
                                                    <span className="report-alert-group-label">Fotos de {alerta.idB}:</span>
                                                    {bloqueB.fotos.map((f, fIdx) => (
                                                        <img key={fIdx} src={f.thumb} alt="Preview B" className="report-alert-thumb" />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Contenedor de la lista principal */}
                        <div className="report-modal-table-container">
                            {previewData.map((row, idIdx) => (
                                <div key={idIdx} className="report-dispositivo-block">
                                    <div className="report-dispositivo-info">
                                        <span><strong>ID:</strong> {row.id}</span>
                                        <span><strong>Ubi:</strong> {row.ubi}</span>
                                        <div className="report-dispositivo-header">
                                            <input 
                                                type="date" 
                                                value={row.fecha} 
                                                onChange={(e) => {
                                                    const newData = [...previewData];
                                                    newData[idIdx].fecha = e.target.value;
                                                    setPreviewData(newData);
                                                }}
                                            />
                                        </div>
                                    </div>
                                    
                                    <div className="report-grid-fotos">
                                        {row.fotos.map((foto, fotoIdx) => (
                                            <div key={fotoIdx} className="report-foto-card">
                                                <img 
                                                    src={foto.thumb} 
                                                    alt="Escaner" 
                                                    className="report-thumbnail" 
                                                    title="Pasa el mouse para ampliar"
                                                />
                                                <select 
                                                    className="report-select-rol"
                                                    value={foto.rol}
                                                    onChange={(e) => handleRoleChange(idIdx, fotoIdx, e.target.value)}
                                                >
                                                    <option value="antes">Antes</option>
                                                    <option value="despues">Después</option>
                                                    <option value="ninguno">Omitir</option>
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="report-modal-actions">
                            <button onClick={() => setShowModal(false)} className="report-btn-cancel">
                                Cancelar
                            </button>
                            <button onClick={generateFinalReport} className="report-btn-confirm" disabled={isProcessing}>
                                {isProcessing ? "Procesando informe..." : "Generar informe"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default ReportFiller;