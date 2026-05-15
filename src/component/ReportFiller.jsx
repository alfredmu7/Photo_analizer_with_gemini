import React from 'react';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import { saveAs } from 'file-saver';

const ReportFiller = ({ results, dateStamp, type, templatePath, className }) => {

    const fillReport = async () => {
        try {
            const response = await fetch(templatePath);
            const content = await response.arrayBuffer();
            const zip = new PizZip(content);

            const imageOptions = {
                centered: false,
                getImage: (tagValue) => {
                    return new Promise((resolve, reject) => {
                        if (!tagValue) return resolve(null);
                        const reader = new FileReader();
                        // Esto convierte el archivo en el formato que el Word entiende
                        reader.onload = () => resolve(reader.result); 
                        reader.onerror = reject;
                        reader.readAsArrayBuffer(tagValue);
                    });
                },
                getSize: () => [220, 150], // Tamaño en píxeles dentro del documento
            };

            const doc = new Docxtemplater(zip, {
                modules: [new ImageModule(imageOptions)],
                paragraphLoop: true,
                linebreaks: true,
            });

            const limit = type === "Otrosí 7" ? 30 : 10;
            const uniqueResults = [];
            const seen = new Set();

            results.forEach(res => {
                if (res.id && !seen.has(res.id) && uniqueResults.length < limit) {
                    // Buscamos todas las fotos de este ID
                    const fotosDelId = results.filter(r => r.id === res.id);
                    
                    if (fotosDelId.length > 0) {
                        uniqueResults.push({
                            item: (uniqueResults.length + 1).toString().padStart(3, '0'),
                            fecha: dateStamp || new Date().toLocaleDateString(),
                            id: res.id,
                            ubi: res.masterInfo?.UBICACION || "No encontrado",
                            // IMPORTANTE: Tu Word tiene la etiqueta {%foto}
                            // Usamos originalFile porque no quieres el sello
                            foto: fotosDelId[0].originalFile 
                        });
                        seen.add(res.id);
                    }
                }
            });

            doc.render({
                reporte: uniqueResults,
                tipo_otrosi: type,
                fecha_generacion: dateStamp
            });

            const out = doc.getZip().generate({
                type: 'blob',
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            });

            saveAs(out, `Informe_JCI_${type}.docx`);

        } catch (error) {
            console.error("Error completo:", error);
            alert("Error al procesar el Word. Revisa la consola.");
        }
    };

    return (
        <button className={className} onClick={fillReport} disabled={results.length === 0}>
            📄 {type}
        </button>
    );
};

export default ReportFiller;