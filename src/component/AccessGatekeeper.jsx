import React, { useState } from 'react';
import '../styles/AccessGatekeeper.css'; 

const AccessGatekeeper = ({ onAccessGranted }) => {
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  // --- CONFIGURACIÓN DE CREDENCIALES ---
  const CLAVE_ACCESO_TOTAL = "Jci/*AdminFull2026";
  const CLAVE_SOLO_WATERMARK = "Jci/*Watermark2026";

  const handleLogin = (e) => {
    e.preventDefault();
    setAuthError('');

    if (passwordInput === CLAVE_ACCESO_TOTAL) {
      onAccessGranted('full');
    } else if (passwordInput === CLAVE_SOLO_WATERMARK) {
      onAccessGranted('watermark');
    } else {
      setAuthError('Clave incorrecta. Inténtalo de nuevo.');
    }
  };

  return (
    <div className="gatekeeper-overlay">
      <div className="gatekeeper-card-compact">
        <h3 className="gatekeeper-title">
          🛡️ Sistema de Control
        </h3>
        
        <p className="gatekeeper-description">
          Introduce tu código de autorización para habilitar los accesos.
        </p>

        <form onSubmit={handleLogin} className="gatekeeper-form">
          <input 
            type="password" 
            placeholder="Escribe la clave de acceso..." 
            value={passwordInput} 
            onChange={(e) => setPasswordInput(e.target.value)}
            className="gatekeeper-input-field"
          />
          
          {authError && <p className="gatekeeper-error-msg">⚠️ {authError}</p>}
          
          <button type="submit" className="gatekeeper-btn-submit">
            Verificar Credenciales
          </button>
        </form>
      </div>
    </div>
  );
};

export default AccessGatekeeper;