import React, { useState } from 'react';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free'; 
import { saveAs } from 'file-saver';
import logoJCI from '../assets/logoJCIcompleto.png';
import '../styles/ReportFiller.css'; 

const ReportFiller = ({ results, type, templatePath, className }) => {
    const [showModal, setShowModal] = useState(false);
    const [previewData, setPreviewData] = useState([]);
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

    // --- FUNCIÓN DE LIMPIEZA COMPLEMENTARIA PARA COINCIDENCIAS ---
    const normalizeIdForMatching = (id) => {
        if (!id) return "";
        return id.toUpperCase().replace(/([A-Z])0+/g, '$1').replace(/[^A-Z0-9]/g, '');
    };

    // --- PROCESAMIENTO Y AGRUPACIÓN AL ABRIR EL POPUP ---
    const openConfig = () => {
        if (!results || results.length === 0) return;

        const today = new Date().toISOString().split('T')[0];
        const grouped = [];
        const seenNormalizedIds = new Set();

        for (let i = 0; i < results.length; i++) {
            const res = results[i];
            if (!res || !res.id) continue;

            const currentNormalized = normalizeIdForMatching(res.id);

            if (seenNormalizedIds.has(currentNormalized)) continue;

            const todasLasFotosDelId = results.filter(r => normalizeIdForMatching(r.id) === currentNormalized);
            
            const fotosEstructuradas = todasLasFotosDelId.map((foto, index) => ({
                originalFile: foto.originalFile,
                thumb: foto.thumb,
                rol: index === 0 ? 'antes' : index === 1 ? 'despues' : 'ninguno',
                idDetectadoOCR: foto.id 
            }));

            const idAntesPropuesto = fotosEstructuradas[0]?.idDetectadoOCR || res.id;
            const idDespuesPropuesto = fotosEstructuradas[1]?.idDetectadoOCR || idAntesPropuesto;
            const idSeleccionadoPorDefecto = idDespuesPropuesto;

            grouped.push({
                idOriginal: res.id,
                idSeleccionado: idSeleccionadoPorDefecto, 
                idAntes: idAntesPropuesto,
                idDespues: idDespuesPropuesto,
                isEditingManual: false,
                ubi: res.masterInfo?.UBICACION || "No encontrado",
                fecha: today,
                fotos: fotosEstructuradas
            });
            
            seenNormalizedIds.add(currentNormalized);
        }

        setPreviewData(grouped);
        setShowModal(true);
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

    // --- MANEJADOR DE SELECCIÓN Y UNIFICACIÓN EN TIEMPO REAL ---
    const handleIdSelection = (idIdx, valorNuevo) => {
        let newData = [...previewData];
        const bloqueActual = newData[idIdx];
        
        bloqueActual.idSeleccionado = valorNuevo;

        const normalizedNuevo = normalizeIdForMatching(valorNuevo);
        if (!normalizedNuevo) {
            setPreviewData(newData);
            return;
        }

        const destinoIdx = newData.findIndex((row, idx) => 
            idx !== idIdx && (
                normalizeIdForMatching(row.idSeleccionado) === normalizedNuevo ||
                normalizeIdForMatching(row.idAntes) === normalizedNuevo ||
                normalizeIdForMatching(row.idDespues) === normalizedNuevo
            )
        );

        if (destinoIdx !== -1) {
            const bloqueDestino = newData[destinoIdx];

            bloqueActual.fotos.forEach(foto => {
                const tieneDespues = bloqueDestino.fotos.some(f => f.rol === 'despues');
                if (!tieneDespues && foto.rol === 'antes') {
                    foto.rol = 'despues';
                }
                bloqueDestino.fotos.push(foto);
            });

            if ((bloqueDestino.ubi === 'N/A' || bloqueDestino.ubi === 'No encontrado') && bloqueActual.ubi !== 'No encontrado') {
                bloqueDestino.ubi = bloqueActual.ubi;
            }

            newData = newData.filter((_, idx) => idx !== idIdx);
        }

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

                let fechaFormateadaTabla = "";
                if (item.fecha) {
                    const [year, month, day] = item.fecha.split("-");
                    fechaFormateadaTabla = `${day}-${month}-${year || ""}`;
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

            const hoy = new Date();
            const diaGlobal = String(hoy.getDate()).padStart(2, '0');
            const mesGlobal = String(hoy.getMonth() + 1).padStart(2, '0');
            const anioGlobal = String(hoy.getFullYear());

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
        }
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
                        
                        {/* CABECERA DEL MODAL */}
                        <div className="report-modal-header">
                            <h3>Asignación de Fotos e IDs para Informe: {type}</h3>
                            <p>
                                Revisa los códigos leídos. Por defecto se ha pre-seleccionado el ID de la foto de "Después" por ser la corregida.
                            </p>
                        </div>
                        
                        {/* CONTENEDOR DE FILAS */}
                        <div className="report-modal-table-container">
                            {previewData.map((row, idIdx) => {
                                const noCoincideId = row.idAntes !== row.idDespues;
                                return (
                                    <div key={idIdx} className="report-dispositivo-block">
                                        
                                        {/* BLOQUE IZQUIERDO */}
                                        <div className="report-info-col">
                                            <div className="report-id-selector-container">
                                                <span className="report-label-inline">ID:</span>
                                                
                                                <div className="report-pill-wrapper">
                                                    {/* Opción Antes */}
                                                    <label className={`report-pill-label ${row.idSeleccionado === row.idAntes ? 'active-antes' : ''} ${noCoincideId ? 'no-match' : ''}`}>
                                                        <input 
                                                            type="radio" 
                                                            name={`id-selector-${idIdx}`}
                                                            checked={row.idSeleccionado === row.idAntes}
                                                            onChange={() => handleIdSelection(idIdx, row.idAntes)}
                                                        />
                                                        Antes: <span className="report-code-font">{row.idAntes}</span>
                                                    </label>

                                                    {/* Opción Después */}
                                                    <label className={`report-pill-label ${row.idSeleccionado === row.idDespues ? 'active-despues' : ''} ${noCoincideId ? 'no-match' : ''}`}>
                                                        <input 
                                                            type="radio" 
                                                            name={`id-selector-${idIdx}`}
                                                            checked={row.idSeleccionado === row.idDespues}
                                                            onChange={() => handleIdSelection(idIdx, row.idDespues)}
                                                        />
                                                        Después (✓): <span className="report-code-font">{row.idDespues}</span>
                                                    </label>

                                                    <div className="report-pill-separator"></div>

                                                    {/* Input Manual */}
                                                    <input 
                                                        type="text" 
                                                        value={row.idSeleccionado}
                                                        onChange={(e) => handleIdSelection(idIdx, e.target.value.toUpperCase())}
                                                        placeholder="✏️ Editar..."
                                                        className={`report-manual-input ${(row.idSeleccionado !== row.idAntes && row.idSeleccionado !== row.idDespues) ? 'custom-active' : ''}`}
                                                    />
                                                </div>
                                            </div>

                                            {/* Fila de Ubicación */}
                                            <div className="report-ubi-row">
                                                <span className="report-label-bold">Ubi:</span> 
                                                <span className={row.ubi === 'N/A' || row.ubi === 'No encontrado' ? 'report-ubi-na' : ''}>{row.ubi}</span>
                                            </div>

                                            {/* Input de Fecha */}
                                            <div className="report-date-row">
                                                <input 
                                                    type="date" 
                                                    value={row.fecha} 
                                                    className="report-date-input"
                                                    onChange={(e) => {
                                                        const newData = [...previewData];
                                                        newData[idIdx].fecha = e.target.value;
                                                        setPreviewData(newData);
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* BLOQUE DERECHO */}
                                        <div className="report-grid-fotos">
                                            {row.fotos.map((foto, fotoIdx) => (
                                                <div key={fotoIdx} className="report-foto-item">
                                                    <img 
                                                        src={foto.thumb} 
                                                        alt="Scanner" 
                                                        className="report-img-thumbnail"
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
                                );
                            })}
                        </div>

                        {/* ACCIONES DEL MODAL */}
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