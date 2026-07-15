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

    // 1. FILTRADO AUTOMÁTICO POR NOMENCLATURA
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
        const automaticos = filtrarPorNomenclatura(sistema);
        const porLote = resultadosOCR.filter(res => res.sistemaAsignado === sistema);
        const todasLasFotos = [...porLote];
        
        automaticos.forEach(autoFoto => {
            if (!todasLasFotos.some(f => f.id === autoFoto.id)) {
                todasLasFotos.push(autoFoto);
            }
        });

        return todasLasFotos;
    };

    // VERIFICAR CONTRASEÑA
    const handleVerifyPassword = (e, sistema) => {
        e.preventDefault();
        if (passwordInput === CREDENTIALS[sistema]) {
            setUnlockedSystems(prev => ({ ...prev, [sistema]: true }));
            setAuthError(false);
            setPasswordInput('');
        } else {
            setAuthError(true);
        }
    };

    // 🔒 Cierra el candado y bloquea el sistema inmediatamente
    const handleLockSystem = (e, sistema) => {
        e.stopPropagation(); // 🛑 Evita que se dispare el evento del botón circular de abajo
        setUnlockedSystems(prev => ({
            ...prev,
            [sistema]: false
        }));
        setAuthError(false);
        setPasswordInput('');
    };

    // 🔑 Solicita clave de seguridad antes de inyectar el Grupo de Ids pendientes
    const handleAsignarLoteSeguro = (sistema) => {
        const confirmPassword = prompt(`Por seguridad, introduce la clave de ${sistema} para agregar este grupo de Ids:`);
        if (confirmPassword === null) return;

        if (confirmPassword === CREDENTIALS[sistema]) {
            asignarLoteASistema(sistema);
            alert("¡Ids asignados con éxito!");
        } else {
            alert("❌ Contraseña incorrecta. Acción cancelada.");
        }
    };

    // 🌟 Ajustado a la IZQUIERDA para no chocar con el badge de registros
    const floatingLockStyle = {
        position: 'absolute',
        top: '-6px',
        left: '-6px', // 👈 Cambiado de right a left
        background: '#ef4444',
        color: '#fff',
        border: '2px solid #fff',
        borderRadius: '50%',
        width: '22px',
        height: '22px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '11px',
        cursor: 'pointer',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
        zIndex: '10',
        transition: 'transform 0.1s ease'
    };

    return (
        <div className="systems-manager-container">
            <div className="systems-manager-header">
                <h3>Asignación de Análisis por Sistema</h3>
                <p>Selecciona tu sistema y lleva el registro de las fotos analizadas para generar el informe correspondiente.</p>
            </div>

            {/* BOTONES CIRCULARES (TABS) */}
            <div className="systems-tabs-circle-bar">
                
                {/* CONTENEDOR SACS */}
                <div style={{ position: 'relative', display: 'inline-block' }}>
                    {unlockedSystems.SACS && (
                        <button 
                            type="button"
                            style={floatingLockStyle}
                            onClick={(e) => handleLockSystem(e, 'SACS')}
                            title="Bloquear acceso a SACS"
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            🔒
                        </button>
                    )}
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
                </div>
                
                {/* CONTENEDOR FADS */}
                <div style={{ position: 'relative', display: 'inline-block' }}>
                    {unlockedSystems.FADS && (
                        <button 
                            type="button"
                            style={floatingLockStyle}
                            onClick={(e) => handleLockSystem(e, 'FADS')}
                            title="Bloquear acceso a FADS"
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            🔒
                        </button>
                    )}
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
                </div>
                
                {/* CONTENEDOR CCTV */}
                <div style={{ position: 'relative', display: 'inline-block' }}>
                    {unlockedSystems.CCTV && (
                        <button 
                            type="button"
                            style={floatingLockStyle}
                            onClick={(e) => handleLockSystem(e, 'CCTV')}
                            title="Bloquear acceso a CCTV"
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            🔒
                        </button>
                    )}
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
                                onClick={() => handleAsignarLoteSeguro('SACS')}
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
                        <div style={{ width: '100%' }}>
                            <ReportFiller 
                                results={obtenerResultadosParaSistema('SACS')} 
                                type="Mantenimiento"
                                system="SACS"
                                templatePath="/Informe_mto_otrosi_fads.docx"
                                className="btn-platform"
                            />
                        </div>
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
                                onClick={() => handleAsignarLoteSeguro('FADS')}
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
                        <div style={{ width: '100%' }}>
                            <ReportFiller 
                                results={obtenerResultadosParaSistema('FADS')} 
                                type="Mantenimiento"
                                system="FADS"
                                templatePath="/Informe_mto_otrosi_fads.docx"
                                className="btn-platform"
                            />
                        </div>
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
                                onClick={() => handleAsignarLoteSeguro('CCTV')}
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
                        <div style={{ width: '100%' }}>
                            <ReportFiller 
                                results={obtenerResultadosParaSistema('CCTV')} 
                                type="Mantenimiento"
                                system="CCTV"
                                templatePath="/Informe_mto_otrosi_fads.docx"
                                className="btn-platform"
                            />
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default ReportSystemsManager;