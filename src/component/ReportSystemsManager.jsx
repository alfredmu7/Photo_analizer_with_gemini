import React, { useState } from 'react';
import ReportFiller from './ReportFiller'; 
import '../styles/ReportSystemsManager.css';

// 1. Recibimos lotePendiente y asignarLoteASistema como props desde el padre
const ReportSystemsManager = ({ resultadosOCR, lotePendiente, asignarLoteASistema }) => {
    const [activeSystem, setActiveSystem] = useState('SACS');
    
    // Estado para controlar qué sistemas ya fueron desbloqueados con credenciales
    const [unlockedSystems, setUnlockedSystems] = useState({
        SACS: false,
        FADS: false,
        CCTV: false
    });

    // Estado temporal para el texto que digita el usuario en el input de clave
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState(false);

    // Definición de credenciales/claves por sistema
    const CREDENTIALS = {
        SACS: 'sacs123',  
        FADS: 'fads123',
        CCTV: 'cctv123'
    };

    // 1. FILTRADO AUTOMÁTICO POR NOMENCLATURA (Mantiene tu lógica actual)
    const filtrarPorNomenclatura = (sistema) => {
        if (!resultadosOCR || resultadosOCR.length === 0) return [];
        switch (sistema) {
            case 'CCTV':
                return resultadosOCR.filter(r => r.id?.toUpperCase().startsWith('C'));
            case 'SACS':
                return resultadosOCR.filter(r => r.id?.toUpperCase().startsWith('A') || r.id?.toUpperCase().startsWith('CK'));
            case 'FADS':
                return resultadosOCR.filter(r => r.id?.toUpperCase().startsWith('F') || r.id?.toUpperCase().startsWith('M'));
            default:
                return [];
        }
    };

    // 2. LOGICA DE CONTROL TOTAL
const obtenerResultadosParaSistema = (sistema) => {
    // 1. Conseguimos las fotos que entran automáticamente por su letra (F, M, A, CK, C)
    const automaticos = filtrarPorNomenclatura(sistema);
    
    // 2. Conseguimos las fotos que el usuario inyectó manualmente a través del botón de lote
    const porLote = resultadosOCR.filter(res => res.sistemaAsignado === sistema);
    
    // 3. Unimos ambas listas en un solo array sin duplicar fotos (usando el ID único o el objeto)
    const todasLasFotos = [...porLote];
    
    automaticos.forEach(autoFoto => {
        // Si la foto automática no está ya en la lista por lote, la agregamos
        if (!todasLasFotos.some(f => f.id === autoFoto.id)) {
            todasLasFotos.push(autoFoto);
        }
    });

    return todasLasFotos;
};

// 🌟 FUNCIÓN QUE TE HACE FALTA PARA DETENER LA RECARGA DE LA PÁGINA
const handleVerifyPassword = (e, sistema) => {
    e.preventDefault(); // 🛑 Detiene el comportamiento de recarga nativo del formulario

    if (passwordInput === CREDENTIALS[sistema]) {
        setUnlockedSystems(prev => ({
            ...prev,
            [sistema]: true
        }));
        setAuthError(false);
        setPasswordInput('');
    } else {
        setAuthError(true);
    }
};

    return (
        <div className="systems-manager-container">
            <div className="systems-manager-header">
                <h3>Asignación de Análisis por Sistema</h3>
                <p>Selecciona tu sistema y lleva el registro de las fotos analizadas para generar el informe correspondiente.</p>
            </div>

            {/* BOTONES CIRCULARES (TABS) */}
            <div className="systems-tabs-circle-bar">
                <button 
                    type="button"
                    className={`tab-circle ${activeSystem === 'SACS' ? 'circle-active-sacs' : ''}`}
                    onClick={() => { setActiveSystem('SACS'); setAuthError(false); setPasswordInput(''); }}
                    title="Control de Acceso (SACS)"
                >
                    <span className="circle-icon">{unlockedSystems.SACS ? '🔓' : '🔒'}</span>
                    {obtenerResultadosParaSistema('SACS').length > 0 && (
                        <span className="circle-badge">{obtenerResultadosParaSistema('SACS').length}</span>
                    )}
                </button>
                
                <button 
                    type="button"
                    className={`tab-circle ${activeSystem === 'FADS' ? 'circle-active-fads' : ''}`}
                    onClick={() => { setActiveSystem('FADS'); setAuthError(false); setPasswordInput(''); }}
                    title="Detección de Incendios (FADS)"
                >
                    <span className="circle-icon">{unlockedSystems.FADS ? '🔓' : '🔥'}</span>
                    {obtenerResultadosParaSistema('FADS').length > 0 && (
                        <span className="circle-badge">{obtenerResultadosParaSistema('FADS').length}</span>
                    )}
                </button>
                
                <button 
                    type="button"
                    className={`tab-circle ${activeSystem === 'CCTV' ? 'circle-active-cctv' : ''}`}
                    onClick={() => { setActiveSystem('CCTV'); setAuthError(false); setPasswordInput(''); }}
                    title="Circuito Cerrado de TV (CCTV)"
                >
                    <span className="circle-icon">{unlockedSystems.CCTV ? '🔓' : '📷'}</span>
                    {obtenerResultadosParaSistema('CCTV').length > 0 && (
                        <span className="circle-badge">{obtenerResultadosParaSistema('CCTV').length}</span>
                    )}
                </button>
            </div>
            
            {/* PANEL DE ACCIÓN DINÁMICO */}
            <div className="systems-action-panel">
                
                {/* --- SECCIÓN SACS --- */}
                {activeSystem === 'SACS' && (
                    lotePendiente ? (
                        <div style={{ padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #3b82f6', textAlign: 'center', width: '100%' }}>
                            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#22c55e', fontWeight: '600' }}>
                                ¿Quieres guardar las {lotePendiente.length} fotos en Sacs?
                            </p>
                            <button 
                                className="btn-platform" 
                                onClick={() => asignarLoteASistema('SACS')}
                                style={{ background: '#22c55e', color: '#fff', width: '100%', justifyContent: 'center', padding: '10px' }}
                            >
                                📥 Confirmar y agregar a SACS
                            </button>
                        </div>
                    ) : !unlockedSystems.SACS ? (
                        <form onSubmit={(e) => handleVerifyPassword(e, 'SACS')} className="auth-inline-form">
                            <input 
                                type="password" 
                                placeholder="Clave SACS..." 
                                value={passwordInput} 
                                onChange={(e) => setPasswordInput(e.target.value)}
                                className={`auth-input ${authError ? 'auth-input-error' : ''}`}
                                autoFocus
                            />
                            <button type="submit" className="btn-auth-submit">Entrar</button>
                        </form>
                    ) : (
                        <ReportFiller 
                            results={obtenerResultadosParaSistema('SACS')} 
                            type="Mantenimiento"
                            system="SACS"
                            templatePath="/Informe_mto_otrosi_fads.docx"
                            className="btn-platform"
                        />
                    )
                )}

                {/* --- SECCIÓN FADS --- */}
                {activeSystem === 'FADS' && (
                    lotePendiente ? (
                        <div style={{ padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #ef4444', textAlign: 'center', width: '100%' }}>
                            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#ff8645', fontWeight: '600' }}>
                               ¿Quieres guardar las {lotePendiente.length} fotos en Fads?
                            </p>
                            <button 
                                className="btn-platform" 
                                onClick={() => asignarLoteASistema('FADS')}
                                style={{ background: '#ff8645', color: '#fff', width: '100%', justifyContent: 'center', padding: '10px' }}
                            >
                                📥 Confirmar y agregar a FADS
                            </button>
                        </div>
                    ) : !unlockedSystems.FADS ? (
                        <form onSubmit={(e) => handleVerifyPassword(e, 'FADS')} className="auth-inline-form">
                            <input 
                                type="password" 
                                placeholder="Clave FADS..." 
                                value={passwordInput} 
                                onChange={(e) => setPasswordInput(e.target.value)}
                                className={`auth-input ${authError ? 'auth-input-error' : ''}`}
                                autoFocus
                            />
                            <button type="submit" className="btn-auth-submit">Entrar</button>
                        </form>
                    ) : (
                        <ReportFiller 
                            results={obtenerResultadosParaSistema('FADS')} 
                            type="Mantenimiento"
                            system="FADS"
                            templatePath="/Informe_mto_otrosi_fads.docx"
                            className="btn-platform"
                        />
                    )
                )}

                {/* --- SECCIÓN CCTV --- */}
                {activeSystem === 'CCTV' && (
                    lotePendiente ? (
                        <div style={{ padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #06b6d4', textAlign: 'center', width: '100%' }}>
                            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#3b82f6', fontWeight: '600' }}>
                                ¿Quieres guardar las {lotePendiente.length} fotos en Cctv?
                            </p>
                            <button 
                                className="btn-platform" 
                                onClick={() => asignarLoteASistema('CCTV')}
                                style={{ background: '#3b82f6 ', color: '#fff', width: '100%', justifyContent: 'center', padding: '10px' }}
                            >
                                📥 Confirmar y agregar a CCTV
                            </button>
                        </div>
                    ) : !unlockedSystems.CCTV ? (
                        <form onSubmit={(e) => handleVerifyPassword(e, 'CCTV')} className="auth-inline-form">
                            <input 
                                type="password" 
                                placeholder="Clave CCTV..." 
                                value={passwordInput} 
                                onChange={(e) => setPasswordInput(e.target.value)}
                                className={`auth-input ${authError ? 'auth-input-error' : ''}`}
                                autoFocus
                            />
                            <button type="submit" className="btn-auth-submit">Entrar</button>
                        </form>
                    ) : (
                        <ReportFiller 
                            results={obtenerResultadosParaSistema('CCTV')} 
                            type="Mantenimiento"
                            system="CCTV"
                            templatePath="/Informe_mto_otrosi_fads.docx"
                            className="btn-platform"
                        />
                    )
                )}
            </div>
        </div>
    );
};

export default ReportSystemsManager;