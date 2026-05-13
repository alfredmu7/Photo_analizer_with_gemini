import React from 'react';
import '../styles/MaintenancePopup.css';

const MaintenancePopup = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="maint-overlay">
      <div className="maint-modal">
        <div className="maint-header">
          ⚠️ SISTEMA EN MANTENIMIENTO
        </div>
        <div className="maint-body">
          <p>
            Agregando IA para la detección de dispositivos y mejorar el analisis de cada foto.
            
          </p>
          <div className="maint-status-box">
            <span>Estado:</span> <strong>Actualizando Motor de análisis</strong>
          </div>
          <p className="maint-footer-text">
            El escaneo de identificadores podría presentar intermitencias.
          </p>
          <button className="btn-maint-close" onClick={onClose}>
            ENTENDIDO
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaintenancePopup;