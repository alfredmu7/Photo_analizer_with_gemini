import React, { useState, useEffect } from 'react';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free'; 
import { saveAs } from 'file-saver';
import logoJCI from '../assets/logoJCIcompleto.png';
import '../styles/ReportFiller.css'; 

import wordIcon from '../assets/word.png';
import restartIcon from '../assets/restart.png';
import undo from '../assets/undo.png';

const ReportFiller = ({ results, type, templatePath, className, system = 'GENERAL' }) => {
    const [showModal, setShowModal] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // ESTADOS NUEVOS: FILTRADO E HISTORIAL PARA UNDO
    const [searchTerm, setSearchTerm] = useState("");
    const [history, setHistory] = useState([]); 

    // LLAVES ÚNICAS DE MEMORIA LOCAL
    const LOCAL_STORAGE_KEY = `report_base64_prog_${system}_${type}`;
    const DELETED_ITEMS_KEY = `report_deleted_${system}_${type}`;

    // ==========================================
// 🔄 CICLOS DE VIDA CORREGIDOS PARA REACCIONAR A LOS LOTES
// ==========================================

// --- EFECTO 1: CARGA INICIAL DESDE LOCALSTORAGE AL MONTAR ---
useEffect(() => {
    const savedDataStr = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedDataStr) {
        try {
            const parsed = JSON.parse(savedDataStr);
            if (parsed && parsed.length > 0) {
                setPreviewData(parsed);
                return; // Si ya hay datos locales guardados, respetamos el caché
            }
        } catch (e) {
            console.error("Error al parsear el progreso guardado:", e);
        }
    }
}, [LOCAL_STORAGE_KEY]);

// --- EFECTO 2: GUARDAR AUTOMÁTICAMENTE CUANDO HAYA CAMBIOS REALES ---
useEffect(() => {
    // Guardamos en el localStorage solo si realmente hay ítems en la previsualización
    if (previewData && previewData.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(previewData));
    }
}, [previewData, LOCAL_STORAGE_KEY]);

// --- EFECTO NUEVO: ESCUCHAR INCORPORACIÓN DE NUEVAS FOTOS POR LOTE/RESULTADOS ---
useEffect(() => {
    if (results && results.length > 0) {
        // Ejecutamos la lógica de mapeo silenciosamente para poblar el previewData en segundo plano
        const sincronizarFotosEntrantes = async () => {
            const today = new Date().toISOString().split('T')[0];
            const savedDataStr = localStorage.getItem(LOCAL_STORAGE_KEY);
            let currentItems = savedDataStr ? JSON.parse(savedDataStr) : [...previewData];

            const seenNormalizedIdsInModal = new Set(currentItems.map(item => normalizeIdForMatching(item.idOriginal)));
            let huboCambios = false;

            for (const res of results) {
                if (!res || !res.id) continue;
                const currentNormalized = normalizeIdForMatching(res.id);

                // Si esta foto ya está procesada en este informe, la ignoramos para evitar bucles
                if (seenNormalizedIdsInModal.has(currentNormalized)) continue;

                // Estructuramos la foto entrante
                const archivoAGuardar = res.originalFile || res.thumb;
                const base64Generado = await fileToBase64(archivoAGuardar);

                currentItems.push({
                    idOriginal: res.id,
                    idSeleccionado: res.id,
                    idAntes: res.id,
                    idDespues: res.id,
                    ubi: res.masterInfo?.UBICACION || "No encontrado",
                    fecha: today,
                    fotos: [{
                        b64Data: base64Generado,
                        rol: 'antes',
                        idDetectadoOCR: res.id
                    }]
                });
                seenNormalizedIdsInModal.add(currentNormalized);
                huboCambios = true;
            }

            if (huboCambios) {
                setPreviewData(currentItems);
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentItems));
            }
        };

        sincronizarFotosEntrantes();
    }
}, [results]);
    // --- HELPER: GUARDAR ESTADO EN EL HISTORIAL ANTES DE CAMBIOS ---
    const saveToHistory = (currentState) => {
        // Guardamos una copia profunda del estado actual antes de modificarlo
        setHistory(prev => [...prev, JSON.parse(JSON.stringify(currentState))]);
    };

    // --- FUNCIÓN DE DESHACER (UNDO) ---
    const handleUndo = () => {
        if (history.length === 0) return;
        
        // Recuperar el último estado guardado
        const previousState = history[history.length - 1];
        
        // Remover el último elemento del historial
        setHistory(prev => prev.slice(0, -1));
        
        // Restaurar los datos de previsualización
        setPreviewData(previousState);
    };

    // --- HELPER: CONVERTIR FILE BINARIO O URL BLOB A BASE64 ---
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

    // --- FUNCIÓN DE ESTAMPADO FINAL (MARCA DE AGUA) ---
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

    // --- ELIMINAR ELEMENTO ---
    const handleRemoveItem = (idOriginal) => {
        saveToHistory(previewData); // Guardar historial antes de borrar
        
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
        setSearchTerm(""); 
        setHistory([]); // Limpiar historial al abrir ventana limpia
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

    const handleRoleChange = (idOriginal, fotoIdx, nuevoRol) => {
        saveToHistory(previewData); // Guardar historial antes de cambiar roles
        
        // INTERCEPTAR SI EL USUARIO SELECCIONA OMITIR
        if (nuevoRol === 'ninguno') {
            const nuevoId = window.prompt("¿Quieres modificar el Id de esta foto para unirla con otra?");
            
            if (nuevoId && nuevoId.trim().toUpperCase() !== idOriginal.toUpperCase()) {
                const targetId = nuevoId.trim().toUpperCase();
                
                setPreviewData(prev => {
                    const sourceRow = prev.find(r => r.idOriginal === idOriginal);
                    if (!sourceRow) return prev;

                    // Extraemos la foto a mudar y dejamos las demás en la fila origen
                    const photoToMove = { ...sourceRow.fotos[fotoIdx], rol: 'antes' }; // Cambia a 'antes' por defecto en el nuevo grupo
                    const updatedSourceFotos = sourceRow.fotos.filter((_, idx) => idx !== fotoIdx);

                    // Buscamos si ya existe el grupo destino (ej: 'P16L1M056-T')
                    const targetRow = prev.find(r => 
                        r.idSeleccionado.toUpperCase() === targetId || 
                        r.idOriginal.toUpperCase() === targetId
                    );

                    let newState = prev.map(row => {
                        // Si es el destino, le sumamos la foto fusionándola
                        if (targetRow && row.idOriginal === targetRow.idOriginal) {
                            const combinacionFotos = [...row.fotos];
                            if (!combinacionFotos.some(f => f.b64Data === photoToMove.b64Data)) {
                                const tieneAntes = combinacionFotos.some(x => x.rol === 'antes');
                                if (tieneAntes) photoToMove.rol = 'despues'; // Si ya hay un 'antes', la acomoda como 'después'
                                combinacionFotos.push(photoToMove);
                            }
                            return { ...row, idSeleccionado: targetId, fotos: combinacionFotos };
                        }
                        // Si es el origen, le removemos la foto
                        if (row.idOriginal === idOriginal) {
                            return { ...row, fotos: updatedSourceFotos };
                        }
                        return row;
                    });

                    // Si el grupo destino no existía, creamos la nueva fila con la foto huérfana
                    if (!targetRow) {
                        newState.push({
                            idOriginal: `PROP_${Date.now()}`,
                            idSeleccionado: targetId,
                            idAntes: targetId,
                            idDespues: targetId,
                            ubi: sourceRow.ubi,
                            fecha: sourceRow.fecha,
                            fotos: [photoToMove]
                        });
                    }

                    // Limpieza: si la fila de origen se quedó sin fotos, la borramos
                    return newState.filter(row => row.fotos.length > 0);
                });
                return; // Termina la ejecución para que no ejecute el flujo normal
            }
        }

        // Flujo normal si cambias entre 'Antes' y 'Después'
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

    // --- LÓGICA CORE: SELECCIÓN/EDICIÓN DE ID CON CORRECCIÓN Y FUSIÓN AUTOMÁTICA ---
    const handleIdSelection = (idOriginal, valorNuevo) => {
        // Guardar estado actual en el historial antes de realizar la fusión/cambio
        saveToHistory(previewData);

        const targetValue = valorNuevo.toUpperCase();

        setPreviewData(prev => {
            // Encuentra la fila que el usuario está editando actualmente
            const currentRow = prev.find(r => r.idOriginal === idOriginal);
            if (!currentRow) return prev;

            // Revisamos si el nuevo ID ya existe en OTRA fila de la lista actual (FUSIÓN)
            const duplicateRow = prev.find(r => r.idOriginal !== idOriginal && r.idSeleccionado.toUpperCase() === targetValue);

            if (duplicateRow) {
                // ¡Hay coincidencia! Vamos a unir las fotos de la fila editada dentro de la fila duplicada existente
                return prev.map(row => {
                    if (row.idOriginal === duplicateRow.idOriginal) {
                        // Combinamos las fotos de ambos bloques evitando duplicados exactos de b64Data si existieran
                        const combinacionFotos = [...row.fotos];
                        currentRow.fotos.forEach(f => {
                            if (!combinacionFotos.some(existente => existente.b64Data === f.b64Data)) {
                                // Forzamos un rol coherente temporal si ya están ocupados el 'antes' y 'despues'
                                const tieneAntes = combinacionFotos.some(x => x.rol === 'antes');
                                const tieneDespues = combinacionFotos.some(x => x.rol === 'despues');
                                
                                let nuevoRolAsignado = f.rol;
                                if (f.rol === 'antes' && tieneAntes) nuevoRolAsignado = !tieneDespues ? 'despues' : 'ninguno';
                                if (f.rol === 'despues' && tieneDespues) nuevoRolAsignado = !tieneAntes ? 'antes' : 'ninguno';

                                combinacionFotos.push({ ...f, rol: nuevoRolAsignado });
                            }
                        });

                        return { ...row, fotos: combinacionFotos };
                    }
                    return row;
                }).filter(row => row.idOriginal !== idOriginal); // Eliminamos la fila vieja que ya fue absorbida
            }

            // Si no colisiona con ningún ID existente, simplemente actualiza el texto de forma normal
            return prev.map(row => row.idOriginal === idOriginal ? { ...row, idSeleccionado: targetValue } : row);
        });
    };

    const handleDateChange = (idOriginal, nuevaFecha) => {
        setPreviewData(prev => prev.map((row) => 
            row.idOriginal === idOriginal ? { ...row, fecha: nuevaFecha } : row
        ));
    };

    const clearProgress = () => {
        if (window.confirm("¿Seguro que deseas reiniciar este informe?")) {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            localStorage.removeItem(DELETED_ITEMS_KEY);
            setPreviewData([]);
            setHistory([]);
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

    // --- FILTRADO INTELIGENTE ---
    const queryClean = searchTerm.trim().toUpperCase();
    const filteredData = previewData.filter(row => {
        if (queryClean.length < 2) return true;
        return (
            row.idOriginal?.toUpperCase().includes(queryClean) ||
            row.idSeleccionado?.toUpperCase().includes(queryClean) ||
            row.idAntes?.toUpperCase().includes(queryClean) ||
            row.idDespues?.toUpperCase().includes(queryClean)
        );
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
                    title="Restablecer reporte"
                >
                    <img src={restartIcon} alt="restart" style={{ width: '25px', marginRight: '8px' }} />
                </button>
            )}

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
                                            opacity: history.length > 0 ? 1 : 0.35, // Se atenúa si no hay historial
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

                            {/* BARRA DE FILTRADO */}
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
                                        border: '1px #cbd5e1',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                        backgroundColor: '#f0f0f0',
                                        
                                    }}
                                />
                                        <span style={{ fontSize: '10px', color: '#9da2a8', fontWeight: '500' }}>
                                            Mostrando {filteredData.length} de {previewData.length} ítems
                                        </span>
                                {searchTerm && (
                                    <button 
                                        onClick={() => setSearchTerm("")}
                                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                                    >
                                        ✕
                                    </button>
                                )}
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
                                                        {/* Al presionar 'Enter' o perder el foco se puede consolidar la edición */}
                                                        <input 
                                                            type="text" 
                                                            value={row.idSeleccionado} 
                                                            onChange={(e) => {
                                                                // Permite escritura fluida sin disparar inmediatamente la fusión en cada carácter
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