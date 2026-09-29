import React, { useState, useEffect } from 'react';
import '../styles/ReportItemList.css';

/**
 * Componente independiente para renderizar y paginar los elementos del informe.
 * Evita que el DOM colapse al manejar más de 150 elementos simultáneamente.
 */
const ReportItemList = ({ 
    filteredData, 
    previewData, 
    handleRemoveItem, 
    handleIdSelection, 
    handleDateChange, 
    handleRoleChange, 
    setPreviewData, 
    searchTerm 
}) => {
    // --- ESTADOS DE PAGINACIÓN LOCAL ---
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5; // Muestra de 5 en 5 (puedes ajustarlo a 20 como indica tu comentario)

    // Resetea la página a 1 cada vez que cambia el filtro de búsqueda o los datos filtrados
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filteredData.length]);

    // Cálculo de los elementos visibles en la página actual
    const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
    
    // Seguridad por si la página actual excede el nuevo total
    const safeCurrentPage = Math.min(currentPage, totalPages);
    
    const indexOfLastItem = safeCurrentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);

    return (
        <div className="report-modal-table-container">
            {filteredData.length > 0 ? (
                <>
                    {/* Renderizado exclusivo de los ítems de la página actual */}
                    {currentItems.map((row) => {
                        const radioGroupKey = `ids-${row.idOriginal}`;
                        
                        return (
                            <div key={row.idOriginal} className="report-dispositivo-block" style={{ position: 'relative' }}>
                                
                                {/* Botón para eliminar un ítem individual */}
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
                                            {/* Selector Opción Antes */}
                                            <label className={`report-pill-label ${row.idSeleccionado === row.idAntes ? 'active-antes' : ''}`}>
                                                <input 
                                                    type="radio" 
                                                    name={radioGroupKey} 
                                                    checked={row.idSeleccionado === row.idAntes} 
                                                    onChange={() => handleIdSelection(row.idOriginal, row.idAntes)} 
                                                />
                                                A: {row.idAntes}
                                            </label>

                                            {/* Selector Opción Después */}
                                            <label className={`report-pill-label ${row.idSeleccionado === row.idDespues ? 'active-despues' : ''}`}>
                                                <input 
                                                    type="radio" 
                                                    name={radioGroupKey} 
                                                    checked={row.idSeleccionado === row.idDespues} 
                                                    onChange={() => handleIdSelection(row.idOriginal, row.idDespues)} 
                                                />
                                                D: {row.idDespues}
                                            </label>

                                            {/* Input manual de ID */}
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
                                    
                                    {/* Selector de Fecha */}
                                    <input 
                                        type="date" 
                                        value={row.fecha} 
                                        className="report-date-input" 
                                        onChange={(e) => handleDateChange(row.idOriginal, e.target.value)} 
                                    />
                                </div>
                                
                                {/* Cuadrícula de fotos optimizada con tamaño compacto */}
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
                                            
                                            {/* Selector de Rol de la Fotografía */}
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
                    })}

                    {/* Controles de Paginación Inferior */}
                    {totalPages > 1 && (
                        <div className="report-pagination-wrapper">
                            <button 
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={safeCurrentPage === 1}
                                className="report-pagination-btn"
                            >
                                Anterior
                            </button>
                            <span className="report-pagination-info">
                                Página {safeCurrentPage} de {totalPages}
                            </span>
                            <button 
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={safeCurrentPage === totalPages}
                                className="report-pagination-btn"
                            >
                                Siguiente
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '14px' }}>
                    Oops! No veo un ID {searchTerm}
                </div>
            )}
        </div>
    );
};

export default ReportItemList;