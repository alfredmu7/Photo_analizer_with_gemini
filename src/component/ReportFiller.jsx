import React, { useState, useEffect } from 'react';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free'; 
import { saveAs } from 'file-saver';
import logoJCI from '../assets/logoJCIcompleto.png';
import '../styles/ReportFiller.css'; 

import wordIcon from '../assets/word.png';
import restartIcon from '../assets/restart.png';

const ReportFiller = ({ results, type, templatePath, className, system = 'GENERAL' }) => {
    const [showModal, setShowModal] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // ESTADO PARA LA BARRA DE FILTRADO
    const [searchTerm, setSearchTerm] = useState("");

    // LLAVES ÚNICAS DE MEMORIA LOCAL
    const LOCAL_STORAGE_KEY = `report_base64_prog_${system}_${type}`;
    const DELETED_ITEMS_KEY = `report_deleted_${system}_${type}`;

    // --- EFECTO 1: CARGA INICIAL DESDE LOCALSTORAGE AL MONTAR ---
    useEffect(() => {
        const savedDataStr = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedDataStr) {
            try {
                const parsed = JSON.parse(savedDataStr);
                if (parsed && parsed.length > 0) {
                    setPreviewData(parsed);
                }
            } catch (e) {
                console.error("Error al parsear el progreso guardado:", e);
            }
        }
    }, [LOCAL_STORAGE_KEY]);

    // --- EFECTO 2: GUARDAR TODO AUTOMÁTICAMENTE CUANDO CAMBIE EL ESTADO ---
    useEffect(() => {
        if (previewData && previewData.length > 0) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(previewData));
        }
    }, [previewData, LOCAL_STORAGE_KEY]);

    // --- HELPER: CONVERTIR FILE BINARIO O URL BLOB A BASE64 OPTIMIZADO ---
    const fileToBase64 = (fileOrBlobUrl) => {
        return new Promise((resolve) => {
            if (!fileOrBlobUrl) return resolve(null);

            const procesarImagen = (srcData) => {
                const img = new Image();
                img.src = srcData;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 500; 
                    const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.70)); 
                };
                img.onerror = () => resolve(null);
            };

            if (fileOrBlobUrl instanceof File) {
                const reader = new FileReader();
                reader.readAsDataURL(fileOrBlobUrl);
                reader.onload = (e) => procesarImagen(e.target.result);
                reader.onerror = () => resolve(null);
            } else if (typeof fileOrBlobUrl === 'string') {
                procesarImagen(fileOrBlobUrl);
            } else {
                resolve(null);
            }
        });
    };

    // --- FUNCIÓN DE ESTAMPADO FINAL (MARCA DE AGUA PARA EL INFORME) ---
    const applyWatermark = (base64Src, dateStr) => {
        return new Promise((resolve) => {
            if (!base64Src || !dateStr) return resolve(null);

            const img = new Image();
            img.src = base64Src;
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

                    resolve(canvas.toDataURL('image/jpeg', 0.85));
                };
                logo.onerror = () => resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => resolve(null);
        });
    };

    const normalizeIdForMatching = (id) => {
        if (!id) return "";
        return id.toUpperCase().replace(/([A-Z])0+/g, '$1').replace(/[^A-Z0-9]/g, '');
    };

    // --- ELIMINAR ELEMENTO USANDO SU ID ORIGINAL PARA EVITAR ERRORES EN FILTRADO ---
    const handleRemoveItem = (idOriginal) => {
        const deletedStr = localStorage.getItem(DELETED_ITEMS_KEY);
        const deletedIds = deletedStr ? JSON.parse(deletedStr) : [];
        
        if (!deletedIds.includes(idOriginal)) {
            deletedIds.push(idOriginal);
            localStorage.setItem(DELETED_ITEMS_KEY, JSON.stringify(deletedIds));
        }

        const updated = previewData.filter(item => item.idOriginal !== idOriginal);
        setPreviewData(updated);
        
        if (updated.length === 0) {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
        } else {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        }
    };

    // --- ENTRADA AL CONFIGURADOR ASÍNCRONO ---
    const openConfig = async () => {
        setSearchTerm(""); // Resetear filtro al abrir
        const savedDataStr = localStorage.getItem(LOCAL_STORAGE_KEY);
        let currentModalState = [];
        
        if (savedDataStr) {
            try {
                const parsed = JSON.parse(savedDataStr);
                if (parsed && parsed.length > 0) currentModalState = parsed;
            } catch (e) {}
        }

        if (!results || results.length === 0) {
            setPreviewData(currentModalState);
            setShowModal(true);
            return;
        }

        setIsProcessing(true);
        const today = new Date().toISOString().split('T')[0];
        
        const deletedStr = localStorage.getItem(DELETED_ITEMS_KEY);
        const deletedIds = deletedStr ? JSON.parse(deletedStr) : [];
        const setDeletedIds = new Set(deletedIds.map(id => normalizeIdForMatching(id)));

        const seenNormalizedIdsInModal = new Set(currentModalState.map(item => normalizeIdForMatching(item.idOriginal)));
        const seenNormalizedIdsInResults = new Set();

        const updatedState = [...currentModalState];

        for (let i = 0; i < results.length; i++) {
            const res = results[i];
            if (!res || !res.id) continue;

            const currentNormalized = normalizeIdForMatching(res.id);
            if (seenNormalizedIdsInResults.has(currentNormalized)) continue;
            seenNormalizedIdsInResults.add(currentNormalized);

            if (seenNormalizedIdsInModal.has(currentNormalized)) continue; 
            if (setDeletedIds.has(currentNormalized)) continue; 

            const todasLasFotosDelId = results.filter(r => normalizeIdForMatching(r.id) === currentNormalized);
            
            const fotosEstructuradas = [];
            for (let index = 0; index < todasLasFotosDelId.length; index++) {
                const foto = todasLasFotosDelId[index];
                const archivoAGuardar = foto.originalFile || foto.thumb;
                const base64Generado = await fileToBase64(archivoAGuardar);

                fotosEstructuradas.push({
                    b64Data: base64Generado,
                    rol: index === 0 ? 'antes' : index === 1 ? 'despues' : 'ninguno',
                    idDetectadoOCR: foto.id 
                });
            }

            const idAntesPropuesto = fotosEstructuradas[0]?.idDetectadoOCR || res.id;
            const idDespuesPropuesto = fotosEstructuradas[1]?.idDetectadoOCR || idAntesPropuesto;

            updatedState.push({
                idOriginal: res.id,
                idSeleccionado: idDespuesPropuesto, 
                idAntes: idAntesPropuesto,
                idDespues: idDespuesPropuesto,
                ubi: res.masterInfo?.UBICACION || "No encontrado",
                fecha: today,
                fotos: fotosEstructuradas
            });
        }

        setPreviewData(updatedState);
        setIsProcessing(false);
        setShowModal(true);
    };

    // --- MANEJADORES MODIFICADOS PARA BUSCAR POR idOriginal ---
    const handleRoleChange = (idOriginal, fotoIdx, nuevoRol) => {
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
        setPreviewData(prev => prev.map((row) => 
            row.idOriginal === idOriginal ? { ...row, idSeleccionado: valorNuevo } : row
        ));
    };

    const handleDateChange = (idOriginal, nuevaFecha) => {
        setPreviewData(prev => prev.map((row) => 
            row.idOriginal === idOriginal ? { ...row, fecha: nuevaFecha } : row
        ));
    };

    // --- LIMPIEZA COMPLETA ---
    const clearProgress = () => {
        if (window.confirm("¿Seguro que deseas reiniciar este informe? (Esto también restaurará los elementos que habías borrado con la X)")) {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            localStorage.removeItem(DELETED_ITEMS_KEY);
            setPreviewData([]);
        }
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
            for (const item of previewData) {
                const fotoAntesObj = item.fotos.find(f => f.rol === 'antes');
                const fotoDespuesObj = item.fotos.find(f => f.rol === 'despues');

                const base64Antes = fotoAntesObj?.b64Data ? await applyWatermark(fotoAntesObj.b64Data, item.fecha) : null;
                const base64Despues = fotoDespuesObj?.b64Data ? await applyWatermark(fotoDespuesObj.b64Data, item.fecha) : null;

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

            doc.setData({
                reporte: cleanReportData,
                tipo_otrosi: type,
                fecha_generacion: new Date().toLocaleDateString('es-CO')
            });

            doc.render();
            const out = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            saveAs(out, `Informe_${system}_${type}.docx`);
            setShowModal(false);
        } catch (error) {
            console.error(error);
            alert("Error al generar el documento.");
        }
        setIsProcessing(false);
    };

    // --- LÓGICA DE FILTRADO INTELIGENTE ---
    const queryClean = searchTerm.trim().toUpperCase();
    const filteredData = previewData.filter(row => {
        // Si hay menos de 2 caracteres, no se aplica el filtro dinámico
        if (queryClean.length < 2) return true;

        const matchOriginal = row.idOriginal?.toUpperCase().includes(queryClean);
        const matchSeleccionado = row.idSeleccionado?.toUpperCase().includes(queryClean);
        const matchAntes = row.idAntes?.toUpperCase().includes(queryClean);
        const matchDespues = row.idDespues?.toUpperCase().includes(queryClean);

        return matchOriginal || matchSeleccionado || matchAntes || matchDespues;
    });

    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <button className={className} onClick={openConfig} disabled={isProcessing}>
                <img src={wordIcon} alt="W" style={{ width: '20px', marginRight: '8px' }} />
                {isProcessing ? "Cargando..." : `${type} ${previewData.length > 0 ? `(${previewData.length})` : ''}`}
            </button>

            {previewData.length > 0 && (
                <button
                    onClick={clearProgress} 
                    style={{ background: 'transparent', border: 'none', padding: '6px 5px', cursor: 'pointer', fontSize: '18px' }}
                    title="Restablecer reporte para iniciar mes nuevo"
                >
                    <img src={restartIcon} alt="restart" style={{ width: '25px', marginRight: '8px' }} />
                </button>
            )}

            {showModal && (
                <div className="report-modal-overlay">
                    <div className="report-modal-content">
                        
                        <div className="report-modal-header" style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', width: '100%' }}>
                                <h3 style={{ margin: 6 }}>Asignación: {type}</h3>
                                
                            </div>

                            {/* BARRA DE FILTRADO MINIMALISTA */}
                            <div style={{ width: '100%', position: 'relative' }}>
                                <input 
                                    type="text"
                                    placeholder="🔍 ¿ Que ID buscas?"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        fontSize: '13px',
                                        borderRadius: '25px',
                                        border: '1px solid #cbd5e1',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                        backgroundColor: '#f8fafc',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#0284c7'}
                                    onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                                />
                                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '500'}}>
                                    Mostrando {filteredData.length} de {previewData.length} ítems
                                </span>
                                {searchTerm && (
                                    <button 
                                        onClick={() => setSearchTerm("")}
                                        style={{
                                            position: 'absolute',
                                            right: '10px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#94a3b8',
                                            cursor: 'pointer',
                                            fontSize: '14px'
                                        }}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="report-modal-table-container">
                            {filteredData.length > 0 ? (
                                filteredData.map((row, index) => {
                                    // Mantenemos un identificador único real para los name de los radios
                                    const radioGroupKey = `ids-${row.idOriginal}`;
                                    
                                    return (
                                        <div key={row.idOriginal} className="report-dispositivo-block" style={{ position: 'relative' }}>
                                            
                                            {/* BOTÓN X MINIMALISTA */}
                                            <button 
                                                type="button"
                                                onClick={() => handleRemoveItem(row.idOriginal)}
                                                style={{
                                                    position: 'absolute',
                                                    top: '8px',
                                                    right: '8px',
                                                    background: 'transparent',
                                                    color: '#94a3b8',
                                                    border: 'none',
                                                    fontSize: '16px',
                                                    cursor: 'pointer',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    lineHeight: '1',
                                                    transition: 'all 0.2s ease',
                                                    fontWeight: 'bold'
                                                }}
                                                onMouseEnter={(e) => { e.target.style.color = '#ef4444'; e.target.style.background = '#fef2f2'; }}
                                                onMouseLeave={(e) => { e.target.style.color = '#94a3b8'; e.target.style.background = 'transparent'; }}
                                                title="Eliminar este ID de este informe"
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
                                                            onChange={(e) => handleIdSelection(row.idOriginal, e.target.value.toUpperCase())} 
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
                                            
                                            <div className="report-grid-fotos">
                                                {row.fotos.map((foto, fotoIdx) => (
                                                    <div key={fotoIdx} className="report-foto-item">
                                                        {foto.b64Data ? (
                                                            <img src={foto.b64Data} alt="Preview" className="report-img-thumbnail" />
                                                        ) : (
                                                            <div className="report-img-thumbnail" style={{ background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#64748b' }}>Sin imagen</div>
                                                        )}
                                                        <select 
                                                            className="report-select-rol" 
                                                            value={foto.rol} 
                                                            onChange={(e) => handleRoleChange(row.idOriginal, fotoIdx, e.target.value)}
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
                                    ⚠️ No se encontraron IDs que coincidan con "{searchTerm}"
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