import React, { useState, useEffect } from 'react';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free'; 
import { saveAs } from 'file-saver';
import logoJCI from '../assets/logoJCIcompleto.png';
import '../styles/ReportFiller.css'; 

import wordIcon from '../assets/word.png';
import undo from '../assets/undo.png';

const ReportFiller = ({ results, type, templatePath, className, system = 'GENERAL' }) => {
    const [showModal, setShowModal] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // ESTADOS: FILTRADO E HISTORIAL PARA UNDO
    const [searchTerm, setSearchTerm] = useState("");
    const [history, setHistory] = useState([]); 

    // --- EFECTO: ESCUCHAR INCORPORACIÓN DE NUEVAS FOTOS POR LOTE (EN MEMORIA PURA) ---
    useEffect(() => {
        if (results && results.length > 0) {
            const sincronizarFotosEntrantes = () => {
                const today = new Date().toISOString().split('T')[0];
                let currentItems = [...previewData];
                let huboCambios = false;

                for (const res of results) {
                    if (!res || !res.id) continue;
                    const currentNormalized = normalizeIdForMatching(res.id);

                    const archivoAGuardar = res.originalFile || res.thumb;
                    const blobUrlGenerado = fileToBlobUrl(archivoAGuardar);

                    const filaExistenteIdx = currentItems.findIndex(item => normalizeIdForMatching(item.idOriginal) === currentNormalized);

                    if (filaExistenteIdx !== -1) {
                        const yaTieneLaFoto = currentItems[filaExistenteIdx].fotos.some(f => f.blobData === blobUrlGenerado);
                        
                        if (!yaTieneLaFoto) {
                            const cantidadFotos = currentItems[filaExistenteIdx].fotos.length;
                            currentItems[filaExistenteIdx].fotos.push({
                                blobData: blobUrlGenerado,
                                rol: cantidadFotos === 1 ? 'despues' : 'ninguno',
                                idDetectadoOCR: res.id
                            });
                            huboCambios = true;
                        }
                    } else {
                        currentItems.push({
                            idOriginal: res.id,
                            idSeleccionado: res.id,
                            idAntes: res.id,
                            idDespues: res.id,
                            ubi: res.masterInfo?.UBICACION || "No encontrado",
                            fecha: today,
                            fotos: [{
                                blobData: blobUrlGenerado,
                                rol: 'antes',
                                idDetectadoOCR: res.id
                            }]
                        });
                        huboCambios = true;
                    }
                }

                if (huboCambios) {
                    setPreviewData(currentItems);
                }
            };

            sincronizarFotosEntrantes();
        }
    }, [results]);

    const saveToHistory = (currentState) => {
        setHistory(prev => [...prev, JSON.parse(JSON.stringify(currentState))]);
    };

    const handleUndo = () => {
        if (history.length === 0) return;
        const previousState = history[history.length - 1];
        setHistory(prev => prev.slice(0, -1));
        setPreviewData(previousState);
    };

    const fileToBlobUrl = (fileOrBlobUrl) => {
        if (!fileOrBlobUrl) return null;
        if (fileOrBlobUrl instanceof File || fileOrBlobUrl instanceof Blob) {
            return URL.createObjectURL(fileOrBlobUrl);
        }
        return fileOrBlobUrl;
    };

    const convertBlobUrlToBase64 = (blobUrl) => {
        return new Promise((resolve) => {
            if (!blobUrl) return resolve(null);
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 900; // Reducido para evitar picos de memoria RAM con lotes masivos
                const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.65)); // Compresión eficiente
            };
            img.onerror = () => resolve(null);
            img.src = blobUrl;
        });
    };

    const applyWatermark = (base64Src, dateStr) => {
        return new Promise((resolve) => {
            if (!base64Src || !dateStr) return resolve(null);

            const img = new Image();
            img.src = base64Src;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 900;
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

                    resolve(canvas.toDataURL('image/jpeg', 0.70));
                };
                logo.onerror = () => resolve(canvas.toDataURL('image/jpeg', 0.70));
            };
            img.onerror = () => resolve(null);
        });
    };

    const normalizeIdForMatching = (id) => {
        if (!id) return "";
        return id.toUpperCase().replace(/([A-Z])0+/g, '$1').replace(/[^A-Z0-9]/g, '');
    };

    const handleRemoveItem = (idOriginal) => {
        saveToHistory(previewData); 
        const updated = previewData.filter(item => item.idOriginal !== idOriginal);
        setPreviewData(updated);
    };

    const openConfig = () => {
        setSearchTerm(""); 
        setHistory([]); 
        setShowModal(true);
    };

    const handleRoleChange = (idOriginal, fotoIdx, nuevoRol) => {
        saveToHistory(previewData); 
        setPreviewData(prev => prev.map((item) => {
            if (item.idOriginal !== idOriginal) return item;
            const updatedFotos = item.fotos.map((f, fIdx) => {
                if (fIdx === fotoIdx) return { ...f, rol: nuevoRol };
                if (nuevoRol !== 'ninguno' && f.rol === nuevoRol) return { ...f, rol: 'ninguno' };
                return f;
            });
            return { ...item, fotos: updatedFotos };
        }));
    };

    const handleIdSelection = (idOriginal, valorNuevo) => {
        saveToHistory(previewData);
        const targetValue = valorNuevo.toUpperCase();

        setPreviewData(prev => {
            return prev.map(row => row.idOriginal === idOriginal ? { ...row, idSeleccionado: targetValue, idAntes: targetValue, idDespues: targetValue } : row);
        });
    };

    const handleDateChange = (idOriginal, nuevaFecha) => {
        setPreviewData(prev => prev.map((row) => 
            row.idOriginal === idOriginal ? { ...row, fecha: nuevaFecha } : row
        ));
    };

    const clearProgress = () => {
        if (window.confirm("¿Seguro que deseas limpiar los elementos actuales?")) {
            setPreviewData([]);
            setHistory([]);
        }
    };

    // --- GENERACIÓN OPTIMIZADA POR BLOQUES (PROTEGE CONTRA CONGELAMIENTO EN LOTES MASIVOS) ---
    const generateFinalReport = async () => {
        if (previewData.length === 0) {
            alert("No hay datos para generar el informe.");
            return;
        }

        setIsProcessing(true);
        try {
            const response = await fetch(templatePath);
            const content = await response.arrayBuffer();
            const zip = new PizZip(content);
            const transparentPixelBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

            const imageOptions = {
                centered: true,
                getImage: (tagValue) => window.atob((tagValue || transparentPixelBase64).replace(/^data:image\/[a-z]+;base64,/, "")),
                getSize: (img, tagValue) => {
                    if (!tagValue || tagValue === transparentPixelBase64) return [1, 1];
                    const ALTURA_FIJA = 85; 
                    if (img?.width && img?.height) {
                        const aspect = img.width / img.height;
                        const wProp = Math.round(ALTURA_FIJA * aspect);
                        return wProp > 120 ? [120, Math.round(120 / aspect)] : [wProp, ALTURA_FIJA];
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
            
            // Procesamiento seguro en lotes de 20 en 20 para liberar el hilo principal del navegador
            const BATCH_SIZE = 20;
            for (let i = 0; i < previewData.length; i += BATCH_SIZE) {
                const batch = previewData.slice(i, i + BATCH_SIZE);
                
                for (const item of batch) {
                    const fotoAntesObj = item.fotos.find(f => f.rol === 'antes');
                    const fotoDespuesObj = item.fotos.find(f => f.rol === 'despues');

                    const base64AntesCrudo = fotoAntesObj?.blobData ? await convertBlobUrlToBase64(fotoAntesObj.blobData) : null;
                    const base64DespuesCrudo = fotoDespuesObj?.blobData ? await convertBlobUrlToBase64(fotoDespuesObj.blobData) : null;

                    const base64Antes = base64AntesCrudo ? await applyWatermark(base64AntesCrudo, item.fecha) : null;
                    const base64Despues = base64DespuesCrudo ? await applyWatermark(base64DespuesCrudo, item.fecha) : null;

                    let fechaFormateadaTabla = "";
                    if (item.fecha) {
                        const [year, month, day] = item.fecha.split("-");
                        fechaFormateadaTabla = `${day}-${month}-${year}`;
                    }

                    cleanReportData.push({
                        item: (cleanReportData.length + 1).toString().padStart(3, '0'),
                        fecha: fechaFormateadaTabla,
                        id: item.idSeleccionado || "", 
                        ubi: item.ubi || "",
                        foto_antes: base64Antes || transparentPixelBase64,
                        foto_despues: base64Despues || transparentPixelBase64
                    });
                }
                // Breve respiro al motor de Javascript entre lote y lote
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            doc.setData({
                reporte: cleanReportData,
                tipo_otrosi: type,
                fecha_generacion: new Date().toLocaleDateString('es-CO')
            });

            doc.render();
            const out = doc.getZip().generate({ 
                type: 'blob', 
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                compression: 'DEFLATE' // Optimiza el peso final del archivo Word
            });
            saveAs(out, `Informe_${system}_${type}.docx`);
            setShowModal(false);
        } catch (error) {
            console.error(error);
            alert("Error al generar el documento.");
        }
        setIsProcessing(false);
    };

    const queryClean = searchTerm.trim().toUpperCase();
    const filteredData = previewData.filter(row => {
        if (queryClean.length < 2) return true;
        return (
            row.idOriginal?.toUpperCase().includes(queryClean) ||
            row.idSeleccionado?.toUpperCase().includes(queryClean)
        );
    });


    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <button className={className} onClick={openConfig} disabled={isProcessing}>
                <img src={wordIcon} alt="W" style={{ width: '20px', marginRight: '8px' }} />
                {isProcessing ? "Cargando..." : `${type} ${previewData.length > 0 ? `(${previewData.length})` : ''}`}
            </button>

            {showModal && (
                <div className="report-modal-overlay">
                    <div className="report-modal-content">
                        
                        <div className="report-modal-header" style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <h3 style={{ margin: 0 }}>Asignación: {type}</h3>
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {/* BOTÓN DE DESHACER (UNDO) CON ICONO */}
                                    <button
                                        onClick={handleUndo}
                                        disabled={history.length === 0}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            padding: '4px 1px',
                                            cursor: history.length > 0 ? 'pointer' : 'not-allowed',
                                            display: 'flex',
                                            alignItems: 'center',
                                            opacity: history.length > 0 ? 1 : 0.35,
                                            transition: 'opacity 0.2s ease, transform 0.1s ease',
                                        }}
                                        title={history.length > 0 ? `Deshacer último cambio` : "No hay cambio para deshacer"}
                                        onMouseDown={(e) => history.length > 0 && (e.currentTarget.style.transform = 'scale(0.95)')}
                                        onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        <img 
                                            src={undo} 
                                            alt="Deshacer" 
                                            style={{ 
                                                width: '22px', 
                                                height: '22px', 
                                                objectFit: 'contain',
                                            }} 
                                        />
                                        {history.length > 0 && (
                                            <span style={{ fontSize: '10px', color: '#b1b1b1', fontWeight: '400' }}>
                                                {history.length}
                                            </span>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* BARRA DE FILTRADO CON EL BOTÓN INTEGRADO ABAJO A LA DERECHA */}
                            <div style={{ width: '100%', position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ width: '100%', position: 'relative' }}>
                                    <input 
                                        type="text"
                                        placeholder="¿Que ID necesitas encontrar?"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '12px 12px',
                                            fontSize: '12px',
                                            borderRadius: '25px',
                                            border: '1px solid #cbd5e1',
                                            outline: 'none',
                                            boxSizing: 'border-box',
                                            backgroundColor: '#f0f0f0',
                                        }}
                                    />
                                    {searchTerm && (
                                        <button 
                                            onClick={() => setSearchTerm("")}
                                            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0 4px' }}>
                                    <span style={{ fontSize: '10px', color: '#9da2a8', fontWeight: '500' }}>
                                        Mostrando {filteredData.length} de {previewData.length} ítems
                                    </span>

                                    {/* BOTÓN MINIMALISTA UBICADO EN LA LÍNEA SOLICITADA */}
                                    {previewData.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={clearProgress}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#f43f5e',
                                                fontSize: '11px',
                                                fontWeight: '600',
                                                cursor: 'pointer',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                transition: 'all 0.2s ease',
                                                opacity: 0.75
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.opacity = '1';
                                                e.currentTarget.style.background = '#ffe4e6';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.opacity = '0.75';
                                                e.currentTarget.style.background = 'transparent';
                                            }}
                                            title="Vaciar listado completo para un mes nuevo"
                                        >
                                            🗑️ Limpiar listado
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="report-modal-table-container">
                            {filteredData.length > 0 ? (
                                filteredData.map((row) => {
                                    const radioGroupKey = `ids-${row.idOriginal}`;
                                    
                                    return (
                                        <div key={row.idOriginal} className="report-dispositivo-block" style={{ position: 'relative' }}>
                                            
                                            <button 
                                                type="button"
                                                onClick={() => handleRemoveItem(row.idOriginal)}
                                                style={{
                                                    position: 'absolute', top: '8px', right: '8px', background: 'transparent', color: '#94a3b8', border: 'none', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold'
                                                }}
                                                title="Eliminar este ID"
                                            >
                                                ×
                                            </button>

                                            <div className="report-info-col">
                                                <div className="report-id-selector-container">
                                                    <div className="report-pill-wrapper">
                                                        <label className={`report-pill-label ${row.idSeleccionado === row.idAntes ? 'active-antes' : ''}`}>
                                                            <input 
                                                                type="radio" 
                                                                name={radioGroupKey} 
                                                                checked={row.idSeleccionado === row.idAntes} 
                                                                onChange={() => handleIdSelection(row.idOriginal, row.idAntes)} 
                                                            />
                                                            A: {row.idAntes}
                                                        </label>
                                                        <label className={`report-pill-label ${row.idSeleccionado === row.idDespues ? 'active-despues' : ''}`}>
                                                            <input 
                                                                type="radio" 
                                                                name={radioGroupKey} 
                                                                checked={row.idSeleccionado === row.idDespues} 
                                                                onChange={() => handleIdSelection(row.idOriginal, row.idDespues)} 
                                                            />
                                                            D: {row.idDespues}
                                                        </label>
                                                        <input 
                                                            type="text" 
                                                            value={row.idSeleccionado} 
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setPreviewData(prev => prev.map(r => r.idOriginal === row.idOriginal ? { ...r, idSeleccionado: val } : r));
                                                            }} 
                                                            onBlur={(e) => handleIdSelection(row.idOriginal, e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleIdSelection(row.idOriginal, e.target.value);
                                                            }}
                                                            className="report-manual-input" 
                                                        />
                                                    </div>
                                                </div>
                                                <div style={{ paddingRight: '25px' }}><b>Ubicación:</b> {row.ubi}</div>
                                                <input 
                                                    type="date" 
                                                    value={row.fecha} 
                                                    className="report-date-input" 
                                                    onChange={(e) => handleDateChange(row.idOriginal, e.target.value)} 
                                                />
                                            </div>
                                            
                                            {/* MINIATURAS DEL TAMAÑO EXACTO DEL CUADRO */}
                                            <div className="report-grid-fotos">
                                                {row.fotos.map((foto, fotoIdx) => (
                                                    <div key={fotoIdx} className="report-foto-item">
                                                        {foto.blobData ? (
                                                            <img 
                                                                src={foto.blobData} 
                                                                alt="Preview" 
                                                                className="report-img-thumbnail" 
                                                                style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '4px', display: 'block', border: '1px solid #ccc' }}
                                                            />
                                                        ) : (
                                                            <div className="report-img-thumbnail" style={{ width: '55px', height: '55px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#64748b', borderRadius: '4px' }}>
                                                                Sin imagen
                                                            </div>
                                                        )}
                                                        <select 
                                                            className="report-select-rol" 
                                                            value={foto.rol} 
                                                            onChange={(e) => handleRoleChange(row.idOriginal, fotoIdx, e.target.value)}
                                                            style={{ fontSize: '11px', marginTop: '2px', width: '65px' }}
                                                        >
                                                            <option value="antes">Antes</option>
                                                            <option value="despues">Después</option>
                                                            <option value="ninguno">Omitir</option>
                                                        </select>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '14px' }}>
                                    Oops! No veo un ID {searchTerm}
                                </div>
                            )}
                        </div>
                        <div className="report-modal-actions">
                            <button onClick={() => setShowModal(false)} className="report-btn-cancel">Cerrar</button>
                            <button onClick={generateFinalReport} className="report-btn-confirm" disabled={isProcessing || previewData.length === 0}>
                                {isProcessing ? "Procesando..." : "Generar informe"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportFiller;