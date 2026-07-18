import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Maximize2, Minimize2, Save, FileText, Layers, Box, Trash2, 
  Plus, Check, RotateCcw, PenTool, Eraser, Square, Circle, Grid, 
  Image as ImageIcon, Sliders, Type, Upload, Download, Sparkles, 
  DollarSign, CheckSquare, Grid3X3, Eye, FileSpreadsheet, Ruler, 
  ChevronRight, Compass, ShieldCheck, Heart, FileUp, Info, HelpCircle
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Types for Design Canvas Element
interface CanvasElement {
  id: string;
  type: string; // 'block_10' | 'block_15' | 'brick' | 'column' | 'viga' | 'placa' | 'tile' | 'cabilla' | 'door' | 'window' | 'lamp' | 'person' | 'car' | 'moto' | 'tree' | 'pool' | 'skyscraper'
  category: 'mamposteria' | 'aberturas' | 'entorno';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  depth: number; // For 3D height projection
  finish: 'default' | 'concrete' | 'brick' | 'metal' | 'wood' | 'glass' | 'water';
  color?: string;
}

// Types for Stroke/Drawing
interface BrushStroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
  isHighlighter?: boolean;
}

// Budget Invoice Item
interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  price: number;
}

interface BudgetDesignStudioProps {
  budget: any;
  onClose: () => void;
  onSaveSuccess?: (updatedBudget: any) => void;
}

export default function BudgetDesignStudio({ budget, onClose, onSaveSuccess }: BudgetDesignStudioProps) {
  // Main states
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<'invoice' | 'canvas'>('invoice');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // ----------------------------------------------------
  // INVOICE (FACTURERO) STATES
  // ----------------------------------------------------
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: '1', description: 'Mano de obra mampostería estructural general', quantity: 1, price: 1500 },
    { id: '2', description: 'Instalación de columnas de soporte reforzadas (por unidad)', quantity: 4, price: 250 },
    { id: '3', description: 'Vaciado de placa de concreto pre-mezclado (mt2)', quantity: 45, price: 35 }
  ]);
  const [ivaPercentage, setIvaPercentage] = useState(16);
  const [additionalTerms, setAdditionalTerms] = useState(
    '1. Validez de esta cotización: 15 días hábiles.\n2. Forma de pago: 60% inicial de anticipo para compra de materiales y 40% contra entrega de obra.\n3. Cualquier adición o modificación sobre este presupuesto generará un costo adicional previamente convenido por escrito.'
  );
  const [adminSignature, setAdminSignature] = useState<string | null>(null);
  const [clientSignature, setClientSignature] = useState<string | null>(null);
  const [requireClientSignature, setRequireClientSignature] = useState(true);
  const [attachedPdfName, setAttachedPdfName] = useState<string | null>(null);
  const [attachedPdfSize, setAttachedPdfSize] = useState<string | null>(null);

  // ----------------------------------------------------
  // DESIGN CANVAS (TENDER) STATES
  // ----------------------------------------------------
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D');
  const [canvasElements, setCanvasElements] = useState<CanvasElement[]>([]);
  const [strokes, setStrokes] = useState<BrushStroke[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'brush' | 'highlighter' | 'eraser' | 'rect' | 'circle' | 'line'>('select');
  const [brushColor, setBrushColor] = useState('#FFCD00');
  const [brushWidth, setBrushWidth] = useState(4);
  const [showGrid, setShowGrid] = useState(true);
  const [showGuidelines, setShowGuidelines] = useState(true);

  // Canvas interaction refs & temporary states
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signatureAdminCanvasRef = useRef<HTMLCanvasElement>(null);
  const signatureClientCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isDrawingStroke, setIsDrawingStroke] = useState(false);
  const [currentStrokePoints, setCurrentStrokePoints] = useState<{ x: number; y: number }[]>([]);
  const [isDraggingElement, setIsDraggingElement] = useState(false);
  const [isResizingElement, setIsResizingElement] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeHandle, setResizeHandle] = useState<'br' | 'tr' | 'bl' | 'tl' | null>(null);
  const [isDrawingShape, setIsDrawingShape] = useState(false);
  const [shapeStart, setShapeStart] = useState({ x: 0, y: 0 });
  const [shapeCurrent, setShapeCurrent] = useState({ x: 0, y: 0 });

  // Load saved draft if it exists in budget doc
  useEffect(() => {
    if (budget) {
      if (budget.draftInvoice) {
        if (budget.draftInvoice.items) setItems(budget.draftInvoice.items);
        if (budget.draftInvoice.ivaPercentage !== undefined) setIvaPercentage(budget.draftInvoice.ivaPercentage);
        if (budget.draftInvoice.additionalTerms) setAdditionalTerms(budget.draftInvoice.additionalTerms);
        if (budget.draftInvoice.adminSignature) setAdminSignature(budget.draftInvoice.adminSignature);
        if (budget.draftInvoice.clientSignature) setClientSignature(budget.draftInvoice.clientSignature);
        if (budget.draftInvoice.requireClientSignature !== undefined) setRequireClientSignature(budget.draftInvoice.requireClientSignature);
        if (budget.draftInvoice.attachedPdfName) setAttachedPdfName(budget.draftInvoice.attachedPdfName);
        if (budget.draftInvoice.attachedPdfSize) setAttachedPdfSize(budget.draftInvoice.attachedPdfSize);
      }
      if (budget.draftCanvas) {
        if (budget.draftCanvas.elements) setCanvasElements(budget.draftCanvas.elements);
        if (budget.draftCanvas.strokes) setStrokes(budget.draftCanvas.strokes);
      }
    }
  }, [budget]);

  // Autocomplete empty list if the user has requested some specific services
  useEffect(() => {
    if (budget && (!budget.draftInvoice || !budget.draftInvoice.items || budget.draftInvoice.items.length === 0)) {
      // Create initial list based on requested services
      const initialItems: InvoiceItem[] = [];
      const requestedServices = budget.servicios || [];
      requestedServices.forEach((service: string, idx: number) => {
        initialItems.push({
          id: `init-${idx}`,
          description: `Servicio especializado de ${service.toLowerCase()} profesional`,
          quantity: 1,
          price: 850 + idx * 300
        });
      });
      if (initialItems.length > 0) {
        setItems(initialItems);
      }
    }
  }, [budget]);

  // Handle auto-save trigger on modification (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only auto-save if we have edits and aren't newly loaded
      if (budget?.id) {
        saveDraft(true);
      }
    }, 4000); // 4 seconds of idle triggers background autosave
    return () => clearTimeout(timer);
  }, [items, ivaPercentage, additionalTerms, adminSignature, clientSignature, requireClientSignature, canvasElements, strokes]);

  // Elements Library
  const elementLibrary = {
    mamposteria: [
      { type: 'block_10', name: 'Bloque Cemento 10cm', width: 40, height: 20, depth: 30, finish: 'concrete', color: '#7E7E7E' },
      { type: 'block_15', name: 'Bloque Cemento 15cm', width: 50, height: 25, depth: 35, finish: 'concrete', color: '#6A6A6A' },
      { type: 'brick', name: 'Bloque Ladrillo Rojo', width: 35, height: 18, depth: 20, finish: 'brick', color: '#D2691E' },
      { type: 'column', name: 'Columna Concreto H', width: 35, height: 35, depth: 120, finish: 'concrete', color: '#555555' },
      { type: 'viga', name: 'Viga de Acero Doble T', width: 90, height: 15, depth: 15, finish: 'metal', color: '#4A5568' },
      { type: 'placa', name: 'Placa Nervada / Losa', width: 120, height: 120, depth: 15, finish: 'concrete', color: '#888888' },
      { type: 'tile', name: 'Baldosa Porcelanato', width: 60, height: 60, depth: 2, finish: 'wood', color: '#F5DEB3' },
      { type: 'cabilla', name: 'Cabilla Acero Corrugada', width: 80, height: 6, depth: 6, finish: 'metal', color: '#2C3E50' },
    ],
    aberturas: [
      { type: 'door', name: 'Puerta Principal Madera', width: 45, height: 12, depth: 85, finish: 'wood', color: '#8B4513' },
      { type: 'window', name: 'Ventana Panorámica', width: 70, height: 10, depth: 55, finish: 'glass', color: '#87CEEB' },
      { type: 'lamp', name: 'Lámpara de Plafón LED', width: 25, height: 25, depth: 10, finish: 'metal', color: '#FFFFF0' },
    ],
    entorno: [
      { type: 'person', name: 'Obrero Técnico', width: 30, height: 30, depth: 70, finish: 'default', color: '#FF4500' },
      { type: 'car', name: 'Camioneta Pickup', width: 130, height: 60, depth: 55, finish: 'metal', color: '#333333' },
      { type: 'moto', name: 'Motocicleta Entorno', width: 65, height: 25, depth: 40, finish: 'metal', color: '#E74C3C' },
      { type: 'tree', name: 'Árbol Ornamental', width: 70, height: 70, depth: 110, finish: 'default', color: '#228B22' },
      { type: 'pool', name: 'Piscina Jacuzzi', width: 180, height: 110, depth: 50, finish: 'water', color: '#00FFFF' },
      { type: 'skyscraper', name: 'Rascacielos / Módulo', width: 150, height: 150, depth: 600, finish: 'glass', color: '#2E4053' },
    ]
  };

  // ----------------------------------------------------
  // DRAWING / RENDERING ENGINE (2D & 3D ISOMETRIC)
  // ----------------------------------------------------
  useEffect(() => {
    drawCanvas();
  }, [canvasElements, strokes, viewMode, selectedElementId, showGrid, showGuidelines, activeTool, isDrawingShape, shapeStart, shapeCurrent]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (viewMode === '2D') {
      draw2D(ctx, canvas.width, canvas.height);
    } else {
      draw3DIsometric(ctx, canvas.width, canvas.height);
    }
  };

  // Draw 2D Blueprint style
  const draw2D = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // 1. Draw Grid blueprint background
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      const gridSize = 25;
      
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw Rules / Lines
      ctx.strokeStyle = 'rgba(255, 205, 0, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(50, 0); ctx.lineTo(50, height);
      ctx.moveTo(0, 50); ctx.lineTo(width, 50);
      ctx.stroke();

      // Rulers markings
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '7px monospace';
      for (let x = 100; x < width; x += 100) {
        ctx.fillText(`${(x / 10).toFixed(0)}m`, x - 10, 45);
        ctx.beginPath();
        ctx.moveTo(x, 40); ctx.lineTo(x, 50);
        ctx.stroke();
      }
      for (let y = 100; y < height; y += 100) {
        ctx.fillText(`${(y / 10).toFixed(0)}m`, 30, y + 3);
        ctx.beginPath();
        ctx.moveTo(40, y); ctx.lineTo(50, y);
        ctx.stroke();
      }
    }

    // 2. Render Hand Drawn Brush Strokes / Highlighters
    strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (stroke.isHighlighter) {
        ctx.globalAlpha = 0.35;
      } else {
        ctx.globalAlpha = 1.0;
      }

      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0; // reset
    });

    // 3. Render Canvas Geometric Library Elements
    canvasElements.forEach((el) => {
      const isSelected = el.id === selectedElementId;
      
      ctx.save();
      ctx.translate(el.x, el.y);
      ctx.rotate((el.rotation * Math.PI) / 180);

      // Render actual element shapes based on category and type
      ctx.fillStyle = el.color || '#7E7E7E';
      ctx.strokeStyle = isSelected ? '#FFCD00' : 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = isSelected ? 2 : 1;

      // Draw standard box representation in 2D
      ctx.beginPath();
      ctx.rect(-el.width / 2, -el.height / 2, el.width, el.height);
      ctx.fill();
      ctx.stroke();

      // Custom visual detailing based on element type to look rich and elite
      if (el.type.includes('block')) {
        // Draw double holes inside the concrete block
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-el.width / 2 + 5, -el.height / 2 + 4, el.width / 2 - 7, el.height - 8);
        ctx.strokeRect(2, -el.height / 2 + 4, el.width / 2 - 7, el.height - 8);
      } else if (el.type === 'brick') {
        // Brick stripes pattern
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.moveTo(-el.width/4, -el.height/2); ctx.lineTo(-el.width/4, el.height/2);
        ctx.moveTo(0, -el.height/2); ctx.lineTo(0, el.height/2);
        ctx.moveTo(el.width/4, -el.height/2); ctx.lineTo(el.width/4, el.height/2);
        ctx.stroke();
      } else if (el.type === 'column') {
        // Column cross pattern
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.moveTo(-el.width/2, -el.height/2); ctx.lineTo(el.width/2, el.height/2);
        ctx.moveTo(-el.width/2, el.height/2); ctx.lineTo(el.width/2, -el.height/2);
        ctx.stroke();
      } else if (el.type === 'viga') {
        // I-beam shape inside
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(-el.width/2 + 10, -el.height/2 + 2, el.width - 20, el.height - 4);
      } else if (el.type === 'door') {
        // Door swing angle indicator
        ctx.strokeStyle = '#FFCD00';
        ctx.beginPath();
        ctx.arc(-el.width/2, -el.height/2, el.width, 0, Math.PI / 2);
        ctx.stroke();
      } else if (el.type === 'window') {
        // Window double panes line
        ctx.strokeStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(-el.width/2, 0); ctx.lineTo(el.width/2, 0);
        ctx.stroke();
      } else if (el.type === 'pool') {
        // Pool water waves ripple
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.moveTo(-el.width/3, -el.height/4); ctx.quadraticCurveTo(-el.width/6, -el.height/3, 0, -el.height/4);
        ctx.quadraticCurveTo(el.width/6, -el.height/6, el.width/3, -el.height/4);
        ctx.stroke();
      }

      // Draw measurements label
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      const realW = (el.width / 10).toFixed(1);
      const realH = (el.height / 10).toFixed(1);
      ctx.fillText(`${realW}m x ${realH}m`, 0, el.height / 2 + 12);

      // Draw selection bounding boxes and stretch handles if active selection
      if (isSelected) {
        ctx.strokeStyle = '#FFCD00';
        ctx.fillStyle = '#FFCD00';
        ctx.lineWidth = 1;
        // Handle dots at corners
        ctx.fillRect(-el.width/2 - 4, -el.height/2 - 4, 8, 8); // TL
        ctx.fillRect(el.width/2 - 4, -el.height/2 - 4, 8, 8);  // TR
        ctx.fillRect(-el.width/2 - 4, el.height/2 - 4, 8, 8);  // BL
        ctx.fillRect(el.width/2 - 4, el.height/2 - 4, 8, 8);   // BR

        // Draw rotating handle
        ctx.beginPath();
        ctx.moveTo(0, -el.height/2);
        ctx.lineTo(0, -el.height/2 - 15);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -el.height/2 - 18, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });

    // 4. Render Active Temp Shape (Drawing)
    if (isDrawingShape) {
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushWidth;
      ctx.fillStyle = 'rgba(255, 205, 0, 0.1)';
      ctx.beginPath();
      
      const w = shapeCurrent.x - shapeStart.x;
      const h = shapeCurrent.y - shapeStart.y;

      if (activeTool === 'rect') {
        ctx.rect(shapeStart.x, shapeStart.y, w, h);
        ctx.fill();
        ctx.stroke();
        
        // Show dimensions instantly!
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`${(Math.abs(w)/10).toFixed(1)}m x ${(Math.abs(h)/10).toFixed(1)}m`, shapeStart.x + w/2, shapeStart.y + h/2);
      } else if (activeTool === 'circle') {
        const radius = Math.sqrt(w*w + h*h);
        ctx.arc(shapeStart.x, shapeStart.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`r: ${(radius/10).toFixed(1)}m`, shapeStart.x, shapeStart.y);
      } else if (activeTool === 'line') {
        ctx.moveTo(shapeStart.x, shapeStart.y);
        ctx.lineTo(shapeCurrent.x, shapeCurrent.y);
        ctx.stroke();

        const len = Math.sqrt(w*w + h*h);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`${(len/10).toFixed(1)}m`, shapeStart.x + w/2, shapeStart.y + h/2 - 5);
      }
    }
  };

  // Draw 3D Isometric projected visual scene (The "Render" engine!)
  const draw3DIsometric = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Elegant dark grid projection
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    
    // Draw isometric grid lines
    const space = 30;
    for (let i = -width; i < width * 2; i += space) {
      // Slanted lines right
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + height * 1.732, height);
      ctx.stroke();

      // Slanted lines left
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i - height * 1.732, height);
      ctx.stroke();
    }

    // Compass indicator
    ctx.strokeStyle = '#FFCD00';
    ctx.fillStyle = '#FFCD00';
    ctx.font = '9px monospace';
    ctx.fillText('N', width - 40, 50);
    ctx.beginPath();
    ctx.moveTo(width - 40, 55);
    ctx.lineTo(width - 25, 65);
    ctx.moveTo(width - 40, 55);
    ctx.lineTo(width - 55, 65);
    ctx.stroke();

    // Sort element by distance from top-left (y + x/2) to render front-most elements last (painter's algorithm)
    const sortedElements = [...canvasElements].sort((a, b) => {
      const depthA = a.y + a.x * 0.5;
      const depthB = b.y + b.x * 0.5;
      return depthA - depthB;
    });

    sortedElements.forEach((el) => {
      // Isometric projection mathematics
      // x_iso = (x - y) * cos(30)
      // y_iso = (x + y) * sin(30) - z
      // We project el.x and el.y from the 2D plane onto the isometric coordinate system.
      // For simplified, fast isometric blocks rendering in modern canvas:
      const isoX = el.x;
      const isoY = el.y + 30; // Push down slightly for center
      const w = el.width;
      const h = el.height;
      const d = el.depth || 30; // Height/depth of the extruded block

      ctx.save();
      ctx.translate(isoX, isoY);

      const colorBase = el.color || '#7E7E7E';
      
      // Calculate shaded color panels for rich elite look
      const adjustBrightness = (hex: string, percent: number) => {
        let R = parseInt(hex.substring(1, 3), 16);
        let G = parseInt(hex.substring(3, 5), 16);
        let B = parseInt(hex.substring(5, 7), 16);

        R = Math.min(255, Math.max(0, R + percent));
        G = Math.min(255, Math.max(0, G + percent));
        B = Math.min(255, Math.max(0, B + percent));

        const rHex = R.toString(16).padStart(2, '0');
        const gHex = G.toString(16).padStart(2, '0');
        const bHex = B.toString(16).padStart(2, '0');

        return `#${rHex}${gHex}${bHex}`;
      };

      const topColor = colorBase;
      const leftColor = adjustBrightness(colorBase, -30);
      const rightColor = adjustBrightness(colorBase, -15);

      // 1. Draw pseudo 3D shadow on ground
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.moveTo(-w/2, h/2);
      ctx.lineTo(0, h/2 + h/4);
      ctx.lineTo(w/2, h/2);
      ctx.lineTo(0, h/2 - h/4);
      ctx.closePath();
      ctx.fill();

      // 2. Draw Front-Left Face
      ctx.fillStyle = leftColor;
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-w/2, h/4);
      ctx.lineTo(0, h/2);
      ctx.lineTo(0, h/2 - d);
      ctx.lineTo(-w/2, h/4 - d);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 3. Draw Front-Right Face
      ctx.fillStyle = rightColor;
      ctx.beginPath();
      ctx.moveTo(0, h/2);
      ctx.lineTo(w/2, h/4);
      ctx.lineTo(w/2, h/4 - d);
      ctx.lineTo(0, h/2 - d);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 4. Draw Top Face
      ctx.fillStyle = topColor;
      ctx.beginPath();
      ctx.moveTo(-w/2, h/4 - d);
      ctx.lineTo(0, -d);
      ctx.lineTo(w/2, h/4 - d);
      ctx.lineTo(0, h/2 - d);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Textures or material finishes detailing
      if (el.finish === 'glass') {
        // Gleam lines on glass
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.moveTo(-w/4, h/6 - d);
        ctx.lineTo(w/4, h/3 - d);
        ctx.stroke();
      } else if (el.finish === 'water') {
        // Pool water concentric circles
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.ellipse(0, h/4 - d, w/3, h/6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Element Label
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(el.name.toUpperCase(), 0, -d - 10);
      ctx.fillStyle = '#FFCD00';
      ctx.fillText(`H: ${(d/10).toFixed(1)}m`, 0, -d - 2);

      ctx.restore();
    });
  };

  // ----------------------------------------------------
  // MOUSE & TOUCH EVENT HANDLERS FOR CANVAS
  // ----------------------------------------------------
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || viewMode === '3D') return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // A. BRUSH TOOLS
    if (activeTool === 'brush' || activeTool === 'highlighter') {
      setIsDrawingStroke(true);
      setCurrentStrokePoints([{ x, y }]);
      return;
    }

    // B. ERASER TOOL
    if (activeTool === 'eraser') {
      // Find and remove elements or lines clicked on
      setCanvasElements(prev => prev.filter(el => {
        const dx = el.x - x;
        const dy = el.y - y;
        return Math.sqrt(dx*dx + dy*dy) > 30; // distance threshold
      }));
      return;
    }

    // C. GEOMETRIC SHAPES CREATION
    if (['rect', 'circle', 'line'].includes(activeTool)) {
      setIsDrawingShape(true);
      setShapeStart({ x, y });
      setShapeCurrent({ x, y });
      return;
    }

    // D. SELECT / MOVE / RESIZE TOOL
    if (activeTool === 'select') {
      // Check handles first if an element is already selected
      if (selectedElementId) {
        const el = canvasElements.find(e => e.id === selectedElementId);
        if (el) {
          // Simplify check for BR resize handle
          const brX = el.x + el.width / 2;
          const brY = el.y + el.height / 2;
          const dist = Math.sqrt((x - brX)**2 + (y - brY)**2);
          if (dist < 15) {
            setIsResizingElement(true);
            setResizeHandle('br');
            return;
          }
        }
      }

      // Check click on any element (bottom to top, so front-most gets clicked)
      const clickedEl = [...canvasElements].reverse().find(el => {
        const halfW = el.width / 2;
        const halfH = el.height / 2;
        // Basic rectangular bound check
        const inX = x >= el.x - halfW && x <= el.x + halfW;
        const inY = y >= el.y - halfH && y <= el.y + halfH;
        return inX && inY;
      });

      if (clickedEl) {
        setSelectedElementId(clickedEl.id);
        setIsDraggingElement(true);
        setDragOffset({
          x: x - clickedEl.x,
          y: y - clickedEl.y
        });
      } else {
        setSelectedElementId(null);
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || viewMode === '3D') return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // A. Draw Brush Line
    if (isDrawingStroke && (activeTool === 'brush' || activeTool === 'highlighter')) {
      const updatedPoints = [...currentStrokePoints, { x, y }];
      setCurrentStrokePoints(updatedPoints);
      
      // Real-time canvas drawing update
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (activeTool === 'highlighter') ctx.globalAlpha = 0.35;
        ctx.moveTo(currentStrokePoints[currentStrokePoints.length - 1].x, currentStrokePoints[currentStrokePoints.length - 1].y);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
      return;
    }

    // B. Draw Temp Shape
    if (isDrawingShape) {
      setShapeCurrent({ x, y });
      return;
    }

    // C. Resize Element
    if (isResizingElement && selectedElementId) {
      setCanvasElements(prev => prev.map(el => {
        if (el.id === selectedElementId) {
          const newW = Math.max(20, (x - el.x) * 2);
          const newH = Math.max(20, (y - el.y) * 2);
          return {
            ...el,
            width: newW,
            height: newH,
            depth: el.category === 'mamposteria' ? newW * 0.7 : el.depth
          };
        }
        return el;
      }));
      return;
    }

    // D. Drag/Move Element
    if (isDraggingElement && selectedElementId) {
      setCanvasElements(prev => prev.map(el => {
        if (el.id === selectedElementId) {
          return {
            ...el,
            x: x - dragOffset.x,
            y: y - dragOffset.y
          };
        }
        return el;
      }));
    }
  };

  const handleCanvasMouseUp = () => {
    // Save drawn strokes
    if (isDrawingStroke) {
      setStrokes(prev => [...prev, {
        points: currentStrokePoints,
        color: brushColor,
        width: brushWidth,
        isHighlighter: activeTool === 'highlighter'
      }]);
      setIsDrawingStroke(false);
      setCurrentStrokePoints([]);
    }

    // Save drawn geometric shape as full design library elements
    if (isDrawingShape) {
      const w = Math.abs(shapeCurrent.x - shapeStart.x);
      const h = Math.abs(shapeCurrent.y - shapeStart.y);
      const cenX = shapeStart.x + (shapeCurrent.x - shapeStart.x) / 2;
      const cenY = shapeStart.y + (shapeCurrent.y - shapeStart.y) / 2;

      let elType = 'rect';
      let elName = 'Rectángulo Geométrico';
      if (activeTool === 'circle') {
        elType = 'circle';
        elName = 'Círculo Geométrico';
      } else if (activeTool === 'line') {
        elType = 'line';
        elName = 'Línea Guía';
      }

      const newEl: CanvasElement = {
        id: `shape-${Date.now()}`,
        type: elType,
        category: 'mamposteria',
        name: elName,
        x: cenX,
        y: cenY,
        width: Math.max(15, w),
        height: Math.max(15, h),
        rotation: 0,
        depth: 20,
        finish: 'default',
        color: brushColor
      };

      setCanvasElements(prev => [...prev, newEl]);
      setIsDrawingShape(false);
      setSelectedElementId(newEl.id);
      setActiveTool('select');
    }

    setIsDraggingElement(false);
    setIsResizingElement(false);
    setResizeHandle(null);
  };

  // Drag and drop library elements onto canvas
  const addLibraryElement = (libItem: any) => {
    const newEl: CanvasElement = {
      id: `el-${Date.now()}`,
      type: libItem.type,
      category: libItem.category || 'mamposteria',
      name: libItem.name,
      x: 200 + Math.random() * 80,
      y: 150 + Math.random() * 80,
      width: libItem.width,
      height: libItem.height,
      rotation: 0,
      depth: libItem.depth,
      finish: libItem.finish,
      color: libItem.color
    };

    setCanvasElements(prev => [...prev, newEl]);
    setSelectedElementId(newEl.id);
  };

  const deleteSelectedElement = () => {
    if (selectedElementId) {
      setCanvasElements(prev => prev.filter(el => el.id !== selectedElementId));
      setSelectedElementId(null);
    }
  };

  const rotateSelectedElement = () => {
    if (selectedElementId) {
      setCanvasElements(prev => prev.map(el => {
        if (el.id === selectedElementId) {
          return {
            ...el,
            rotation: (el.rotation + 45) % 360
          };
        }
        return el;
      }));
    }
  };

  const changeElementFinish = (finish: 'concrete' | 'brick' | 'metal' | 'wood' | 'glass' | 'water') => {
    const finishColors = {
      concrete: '#7E7E7E',
      brick: '#D2691E',
      metal: '#4A5568',
      wood: '#8B4513',
      glass: '#87CEEB',
      water: '#00FFFF'
    };

    if (selectedElementId) {
      setCanvasElements(prev => prev.map(el => {
        if (el.id === selectedElementId) {
          return {
            ...el,
            finish,
            color: finishColors[finish]
          };
        }
        return el;
      }));
    }
  };

  const clearWholeCanvas = () => {
    if (window.confirm('¿ESTÁS SEGURO DE BORRAR POR COMPLETO EL CANVAS DE DISEÑO?')) {
      setCanvasElements([]);
      setStrokes([]);
      setSelectedElementId(null);
    }
  };

  // ----------------------------------------------------
  // INVOICE HANDLERS (FACTURERO)
  // ----------------------------------------------------
  const addInvoiceItem = () => {
    const newItem: InvoiceItem = {
      id: Date.now().toString(),
      description: 'NUEVO RUBRO REQUERIDO DE OBRA',
      quantity: 1,
      price: 150
    };
    setItems(prev => [...prev, newItem]);
  };

  const updateInvoiceItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(prev => prev.map(it => {
      if (it.id === id) {
        return {
          ...it,
          [field]: field === 'price' || field === 'quantity' ? Number(value) : value
        };
      }
      return it;
    }));
  };

  const deleteInvoiceItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  // Calculation formulas
  const subtotal = items.reduce((acc, it) => acc + (it.quantity * it.price), 0);
  const ivaAmount = subtotal * (ivaPercentage / 100);
  const grandTotal = subtotal + ivaAmount;

  // ----------------------------------------------------
  // SIGNATURE BOARD DRAWING
  // ----------------------------------------------------
  const [isDrawingSigAdmin, setIsDrawingSigAdmin] = useState(false);
  const [isDrawingSigClient, setIsDrawingSigClient] = useState(false);

  const startSigDraw = (type: 'admin' | 'client') => {
    if (type === 'admin') setIsDrawingSigAdmin(true);
    else setIsDrawingSigClient(true);
  };

  const drawSig = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, type: 'admin' | 'client') => {
    const canvas = type === 'admin' ? signatureAdminCanvasRef.current : signatureClientCanvasRef.current;
    const isDrawing = type === 'admin' ? isDrawingSigAdmin : isDrawingSigClient;
    if (!canvas || !isDrawing) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x, y;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#FFFFFF'; // Clean white ink for premium digital sign look
    ctx.lineCap = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const stopSigDraw = (type: 'admin' | 'client') => {
    if (type === 'admin') {
      setIsDrawingSigAdmin(false);
      // Capture signature base64
      const canvas = signatureAdminCanvasRef.current;
      if (canvas) {
        setAdminSignature(canvas.toDataURL());
      }
    } else {
      setIsDrawingSigClient(false);
      const canvas = signatureClientCanvasRef.current;
      if (canvas) {
        setClientSignature(canvas.toDataURL());
      }
    }
  };

  const clearSignature = (type: 'admin' | 'client') => {
    if (type === 'admin') {
      setAdminSignature(null);
      const canvas = signatureAdminCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      setClientSignature(null);
      const canvas = signatureClientCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  // ----------------------------------------------------
  // FILE UPLOAD FOR EXCLUDING PDF / PRE-BUILT DOC
  // ----------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedPdfName(file.name);
      setAttachedPdfSize((file.size / (1024 * 1024)).toFixed(2) + ' MB');
    }
  };

  // ----------------------------------------------------
  // FIREBASE SAVE / SUBMIT DRAFT
  // ----------------------------------------------------
  const saveDraft = async (isAutosave: boolean = false) => {
    if (!budget?.id) return;
    if (!isAutosave) setIsSaving(true);

    try {
      const budgetRef = doc(db, 'budgets', budget.id);

      // Construct payload
      const draftInvoice = {
        items,
        ivaPercentage,
        additionalTerms,
        adminSignature,
        clientSignature,
        requireClientSignature,
        attachedPdfName,
        attachedPdfSize,
        totalUSD: grandTotal
      };

      const draftCanvas = {
        elements: canvasElements,
        strokes
      };

      // Calculate new total to reflect onto main budget card
      const updatedFields: any = {
        draftInvoice,
        draftCanvas,
        montoTotal: grandTotal, // Auto update main price in USD
        isDraftActive: true,
        lastSavedDraft: new Date().toISOString()
      };

      // If signed by both, we can flag confirmed or let admin auto-approve it
      if (adminSignature && (!requireClientSignature || clientSignature)) {
        updatedFields.signature = clientSignature || adminSignature; // map to standard signature field
        updatedFields.confirmed = true;
      }

      await updateDoc(budgetRef, updatedFields);

      const d = new Date();
      setLastSaved(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`);

      if (!isAutosave && onSaveSuccess) {
        onSaveSuccess({ ...budget, ...updatedFields });
      }
    } catch (error) {
      console.error("Error saving draft design budget:", error);
    } finally {
      if (!isAutosave) setIsSaving(false);
    }
  };

  return (
    <div className={`fixed bg-black z-[9999] flex flex-col transition-all duration-500 overflow-hidden ${
      isMinimized 
        ? 'h-16 w-80 bottom-5 right-5 top-auto left-auto rounded-3xl border-2 border-[#FFCD00] shadow-[0_0_30px_rgba(255,205,0,0.4)]' 
        : 'top-0 left-0 w-full h-full'
    }`}>
      
      {/* 1. MINIMIZED FLOATING PILL */}
      {isMinimized ? (
        <div 
          onClick={() => setIsMinimized(false)}
          className="w-full h-full flex items-center justify-between px-5 bg-zinc-950 cursor-pointer hover:bg-zinc-900 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 bg-[#FFCD00] rounded-full animate-pulse" />
            <div className="text-left">
              <p className="text-[9px] font-black uppercase text-[#FFCD00] tracking-wider">DISEÑO ACTIVO</p>
              <p className="text-[7.5px] font-bold text-white/55 uppercase truncate max-w-[120px]">{budget?.cliente || 'SIN CLIENTE'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(false);
              }}
              title="Maximizar"
              className="p-1.5 bg-zinc-900 hover:bg-[#FFCD00] hover:text-black rounded-lg transition-all text-[#FFCD00]"
            >
              <Maximize2 size={12} />
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Cerrar y dejar en bitácora"
              className="p-1.5 bg-zinc-900 hover:bg-red-600 hover:text-white rounded-lg transition-all text-white/50"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      ) : (
        /* 2. FULLSCREEN ACTIVE WORKSPACE */
        <div className="flex-1 flex flex-col bg-black">
          
          {/* HEADER BAR */}
          <div className="bg-zinc-950 px-6 py-4 border-b border-white/5 flex items-center justify-between z-10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#FFCD00] rounded-xl flex items-center justify-center text-black font-black italic text-lg shadow-[0_0_15px_rgba(255,205,0,0.3)]">A</div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase text-[#FFCD00] tracking-widest italic">ESTACIÓN DE DISEÑO & PRESUPUESTACIÓN</span>
                  <span className="px-2 py-0.5 bg-red-600 text-white text-[6px] font-black uppercase rounded-md tracking-wider">MODO ADMINISTRADOR</span>
                </div>
                <h2 className="text-[9px] font-bold text-white/50 uppercase tracking-widest mt-0.5">ESTACIÓN EXCLUSIVA PARA EL CONTROL INTEGRAL DE EXPEDIENTES</h2>
              </div>
            </div>

            {/* Save Status & Action Controls */}
            <div className="flex items-center gap-3">
              {lastSaved && (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-[7.5px] font-black text-white/40 uppercase">AUTOGUARDADO ACTIVO • {lastSaved}</span>
                </div>
              )}

              {/* SAVE / FLOPPY BUTTON */}
              <button 
                onClick={() => saveDraft(false)}
                className="p-3 bg-[#FFCD00] hover:bg-[#FFE066] text-black rounded-xl font-black text-xs active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-[#FFCD00]/20"
              >
                <Save size={14} className={isSaving ? "animate-spin" : ""} />
                <span className="hidden md:inline uppercase text-[9px] tracking-widest">GUARDAR RESPALDO</span>
              </button>

              <button 
                onClick={() => setIsMinimized(true)} 
                title="Minimizar para consultar"
                className="p-3 bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-white/70 rounded-xl active:scale-95 transition-all"
              >
                <Minimize2 size={14} />
              </button>

              <button 
                onClick={onClose} 
                className="p-3 bg-red-600/20 border border-red-500/20 hover:bg-red-600 text-white rounded-xl active:scale-95 transition-all"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* ACTIVE STUDIO SUB-BAR WITH CLIENT DETAILS */}
          <div className="bg-zinc-900/60 px-6 py-3 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[6px] font-black text-[#FFCD00] uppercase tracking-widest">EXPEDIENTE DEL CLIENTE</p>
                <p className="text-xs font-black text-white uppercase mt-0.5 tracking-wide">{budget?.cliente || 'SIN CLIENTE'}</p>
              </div>
              <div className="h-6 w-px bg-white/5 hidden sm:block" />
              <div className="hidden sm:block">
                <p className="text-[6px] font-black text-white/30 uppercase tracking-widest">IDENTIFICADOR</p>
                <p className="text-[9px] font-mono text-white/70 uppercase mt-0.5">{budget?.idDocumento || budget?.id || 'REF-N/A'}</p>
              </div>
              <div className="h-6 w-px bg-white/5 hidden md:block" />
              <div className="hidden md:block">
                <p className="text-[6px] font-black text-white/30 uppercase tracking-widest">TELEFONO / EMAIL</p>
                <p className="text-[9px] font-black text-white/70 uppercase mt-0.5">{budget?.telefono || 'S/N'} • {budget?.email || 'S/E'}</p>
              </div>
            </div>

            {/* TAB SELECTOR */}
            <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5">
              <button 
                onClick={() => setActiveTab('invoice')}
                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                  activeTab === 'invoice' ? 'bg-[#FFCD00] text-black shadow-lg shadow-[#FFCD00]/10' : 'text-white/40 hover:text-white'
                }`}
              >
                <FileText size={12} />
                FACTURERO ELITE
              </button>
              <button 
                onClick={() => setActiveTab('canvas')}
                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                  activeTab === 'canvas' ? 'bg-[#FFCD00] text-black shadow-lg shadow-[#FFCD00]/10' : 'text-white/40 hover:text-white'
                }`}
              >
                <Box size={12} />
                DIBUJO 2D/3D (TENDER)
              </button>
            </div>
          </div>

          {/* MAIN CONTAINER PANEL */}
          <div className="flex-1 overflow-hidden relative flex">
            
            {/* ======================================================== */}
            {/* TAB 1: INVOICE STUDIO (FACTURERO PREMIUM) */}
            {/* ======================================================== */}
            {activeTab === 'invoice' && (
              <div className="flex-1 w-full h-full overflow-y-auto p-4 md:p-10 bg-black flex flex-col items-center overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                
                <div className="w-full max-w-4xl bg-zinc-950 border-2 border-[#FFCD00]/15 rounded-[3rem] p-8 md:p-12 shadow-[0_0_80px_rgba(255,205,0,0.03)] text-left relative overflow-hidden">
                  
                  {/* Decorative background logo */}
                  <div className="absolute top-10 right-10 opacity-5 pointer-events-none">
                    <span className="text-8xl font-black italic text-white leading-none">CONSTRUACHA</span>
                  </div>

                  {/* Header within invoice sheet */}
                  <div className="flex flex-col md:flex-row justify-between items-start border-b-2 border-white/5 pb-8 mb-8 gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl font-black italic tracking-tighter text-[#FFCD00]">CONSTRUACHA</span>
                        <span className="text-[9px] font-black uppercase border border-white/20 px-2.5 py-0.5 rounded text-white/55">ESTUDIO PREMIUM</span>
                      </div>
                      <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest leading-relaxed">
                        RIF: J-50472910-3 • CONSTRUCCIÓN, ELECTRICIDAD & ARQUITECTURA ELITE
                      </p>
                    </div>
                    
                    <div className="text-left md:text-right space-y-1">
                      <p className="text-[6.5px] font-black text-[#FFCD00] uppercase tracking-widest">PROPUESTA DE PRESUPUESTO</p>
                      <h3 className="text-xl font-mono font-black text-white">{budget?.id ? `N° C-${budget.id.substring(0,8).toUpperCase()}` : 'N° COT-2026-001'}</h3>
                      <p className="text-[8px] font-black text-white/40 uppercase">FECHA EMISIÓN: {budget?.fecha || 'HOY'}</p>
                    </div>
                  </div>

                  {/* Preloaded client parameters section */}
                  <div className="bg-white/5 rounded-3xl p-6 border border-white/5 grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div>
                      <p className="text-[6px] font-black text-[#FFCD00] uppercase tracking-widest mb-1.5">DATOS DEL DESTINATARIO</p>
                      <h4 className="text-sm font-black text-white uppercase">{budget?.cliente || 'S/N'}</h4>
                      <p className="text-[9px] font-black text-white/40 uppercase mt-1">CÉDULA/RIF: {budget?.idDocumento || 'S/N'}</p>
                      <p className="text-[9px] font-black text-white/40 uppercase">{budget?.tipo || 'CLIENTE EXCLUSIVO'}</p>
                    </div>
                    <div>
                      <p className="text-[6px] font-black text-[#FFCD00] uppercase tracking-widest mb-1.5">ESPECIFICACIONES DE OBRA</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(budget?.servicios || ['CONSTRUCCIÓN GENERAL']).map((s: string) => (
                          <span key={s} className="px-2.5 py-1 bg-black/40 border border-white/5 rounded-lg text-[7px] font-black uppercase text-white/70">{s}</span>
                        ))}
                      </div>
                      <p className="text-[9px] font-black text-[#FFCD00] uppercase italic mt-2">DETERMINACIÓN EN DÓLARES AMERICANOS ($)</p>
                    </div>
                  </div>

                  {/* Facturero Items Table */}
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2.5 px-3">
                      <h4 className="text-[9px] font-black uppercase tracking-widest text-[#FFCD00]">DESGLOSE REQUERIDO DE RUBROS</h4>
                      <button 
                        onClick={addInvoiceItem}
                        className="px-3 py-1 bg-[#FFCD00]/20 hover:bg-[#FFCD00] hover:text-black rounded-lg text-[8px] font-black uppercase text-[#FFCD00] transition-colors flex items-center gap-1.5"
                      >
                        <Plus size={10} /> AGREGAR RENGLÓN
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {items.map((it, index) => (
                        <div key={it.id} className="flex flex-col md:flex-row items-center gap-3 bg-black/40 p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                          <span className="w-6 h-6 rounded-full bg-white/5 text-white/40 font-black text-[9px] flex items-center justify-center shrink-0">{index + 1}</span>
                          
                          <div className="flex-1 w-full">
                            <input 
                              type="text" 
                              value={it.description}
                              onChange={(e) => updateInvoiceItem(it.id, 'description', e.target.value)}
                              placeholder="DESCRIPCIÓN DEL MATERIAL O SERVICIO..."
                              className="w-full bg-transparent border-b border-white/10 focus:border-[#FFCD00] text-[10px] font-bold text-white uppercase outline-none py-1 transition-colors"
                            />
                          </div>

                          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                            <div className="w-20 shrink-0">
                              <p className="text-[5.5px] font-black text-white/30 uppercase tracking-widest mb-0.5 text-center">CANTIDAD</p>
                              <input 
                                type="number" 
                                value={it.quantity}
                                onChange={(e) => updateInvoiceItem(it.id, 'quantity', e.target.value)}
                                className="w-full bg-white/5 border border-white/5 rounded-lg text-center font-mono font-bold text-white py-1.5 text-[10px]"
                              />
                            </div>

                            <div className="w-24 shrink-0">
                              <p className="text-[5.5px] font-black text-[#FFCD00] uppercase tracking-widest mb-0.5 text-center">COSTO UNIT ($)</p>
                              <div className="relative">
                                <span className="absolute left-2.5 top-2 text-[8px] font-black text-white/30">$</span>
                                <input 
                                  type="number" 
                                  value={it.price}
                                  onChange={(e) => updateInvoiceItem(it.id, 'price', e.target.value)}
                                  className="w-full bg-white/5 border border-white/5 rounded-lg text-right font-mono font-bold text-white py-1.5 pl-5 pr-2.5 text-[10px]"
                                />
                              </div>
                            </div>

                            <div className="w-24 text-right shrink-0">
                              <p className="text-[5.5px] font-black text-white/30 uppercase tracking-widest mb-0.5">SUBTOTAL</p>
                              <p className="font-mono font-black text-xs text-white/90 py-1.5">${(it.quantity * it.price).toLocaleString()}</p>
                            </div>

                            <button 
                              onClick={() => deleteInvoiceItem(it.id)}
                              className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg active:scale-95 transition-all self-end md:self-center"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Calculations Sheet & Legal terms */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-white/10">
                    
                    {/* Legal terms & attached files */}
                    <div className="space-y-4">
                      <div>
                        <p className="text-[6px] font-black text-[#FFCD00] uppercase tracking-widest mb-1.5">CONDICIONES LEGALES Y PLAZOS</p>
                        <textarea 
                          value={additionalTerms}
                          onChange={(e) => setAdditionalTerms(e.target.value)}
                          className="w-full h-24 bg-black/50 border border-white/5 rounded-2xl p-4 text-[9px] text-white/60 font-medium uppercase outline-none focus:border-[#FFCD00] transition-colors leading-relaxed"
                        />
                      </div>

                      {/* PDF Upload widget */}
                      <div className="bg-black/40 p-4 rounded-[2rem] border border-white/5">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h5 className="text-[8px] font-black uppercase text-white tracking-widest">ANEXAR ARCHIVO PDF (Opcional)</h5>
                            <p className="text-[6px] font-bold text-white/30 uppercase mt-0.5">Para planos hechos en computadora o pliego de bases</p>
                          </div>
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors border border-white/5"
                          >
                            <FileUp size={14} />
                          </button>
                          <input 
                            ref={fileInputRef} 
                            type="file" 
                            accept=".pdf" 
                            onChange={handleFileUpload} 
                            className="hidden" 
                          />
                        </div>

                        {attachedPdfName ? (
                          <div className="flex items-center justify-between bg-[#FFCD00]/5 border border-[#FFCD00]/25 rounded-xl p-3">
                            <div className="flex items-center gap-2">
                              <FileText size={14} className="text-[#FFCD00]" />
                              <div className="text-left">
                                <p className="text-[8px] font-black uppercase text-white truncate max-w-[150px]">{attachedPdfName}</p>
                                <p className="text-[5px] font-mono text-white/35 uppercase">{attachedPdfSize}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => { setAttachedPdfName(null); setAttachedPdfSize(null); }}
                              className="text-red-500 hover:text-red-400 p-1"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="text-center py-2.5 bg-black/20 border border-dashed border-white/5 rounded-xl">
                            <p className="text-[7.5px] font-bold text-white/20 uppercase tracking-wider">NINGÚN ARCHIVO ADJUNTO EN LA COTIZACIÓN</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Calculations Summary Sheet */}
                    <div className="space-y-4">
                      <div className="bg-black/50 p-6 rounded-[2.5rem] border border-white/5 space-y-4 text-right">
                        <div className="flex justify-between items-center pb-2 border-b border-white/5">
                          <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">SUBTOTAL BRUTO</span>
                          <span className="font-mono font-black text-sm text-white">${subtotal.toLocaleString()}</span>
                        </div>

                        <div className="flex justify-between items-center pb-2 border-b border-white/5 gap-4">
                          <span className="text-[8px] font-black text-[#FFCD00] uppercase tracking-widest">IMPUESTO DE LEY (IVA %)</span>
                          <div className="flex items-center gap-2 justify-end">
                            <input 
                              type="number" 
                              value={ivaPercentage} 
                              onChange={(e) => setIvaPercentage(Number(e.target.value))} 
                              className="w-12 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-center text-[10px] text-white font-mono font-bold"
                            />
                            <span className="text-[8px] font-black text-white/40 uppercase">%</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                          <span className="text-[10px] font-black text-[#FFCD00] uppercase tracking-[0.1em] italic">MONTO TOTAL ($)</span>
                          <span className="font-mono font-black text-xl text-[#FFCD00] shadow-[#FFCD00]/5">${grandTotal.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Legally Binding Digital Consent Checkbox */}
                      <div className="flex items-start gap-2.5 px-2">
                        <div className="pt-0.5">
                          <input 
                            type="checkbox" 
                            id="require-signature"
                            checked={requireClientSignature}
                            onChange={(e) => setRequireClientSignature(e.target.checked)}
                            className="rounded border-zinc-800 bg-zinc-950 text-[#FFCD00] focus:ring-[#FFCD00] h-3.5 w-3.5"
                          />
                        </div>
                        <label htmlFor="require-signature" className="text-[7.5px] font-bold text-white/40 uppercase leading-snug cursor-pointer select-none">
                          Requerir firma digital del cliente antes de que la propuesta pase automáticamente a aprobada en la base de datos de ConstruAcha.
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* DIGITAL SIGNATURES SPACE */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 pt-8 border-t border-white/10">
                    
                    {/* Admin Signature */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[7px] font-black text-[#FFCD00] uppercase tracking-widest flex items-center gap-1">
                          <ShieldCheck size={10} /> FIRMA DIGITAL AUTORIZADA (ADMIN)
                        </span>
                        {adminSignature && (
                          <button onClick={() => clearSignature('admin')} className="text-[6px] font-black text-red-500 uppercase hover:underline">REHACER</button>
                        )}
                      </div>

                      {adminSignature ? (
                        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4 flex items-center justify-center min-h-[110px] relative">
                          <img src={adminSignature} className="max-h-20 object-contain invert brightness-200" alt="Firma Admin" />
                          <span className="absolute bottom-1 right-2 text-[5px] font-black text-green-500 uppercase tracking-widest flex items-center gap-0.5"><Check size={6}/> VALIDADA</span>
                        </div>
                      ) : (
                        <div className="bg-zinc-900 border border-dashed border-white/10 rounded-2xl relative overflow-hidden flex flex-col items-center">
                          <canvas 
                            ref={signatureAdminCanvasRef}
                            width={380}
                            height={110}
                            onMouseDown={() => startSigDraw('admin')}
                            onMouseMove={(e) => drawSig(e, 'admin')}
                            onMouseUp={() => stopSigDraw('admin')}
                            onTouchStart={() => startSigDraw('admin')}
                            onTouchMove={(e) => drawSig(e, 'admin')}
                            onTouchEnd={() => stopSigDraw('admin')}
                            className="w-full h-[110px] bg-black/40 cursor-crosshair relative z-10"
                          />
                          <p className="absolute text-[7px] font-black text-white/10 uppercase tracking-widest pointer-events-none text-center select-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                            DIBUJE SU FIRMA AQUÍ
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Client Signature */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[7px] font-black text-white/50 uppercase tracking-widest flex items-center gap-1">
                          <Heart size={10} /> FIRMA DEL CLIENTE AL RECIBIR
                        </span>
                        {clientSignature && (
                          <button onClick={() => clearSignature('client')} className="text-[6px] font-black text-red-500 uppercase hover:underline">REHACER</button>
                        )}
                      </div>

                      {clientSignature ? (
                        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4 flex items-center justify-center min-h-[110px] relative">
                          <img src={clientSignature} className="max-h-20 object-contain invert brightness-200" alt="Firma Cliente" />
                          <span className="absolute bottom-1 right-2 text-[5px] font-black text-green-500 uppercase tracking-widest flex items-center gap-0.5"><Check size={6}/> COMPLETADA</span>
                        </div>
                      ) : (
                        <div className="bg-zinc-900 border border-dashed border-white/10 rounded-2xl relative overflow-hidden flex flex-col items-center">
                          <canvas 
                            ref={signatureClientCanvasRef}
                            width={380}
                            height={110}
                            onMouseDown={() => startSigDraw('client')}
                            onMouseMove={(e) => drawSig(e, 'client')}
                            onMouseUp={() => stopSigDraw('client')}
                            onTouchStart={() => startSigDraw('client')}
                            onTouchMove={(e) => drawSig(e, 'client')}
                            onTouchEnd={() => stopSigDraw('client')}
                            className="w-full h-[110px] bg-black/40 cursor-crosshair relative z-10"
                          />
                          <p className="absolute text-[7px] font-black text-white/10 uppercase tracking-widest pointer-events-none text-center select-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                            {requireClientSignature ? 'REQUERIDO FIRMA DEL CLIENTE' : 'FIRMA CLIENTE (OPCIONAL)'}
                          </p>
                        </div>
                      )}
                    </div>

                  </div>

                </div>

              </div>
            )}

            {/* ======================================================== */}
            {/* TAB 2: INTERACTIVE DESIGN STUDIO (TENDER BOARD) */}
            {/* ======================================================== */}
            {activeTab === 'canvas' && (
              <div className="flex-1 flex overflow-hidden">
                
                {/* A. LEFT TOOLBAR PANEL */}
                <div className="w-64 bg-zinc-950 border-r border-white/5 flex flex-col shrink-0 overflow-y-auto">
                  
                  {/* View Mode Toggle (2D/3D Render) */}
                  <div className="p-4 border-b border-white/5 space-y-2">
                    <p className="text-[6px] font-black text-white/40 uppercase tracking-widest">MODO DE VISUALIZACIÓN</p>
                    <div className="grid grid-cols-2 gap-2 bg-black p-1 rounded-xl">
                      <button 
                        onClick={() => setViewMode('2D')}
                        className={`py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                          viewMode === '2D' ? 'bg-[#FFCD00] text-black' : 'text-white/40 hover:text-white'
                        }`}
                      >
                        VISTA 2D PLANO
                      </button>
                      <button 
                        onClick={() => setViewMode('3D')}
                        className={`py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                          viewMode === '3D' ? 'bg-[#FFCD00] text-black shadow-[0_0_10px_rgba(255,205,0,0.2)]' : 'text-white/40 hover:text-white'
                        }`}
                      >
                        RENDER 3D
                      </button>
                    </div>
                  </div>

                  {/* Active Tool Select */}
                  <div className="p-4 border-b border-white/5 space-y-2">
                    <p className="text-[6px] font-black text-[#FFCD00] uppercase tracking-widest">HERRAMIENTAS DE DIBUJO</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: 'select', icon: <Compass size={14} />, label: 'Selec' },
                        { id: 'brush', icon: <PenTool size={14} />, label: 'Lápiz' },
                        { id: 'highlighter', icon: <Sparkles size={14} />, label: 'Resalt' },
                        { id: 'eraser', icon: <Eraser size={14} />, label: 'Borr' },
                        { id: 'rect', icon: <Square size={14} />, label: 'Rect' },
                        { id: 'circle', icon: <Circle size={14} />, label: 'Circ' },
                        { id: 'line', icon: <Ruler size={14} />, label: 'Regla' },
                      ].map((t) => (
                        <button 
                          key={t.id}
                          onClick={() => {
                            setActiveTool(t.id as any);
                            if (t.id !== 'select') setSelectedElementId(null);
                          }}
                          className={`p-2 rounded-xl flex flex-col items-center justify-center border transition-all ${
                            activeTool === t.id 
                              ? 'bg-[#FFCD00] text-black border-[#FFCD00]' 
                              : 'bg-black/30 border-white/5 text-white/50 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          {t.icon}
                          <span className="text-[5.5px] font-black uppercase mt-1 tracking-widest">{t.label}</span>
                        </button>
                      ))}
                      <button 
                        onClick={clearWholeCanvas}
                        className="p-2 rounded-xl flex flex-col items-center justify-center border bg-red-600/15 border-red-500/20 text-red-500 hover:bg-red-600 hover:text-white transition-all"
                      >
                        <RotateCcw size={14} />
                        <span className="text-[5.5px] font-black uppercase mt-1 tracking-widest">Limp</span>
                      </button>
                    </div>
                  </div>

                  {/* Stroke styling controls */}
                  {(activeTool === 'brush' || activeTool === 'highlighter') && (
                    <div className="p-4 border-b border-white/5 space-y-3 animate-in fade-in duration-300">
                      <p className="text-[6px] font-black text-white/40 uppercase tracking-widest">CONFIGURAR PINCEL</p>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-[7.5px] font-black text-white/50 uppercase">GROSOR: {brushWidth}px</span>
                        <input 
                          type="range" 
                          min={2} 
                          max={15} 
                          value={brushWidth} 
                          onChange={(e) => setBrushWidth(Number(e.target.value))} 
                          className="w-24 accent-[#FFCD00]"
                        />
                      </div>

                      <div className="space-y-1">
                        <span className="text-[7.5px] font-black text-white/50 uppercase">COLOR ACTIVO</span>
                        <div className="flex gap-1.5 flex-wrap">
                          {['#FFCD00', '#FF4500', '#00FFFF', '#228B22', '#FFFFFF', '#FF00FF'].map((c) => (
                            <button 
                              key={c}
                              onClick={() => setBrushColor(c)}
                              className={`w-6 h-6 rounded-full border-2 transition-all ${brushColor === c ? 'border-[#FFCD00] scale-110' : 'border-transparent'}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Element Library (Pre-designed items) */}
                  <div className="flex-1 p-4 space-y-4">
                    <div>
                      <p className="text-[6.5px] font-black text-[#FFCD00] uppercase tracking-widest mb-2 flex items-center gap-1">
                        <Grid3X3 size={11} /> ESTRUCTURA & MAMPOSTERÍA
                      </p>
                      <div className="space-y-1">
                        {elementLibrary.mamposteria.map((el) => (
                          <button 
                            key={el.type}
                            onClick={() => addLibraryElement({ ...el, category: 'mamposteria' })}
                            className="w-full p-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-[#FFCD00]/20 rounded-xl text-left flex items-center justify-between group transition-all"
                          >
                            <span className="text-[8px] font-black uppercase text-white/80 group-hover:text-white">{el.name}</span>
                            <span className="text-[6.5px] font-mono text-[#FFCD00]">{el.width/10}m</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[6.5px] font-black text-[#FFCD00] uppercase tracking-widest mb-2 flex items-center gap-1">
                        <Layers size={11} /> ABERTURAS & HERRAJES
                      </p>
                      <div className="space-y-1">
                        {elementLibrary.aberturas.map((el) => (
                          <button 
                            key={el.type}
                            onClick={() => addLibraryElement({ ...el, category: 'aberturas' })}
                            className="w-full p-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-[#FFCD00]/20 rounded-xl text-left flex items-center justify-between group transition-all"
                          >
                            <span className="text-[8px] font-black uppercase text-white/80 group-hover:text-white">{el.name}</span>
                            <span className="text-[6.5px] font-mono text-[#FFCD00]">{el.width/10}m</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[6.5px] font-black text-[#FFCD00] uppercase tracking-widest mb-2 flex items-center gap-1">
                        <Ruler size={11} /> EQUIPAMIENTO & ENTORNO
                      </p>
                      <div className="space-y-1">
                        {elementLibrary.entorno.map((el) => (
                          <button 
                            key={el.type}
                            onClick={() => addLibraryElement({ ...el, category: 'entorno' })}
                            className="w-full p-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-[#FFCD00]/20 rounded-xl text-left flex items-center justify-between group transition-all"
                          >
                            <span className="text-[8px] font-black uppercase text-white/80 group-hover:text-white">{el.name}</span>
                            <span className="text-[6.5px] font-mono text-white/40">{el.width/10}m</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>

                {/* B. CENTRAL CANVAS INTERACTION BOARD */}
                <div className="flex-1 bg-[#09090B] flex flex-col items-center justify-center relative p-6 overflow-hidden">
                  
                  {/* Canvas container with limits */}
                  <div className="relative bg-[#030303] border-2 border-white/5 rounded-[2.5rem] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
                    
                    {/* Floating HUD status indicator inside canvas */}
                    <div className="absolute top-6 left-6 z-10 flex items-center gap-2 bg-zinc-950/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                      <div className="w-1.5 h-1.5 bg-[#FFCD00] rounded-full animate-ping" />
                      <span className="text-[8px] font-black text-[#FFCD00] uppercase tracking-widest italic">{viewMode} WORKSTATION</span>
                      <span className="text-[8px] font-black text-white/40">|</span>
                      <span className="text-[8px] font-mono text-white/60 uppercase">{canvasElements.length} ELEMENTOS EN TABLA</span>
                    </div>

                    {/* Canvas Controls Header floating */}
                    <div className="absolute top-6 right-6 z-10 flex items-center gap-1 bg-zinc-950/80 backdrop-blur-md p-1.5 rounded-2xl border border-white/10">
                      <button 
                        onClick={() => setShowGrid(!showGrid)}
                        className={`p-2 rounded-xl text-xs transition-colors ${showGrid ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white'}`}
                        title="Alternar Retícula de Ingeniería"
                      >
                        <Grid size={13} />
                      </button>
                      <button 
                        onClick={() => setCanvasElements([])}
                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                        title="Borrar Todo el Render"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* The Interactive HTML5 Drawing Stage */}
                    <canvas 
                      ref={canvasRef}
                      width={800}
                      height={500}
                      onMouseDown={handleCanvasMouseDown}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      onMouseLeave={handleCanvasMouseUp}
                      className="cursor-crosshair max-w-full block"
                    />

                    {/* Help hint */}
                    <div className="absolute bottom-6 left-6 pointer-events-none opacity-40 flex items-center gap-2">
                      <Info size={11} className="text-[#FFCD00]" />
                      <p className="text-[7px] font-black uppercase text-white/70 tracking-wider">
                        {viewMode === '2D' ? 'DIBUJE LÍNEAS O ARRASTRE ELEMENTOS DE CONSTRUCCIÓN' : 'RENDER EN PERSPECTIVA ISOMÉTRICA CON TEXTURAS DE LEY'}
                      </p>
                    </div>
                  </div>

                  {/* C. FLOATING MODIFICATION CONTROLS FOR SELECTED ELEMENT */}
                  <AnimatePresence>
                    {selectedElementId && (
                      <motion.div 
                        initial={{ opacity: 0, y: 30 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: 30 }}
                        className="absolute bottom-10 bg-zinc-950/95 border-2 border-[#FFCD00]/30 backdrop-blur-lg rounded-[2rem] p-5 w-full max-w-xl shadow-[0_0_50px_rgba(255,205,0,0.15)] flex flex-col md:flex-row items-center justify-between gap-4 z-20"
                      >
                        {(() => {
                          const el = canvasElements.find(e => e.id === selectedElementId);
                          if (!el) return null;
                          return (
                            <>
                              <div className="text-left w-full md:w-auto">
                                <span className="text-[6.5px] font-black text-[#FFCD00] uppercase tracking-widest block mb-0.5">ELEMENTO SELECCIONADO</span>
                                <h4 className="text-xs font-black text-white uppercase tracking-tight">{el.name}</h4>
                                <span className="text-[7.5px] font-mono text-white/45 block mt-1">
                                  ANCHO: {(el.width/10).toFixed(1)}m • LARGO: {(el.height/10).toFixed(1)}m • ALTO: {((el.depth || 30)/10).toFixed(1)}m
                                </span>
                              </div>

                              {/* Finishes and alignment properties */}
                              <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                                <div className="space-y-1 text-left">
                                  <span className="text-[6px] font-black text-white/35 uppercase block">ACABADO/TERMINADO</span>
                                  <div className="flex bg-black p-0.5 rounded-lg border border-white/5">
                                    {(['concrete', 'brick', 'metal', 'wood', 'glass', 'water'] as any[]).map((f) => (
                                      <button 
                                        key={f}
                                        onClick={() => changeElementFinish(f)}
                                        className={`px-1.5 py-1 rounded text-[5px] font-black uppercase tracking-wider transition-colors ${
                                          el.finish === f ? 'bg-[#FFCD00] text-black' : 'text-white/45 hover:text-white'
                                        }`}
                                      >
                                        {f === 'concrete' ? 'Conc' : f === 'brick' ? 'Ladr' : f === 'metal' ? 'Met' : f === 'wood' ? 'Mad' : f === 'glass' ? 'Vidr' : 'Agua'}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Dynamic Height Slider */}
                                <div className="space-y-1 text-left shrink-0">
                                  <span className="text-[6px] font-black text-white/35 uppercase block">PROYECCIÓN ALTO: {((el.depth || 30)/10).toFixed(1)}m</span>
                                  <input 
                                    type="range" 
                                    min={5} 
                                    max={200} 
                                    value={el.depth || 30} 
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      setCanvasElements(prev => prev.map(x => x.id === selectedElementId ? { ...x, depth: val } : x));
                                    }} 
                                    className="w-20 accent-[#FFCD00]"
                                  />
                                </div>

                                <div className="flex gap-1">
                                  <button 
                                    onClick={rotateSelectedElement}
                                    title="Rotar 45°"
                                    className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors border border-white/5"
                                  >
                                    <RotateCcw size={13} className="rotate-180" />
                                  </button>
                                  <button 
                                    onClick={deleteSelectedElement}
                                    title="Eliminar Elemento"
                                    className="p-2 bg-red-600/15 text-red-500 hover:bg-red-600 hover:text-white rounded-xl transition-colors border border-red-500/20"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>

              </div>
            )}

          </div>

        </div>
      )}

    </div>
  );
}
