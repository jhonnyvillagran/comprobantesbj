import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Upload, FileImage, Loader2, Trash2, MessageCircle, Moon, Sun, Coffee, Share2, Smartphone, X } from 'lucide-react';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyD0xEN45hCo_gm4wjtsASokBcAczZyc3Ak' });

interface ExtractedData {
  destinatario: string;
  rastreo: string;
  fecha: string;
  telefono: string;
  cantidad: string;
}

interface ReceiptData {
  id: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  data?: ExtractedData;
  error?: string;
}

type Theme = 'light' | 'dark' | 'sepia';

export default function App() {
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIosPrompt, setShowIosPrompt] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsStandalone(true);
    }

    // Listen for install prompt on Android/Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Android/Chrome install flow
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      // iOS or unsupported browser fallback
      const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
      if (isIos) {
        setShowIosPrompt(true);
      } else {
        alert('Para instalar la app, busca la opción "Instalar aplicación" o "Añadir a la pantalla de inicio" en el menú de tu navegador.');
      }
    }
  };

  // Theme classes
  const themeClasses = {
    light: 'bg-gray-50 text-gray-900',
    dark: 'bg-gray-900 text-gray-100',
    sepia: 'bg-[#f4ecd8] text-[#5b4636]'
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files));
    }
    // Reset input so the same file can be selected again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const imageFiles = (Array.from(e.dataTransfer.files) as File[]).filter(file => file.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        await processFiles(imageFiles);
      }
    }
  };

  const processFiles = async (files: File[]) => {
    const newReceipts: ReceiptData[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending'
    }));

    setReceipts(prev => [...newReceipts, ...prev]);

    // Process each file
    for (const receipt of newReceipts) {
      extractData(receipt);
    }
  };

  const extractData = async (receipt: ReceiptData) => {
    setReceipts(prev => prev.map(r => r.id === receipt.id ? { ...r, status: 'processing' } : r));

    try {
      // Convert file to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          // Extract just the base64 data part
          const base64 = base64String.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(receipt.file);
      });

      const prompt = `Extrae la siguiente información del comprobante de envío.
REGLA ESTRICTA: NO inventes ninguna información. Si un dato no está claro, está borroso o no aparece en la imagen, devuelve "No encontrado".
1. Destinatario (Nombre de la persona que recibe)
2. Número de rastreo
3. Fecha y hora de envío
4. Teléfono del destinatario (solo números, incluye código de país si es posible, si no, déjalo como aparece. Busca cerca de los datos del destinatario)
5. Cantidad de paquetes (busca palabras como "Cantidad", "Bultos", "Paquetes")`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: receipt.file.type
            }
          },
          prompt
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              destinatario: { type: Type.STRING, description: "Nombre del destinatario" },
              rastreo: { type: Type.STRING, description: "Número de rastreo" },
              fecha: { type: Type.STRING, description: "Fecha y hora de envío" },
              telefono: { type: Type.STRING, description: "Teléfono del destinatario, solo números. Si no hay, pon 'No encontrado'" },
              cantidad: { type: Type.STRING, description: "Cantidad de paquetes" }
            },
            required: ["destinatario", "rastreo", "fecha", "telefono", "cantidad"]
          }
        }
      });

      const jsonText = response.text || '{}';
      const data = JSON.parse(jsonText) as ExtractedData;
      
      setReceipts(prev => prev.map(r => r.id === receipt.id ? { ...r, status: 'success', data } : r));
    } catch (error) {
      console.error("Error extracting data:", error);
      setReceipts(prev => prev.map(r => r.id === receipt.id ? { ...r, status: 'error', error: 'Error al procesar la imagen con IA.' } : r));
    }
  };

  const removeReceipt = (id: string) => {
    setReceipts(prev => {
      const receiptToRemove = prev.find(r => r.id === id);
      if (receiptToRemove) {
        URL.revokeObjectURL(receiptToRemove.previewUrl);
      }
      return prev.filter(r => r.id !== id);
    });
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 font-sans transition-colors duration-300 ${themeClasses[theme]}`}>
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center space-y-4 pt-4 relative">
          <div className="absolute right-0 top-0 flex space-x-2">
            <button onClick={() => setTheme('light')} className={`p-2 rounded-full transition-colors ${theme === 'light' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-gray-200 text-gray-500'}`} title="Modo Claro"><Sun size={20} /></button>
            <button onClick={() => setTheme('dark')} className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'bg-indigo-900 text-indigo-300' : 'hover:bg-gray-700 text-gray-400'}`} title="Modo Oscuro"><Moon size={20} /></button>
            <button onClick={() => setTheme('sepia')} className={`p-2 rounded-full transition-colors ${theme === 'sepia' ? 'bg-[#e4d5b7] text-[#5b4636]' : 'hover:bg-[#e4d5b7] text-[#8b7355]'}`} title="Modo Sepia"><Coffee size={20} /></button>
          </div>
          
          <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-2xl mb-2">
            <MessageCircle className="w-8 h-8 text-indigo-500" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">ComprobantesPclientes</h1>
          <p className="opacity-80 max-w-xl mx-auto text-lg">
            Sube fotos de tus recibos de envío para extraer los datos y enviarlos directamente por WhatsApp al cliente.
          </p>

          {/* Install App Banner */}
          {!isStandalone && (deferredPrompt || /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase())) && (
            <div className="flex justify-center mt-4">
              <button 
                onClick={handleInstallClick}
                className="flex items-center space-x-2 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 py-2.5 px-5 rounded-full text-sm font-semibold transition-colors shadow-sm border border-indigo-200 dark:border-indigo-800"
              >
                <Smartphone size={18} />
                <span>Instalar App en el Celular</span>
              </button>
            </div>
          )}
        </header>

        {/* iOS Install Instructions Modal */}
        {showIosPrompt && (
          <div className="fixed bottom-6 left-4 right-4 bg-gray-900 dark:bg-gray-800 text-white p-4 rounded-2xl shadow-2xl z-50 text-sm border border-gray-700 animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-start mb-2">
              <p className="font-semibold text-base">Instalar en iPhone / iPad</p>
              <button onClick={() => setShowIosPrompt(false)} className="p-1 hover:bg-gray-700 rounded-full">
                <X size={16} />
              </button>
            </div>
            <p className="opacity-90 leading-relaxed">
              1. Toca el botón <strong>Compartir</strong> <Share2 size={14} className="inline mx-1" /> en la barra inferior de Safari.<br/>
              2. Desliza hacia abajo y selecciona <strong>"Agregar a inicio"</strong> <span className="text-lg leading-none inline-block align-middle">+</span>.
            </p>
          </div>
        )}

        {/* Upload Area */}
        <div 
          className={`border-2 border-dashed rounded-3xl p-10 text-center transition-all duration-200 ease-in-out cursor-pointer
            ${isDragging ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]' : 'border-current opacity-60 hover:opacity-100 hover:bg-indigo-500/5'}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple 
            accept="image/*" 
            onChange={handleFileChange} 
          />
          <div className="flex flex-col items-center space-y-4">
            <div className="p-4 bg-indigo-500/20 rounded-full text-indigo-500">
              <Upload size={40} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xl font-medium">Toca para subir imágenes o arrástralas aquí</p>
              <p className="opacity-70 mt-2">Soporta múltiples imágenes (JPG, PNG)</p>
            </div>
            <button className="mt-4 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm">
              Seleccionar fotos
            </button>
          </div>
        </div>

        {/* Results Area */}
        {receipts.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-current pb-4 opacity-80">
              <h2 className="text-xl font-semibold">
                Comprobantes ({receipts.length})
              </h2>
              <button 
                onClick={() => setReceipts([])}
                className="text-sm hover:text-red-500 font-medium transition-colors"
              >
                Limpiar todos
              </button>
            </div>
            
            <div className="grid gap-6">
              {receipts.map(receipt => (
                <ReceiptCard key={receipt.id} receipt={receipt} onRemove={() => removeReceipt(receipt.id)} theme={theme} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const ReceiptCard: React.FC<{ receipt: ReceiptData, onRemove: () => void, theme: Theme }> = ({ receipt, onRemove, theme }) => {
  const cardClasses = {
    light: 'bg-white border-gray-200',
    dark: 'bg-gray-800 border-gray-700',
    sepia: 'bg-[#fdf8e9] border-[#e4d5b7]'
  };

  const getWhatsAppText = () => {
    if (!receipt.data) return '';
    return `Destinatario: ${receipt.data.destinatario}\nNúmero de rastreo: ${receipt.data.rastreo}\nFecha y hora de envío: ${receipt.data.fecha}\nCantidad de paquetes: ${receipt.data.cantidad}`;
  };

  const handleShareWithImage = async () => {
    const textToShare = getWhatsAppText();
    
    // REPARACIÓN CRÍTICA: Las fotos tomadas directamente con la cámara del móvil 
    // a veces fallan al compartirse porque el navegador no les asigna un nombre o tipo correcto.
    // Recreamos el archivo para asegurar que sea 100% compatible con navigator.share
    const shareFile = new File([receipt.file], 'comprobante.jpg', { type: 'image/jpeg' });
    
    // Check if Web Share API is supported and can share files
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [shareFile] })) {
      try {
        // TRUCO: Copiamos el número de teléfono al portapapeles para que el usuario 
        // pueda pegarlo en el buscador de WhatsApp y encontrar al cliente rápido.
        let phone = receipt.data?.telefono || '';
        phone = phone.replace(/\D/g, '');
        if (phone && navigator.clipboard) {
          await navigator.clipboard.writeText(phone).catch(() => {});
          alert(`💡 CONSEJO:\nSe ha copiado el número ${phone} al portapapeles.\n\nCuando elijas WhatsApp, pega el número en la lupa de búsqueda para encontrar al cliente al instante.`);
        }

        await navigator.share({
          files: [shareFile],
          title: 'Comprobante de Envío',
          text: textToShare
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      alert('Tu navegador o dispositivo no soporta compartir imágenes directamente.');
    }
  };

  return (
    <div className={`rounded-2xl shadow-sm border overflow-hidden flex flex-col md:flex-row transition-all hover:shadow-md ${cardClasses[theme]}`}>
      {/* Image Preview */}
      <div className="w-full md:w-48 h-48 md:h-auto relative flex-shrink-0 border-b md:border-b-0 md:border-r border-current opacity-90">
        <img src={receipt.previewUrl} alt="Preview" className="w-full h-full object-cover" />
        
        {/* Status Overlay */}
        {receipt.status === 'processing' && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-white mb-2" size={28} />
            <span className="text-xs font-medium text-white bg-black/50 px-2 py-1 rounded-full">Procesando...</span>
          </div>
        )}
        
        {/* Remove Button */}
        <button 
          onClick={onRemove} 
          className="absolute top-2 right-2 bg-black/50 backdrop-blur text-white hover:text-red-400 p-1.5 rounded-full shadow-sm transition-colors"
          title="Eliminar imagen"
        >
          <Trash2 size={16} />
        </button>
      </div>
      
      {/* Content Area */}
      <div className="p-5 flex-grow flex flex-col justify-between">
        <div className="mb-4">
          <div className="flex items-center space-x-2 mb-3 opacity-70">
            <FileImage size={16} />
            <span className="text-sm font-medium truncate" title={receipt.file.name}>
              {receipt.file.name}
            </span>
          </div>

          {receipt.status === 'pending' || receipt.status === 'processing' ? (
            <div className="animate-pulse space-y-3 py-2 opacity-50">
              <div className="h-5 bg-current rounded w-3/4"></div>
              <div className="h-5 bg-current rounded w-1/2"></div>
              <div className="h-5 bg-current rounded w-2/3"></div>
            </div>
          ) : receipt.status === 'error' ? (
            <div className="text-red-500 bg-red-500/10 p-4 rounded-xl border border-red-500/20">
              <p className="font-medium">{receipt.error}</p>
              <p className="text-sm mt-1 opacity-80">Por favor, intenta subir la imagen nuevamente.</p>
            </div>
          ) : receipt.data ? (
            <div className="space-y-2 text-lg">
              <div><span className="font-semibold opacity-80">Destinatario:</span> <span className="font-bold">{receipt.data.destinatario}</span></div>
              <div><span className="font-semibold opacity-80">Número de rastreo:</span> <span className="font-bold">{receipt.data.rastreo}</span></div>
              <div><span className="font-semibold opacity-80">Fecha y hora:</span> <span className="font-bold">{receipt.data.fecha}</span></div>
              <div><span className="font-semibold opacity-80">Cantidad:</span> <span className="font-bold">{receipt.data.cantidad}</span></div>
              <div><span className="font-semibold opacity-80">Teléfono:</span> <span className="font-bold">{receipt.data.telefono}</span></div>
            </div>
          ) : null}
        </div>
        
        {/* Action Buttons */}
        {receipt.status === 'success' && (
          <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-current border-opacity-10">
            <div className="bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20">
              <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-2">
                📱 Desde Móvil (Recomendado)
              </p>
              <button 
                onClick={handleShareWithImage}
                className="w-full flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-xl text-sm font-medium transition-colors shadow-sm"
              >
                <Share2 size={18} />
                <span>Compartir Foto + Texto</span>
              </button>
              <p className="text-xs opacity-70 mt-1.5 text-center">
                Abre el menú de tu celular. Elige WhatsApp y busca al cliente.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
