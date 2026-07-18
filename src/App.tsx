import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  LayoutGrid, Instagram, Facebook, Mail, Home, 
  HardHat, Hammer, Droplets, Paintbrush, Layers, Zap, Trash2, Scale, PencilRuler,
  FileText, MessageCircle, ChevronRight, Briefcase, AlertCircle, ArrowLeft, Send,
  User, Building2, Phone, Paperclip, Camera, X, Image as ImageIcon, Maximize2, CheckCircle2,
  Bell, Info, MapPin, Calendar, MessageSquare, Archive, Clock, Trash, QrCode as QrIcon, ExternalLink,
  AlarmClock, Video, Film, ShieldCheck, Eye, EyeOff, Bot, Lock, Unlock, LogOut, Fingerprint, ScanFace, Key, UserPlus,
  Mic, MicOff, Volume2, VolumeX, Sparkles, Brain, Cpu, Construction, Wrench, Share2, FolderEdit, UploadCloud,
  Check, AlertTriangle, Edit, Download, PenTool, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { cn } from './lib/utils';
import { signInAnonymously, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, updateProfile, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db, googleProvider } from './firebase';
import { generateAIResponse, GeminiModel, Message } from './services/geminiService';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  addDoc, 
  query, 
  onSnapshot, 
  orderBy, 
  deleteDoc, 
  updateDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
  where,
  limit
} from 'firebase/firestore';
import BudgetDesignStudio from './components/BudgetDesignStudio';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

const compressImageFile = (file: File, maxWidth = 1000, maxHeight = 1000, quality = 0.65): Promise<string> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string || '');
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => {
        const r = new FileReader();
        r.readAsDataURL(file);
        r.onload = () => resolve(r.result as string);
        r.onerror = () => resolve('');
      };
    };
    reader.onerror = () => resolve('');
  });
};

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
};

const safeSessionStorage = {
  getItem: (key: string): string | null => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      sessionStorage.setItem(key, value);
    } catch {}
  },
  removeItem: (key: string): void => {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }
};

const validateClientEmail = (email: string): string | null => {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return "POR FAVOR INGRESA UN CORREO ELECTRÓNICO (EMAIL).";
  
  // 1. Basic format with regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/;
  if (!emailRegex.test(trimmed)) {
    return "FORMATO INCORRECTO: EL CORREO DEBE TENER LA ESTRUCTURA EJEMPLO@DOMINIO.COM";
  }

  // 2. Extract domain
  const parts = trimmed.split('@');
  if (parts.length !== 2) return "EL CORREO DEBE CONTENER EXACTAMENTE UN CARÁCTER '@'.";
  const domain = parts[1];

  // Check for popular domain typos/extensions
  if (domain.startsWith('gmail')) {
    if (domain !== 'gmail.com') {
      return `EL DOMINIO DE GMAIL DEBE SER EXACTAMENTE "gmail.com" (ESCRIBISTE "${domain}").`;
    }
  } else if (domain.startsWith('hotmail')) {
    const validHotmail = ['hotmail.com', 'hotmail.es', 'hotmail.co', 'hotmail.com.ve', 'hotmail.ve'];
    if (!validHotmail.includes(domain)) {
      return `EL DOMINIO DE HOTMAIL PARECE INCORRECTO (ESCRIBISTE "${domain}").`;
    }
  } else if (domain.startsWith('outlook')) {
    const validOutlook = ['outlook.com', 'outlook.es', 'outlook.co', 'outlook.com.ve'];
    if (!validOutlook.includes(domain)) {
      return `EL DOMINIO DE OUTLOOK PARECE INCORRECTO (ESCRIBISTE "${domain}").`;
    }
  } else if (domain.startsWith('yahoo')) {
    const validYahoo = ['yahoo.com', 'yahoo.es', 'yahoo.com.ve'];
    if (!validYahoo.includes(domain)) {
      return `EL DOMINIO DE YAHOO PARECE INCORRECTO (ESCRIBISTE "${domain}").`;
    }
  } else if (domain.startsWith('icloud')) {
    if (domain !== 'icloud.com') {
      return `EL DOMINIO DE ICLOUD DEBE SER EXACTAMENTE "icloud.com" (ESCRIBISTE "${domain}").`;
    }
  } else if (domain.startsWith('live')) {
    const validLive = ['live.com', 'live.es', 'live.com.ve'];
    if (!validLive.includes(domain)) {
      return `EL DOMINIO DE LIVE PARECE INCORRECTO (ESCRIBISTE "${domain}").`;
    }
  }

  // 3. Check for common typos in domain name itself (like gamil, hotmeil, outlok, yaho)
  const badDomains = ['gamil.com', 'gmal.com', 'gmeil.com', 'gmaill.com', 'hotmeil.com', 'hotmal.com', 'outlok.com', 'yaho.com'];
  if (badDomains.includes(domain)) {
    return `ERROR DE ESCRITURA EN EL DOMINIO: "${domain}". POR FAVOR CORRÍGELO.`;
  }

  // 4. Check ending suffix
  const lastDotIndex = domain.lastIndexOf('.');
  if (lastDotIndex === -1) return "EL DOMINIO DEBE CONTENER UN PUNTO (EJ. .COM).";
  const suffix = domain.substring(lastDotIndex + 1);
  const validSuffixes = [
    'com', 'net', 'org', 'es', 'co', 've', 'info', 'biz', 'online', 'me', 'edu', 'gov', 'club', 'site', 'store', 'app'
  ];
  if (!validSuffixes.includes(suffix)) {
    return `TERMINACIÓN DE CORREO NO RECONOCIDA: ".${suffix}". USE UNA TERMINACIÓN VÁLIDA COMO .COM, .ES, .VE, .NET, ETC.`;
  }

  return null;
};

const getDirectChatId = (userObj: any, selectedUserObj: any, isAdm: boolean) => {
  if (isAdm) {
    if (!selectedUserObj) return 'direct_unknown';
    const emailKey = selectedUserObj.email ? selectedUserObj.email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_') : selectedUserObj.id;
    return `direct_${emailKey}`;
  } else {
    if (!userObj) return 'direct_unknown';
    const emailKey = userObj.email ? userObj.email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_') : userObj.uid;
    return `direct_${emailKey}`;
  }
};

const isNotificationForUser = (notif: any, userItem: any, archivedBudgets: any[] = []) => {
  if (!notif || !userItem) return false;
  const userChatId = getDirectChatId(null, userItem, true);
  if (notif.budgetId === userChatId) return true;
  
  const emailClean = userItem.email ? userItem.email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_') : '';
  const idClean = userItem.id ? userItem.id.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_') : '';
  
  if (emailClean && notif.budgetId && notif.budgetId.toLowerCase().includes(emailClean)) return true;
  if (idClean && notif.budgetId && notif.budgetId.toLowerCase().includes(idClean)) return true;
  
  if (archivedBudgets && archivedBudgets.length > 0) {
    const budgetObj = archivedBudgets.find(b => b.id === notif.budgetId);
    if (budgetObj) {
      if (budgetObj.uid && budgetObj.uid === userItem.id) return true;
      if (budgetObj.email && userItem.email && budgetObj.email.toLowerCase() === userItem.email.toLowerCase()) return true;
    }
  }
  
  return false;
};

const App = () => {
  const [user, setUser] = useState<any>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  
  // Estados para la instalación de la PWA (Progressive Web App)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showPWAInstructionsModal, setShowPWAInstructionsModal] = useState(false);

  useEffect(() => {
    // Detectar si ya está en modo standalone / app instalada con alta precisión (evitando falsos positivos en navegadores o iframes)
    const matchesStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    const isIframe = window.self !== window.top;
    
    // Solo es standalone real si está en modo standalone y no dentro del iframe de previsualización
    const standaloneMode = matchesStandalone && !isIframe;
    setIsStandalone(standaloneMode);

    // Detectar si el dispositivo es iOS (iPhone, iPad, iPod)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(iosDevice);

    // Cargar deferredPrompt si ya fue capturado globalmente por index.html
    if ((window as any).deferredPrompt) {
      setDeferredPrompt((window as any).deferredPrompt);
    }

    const handlePwaInstallable = () => {
      if ((window as any).deferredPrompt) {
        setDeferredPrompt((window as any).deferredPrompt);
        setIsStandalone(false);
      }
    };

    window.addEventListener('pwa-installable', handlePwaInstallable);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).deferredPrompt = e;
      setDeferredPrompt(e);
      setIsStandalone(false);
      console.log('beforeinstallprompt: El navegador permite la instalación.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      console.log('appinstalled: La aplicación ha sido instalada con éxito.');
      setDeferredPrompt(null);
      (window as any).deferredPrompt = null;
      setIsStandalone(true);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('pwa-installable', handlePwaInstallable);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handlePWAInstall = async () => {
    const activePrompt = deferredPrompt || (window as any).deferredPrompt;
    if (activePrompt) {
      activePrompt.prompt();
      const { outcome } = await activePrompt.userChoice;
      console.log(`Elección de instalación del usuario: ${outcome}`);
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        (window as any).deferredPrompt = null;
        setIsStandalone(true);
      }
    } else {
      // Si no tenemos prompt nativo (o es iOS / WebView), abrimos el modal de instrucciones interactivas premium
      setShowPWAInstructionsModal(true);
    }
  };

  useEffect(() => {
    // Solo mostrar intro una vez por sesión para profesionalismo
    const hasSeenIntro = safeSessionStorage.getItem('construacha_intro_seen');
    if (hasSeenIntro) {
      setShowIntro(false);
    } else {
      const timer = setTimeout(() => {
        setShowIntro(false);
        safeSessionStorage.setItem('construacha_intro_seen', 'true');
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Limpieza inicial automatizada de todas las bitácoras de chat y notificaciones fantasmas
  useEffect(() => {
    const runOneTimeCleanup = async () => {
      const hasCleaned = safeSessionStorage.getItem('construacha_master_cleanup_chats_and_notifs_v3');
      if (hasCleaned) return;
      
      try {
        console.log("Iniciando purga silenciosa de todos los chats y notificaciones fantasmas...");
        await clearAllChatsAndNotifications();
        console.log("Purga completada exitosamente.");
        safeSessionStorage.setItem('construacha_master_cleanup_chats_and_notifs_v3', 'true');
      } catch (err) {
        console.error("Error running one-time master chat cleanup:", err);
      }
    };
    
    const timer = setTimeout(() => {
      runOneTimeCleanup();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);
  const appUrl = "https://ais-pre-dw7ttdhfb36ivbjsxo6fxl-379601313220.us-west2.run.app";

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (!u) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.error("Error al iniciar sesión anónima:", e);
        }
      }
    });
    
    // Presentación inicial al cargar la app
    const timer = setTimeout(() => {
      const intro = "Bienvenido a ConstruAcha. Soy tu Núcleo de Inteligencia Especializada. Pulsa en el botón IA del panel para iniciar el análisis técnico.";
      if (typeof window !== 'undefined' && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
        try {
          const utterance = new SpeechSynthesisUtterance(intro);
          utterance.lang = 'es-ES';
          utterance.rate = 1.0;
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn("Speech synthesis failed or was blocked:", e);
        }
      }
    }, 3000);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const [localIsAdmin, setLocalIsAdmin] = useState(() => {
    return safeLocalStorage.getItem('construacha_admin_logged') === 'true';
  });
   const [localAdminEmail, setLocalAdminEmail] = useState(() => {
     return safeLocalStorage.getItem('construacha_admin_email') || '';
   });
   const [adminSubView, setAdminSubView] = useState<'solicitudes' | 'estadisticas'>('solicitudes');

  useEffect(() => {
    const checkBiometrics = async () => {
      if (window.PublicKeyCredential) {
        try {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setBiometricsSupported(available);
        } catch (e) {
          console.warn("Error verificando soporte de autenticador biométrico:", e);
          setBiometricsSupported(false);
        }
      } else {
        setBiometricsSupported(false);
      }
    };
    checkBiometrics();

    // Cargar lista de biometría registrada
    try {
      const listKey = 'construacha_biometric_list';
      const currentListStr = safeLocalStorage.getItem(listKey) || '[]';
      setRegisteredBiometrics(JSON.parse(currentListStr));
    } catch (e) {
      console.warn("Error cargando biometría registrada:", e);
    }
  }, []);

  const isAdmin = localIsAdmin || 
    user?.email === 'construachaapp@gmail.com' || 
    user?.email === 'construacha@gmail.com' || 
    localAdminEmail === 'construachaapp@gmail.com' || 
    localAdminEmail === 'construacha@gmail.com';
  
  // Navigation and general states
  const [view, setView] = useState(() => {
    const saved = safeLocalStorage.getItem('construacha_view');
    return saved || 'home';
  });
  const [showAIChat, setShowAIChat] = useState(false);
  const [showDesignStudio, setShowDesignStudio] = useState(false);

  // Estados de autenticación para clientes externos
  const [showClientAuthModal, setShowClientAuthModal] = useState(false);
  const [clientLoginEmail, setClientLoginEmail] = useState(() => {
    return safeLocalStorage.getItem('construacha_last_email_client') || '';
  });
  const [clientLoginPassword, setClientLoginPassword] = useState('');
  const [clientLoginName, setClientLoginName] = useState('');
  const [isClientRegister, setIsClientRegister] = useState(true);
  const [clientAuthError, setClientAuthError] = useState('');
  const [isClientAuthLoading, setIsClientAuthLoading] = useState(false);
  const [pendingActionView, setPendingActionView] = useState<string | null>(null);
  const [showClientPassword, setShowClientPassword] = useState(false);
  const [isClientRecoveringPassword, setIsClientRecoveringPassword] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySuccessMessage, setRecoverySuccessMessage] = useState('');
  const [isRecoveryLoading, setIsRecoveryLoading] = useState(false);

  const requireRegistration = (targetView: string) => {
    if (isAdmin) {
      if (targetView === 'ai_chat') {
        setShowAIChat(true);
        setTimeout(speakWelcome, 800);
      } else if (targetView === 'presupuesto_rubros') {
        resetBudgetFlow();
        setView('presupuesto_rubros');
      } else {
        setView(targetView);
      }
      return false;
    }
    
    if (!user || user.isAnonymous) {
      setPendingActionView(targetView);
      setIsClientRegister(true); // Default to register
      setClientAuthError('');
      setShowClientAuthModal(true);
      return true;
    }
    
    if (targetView === 'ai_chat') {
      setShowAIChat(true);
      setTimeout(speakWelcome, 800);
    } else if (targetView === 'presupuesto_rubros') {
      resetBudgetFlow();
      setView('presupuesto_rubros');
    } else {
      setView(targetView);
    }
    return false;
  };

  const handleClientAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientAuthError('');
    setIsClientAuthLoading(true);

    const email = clientLoginEmail.trim().toLowerCase();
    const password = clientLoginPassword.trim();
    const name = clientLoginName.trim();

    if (!email || !password) {
      setClientAuthError('Por favor completa todos los campos requeridos');
      setIsClientAuthLoading(false);
      return;
    }

    if (password.length < 6) {
      setClientAuthError('La contraseña debe tener al menos 6 caracteres');
      setIsClientAuthLoading(false);
      return;
    }

    try {
      if (isClientRegister) {
        if (!name) {
          setClientAuthError('El nombre es requerido para registrarse');
          setIsClientAuthLoading(false);
          return;
        }
        
        // 1. Crear nuevo usuario cliente en Firebase
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const currentUserInstance = userCred.user;
        
        // 2. Guardar el nombre oficial del cliente en su perfil de Firebase auth
        await updateProfile(currentUserInstance, {
          displayName: name
        });

        // 3. Crear registro de usuario en colección de Firestore
        try {
          await setDoc(doc(db, 'users', currentUserInstance.uid), {
            name: name,
            email: email.toLowerCase(),
            role: 'client',
            createdAt: new Date().toISOString()
          }, { merge: true });
        } catch (dbErr) {
          console.warn("No se pudo escribir perfil en Firestore (registrado en auth correctamente):", dbErr);
        }

      } else {
        // Iniciar sesión cliente
        await signInWithEmailAndPassword(auth, email, password);
      }

      // Éxito: Limpiar campos, remover estados de Admin anteriores y cerrar modal
      safeLocalStorage.removeItem('construacha_admin_logged');
      safeLocalStorage.removeItem('construacha_admin_email');
      safeLocalStorage.setItem('construacha_last_email_client', email);
      setLocalIsAdmin(false);
      setLocalAdminEmail('');

      setShowClientAuthModal(false);
      setClientLoginEmail('');
      setClientLoginPassword('');
      setClientLoginName('');
      
      // Ofrecer registro biométrico si es compatible y no está registrado para este email
      const hasBiometric = registeredBiometrics.some(b => b.type === 'client' && b.email.toLowerCase() === email.toLowerCase());
      if (biometricsSupported && !hasBiometric) {
        setBiometricRegPassword(password);
        setBiometricRegError('');
        setBiometricRegSuccess('');
        setShowBiometricSettingsModal(true);
      }
      
      // Re-direccionar automáticamente a la acción truncada
      if (pendingActionView) {
        if (pendingActionView === 'ai_chat') {
          setShowAIChat(true);
          setTimeout(speakWelcome, 800);
        } else if (pendingActionView === 'presupuesto_rubros') {
          resetBudgetFlow();
          setView('presupuesto_rubros');
        } else {
          setView(pendingActionView);
        }
        setPendingActionView(null);
      }
    } catch (err: any) {
      console.error("Error de autenticación de cliente:", err);
      let errorMsg = 'Error al procesar la solicitud.';
      if (err.code === 'auth/email-already-in-use') {
        errorMsg = 'Este correo electrónico ya está registrado. Por favor inicia sesión.';
      } else if (err.code === 'auth/invalid-email') {
        errorMsg = 'El formato de correo electrónico no es válido.';
      } else if (err.code === 'auth/weak-password') {
        errorMsg = 'La contraseña es muy débil (mínimo 6 caracteres).';
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMsg = 'Credenciales incorrectas o usuario no encontrado.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      setClientAuthError(errorMsg);
    } finally {
      setIsClientAuthLoading(false);
    }
  };

  // INICIO DE SESIÓN CON GOOGLE (GMAIL)
  const handleGoogleSignIn = async (role: 'client' | 'admin') => {
    setClientAuthError('');
    setLoginError('');
    setIsClientAuthLoading(true);
    setIsLoggingIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const googleUser = result.user;
      const email = googleUser.email?.toLowerCase() || '';

      if (role === 'admin') {
        if (
          email !== 'construachaapp@gmail.com' && 
          email !== 'construacha@gmail.com'
        ) {
          // El usuario Gmail no está autorizado para el panel de administración
          await signOut(auth);
          // Iniciar sesión anónima de respaldo para mantener la continuidad del app
          await signInAnonymously(auth);
          setLoginError("Solo los correos autorizados de ConstruAcha pueden configurarse como administrador");
          setIsLoggingIn(false);
          setIsClientAuthLoading(false);
          return;
        }

        // Autorizado como admin!
        const fieldName = email.replace(/[^a-zA-Z0-9]/g, '_');
        try {
          await setDoc(doc(db, 'users', googleUser.uid), {
            email: email,
            role: 'admin',
            status: 'active',
            name: googleUser.displayName || 'Administrador Google',
            createdAt: new Date().toISOString()
          }, { merge: true });
        } catch (dbErr) {
          console.warn("Ignorado error al escribir admin en colección users:", dbErr);
        }

        safeLocalStorage.setItem('construacha_admin_logged', 'true');
        safeLocalStorage.setItem('construacha_admin_email', email);
        setLocalIsAdmin(true);
        setLocalAdminEmail(email);

        setShowAdminLoginModal(false);
      } else {
        // Rol Client: guardar en Firestore
        try {
          await setDoc(doc(db, 'users', googleUser.uid), {
            name: googleUser.displayName || googleUser.email?.split('@')[0] || 'Cliente Google',
            email: email,
            role: 'client',
            createdAt: new Date().toISOString()
          }, { merge: true });
        } catch (dbErr) {
          console.warn("No se pudo escribir perfil de cliente Google en Firestore (pero la sesión está activa):", dbErr);
        }

        // Éxito: Limpiar campos, remover estados de Admin anteriores y cerrar modal
        safeLocalStorage.removeItem('construacha_admin_logged');
        safeLocalStorage.removeItem('construacha_admin_email');
        setLocalIsAdmin(false);
        setLocalAdminEmail('');

        setShowClientAuthModal(false);

        // Re-direccionar automáticamente a la acción truncada
        if (pendingActionView) {
          if (pendingActionView === 'ai_chat') {
            setShowAIChat(true);
            setTimeout(speakWelcome, 800);
          } else if (pendingActionView === 'presupuesto_rubros') {
            resetBudgetFlow();
            setView('presupuesto_rubros');
          } else {
            setView(pendingActionView);
          }
          setPendingActionView(null);
        }
      }
    } catch (err: any) {
      console.error("Error en autenticación con Google:", err);
      let errorMsg = 'Error al conectar con Google. Por favor, intenta de nuevo.';
      if (err.code === 'auth/popup-closed-by-user') {
        errorMsg = 'La ventana de Google se cerró antes de completar el acceso.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      if (role === 'admin') {
        setLoginError(errorMsg);
      } else {
        setClientAuthError(errorMsg);
      }
    } finally {
      setIsClientAuthLoading(false);
      setIsLoggingIn(false);
    }
  };

  // RECUPERAR CONTRASEÑA POR EMAIL (GMAIL/CORREO)
  const handleSendPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = recoveryEmail.trim().toLowerCase();
    if (!email) {
      setClientAuthError('Por favor ingresa tu correo electrónico');
      return;
    }
    setIsRecoveryLoading(true);
    setClientAuthError('');
    setRecoverySuccessMessage('');
    try {
      await sendPasswordResetEmail(auth, email);
      setRecoverySuccessMessage('¡Enlace enviado! Revisa tu bandeja de entrada o spam para restablecer tu contraseña.');
    } catch (err: any) {
      console.error("Error al enviar recuperación de contraseña:", err);
      let errorMsg = 'Error al enviar el correo de recuperación.';
      if (err.code === 'auth/user-not-found') {
        errorMsg = 'No existe ningún usuario registrado con este correo electrónico.';
      } else if (err.code === 'auth/invalid-email') {
        errorMsg = 'El formato del correo electrónico no es válido.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      setClientAuthError(errorMsg);
    } finally {
      setIsRecoveryLoading(false);
    }
  };

  // EFECTO DE SILENCIO GLOBAL: Cancela voz al ocultar chat o cambiar sección
  useEffect(() => {
    const handleSilence = () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}
      }
    };

    if (!showAIChat) {
      handleSilence();
    }

    window.addEventListener('visibilitychange', handleSilence);
    return () => {
      handleSilence();
      window.removeEventListener('visibilitychange', handleSilence);
    };
  }, [showAIChat, view]);
  // Canal independiente para Clientes y Administrador para evitar cruce de chats
  const [clientAiHistory, setClientAiHistory] = useState<Message[]>(() => {
    try {
      const saved = safeLocalStorage.getItem('construacha_client_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [adminAiHistory, setAdminAiHistory] = useState<Message[]>(() => {
    try {
      const saved = safeLocalStorage.getItem('construacha_admin_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const aiHistory = isAdmin ? adminAiHistory : clientAiHistory;
  const setAIHistory = (val: Message[] | ((prev: Message[]) => Message[])) => {
    if (isAdmin) {
      setAdminAiHistory(prev => {
        const next = typeof val === 'function' ? val(prev) : val;
        try {
          safeLocalStorage.setItem('construacha_admin_chat_history', JSON.stringify(next));
        } catch (e) {}
        return next;
      });
    } else {
      setClientAiHistory(prev => {
        const next = typeof val === 'function' ? val(prev) : val;
        try {
          safeLocalStorage.setItem('construacha_client_chat_history', JSON.stringify(next));
        } catch (e) {}
        return next;
      });
    }
  };

  const [showUsersHistoryModal, setShowUsersHistoryModal] = useState(false);
  const [appUsers, setAppUsers] = useState<any[]>([]);
  const [aiInput, setAIInput] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiModel, setAIModel] = useState<GeminiModel>(GeminiModel.FLASH);

  const [isMicMuted, setIsMicMuted] = useState<boolean>(() => {
    try {
      const saved = safeLocalStorage.getItem('construacha_ai_mic_muted');
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });
  const [isListening, setIsListening] = useState(false);
  const [aiMedia, setAIMedia] = useState<{ mimeType: string; data: string; preview: string }[]>([]);
  const [baseInput, setBaseInput] = useState('');
  
  // APLICATIVOS DE ESTABILIDAD
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [lastRequestTime, setLastRequestTime] = useState(0);

  const recognitionRef = useRef<any>(null);
  const lastProcessedIndexRef = useRef<number>(-1);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.lang = 'es-ES';
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = false;

        recognitionRef.current.onstart = () => {
          recognitionRef.current.lang = 'es-ES'; // Forzamos español al iniciar siempre
        };

        recognitionRef.current.onaudiostart = () => {
          if (recognitionRef.current) recognitionRef.current.lang = 'es-ES';
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error("Speech Recognition Error:", event.error);
          setIsListening(false);
          // Si hay error de red o similar, intentamos reiniciar el idioma
          if (recognitionRef.current) recognitionRef.current.lang = 'es-ES';
        };

        recognitionRef.current.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            // Solo procesamos si es un resultado final y no lo hemos procesado antes
            if (event.results[i].isFinal && i > lastProcessedIndexRef.current) {
              const finalTranscript = event.results[i][0].transcript;
              setAIInput(prev => {
                const current = prev.trim();
                const added = finalTranscript.trim();
                if (current.toLowerCase().endsWith(added.toLowerCase())) return current;
                return (current + ' ' + added).trim();
              });
              lastProcessedIndexRef.current = i;
            }
          }
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
          lastProcessedIndexRef.current = -1;
        };
      }
    }
  }, []);

  const toggleListening = () => {
    // Interrupción inmediata de la voz de la IA al tocar el micro
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      lastProcessedIndexRef.current = -1;
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (err) {
        console.error("Speech recognition error:", err);
      }
    }
  };

  // Ajustes dinámicos de la aplicación (activar/desactivar opciones)
  const [appSettings, setAppSettings] = useState({
    allowBudgetRequest: true,
    allowServicesList: true,
    allowPortfolio: true,
    allowAIChat: true,
    allowMyOrders: true,
    allowComments: true,
    allowSupportChat: true,
    allowNotifications: true,
    renderPrompt: 'ultra modern architecture, photorealistic facade, [prompt], architectural lighting, high quality, 8k',
    renderStyle: 'Moderno',
    aiModel: 'flash',
    blockedCommenters: [] as string[],
  });

  const updateAppSetting = async (key: string, value: any) => {
    try {
      const docRef = doc(db, 'app_settings', 'client_config');
      await setDoc(docRef, {
        [key]: value
      }, { merge: true });
    } catch (error) {
      console.error("Error al actualizar ajuste:", error);
      alert("No se pudo guardar el ajuste: verificar permisos.");
    }
  };

  // Comentarios
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [selectedCommentForAction, setSelectedCommentForAction] = useState<any>(null);

  // data states
  const [previewMedia, setPreviewMedia] = useState<{ mimeType: string; data: string; preview?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const directChatEndRef = useRef<HTMLDivElement>(null);

  const [activeSocial, setActiveSocial] = useState(null);
  const [selectedRubros, setSelectedRubros] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [description, setDescription] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+58');
  const [clientType, setClientType] = useState(''); 
  const [clientName, setClientName] = useState('');
  const [clientIdType, setClientIdType] = useState('V');
  const [clientIdNumber, setClientIdNumber] = useState('');
  const [clientEmail, setClientEmail] = useState('');

  useEffect(() => {
    if (user && user.email) {
      setClientEmail(user.email);
    }
  }, [user]);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmittingBudget, setIsSubmittingBudget] = useState(false);
  const [lastSubmittedBudget, setLastSubmittedBudget] = useState<any>(() => {
    const saved = safeLocalStorage.getItem('construacha_lastSubmittedBudget');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [followUpNote, setFollowUpNote] = useState('');
  const [showSnoozeId, setShowSnoozeId] = useState<string | null>(null);
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [interactionFilter, setInteractionFilter] = useState('all');

  const [isAuthProcessing, setIsAuthProcessing] = useState(false);

  const handleSendMessage = async () => {
    if ((!aiInput.trim() && aiMedia.length === 0) || isAILoading) return;

    // Si está escuchando, detenemos el micro para procesar el mensaje final
    if (isListening) {
      recognitionRef.current?.stop();
    }

    // LIMITADOR DE CUOTAS: Evita ráfagas seguidas
    const now = Date.now();
    if (now - lastRequestTime < 2000) {
      setAIHistory(prev => [...prev, { 
        role: 'model', 
        parts: [{ text: "⚠️ ESTABILIZADOR: Espera un segundo entre envíos para proteger el núcleo de procesamiento." }] 
      }]);
      return;
    }
    setLastRequestTime(now);

    // LIMITADOR DE ERRORES: Si hay demasiados fallos, sugiere reinicio
    if (consecutiveErrors >= 3) {
      setAIHistory(prev => [...prev, { 
        role: 'model', 
        parts: [{ text: "⚠️ PROTOCOLO DE SEGURIDAD ACTIVADO. Se han detectado fallos consecutivos. Por favor, refresca la aplicación para recalibrar los motores." }] 
      }]);
      return;
    }

    const currentInput = aiInput.trim();
    const currentMedia = aiMedia.map(m => ({ mimeType: m.mimeType, data: m.data }));
    
    // VERSIÓN LIGERA PARA EL HISTORIAL (Evita OOM / Crashes)
    const historyMessage: Message = {
      role: 'user',
      parts: [
        { text: currentInput || (currentMedia.length > 0 ? "Analizando archivos técnicos..." : "") },
        ...aiMedia.map(m => ({ 
          text: `[Archivo: ${m.mimeType}]`,
          // NO incluimos inlineData aquí para no saturar la memoria del navegador
        }))
      ]
    };

    const history = aiHistory; 

    // LIMPIEZA INMEDIATA PARA UI
    setAIInput('');
    setAIMedia([]);
    setBaseInput('');
    setIsAILoading(true);

    // Añadimos el mensaje "ligero" al historial
    setAIHistory(prev => {
      const newHistory = [...prev, historyMessage];
      return newHistory.slice(-10); // Límite estricto de 10 mensajes para estabilidad
    });

    try {
      const result = await generateAIResponse(
        currentInput,
        appSettings.aiModel === 'pro' ? GeminiModel.PRO : GeminiModel.FLASH,
        history, 
        currentMedia,
        isAdmin ? 'admin' : 'client'
      );

      const responseText = result.text;
      setConsecutiveErrors(0); 

      const aiParts: any[] = [{ text: responseText }];
      
      // SIMULACIÓN VISUAL (Motor de Renderizado IA calibrable)
      const hasImageMedia = currentMedia.some(m => m.mimeType.startsWith('image/'));
      const isVisualRequest = /rediseñar|modernizar|remodelar|fachada|imagen|foto|visual|render/i.test(currentInput) || (isAdmin && hasImageMedia);
      
      if (isVisualRequest) {
        const basePrompt = appSettings.renderPrompt || 'ultra modern architecture, photorealistic facade, [prompt], architectural lighting, high quality, 8k';
        const styleText = appSettings.renderStyle ? `style preset: ${appSettings.renderStyle}` : '';
        
        // Si no hay prompt del usuario, usamos un prompt de sugerencia por defecto basado en el estilo
        const cleanedInput = currentInput.replace(/rediseñar|modernizar|remodelar|fachada|imagen|foto|visual|render/gi, '').trim();
        const userPromptPart = cleanedInput || 'high quality professional modern design facade improvements';
        
        let finalPromptStr = basePrompt.replace('[prompt]', userPromptPart);
        if (styleText && !finalPromptStr.toLowerCase().includes(styleText.toLowerCase())) {
          finalPromptStr += `, ${styleText}`;
        }
        
        const visualPrompt = encodeURIComponent(finalPromptStr);
        const simulationUrl = `https://pollinations.ai/p/${visualPrompt}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1000)}`;
        
        // Añadimos la imagen simulada a las piezas del mensaje
        aiParts.push({
          inlineData: {
            mimeType: 'image/png',
            data: simulationUrl // La UI ya está preparada para manejar URLs en data si empiezan por http
          }
        });
        
        // Nota aclaratoria
        aiParts[0].text += `\n\n📸 **RECREACIÓN VISUAL FINALIZADA.** (Estilo calibrado: ${appSettings.renderStyle || 'Moderno'})`;
      }

      const aiMessage: Message = {
        role: 'model',
        parts: aiParts
      };

      setAIHistory(prev => {
        const newHistory = [...prev, aiMessage];
        return newHistory.slice(-10);
      });
      
      // Auto-speak AI response if not muted
      if (!isMicMuted && responseText && typeof window !== 'undefined' && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
        try {
          window.speechSynthesis.cancel();
          
          // LIMPIEZA DE SIGNOS: Eliminamos símbolos de markdown y caracteres especiales para una lectura fluida
          const cleanText = responseText
            .replace(/[*#_~`>\[\]\(\)]/g, '') // Elimina formato markdown
            .replace(/[⚠️🔧🏗️🚜📏📐🔩🏗️]/gu, '') // Elimina emojis técnicos
            .replace(/\s+/g, ' ') // Normaliza espacios
            .trim();

          const utterance = new SpeechSynthesisUtterance(cleanText);
          utterance.lang = 'es-ES';
          utterance.rate = 1.0; 
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn("Auto-speak failed:", e);
        }
      }

    } catch (error: any) {
      setConsecutiveErrors(prev => prev + 1);
      console.error("AI Error (Optimizado):", error);
      const isQuota = error?.message?.includes('429') || error?.message?.includes('Quota') || error?.message?.includes('limit') || error?.message?.includes('RESOURCE_EXHAUSTED');
      const isNetwork = error?.message?.includes('fetch') || error?.message?.includes('network');
      
      let errorMsg = "📡 RECALIBRANDO SEÑAL. El Núcleo ha detectado una pequeña interferencia en el enlace. He estabilizado el canal, por favor intenta enviar de nuevo tu mensaje ahora.";
      
      if (error?.message) {
        if (error.message.includes("GEMINI_API_KEY") || error.message.includes("clave")) {
          errorMsg = `⚠️ CONFIGURACIÓN DE IA INCOMPLETA: Falta la clave de API (GEMINI_API_KEY) en las variables del servidor. Por favor agrégala en el panel de Secrets de AI Studio. Detalle: ${error.message}`;
        } else if (isQuota) {
          errorMsg = "⏳ LÍMITE DE CONSULTAS ALCANZADO (429). Google reporta que se ha excedido el límite temporal de cuota. Si cuentas con un plan de pago o Pro en Google AI Studio, asegúrate de que tu clave de API (GEMINI_API_KEY) esté vinculada a un proyecto de Google Cloud con la facturación activa (Pay-as-you-go). De lo contrario, por favor espera unos 30 segundos antes de enviar tu siguiente consulta técnica.";
        } else if (isNetwork) {
          errorMsg = "🌐 ERROR DE ENLACE SATELITAL. Revisa tu conexión a internet. Los motores de análisis no pudieron establecer comunicación con el servidor.";
        } else {
          errorMsg = `📡 INTERFERENCIA DETECTADA. Error del sistema técnico: ${error.message}`;
        }
      }

      setAIHistory(prev => [...prev, { 
        role: 'model', 
        parts: [{ text: errorMsg }] 
      }]);
    } finally {
      setIsAILoading(false);
    }
  };

  const speakWelcome = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        if (!isMicMuted && typeof SpeechSynthesisUtterance !== 'undefined') {
          const intro = "Saludos. Soy el Núcleo de Inteligencia ConstruAcha. Mi sistema polímata está listo para el análisis técnico de tu obra, planos o maquinaria pesada. ¿En qué frente trabajamos hoy?";
          const utterance = new SpeechSynthesisUtterance(intro);
          utterance.lang = 'es-ES';
          window.speechSynthesis.speak(utterance);
        }
      } catch (e) {
        console.warn("speakWelcome failed:", e);
      }
    }
  };

  const handleAIFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    // LIMITADOR DE ARCHIVOS: Máximo 3 archivos para estabilidad
    if (aiMedia.length + files.length > 3) {
      setAIHistory(prev => [...prev, { 
        role: 'model', 
        parts: [{ text: "⚠️ LIMITADOR DE ARCHIVOS: Solo se permiten hasta 3 archivos simultáneos para garantizar la fluidez del sistema." }] 
      }]);
      return;
    }

    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        setAIMedia(prev => [...prev, {
          mimeType: file.type,
          data: base64,
          preview: URL.createObjectURL(file)
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleBiometricAuth = (type: 'fingerprint' | 'face') => {
    // Auth disabled
  };

  // Audio for reminders
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Persistence states
  const [archivedBudgets, setArchivedBudgets] = useState<any[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<any>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(() => {
    const saved = safeLocalStorage.getItem('construacha_selectedReceipt');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [reminders, setReminders] = useState<any[]>([]);
  const [activeReminders, setActiveReminders] = useState<any[]>([]); 
  const [silencedAlertIds, setSilencedAlertIds] = useState<string[]>([]);
  const [showReminderForm, setShowReminderForm] = useState(null); 
  const [reminderConfig, setReminderConfig] = useState({ date: '', time: '' });
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInputText, setChatInputText] = useState('');

  // Estados del Chat de Soporte Directo
  const [showDirectChatModal, setShowDirectChatModal] = useState(false);
  const [selectedDirectChatUser, setSelectedDirectChatUser] = useState<any>(null);
  const [directChatMessages, setDirectChatMessages] = useState<any[]>([]);
  const [directChatInputText, setDirectChatInputText] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');
  const [selectedMessageOptions, setSelectedMessageOptions] = useState<any | null>(null);

   // Confirmación personalizada para evitar alert/confirm nativos que fallan en iFrame
   const [customConfirm, setCustomConfirm] = useState<{
     isOpen: boolean;
     title: string;
     message: string;
     onConfirm: () => void;
   } | null>(null);

   // Deep linking for shared budgets (WhatsApp share links - Opción A)
   useEffect(() => {
     const params = new URLSearchParams(window.location.search);
     const viewParam = params.get('view');
     const receiptIdParam = params.get('receiptId');
     if (viewParam === 'comprobante_detalle' && receiptIdParam) {
       const docRef = doc(db, 'budgets', receiptIdParam);
       getDoc(docRef).then((snap) => {
         if (snap.exists()) {
           const data = { id: snap.id, ...snap.data() };
           setSelectedReceipt(data);
           setView('comprobante_detalle');
           // Clean url query parameters to keep address bar tidy
           window.history.replaceState({}, document.title, window.location.pathname);
         }
       }).catch((err) => {
         console.error("Error al cargar comprobante por deep link:", err);
       });
     }
   }, []);

  // Guard para evitar llamadas infinitas o loops de Firestore en marcas de recibido y leído
  const processedMessageUpdatesRef = useRef<Set<string>>(new Set());

  // Estados para Acceso Biométrico (Huella / FaceID)
  const [biometricsSupported, setBiometricsSupported] = useState(false);
  const [registeredBiometrics, setRegisteredBiometrics] = useState<{ type: 'admin' | 'client'; email: string }[]>([]);
  const [showBiometricSettingsModal, setShowBiometricSettingsModal] = useState(false);
  const [biometricRegPassword, setBiometricRegPassword] = useState('');
  const [biometricRegError, setBiometricRegError] = useState('');
  const [biometricRegSuccess, setBiometricRegSuccess] = useState('');
  const [isRegisteringBiometric, setIsRegisteringBiometric] = useState(false);

  // Estados para el arrastre (movimiento) del botón flotante de soporte
  const [dragOffset, setDragOffset] = useState({ x: 0, y: -80 }); // Empieza 80px más arriba
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const [draggedDistance, setDraggedDistance] = useState(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: dragOffset.x,
      offsetY: dragOffset.y,
    };
    setDraggedDistance(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    setDraggedDistance(dist);
    
    const proposedX = dragStartRef.current.offsetX + dx;
    const proposedY = dragStartRef.current.offsetY + dy;
    
    // Obtener dimensiones del contenedor principal max-w-md (máximo 448px)
    const containerWidth = Math.min(window.innerWidth || 375, 448);
    const screenHeight = window.innerHeight || 812;
    
    // El botón empieza a la derecha con un margen de unos 24px (right-6)
    // Evitamos que se salga por la derecha (maxX = 16) y por la izquierda (minX = -containerWidth + 80)
    const minX = -containerWidth + 80;
    const maxX = 16;
    const clampedX = Math.max(minX, Math.min(proposedX, maxX));
    
    // Evitamos que se salga por abajo (maxY = 16) y por arriba (minY = -screenHeight + 100)
    const minY = -screenHeight + 100;
    const maxY = 16;
    const clampedY = Math.max(minY, Math.min(proposedY, maxY));
    
    setDragOffset({
      x: clampedX,
      y: clampedY
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // Dynamic notification count
  const pendingBudgetsCount = useMemo(() => {
    return archivedBudgets.filter(b => !b.confirmed).length;
  }, [archivedBudgets]);

  const unapprovedCommentsCount = useMemo(() => {
    return comments.filter(c => !c.approved).length;
  }, [comments]);

  // Admin Chat Notifications
  const adminChatNotifications = useMemo(() => {
    if (!isAdmin) return [];
    return reminders.filter(r => r.isChatNotification && r.recipient === 'admin' && !r.dismissed);
  }, [isAdmin, reminders]);

  // Client Direct Chat Notifications (for direct support chat)
  const clientDirectChatNotifications = useMemo(() => {
    if (isAdmin || !user?.uid) return [];
    const directChatId = getDirectChatId(user, null, false);
    return reminders.filter(r => 
      r.isChatNotification && 
      r.recipient === 'client' && 
      !r.dismissed && 
      r.budgetId === directChatId
    );
  }, [isAdmin, user?.uid, user?.email, reminders]);

  // Client Budget Chat Notifications (for budget bitácoras chat)
  const clientBudgetChatNotifications = useMemo(() => {
    if (isAdmin || !user?.uid) return [];
    const clientBudgetsIds = archivedBudgets.map(b => b.id);
    return reminders.filter(r => 
      r.isChatNotification && 
      r.recipient === 'client' && 
      !r.dismissed && 
      clientBudgetsIds.includes(r.budgetId)
    );
  }, [isAdmin, user?.uid, archivedBudgets, reminders]);

  // Client Chat Notifications (retained for fallback / backwards compatibility)
  const clientChatNotifications = useMemo(() => {
    if (isAdmin || !user?.uid) return [];
    const clientBudgetsIds = archivedBudgets.map(b => b.id);
    const directChatId = getDirectChatId(user, null, false);
    return reminders.filter(r => 
      r.isChatNotification && 
      r.recipient === 'client' && 
      !r.dismissed && 
      (r.budgetId === directChatId || clientBudgetsIds.includes(r.budgetId))
    );
  }, [isAdmin, user?.uid, user?.email, archivedBudgets, reminders]);

  // Admin Pending Reminders (scheduled reminders ONLY, excluding chat notifications)
  const pendingRemindersCount = useMemo(() => {
    if (!isAdmin) return 0;
    return reminders.filter(r => 
      !r.dismissed && 
      !r.isChatNotification
    ).length;
  }, [isAdmin, reminders]);

  // Ref para rastrear alertas ya procesadas para evitar spam
  const notifiedReminderIdsRef = useRef<string[]>([]);

  useEffect(() => {
    // Inicializar el sonido de alertas de forma diferida en el navegador
    try {
      audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
      audioRef.current.loop = true;
      audioRef.current.volume = 0.8;
    } catch (err) {
      console.warn("Audio initialization error:", err);
    }

    // Solicitar permiso de notificaciones nativas del navegador
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          Notification.requestPermission().then(permission => {
            console.log("Notification permission state:", permission);
          });
        }
      }
    } catch (err) {
      console.warn("Notification request permission error:", err);
    }
  }, []);

  // SISTEMA DE NOTIFICACIONES EN SEGUNDO PLANO (WEB NOTIFICATIONS, VIBRACIÓN Y SONIDO)
  useEffect(() => {
    if (reminders.length === 0) return;

    // Si es la primera carga de la sesión, simplemente inicializamos la lista de ya procesados
    if (notifiedReminderIdsRef.current.length === 0) {
      notifiedReminderIdsRef.current = reminders.map(r => r.id);
      return;
    }

    reminders.forEach(r => {
      // Si es un recordatorio nuevo que no hemos procesado aún
      if (!notifiedReminderIdsRef.current.includes(r.id)) {
        notifiedReminderIdsRef.current.push(r.id);

        // Verificar si está dirigido a este usuario actual
        const isForMe = r.isChatNotification && (
          (isAdmin && r.recipient === 'admin') ||
          (!isAdmin && r.recipient === 'client' && user?.uid && (r.budgetId === getDirectChatId(user, null, false) || archivedBudgets.some(b => b.id === r.budgetId)))
        );

        if (isForMe && !r.dismissed) {
          // 1. Desplegar Banner de Notificación del Sistema Operativo (incluso fuera de la app / segundo plano)
          try {
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              const notificationTitle = r.budgetId && r.budgetId.startsWith('direct_') 
                ? "SOPORTE CONSTRUACHA 💬" 
                : "CONSTRUACHA - NUEVA ALERTA ⚡";

              new Notification(notificationTitle, {
                body: r.note || "Tienes un mensaje nuevo en tiempo real.",
                vibrate: [200, 100, 200, 100, 200],
                tag: r.id,
                requireInteraction: true
              } as any);
            }
          } catch (err) {
            console.error("Error al disparar notificación nativa:", err);
          }

          // 2. Hacer sonar un pitido / tono fuerte de notificación de inmediato
          try {
            const chimeAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
            chimeAudio.volume = 0.95;
            chimeAudio.play().catch(e => console.log("Error al reproducir audio de fondo:", e));
          } catch (err) {
            console.error("Error de audio:", err);
          }

          // 3. Vibrar el dispositivo móvil de inmediato
          try {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate([300, 100, 300, 100, 300]);
            }
          } catch (err) {
            console.error("Error al hacer vibrar el móvil:", err);
          }
        }
      }
    });
  }, [reminders, isAdmin, user?.uid, archivedBudgets]);

  // Comments Listener
  useEffect(() => {
    try {
      // Obtenemos todos los comentarios de forma segura para evitar fallos de índices o exclusión por createdAt
      const q = query(collection(db, 'comments'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Ordenamos en memoria para mayor robustez
        docs.sort((a: any, b: any) => {
          const timeA = a.createdAt?.seconds || (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
          const timeB = b.createdAt?.seconds || (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
          return timeB - timeA;
        });
        setComments(docs);
      }, (error) => {
        console.warn("Error en tiempo real en comentarios:", error);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error("Error setting up comments listener:", error);
    }
  }, []);

  // Client Auto-Dismiss Chat Notifications Effect
  useEffect(() => {
    if (!isAdmin && view === 'comprobante_detalle' && selectedReceipt) {
      // Find any active chat notifications for this specific budget
      const notifsToDismiss = reminders.filter(
        r => r.budgetId === selectedReceipt.id && 
             r.recipient === 'client' && 
             r.isChatNotification && 
             !r.dismissed
      );
      notifsToDismiss.forEach(r => {
        dismissReminder(r.id);
      });
    }
  }, [view, selectedReceipt, reminders, isAdmin]);

  // Admin Auto-Dismiss Chat Notifications Effect
  useEffect(() => {
    if (isAdmin) {
      if (view === 'budget_details' && selectedBudget) {
        // Find any active chat notifications for this specific budget
        const notifsToDismiss = reminders.filter(
          r => r.budgetId === selectedBudget.id && 
               r.recipient === 'admin' && 
               r.isChatNotification && 
               !r.dismissed
        );
        notifsToDismiss.forEach(r => {
          dismissReminder(r.id);
        });
      } else if (view === 'comprobante_validacion' && selectedReceipt) {
        // Find any active chat notifications for this specific budget being validated
        const notifsToDismiss = reminders.filter(
          r => r.budgetId === selectedReceipt.id && 
               r.recipient === 'admin' && 
               r.isChatNotification && 
               !r.dismissed
        );
        notifsToDismiss.forEach(r => {
          dismissReminder(r.id);
        });
      }
    }
  }, [view, selectedBudget, selectedReceipt, reminders, isAdmin]);

  // Direct Support Chat Auto-Dismiss Notifications Effect (For both Client and Admin)
  useEffect(() => {
    if (showDirectChatModal) {
      if (isAdmin && selectedDirectChatUser) {
        const targetNotifs = reminders.filter(
          r => r.isChatNotification && 
               r.recipient === 'admin' && 
               !r.dismissed &&
               isNotificationForUser(r, selectedDirectChatUser, archivedBudgets)
        );
        targetNotifs.forEach(n => {
          dismissReminder(n.id);
        });
      } else if (!isAdmin && user) {
        const directChatId = getDirectChatId(user, null, false);
        const targetNotifs = reminders.filter(
          r => r.isChatNotification && 
               r.recipient === 'client' && 
               !r.dismissed &&
               r.budgetId === directChatId
        );
        targetNotifs.forEach(n => {
          dismissReminder(n.id);
        });
      }
    }
  }, [showDirectChatModal, selectedDirectChatUser, reminders, isAdmin, user, archivedBudgets]);

  // Settings Listener (Real-Time Permissions)
  useEffect(() => {
    try {
      const docRef = doc(db, 'app_settings', 'client_config');
      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setAppSettings({
            allowBudgetRequest: data.allowBudgetRequest !== false,
            allowServicesList: data.allowServicesList !== false,
            allowPortfolio: data.allowPortfolio !== false,
            allowAIChat: data.allowAIChat !== false,
            allowMyOrders: data.allowMyOrders !== false,
            allowComments: data.allowComments !== false,
            allowSupportChat: data.allowSupportChat !== false,
            allowNotifications: data.allowNotifications !== false,
            renderPrompt: data.renderPrompt || 'ultra modern architecture, photorealistic facade, [prompt], architectural lighting, high quality, 8k',
            renderStyle: data.renderStyle || 'Moderno',
            aiModel: data.aiModel || 'flash',
            blockedCommenters: data.blockedCommenters || [],
          });
        }
      }, (error) => {
        console.warn("Error en tiempo real en configuraciones:", error);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error("Error setting up app settings listener:", error);
    }
  }, []);

  // Budgets Listener (Real-Time Cloud Sync)
  useEffect(() => {
    let unsubscribe;
    try {
      let q;
      if (isAdmin) {
        // Admin matches all global budgets
        q = query(collection(db, 'budgets'));
      } else if (user?.uid) {
        // Client matches budgets they submitted from their uid
        q = query(collection(db, 'budgets'), where('uid', '==', user.uid));
      } else {
        // If auth is loading, don't subscribe yet
        return;
      }
      unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const sortedDocs = docs.sort((a: any, b: any) => (b.orderId || 0) - (a.orderId || 0));
        setArchivedBudgets(sortedDocs);
      }, (error) => {
        console.error("Firestore loading budgets error:", error);
      });
    } catch (error) {
      console.error("Error setting up budgets listener:", error);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isAdmin, user?.uid]);

  // Reminders Listener (Real-Time Cloud Sync)
  useEffect(() => {
    let unsubscribe;
    try {
      const q = query(collection(db, 'reminders'));
      unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setReminders(docs);
      }, (error) => {
        console.error("Firestore loading reminders error:", error);
      });
    } catch (error) {
      console.error("Error setting up reminders listener:", error);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Portfolio Listener (Real-Time Cloud Sync & Seeding)
  useEffect(() => {
    let unsubscribe;
    try {
      const q = query(collection(db, 'portfolio'));
      unsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
          // Local fallback for both clients and admins if Firestore is empty without causing concurrent cyclic writes
          const defaults = [
            { id: 'p1', url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop", urlBefore: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=2070&auto=format&fit=crop", title: "RESIDENCIA MONOLÍTICA", type: 'image' },
            { id: 'p2', url: "https://images.unsplash.com/photo-1503387762-592dea58d11c?q=80&w=2070&auto=format&fit=crop", urlBefore: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=2070&auto=format&fit=crop", title: "CUBISMO GEOMÉTRICO", type: 'image' },
            { id: 'p3', url: "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?q=80&w=2070&auto=format&fit=crop", urlBefore: "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?q=80&w=2070&auto=format&fit=crop", title: "ESTRUCTURA MINIMALISTA", type: 'image' },
            { id: 'p4', url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=2070&auto=format&fit=crop", urlBefore: "https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?q=80&w=2070&auto=format&fit=crop", title: "PROYECTO RECTANGULAR", type: 'image' }
          ];
          setPortfolioItems(defaults);
        } else {
          const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setPortfolioItems(docs as any[]);
        }
      }, (error) => {
        console.error("Firestore loading portfolio error:", error);
      });
    } catch (error) {
      console.error("Error setting up portfolio listener:", error);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isAdmin]);

  // Users List Listener (Real-Time Cloud Sync for Admins)
  useEffect(() => {
    if (!isAdmin) {
      setAppUsers([]);
      return;
    }
    let unsubscribe;
    try {
      const q = query(collection(db, 'users'));
      unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort by createdAt descending
        docs.sort((a: any, b: any) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        setAppUsers(docs);
      }, (error) => {
        console.error("Firestore loading users error:", error);
      });
    } catch (error) {
      console.error("Error setting up users listener:", error);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isAdmin]);

  // Access Guards for client
  useEffect(() => {
    try {
      if (!isAdmin) {
        if (view === 'presupuesto_rubros' && !appSettings?.allowBudgetRequest) {
          setView('home');
        }
        if (view === 'rubros_info' && !appSettings?.allowServicesList) {
          setView('home');
        }
        if (view === 'portfolio' && !appSettings?.allowPortfolio) {
          setView('home');
        }
        if (view === 'client_comprobantes' && !appSettings?.allowMyOrders) {
          setView('home');
        }
        if (showComments && !appSettings?.allowComments) {
          setShowComments(false);
        }
      }

      // Safeguards for state-dependent views to prevent black screens
      if ((view === 'comprobante_detalle' || view === 'comprobante_validacion') && !selectedReceipt) {
        setView('home');
      }
      if (view === 'budget_details' && !selectedBudget) {
        setView('home');
      }
      if (view === 'social_qr' && !activeSocial) {
        setView('home');
      }
    } catch (error) {
      console.error("Safeguard redirect error:", error);
      setView('home');
    }
  }, [view, appSettings, isAdmin, showComments, selectedReceipt, selectedBudget, activeSocial]);

  // Automatically dismiss the floating design studio if navigating away from budget screens to prevent persistent clutter
  useEffect(() => {
    if (view !== 'budget_details' && view !== 'admin_archive' && view !== 'comprobante_detalle' && view !== 'comprobante_validacion') {
      setShowDesignStudio(false);
    }
  }, [view]);

  // Keep selectedBudget in sync with real-time archivedBudgets updates
  useEffect(() => {
    if (selectedBudget) {
      const updated = archivedBudgets.find(b => b.id === selectedBudget.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedBudget)) {
        setSelectedBudget(updated);
      }
    }
  }, [archivedBudgets, selectedBudget]);

  // Persistence of validation state in localStorage (safeguard for low-RAM mobile reloads)
  useEffect(() => {
    if (view) {
      safeLocalStorage.setItem('construacha_view', view);
      if (view === 'home') {
        safeLocalStorage.removeItem('construacha_selectedReceipt');
        safeLocalStorage.removeItem('construacha_lastSubmittedBudget');
      }
    }
  }, [view]);

  useEffect(() => {
    if (selectedReceipt) {
      safeLocalStorage.setItem('construacha_selectedReceipt', JSON.stringify(selectedReceipt));
    } else {
      safeLocalStorage.removeItem('construacha_selectedReceipt');
    }
  }, [selectedReceipt]);

  useEffect(() => {
    if (lastSubmittedBudget) {
      safeLocalStorage.setItem('construacha_lastSubmittedBudget', JSON.stringify(lastSubmittedBudget));
    } else {
      safeLocalStorage.removeItem('construacha_lastSubmittedBudget');
    }
  }, [lastSubmittedBudget]);

  const [showFullEvidence, setShowFullEvidence] = useState<any>(null);
  const [showQRVerification, setShowQRVerification] = useState(false);

  // Estados y funciones para la Firma Digital del Cliente
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [isSignatureSaving, setIsSignatureSaving] = useState(false);
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [isEraser, setIsEraser] = useState(false);
  const [showEraseOptions, setShowEraseOptions] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [exportedImagePreview, setExportedImagePreview] = useState<{ url: string; title: string; pdfUrl?: string; pdfFileName?: string } | null>(null);
  const [activeMediaPreview, setActiveMediaPreview] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawingRef.current = true;
    const pos = getEventCoords(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x, pos.y);
    
    // Set eraser or normal stroke
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : '#FFCD00'; // Amarillo ConstruAcha
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (e.cancelable) {
      e.preventDefault();
    }

    const pos = getEventCoords(e, canvas);
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : '#FFCD00';
    ctx.lineWidth = strokeWidth;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getEventCoords = (e: any, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const isCanvasBlank = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    try {
      const buffer = new Uint32Array(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer
      );
      return !buffer.some(color => color !== 0);
    } catch (e) {
      // Fallback si getImageData falla por alguna razón
      return false;
    }
  };

  const saveSignature = async () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !selectedReceipt) return;

    if (isCanvasBlank(canvas)) {
      alert("Por favor, dibuje su firma digital antes de confirmar. No se puede guardar una firma vacía.");
      return;
    }

    setIsSignatureSaving(true);
    try {
      const signatureDataUrl = canvas.toDataURL('image/png');
      
      const updatedInteractions = [
        {
          type: 'system',
          text: 'Comprobante firmado digitalmente por el cliente',
          time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          date: new Date().toLocaleDateString('es-ES')
        },
        ...(selectedReceipt.interactions || [])
      ];

      const budgetRef = doc(db, 'budgets', selectedReceipt.id);
      await updateDoc(budgetRef, {
        signature: signatureDataUrl,
        interactions: updatedInteractions
      });

      setSelectedReceipt((prev: any) => ({
        ...prev,
        signature: signatureDataUrl,
        interactions: updatedInteractions
      }));

      setArchivedBudgets(prev => prev.map(b => b.id === selectedReceipt.id ? { ...b, signature: signatureDataUrl, interactions: updatedInteractions } : b));
      setShowSignaturePad(false);
    } catch (error) {
      console.error("Error al guardar firma digital:", error);
      alert("No se pudo guardar la firma. Por favor verifica tu conexión.");
    } finally {
      setIsSignatureSaving(false);
    }
  };

  // --- PARSEO Y COMPATIBILIDAD CON OKLCH/OKLAB PARA HTML2CANVAS ---
  const safeHtml2Canvas = async (element: HTMLElement, options: any) => {
    const originalGetComputedStyle = window.getComputedStyle;
    
    let helperCanvas: HTMLCanvasElement | null = null;
    let helperCtx: CanvasRenderingContext2D | null = null;

    const resolveColorToRgba = (colorStr: string): string => {
      if (!colorStr) return colorStr;
      if (!colorStr.includes('oklch') && !colorStr.includes('oklab')) {
        return colorStr;
      }
      try {
        if (!helperCanvas) {
          helperCanvas = document.createElement('canvas');
          helperCanvas.width = 1;
          helperCanvas.height = 1;
          helperCtx = helperCanvas.getContext('2d');
        }
        if (helperCtx) {
          helperCtx.fillStyle = 'rgba(0,0,0,0)';
          helperCtx.fillStyle = colorStr;
          const resolved = helperCtx.fillStyle;
          if (resolved && !resolved.includes('oklch') && !resolved.includes('oklab')) {
            return resolved;
          }
        }
      } catch (e) {
        console.error("Error resolviendo color con canvas:", e);
      }
      // Fallbacks si falla el canvas o no es soportado
      if (colorStr.includes('0.0') || colorStr.includes('0.1') || colorStr.includes('0.2')) {
        return '#0f0f10';
      }
      if (colorStr.includes('0.8') || colorStr.includes('0.9') || colorStr.includes('1')) {
        return '#f4f4f5';
      }
      return '#18181b';
    };

    const colorRegex = /(oklch|oklab)\([^)]+\)/g;

    const resolveAllColorsInString = (value: string): string => {
      if (!value) return value;
      if (!value.includes('oklch') && !value.includes('oklab')) {
        return value;
      }
      return value.replace(colorRegex, (match) => {
        return resolveColorToRgba(match);
      });
    };

    // Crear un proxy seguro para CSSStyleDeclaration que evita "Illegal invocation"
    const createStyleProxy = (style: CSSStyleDeclaration) => {
      return new Proxy(style, {
        get(target, prop) {
          if (prop === 'getPropertyValue') {
            return function(propertyName: string) {
              const val = target.getPropertyValue(propertyName);
              return resolveAllColorsInString(val);
            };
          }
          const val = target[prop as any];
          if (typeof val === 'function') {
            return (val as any).bind(target);
          }
          if (typeof val === 'string') {
            return resolveAllColorsInString(val);
          }
          return val;
        }
      });
    };

    // Proxy para el window principal con llamada context-bound
    window.getComputedStyle = function (el, pseudo) {
      const style = originalGetComputedStyle.call(window, el, pseudo);
      return createStyleProxy(style);
    };

    // --- INTERCEPCIÓN EN EL IFRAME TEMPORAL DE HTML2CANVAS ---
    const userOnClone = options.onclone;
    options.onclone = (clonedDoc: Document, clonedEl: HTMLElement) => {
      const iframeWindow = clonedDoc.defaultView;
      if (iframeWindow) {
        // 1. Monkey-patch para getPropertyValue en el prototipo del iframe
        const originalIframeGetPropertyValue = iframeWindow.CSSStyleDeclaration.prototype.getPropertyValue;
        iframeWindow.CSSStyleDeclaration.prototype.getPropertyValue = function (propertyName: string) {
          const val = originalIframeGetPropertyValue.call(this, propertyName);
          return resolveAllColorsInString(val);
        };

        // 2. Wrap de getComputedStyle en el iframe con llamada context-bound
        const originalIframeGetComputedStyle = iframeWindow.getComputedStyle;
        iframeWindow.getComputedStyle = function (el, pseudo) {
          const style = originalIframeGetComputedStyle.call(iframeWindow, el, pseudo);
          return createStyleProxy(style);
        };
      }

      // 3. Limpieza de variables CSS de Tailwind v4 en el :root / html del clon
      if (clonedDoc.documentElement && clonedDoc.documentElement.style) {
        const rootStyle = clonedDoc.documentElement.style;
        for (let i = 0; i < rootStyle.length; i++) {
          const propName = rootStyle[i];
          if (propName.startsWith('--')) {
            const val = rootStyle.getPropertyValue(propName);
            if (val && (val.includes('oklch') || val.includes('oklab'))) {
              rootStyle.setProperty(propName, resolveAllColorsInString(val));
            }
          }
        }
      }

      // 4. Reemplazo de oklch/oklab en estilos en línea de los elementos clonados
      const allElements = clonedEl.getElementsByTagName('*');
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i] as HTMLElement;
        if (el.style) {
          for (let j = 0; j < el.style.length; j++) {
            const propName = el.style[j];
            const originalVal = el.style.getPropertyValue(propName);
            if (originalVal && (originalVal.includes('oklch') || originalVal.includes('oklab'))) {
              el.style.setProperty(propName, resolveAllColorsInString(originalVal));
            }
          }
        }
      }

      if (userOnClone) {
        userOnClone(clonedDoc, clonedEl);
      }
    };

    try {
      const result = await html2canvas(element, options);
      return result;
    } finally {
      window.getComputedStyle = originalGetComputedStyle;
    }
  };

  const downloadTicketPDF = async () => {
    const element = document.getElementById('ticket-seguridad-descargable');
    if (!element) {
      alert("Elemento del ticket no encontrado.");
      return;
    }
    setIsExporting(true);
    setExportMessage("Generando PDF de Seguridad...");
    try {
      const canvas = await safeHtml2Canvas(element, {
        backgroundColor: '#0a0a0a',
        scale: 2.5,
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width / 2.5, canvas.height / 2.5]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2.5, canvas.height / 2.5);
      
      let pdfUrl = "";
      try {
        const blob = pdf.output('blob');
        pdfUrl = URL.createObjectURL(blob);
      } catch (e) {
        console.warn("No se pudo generar el blob del PDF:", e);
      }

      // Intentar descarga directa
      try {
        pdf.save(`ticket-seguridad-${lastSubmittedBudget?.id || 'seguridad'}.pdf`);
      } catch (saveErr) {
        console.warn("Descarga directa de PDF bloqueada por iframe/navegador:", saveErr);
      }

      // Previsualización y descarga manual obligatoria para solucionar bloqueos de iframe
      setExportedImagePreview({
        url: imgData,
        title: "TICKET DE SEGURIDAD",
        pdfUrl: pdfUrl || undefined,
        pdfFileName: `ticket-seguridad-${lastSubmittedBudget?.id || 'seguridad'}.pdf`
      });
    } catch (err: any) {
      console.error("Error al exportar PDF:", err);
      alert(`Error al exportar PDF: ${err.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadTicketImage = async () => {
    const element = document.getElementById('ticket-seguridad-descargable');
    if (!element) {
      alert("Elemento del ticket no encontrado.");
      return;
    }
    setIsExporting(true);
    setExportMessage("Procesando imagen HD...");
    try {
      const canvas = await safeHtml2Canvas(element, {
        backgroundColor: '#0a0a0a',
        scale: 2.5,
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      
      // Intentar descarga directa
      try {
        const link = document.createElement('a');
        link.href = imgData;
        link.download = `ticket-seguridad-${lastSubmittedBudget?.id || 'seguridad'}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (saveErr) {
        console.warn("Descarga directa de imagen bloqueada por iframe/navegador:", saveErr);
      }

      setExportedImagePreview({
        url: imgData,
        title: "TICKET DE SEGURIDAD"
      });
    } catch (err: any) {
      console.error("Error al exportar imagen:", err);
      alert(`Error al exportar imagen: ${err.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadDetailPDF = async (id: string) => {
    const element = document.getElementById('ticket-detalle-descargable');
    if (!element) {
      alert("Elemento de comprobante no encontrado.");
      return;
    }
    setIsExporting(true);
    setExportMessage("Generando comprobante PDF...");
    try {
      const canvas = await safeHtml2Canvas(element, {
        backgroundColor: '#000000',
        scale: 2.5,
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width / 2.5, canvas.height / 2.5]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2.5, canvas.height / 2.5);
      
      let pdfUrl = "";
      try {
        const blob = pdf.output('blob');
        pdfUrl = URL.createObjectURL(blob);
      } catch (e) {
        console.warn("No se pudo generar el blob del PDF:", e);
      }

      // Intentar descarga directa
      try {
        pdf.save(`comprobante-detalle-${id}.pdf`);
      } catch (saveErr) {
        console.warn("Descarga directa de PDF bloqueada por iframe/navegador:", saveErr);
      }

      // Previsualización y descarga manual obligatoria para solucionar bloqueos de iframe
      setExportedImagePreview({
        url: imgData,
        title: `COMPROBANTE DETALLADO #${id}`,
        pdfUrl: pdfUrl || undefined,
        pdfFileName: `comprobante-detalle-${id}.pdf`
      });
    } catch (err: any) {
      console.error("Error al exportar PDF detallado:", err);
      alert(`Error al exportar PDF: ${err.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadDetailImage = async (id: string) => {
    const element = document.getElementById('ticket-detalle-descargable');
    if (!element) {
      alert("Elemento de comprobante no encontrado.");
      return;
    }
    setIsExporting(true);
    setExportMessage("Procesando imagen HD...");
    try {
      const canvas = await safeHtml2Canvas(element, {
        backgroundColor: '#000000',
        scale: 2.5,
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      
      // Intentar descarga directa
      try {
        const link = document.createElement('a');
        link.href = imgData;
        link.download = `comprobante-detalle-${id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (saveErr) {
        console.warn("Descarga directa de imagen bloqueada por iframe/navegador:", saveErr);
      }

      setExportedImagePreview({
        url: imgData,
        title: `COMPROBANTE DETALLADO #${id}`
      });
    } catch (err: any) {
      console.error("Error al exportar imagen detallada:", err);
      alert(`Error al exportar imagen: ${err.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [isUploadingID, setIsUploadingID] = useState<'front' | 'back' | null>(null);

  const handleIDDocumentSelect = async (e: React.ChangeEvent<HTMLInputElement>, receiptId: string, side: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingID(side);
    try {
      const base64 = await compressImageFile(file);
      const budgetRef = doc(db, 'budgets', receiptId);
      
      const logEntry = {
        type: 'system',
        text: `Documento de identidad (${side === 'front' ? 'Anverso' : 'Reverso'}) cargado por el cliente`,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString('es-ES')
      };

      const budgetDoc = archivedBudgets.find(b => b.id === receiptId);
      const updatedInteractions = [logEntry, ...(budgetDoc?.interactions || [])];

      await updateDoc(budgetRef, {
        [`id_${side}`]: base64,
        interactions: updatedInteractions
      });

      setSelectedReceipt((prev: any) => {
        if (prev && prev.id === receiptId) {
          return {
            ...prev,
            [`id_${side}`]: base64,
            interactions: updatedInteractions
          };
        }
        return prev;
      });

      alert(`¡Documento (${side === 'front' ? 'Anverso' : 'Reverso'}) guardado con éxito!`);
    } catch (err: any) {
      console.error("Error al subir documento de identidad:", err);
      alert("Hubo un error al procesar el documento. Inténtalo de nuevo.");
    } finally {
      setIsUploadingID(null);
    }
  };
  const [selectedPortfolioItem, setSelectedPortfolioItem] = useState<any>(null);
  const [compareMode, setCompareMode] = useState<'before' | 'after'>('after');
  const [newPortfolioTitle, setNewPortfolioTitle] = useState('');
  const [newPortfolioBeforeUrl, setNewPortfolioBeforeUrl] = useState('');
  const [newPortfolioAfterUrl, setNewPortfolioAfterUrl] = useState('');
  const [isSubmittingPortfolio, setIsSubmittingPortfolio] = useState(false);
  const [showAdminPortfolioForm, setShowAdminPortfolioForm] = useState(false);

  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [adminEmail, setAdminEmail] = useState(() => {
    return safeLocalStorage.getItem('construacha_last_email_admin') || '';
  });
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isAdminRegister, setIsAdminRegister] = useState(false);

  const handleAdminAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailToCheck = adminEmail.trim().toLowerCase();
    
    if (
      emailToCheck !== 'construachaapp@gmail.com' && 
      emailToCheck !== 'construacha@gmail.com'
    ) {
      setLoginError("Solo los correos autorizados de ConstruAcha pueden configurarse como administrador");
      return;
    }

    if (!adminPassword.trim() || adminPassword.length < 6) {
      setLoginError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');
    try {
      const fieldName = emailToCheck.replace(/[^a-zA-Z0-9]/g, '_');
      
      if (isAdminRegister) {
        // REGISTRO DE CLAVE EN FIRESTORE
        try {
          await setDoc(doc(db, 'app_settings', 'admin_passcode'), {
            [fieldName]: adminPassword.trim(),
            passcode: adminPassword.trim() // master fallback
          }, { merge: true });
        } catch (fsErr) {
          console.warn("No se pudo guardar en Firestore (registrando localmente):", fsErr);
        }
        
        try {
          await setDoc(doc(db, 'users', user?.uid || 'admin_offline'), {
            email: emailToCheck,
            role: 'admin',
            status: 'active',
            createdAt: new Date().toISOString()
          }, { merge: true });
        } catch (dbErr) {
          console.warn("Ignorado error en colección users:", dbErr);
        }

        // Marcar sesión admin localmente (¡Funciona siempre!)
        safeLocalStorage.setItem('construacha_admin_logged', 'true');
        safeLocalStorage.setItem('construacha_admin_email', emailToCheck);
        safeLocalStorage.setItem('construacha_last_email_admin', emailToCheck);
        safeLocalStorage.setItem(`construacha_pass_fallback_${fieldName}`, adminPassword.trim());
        setLocalIsAdmin(true);
        setLocalAdminEmail(emailToCheck);
        
        setAdminEmail('');
        setAdminPassword('');
        setIsAdminRegister(false);
        setShowAdminLoginModal(false);
      } else {
        // INICIO DE SESIÓN CON FIRESTORE O VALIDACIÓN LOCAL/MASTER
        let isValid = false;
        
        // Comprobar primero con el master fallback local para mayor seguridad e inmediatez
        if (adminPassword.trim() === '06201515' || adminPassword.trim() === 'construacha2026') {
          isValid = true;
        } else {
          try {
            const passcodeSnap = await getDoc(doc(db, 'app_settings', 'admin_passcode'));
            if (passcodeSnap.exists()) {
              const data = passcodeSnap.data();
              const registeredPasscode = data[fieldName];
              const masterPasscode = data.passcode;
              
              if (registeredPasscode === adminPassword.trim() || masterPasscode === adminPassword.trim()) {
                isValid = true;
              }
            } else {
              // Inicializar por primera vez si no existe el documento en la base de datos nueva
              if (adminPassword.trim() === '06201515') {
                try {
                  await setDoc(doc(db, 'app_settings', 'admin_passcode'), {
                    passcode: '06201515',
                    [fieldName]: '06201515'
                  });
                } catch (writeErr) {
                  console.warn("Error guardando passcode inicial:", writeErr);
                }
                isValid = true;
              }
            }
          } catch (fsReadErr) {
            console.warn("Error leyendo Firestore durante login, usando validación local:", fsReadErr);
            // Si el login falla por conexión/permisos, usamos el almacenamiento local como respaldo del dispositivo
            const localSavedPass = safeLocalStorage.getItem(`construacha_pass_fallback_${fieldName}`);
            if (localSavedPass === adminPassword.trim()) {
              isValid = true;
            }
          }
        }
        
        if (isValid) {
          safeLocalStorage.setItem('construacha_admin_logged', 'true');
          safeLocalStorage.setItem('construacha_admin_email', emailToCheck);
          safeLocalStorage.setItem('construacha_last_email_admin', emailToCheck);
          safeLocalStorage.setItem(`construacha_pass_fallback_${fieldName}`, adminPassword.trim());
          setLocalIsAdmin(true);
          setLocalAdminEmail(emailToCheck);
          
          setAdminEmail('');
          setAdminPassword('');
          setShowAdminLoginModal(false);

          // Ofrecer registro biométrico si es compatible y no está registrado para este email
          const hasBiometric = registeredBiometrics.some(b => b.type === 'admin' && b.email.toLowerCase() === emailToCheck.toLowerCase());
          if (biometricsSupported && !hasBiometric) {
            setBiometricRegPassword(adminPassword.trim());
            setBiometricRegError('');
            setBiometricRegSuccess('');
            setShowBiometricSettingsModal(true);
          }
        } else {
          setLoginError("La clave introducida es incorrecta o no ha sido registrada aún");
        }
      }
    } catch (err: any) {
      console.error("Error en autenticación de administrador:", err);
      setLoginError("Error de comunicación: " + err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAdminLogout = async () => {
    try {
      safeLocalStorage.removeItem('construacha_admin_logged');
      safeLocalStorage.removeItem('construacha_admin_email');
      setLocalIsAdmin(false);
      setLocalAdminEmail('');
      await signOut(auth);
      // Re-signin anonymously to keep client functionalities
      await signInAnonymously(auth);
      setView('home');
    } catch (err) {
      console.error("Error al salir de administrador:", err);
    }
  };

  // --- COMPORTAMIENTO DE ACCESO BIOMÉTRICO (HUELLA / FACEID) ---
  const base64urlToUint8Array = (base64url: string) => {
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };

  const handleRegisterBiometric = async (e: React.FormEvent) => {
    e.preventDefault();
    setBiometricRegError('');
    setBiometricRegSuccess('');
    setIsRegisteringBiometric(true);

    const email = isAdmin ? (localAdminEmail || '').toLowerCase().trim() : (user?.email || '').toLowerCase().trim();
    const type = isAdmin ? 'admin' : 'client';
    const password = biometricRegPassword.trim();

    if (!email) {
      setBiometricRegError("No se encontró un correo de sesión activo");
      setIsRegisteringBiometric(false);
      return;
    }

    if (!password) {
      setBiometricRegError("Por favor, ingresa tu contraseña o clave para confirmar");
      setIsRegisteringBiometric(false);
      return;
    }

    // Validar localmente si es admin
    if (isAdmin) {
      const fieldName = email.replace(/[^a-zA-Z0-9]/g, '_');
      const localSavedPass = safeLocalStorage.getItem(`construacha_pass_fallback_${fieldName}`);
      let isValid = false;
      if (password === '06201515' || password === 'construacha2026') {
        isValid = true;
      } else if (localSavedPass === password) {
        isValid = true;
      } else {
        // Intentar leer de Firestore
        try {
          const passcodeSnap = await getDoc(doc(db, 'app_settings', 'admin_passcode'));
          if (passcodeSnap.exists()) {
            const data = passcodeSnap.data();
            if (data[fieldName] === password || data.passcode === password) {
              isValid = true;
            }
          }
        } catch (fsErr) {
          console.warn("Error validando admin passcode en Firestore:", fsErr);
        }
      }

      if (!isValid) {
        setBiometricRegError("La clave introducida no coincide con tu clave de administrador");
        setIsRegisteringBiometric(false);
        return;
      }
    }

    try {
      // Si es cliente, podemos intentar un inicio de sesión silencioso con sus credenciales para asegurar que la contraseña es correcta
      if (!isAdmin && user && !user.isAnonymous) {
        try {
          await signInWithEmailAndPassword(auth, email, password);
        } catch (authErr: any) {
          setBiometricRegError("La contraseña ingresada es incorrecta");
          setIsRegisteringBiometric(false);
          return;
        }
      }

      // Proceder con WebAuthn de registro
      const randomId = Math.random().toString(36).substring(2);
      const userIdBuffer = Uint8Array.from(randomId, c => c.charCodeAt(0));
      const challengeBuffer = Uint8Array.from("construacha-secure-auth-challenge-2026", c => c.charCodeAt(0));
      const rpId = window.location.hostname === "localhost" ? "localhost" : window.location.hostname;

      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: challengeBuffer,
        rp: {
          name: "ConstruAcha",
          id: rpId,
        },
        user: {
          id: userIdBuffer,
          name: email,
          displayName: email,
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" }, // ES256
          { alg: -257, type: "public-key" } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        timeout: 60000,
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
      }) as PublicKeyCredential | null;

      if (!credential) {
        throw new Error("El navegador no devolvió ninguna credencial.");
      }

      // Guardar la credencial de forma segura y cifrada/ofuscada en el dispositivo
      const storageKey = `construacha_biometric_${type}_${email}`;
      const dataToSave = {
        credentialId: credential.id,
        email: email,
        secret: btoa(password), // Ofuscado ligero de contraseña local
        registeredAt: new Date().toISOString()
      };

      safeLocalStorage.setItem(storageKey, JSON.stringify(dataToSave));

      // Actualizar lista en localStorage
      const listKey = 'construacha_biometric_list';
      const currentListStr = safeLocalStorage.getItem(listKey) || '[]';
      const currentList = JSON.parse(currentListStr);
      const filteredList = currentList.filter((item: any) => !(item.type === type && item.email.toLowerCase() === email));
      filteredList.push({ type, email });
      safeLocalStorage.setItem(listKey, JSON.stringify(filteredList));
      setRegisteredBiometrics(filteredList);

      setBiometricRegSuccess("¡Enlace Biométrico (Huella / FaceID) activado con éxito!");
      setBiometricRegPassword('');
    } catch (err: any) {
      console.error("Error registrando WebAuthn:", err);
      setBiometricRegError("Error al registrar: " + (err.message || "No se completó la verificación biométrica."));
    } finally {
      setIsRegisteringBiometric(false);
    }
  };

  const handleDeactivateBiometric = () => {
    const email = isAdmin ? (localAdminEmail || '').toLowerCase().trim() : (user?.email || '').toLowerCase().trim();
    const type = isAdmin ? 'admin' : 'client';
    const storageKey = `construacha_biometric_${type}_${email}`;

    safeLocalStorage.removeItem(storageKey);

    const listKey = 'construacha_biometric_list';
    const currentListStr = safeLocalStorage.getItem(listKey) || '[]';
    const currentList = JSON.parse(currentListStr);
    const filteredList = currentList.filter((item: any) => !(item.type === type && item.email.toLowerCase() === email));
    safeLocalStorage.setItem(listKey, JSON.stringify(filteredList));
    setRegisteredBiometrics(filteredList);

    setBiometricRegSuccess("Acceso biométrico desactivado correctamente.");
    setBiometricRegError('');
  };

  const handleBiometricLogin = async (type: 'admin' | 'client', specifiedEmail?: string) => {
    setLoginError('');
    setClientAuthError('');

    let emailToUse = (specifiedEmail || '').toLowerCase().trim();

    if (!emailToUse) {
      const ofType = registeredBiometrics.filter(b => b.type === type);
      if (ofType.length === 1) {
        emailToUse = ofType[0].email;
      } else if (ofType.length > 1) {
        const currentFieldVal = type === 'admin' ? adminEmail.trim().toLowerCase() : clientLoginEmail.trim().toLowerCase();
        if (currentFieldVal && ofType.some(b => b.email === currentFieldVal)) {
          emailToUse = currentFieldVal;
        } else {
          emailToUse = ofType[0].email;
        }
      } else {
        alert("No tienes ningún acceso biométrico registrado en este dispositivo para " + (type === 'admin' ? 'administradores.' : 'clientes.'));
        return;
      }
    }

    const storageKey = `construacha_biometric_${type}_${emailToUse}`;
    const savedDataStr = safeLocalStorage.getItem(storageKey);
    if (!savedDataStr) {
      alert(`No hay registro biométrico para ${emailToUse} en este celular/dispositivo.`);
      return;
    }

    const savedData = JSON.parse(savedDataStr);
    const credentialId = savedData.credentialId;

    try {
      const challengeBuffer = Uint8Array.from("construacha-secure-auth-challenge-2026", c => c.charCodeAt(0));
      const rpId = window.location.hostname === "localhost" ? "localhost" : window.location.hostname;
      const credentialIdBuffer = base64urlToUint8Array(credentialId);

      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge: challengeBuffer,
        rpId: rpId,
        allowCredentials: [{
          id: credentialIdBuffer,
          type: 'public-key',
        }],
        userVerification: 'required',
        timeout: 60000,
      };

      const assertion = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions
      });

      if (!assertion) {
        throw new Error("No se pudo verificar la huella/FaceID.");
      }

      const decryptedPassword = atob(savedData.secret);

      if (type === 'admin') {
        setIsLoggingIn(true);
        const fieldName = emailToUse.replace(/[^a-zA-Z0-9]/g, '_');
        safeLocalStorage.setItem('construacha_admin_logged', 'true');
        safeLocalStorage.setItem('construacha_admin_email', emailToUse);
        safeLocalStorage.setItem('construacha_last_email_admin', emailToUse);
        safeLocalStorage.setItem(`construacha_pass_fallback_${fieldName}`, decryptedPassword);
        setLocalIsAdmin(true);
        setLocalAdminEmail(emailToUse);
        
        setAdminEmail('');
        setAdminPassword('');
        setShowAdminLoginModal(false);
        setIsLoggingIn(false);
      } else {
        setIsClientAuthLoading(true);
        await signInWithEmailAndPassword(auth, emailToUse, decryptedPassword);

        safeLocalStorage.removeItem('construacha_admin_logged');
        safeLocalStorage.removeItem('construacha_admin_email');
        safeLocalStorage.setItem('construacha_last_email_client', emailToUse);
        setLocalIsAdmin(false);
        setLocalAdminEmail('');

        setShowClientAuthModal(false);
        setClientLoginEmail('');
        setClientLoginPassword('');
        setClientLoginName('');
        setIsClientAuthLoading(false);

        if (pendingActionView) {
          if (pendingActionView === 'ai_chat') {
            setShowAIChat(true);
            setTimeout(speakWelcome, 800);
          } else if (pendingActionView === 'presupuesto_rubros') {
            resetBudgetFlow();
            setView('presupuesto_rubros');
          } else {
            setView(pendingActionView);
          }
          setPendingActionView(null);
        }
      }
    } catch (err: any) {
      console.error("Error en login biométrico:", err);
      const errMsg = "Error biométrico: " + (err.message || "Inténtalo de nuevo o ingresa con tu contraseña.");
      if (type === 'admin') {
        setLoginError(errMsg);
      } else {
        setClientAuthError(errMsg);
      }
    }
  };

  const submitComment = async () => {
    if (!newComment.trim()) return;
    
    const currentUserId = user?.uid || 'anonymous';
    const isBlocked = appSettings.blockedCommenters?.includes(currentUserId);
    
    if (isBlocked) {
      alert("⚠️ Tu usuario ha sido bloqueado para publicar comentarios por el administrador.");
      return;
    }

    setIsSubmittingComment(true);
    try {
      const commenterName = clientName.trim() || user?.email?.split('@')[0] || 'Cliente';
      await addDoc(collection(db, 'comments'), {
        userId: currentUserId,
        userName: commenterName,
        userPhoto: '',
        content: newComment,
        approved: false, // Default to false so it needs authorization
        createdAt: serverTimestamp()
      });
      setNewComment(''); // Clear input
      alert("Comentario enviado. Pendiente de autorización.");
    } catch (error) {
      console.error("Error al enviar comentario:", error);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const toggleCommentApproval = async (commentId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'comments', commentId), {
        approved: !currentStatus
      });
    } catch (error) {
      console.error("Error al actualizar comentario:", error);
    }
  };

  const deleteComment = async (commentId: string, force = false) => {
    if (force || window.confirm("¿CONFIRMAS QUE DESEAS ELIMINAR ESTE COMENTARIO PERMANENTEMENTE?")) {
      try {
        await deleteDoc(doc(db, 'comments', commentId));
        alert("¡Comentario eliminado con éxito!");
      } catch (error: any) {
        console.error("Error al eliminar comentario:", error);
        alert("⚠️ Error al eliminar comentario: " + error.message);
      }
    }
  };

  const blockCommenter = async (userId: string) => {
    if (!userId || userId === 'anonymous') {
      alert("No se puede bloquear un usuario anónimo sin ID válido.");
      return;
    }
    if (window.confirm("¿CONFIRMAS QUE DESEAS BLOQUEAR A ESTE CLIENTE EN LOS COMENTARIOS PARA QUE NO PUEDA SEGUIR PUBLICANDO?")) {
      try {
        const currentBlocked = appSettings.blockedCommenters || [];
        if (!currentBlocked.includes(userId)) {
          const updated = [...currentBlocked, userId];
          await updateAppSetting('blockedCommenters', updated);
          alert("¡Cliente bloqueado con éxito!");
        } else {
          alert("Este cliente ya se encuentra bloqueado.");
        }
      } catch (err) {
        console.error("Error al bloquear de comentarios:", err);
        alert("Error al intentar bloquear al cliente.");
      }
    }
  };

  const blockUser = async (userId: string) => {
    if (window.confirm("¿Bloquear permanentemente a este usuario?")) {
      try {
        await updateDoc(doc(db, 'users', userId), {
          status: 'blocked'
        });
      } catch (error) {
        console.error("Error al bloquear usuario:", error);
      }
    }
  };

  // Portfolio functions
  const [portfolioItems, setPortfolioItems] = useState([
    { id: 'p1', url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop", urlBefore: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=2070&auto=format&fit=crop", title: "RESIDENCIA MONOLÍTICA", type: 'image' },
    { id: 'p2', url: "https://images.unsplash.com/photo-1503387762-592dea58d11c?q=80&w=2070&auto=format&fit=crop", urlBefore: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=2070&auto=format&fit=crop", title: "CUBISMO GEOMÉTRICO", type: 'image' },
    { id: 'p3', url: "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?q=80&w=2070&auto=format&fit=crop", urlBefore: "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?q=80&w=2070&auto=format&fit=crop", title: "ESTRUCTURA MINIMALISTA", type: 'image' },
    { id: 'p4', url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=2070&auto=format&fit=crop", urlBefore: "https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?q=80&w=2070&auto=format&fit=crop", title: "PROYECTO RECTANGULAR", type: 'image' }
  ]);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const recordVideoInputRef = useRef(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      // Look ahead 5 seconds
      const futureTime = new Date(now.getTime() + 5000);
      const nowDate = futureTime.toISOString().split('T')[0];
      const nowTime = futureTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      reminders.forEach(reminder => {
        // Chat notifications never trigger the activeReminders full-screen alarm overlay (which is only for actual scheduled reminders)
        if (reminder.isChatNotification) return;

        if (!reminder.dismissed && !silencedAlertIds.includes(reminder.id) && (reminder.date === nowDate && reminder.time === nowTime)) {
          if (!activeReminders.find(ar => ar.id === reminder.id)) {
            setActiveReminders(prev => [...prev, reminder]);
            // Play sound if not already playing
            if (audioRef.current) {
              audioRef.current.play().catch(e => console.log("Audio play error:", e));
            }
            // Vibrate mobile if API is available (ring/vibrate effect)
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate([200, 100, 200]);
            }
          }
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [reminders, activeReminders, isAdmin, user?.uid, archivedBudgets, silencedAlertIds]);

  useEffect(() => {
    // Stop audio if no active reminders
    if (activeReminders.length === 0 && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [activeReminders]);

  const phoneNumber = "584265606661";
  const instagramUser = "construacha"; 
  const facebookUser = "construacha";
  const emailAddress = "construacha@gmail.com";
  const mainHeroImage = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=2070&auto=format&fit=crop";

  const servicesData = [
    { id: 'civil', icon: <HardHat size={20} />, title: "Construcción Civil", items: ["Casas residenciales", "Edificios", "Galpones", "Locales comerciales", "Tanques subterráneos", "Piscinas", "Mampostería", "Muros", "Placas", "Columnas", "Vigas", "Losas", "Zapatas", "Vigas de corona"] },
    { id: 'remodelacion', icon: <PencilRuler size={20} />, title: "Remodelaciones", items: ["Exteriores", "Interiores", "Salas de baño", "Cocinas en madera", "Cocina en porcelanato"] },
    { id: 'herreria', icon: <Hammer size={20} />, title: "Herrería", items: ["Estructuras metálicas", "Portones eléctricos", "Motores", "Rejas", "Puertas de seguridad", "Puertas 3D", "Ventanas panorámicas", "Cerramientos industriales"] },
    { id: 'plomeria', icon: <Droplets size={20} />, title: "Plomería", items: ["Destapado de cañerías", "Aguas blancas", "Aguas negras", "Filtraciones", "Impermeabilización", "Drenajes viales"] },
    { id: 'acabados', icon: <Paintbrush size={20} />, title: "Acabados", items: ["Pintura", "Estuco", "Drywall", "Wallpanel", "PVC 3D", "Grafiado", "Nuevas tecnologías"] },
    { id: 'lujo', icon: <Layers size={20} />, title: "Acabados de Lujo", items: ["Porcelanato", "Baldosas", "Granito", "Revestimientos", "Pulido de pisos"] },
    { id: 'electrico', icon: <Zap size={20} />, title: "Electricidad", items: ["Industrial", "Doméstica", "Iluminación LED", "Tableros", "Acometidas"] },
    { id: 'generales', icon: <Wrench size={20} />, title: "Servicios Generales", items: ["Servicios Varios"] },
    { id: 'logistica', icon: <Trash2 size={20} />, title: "Logística", items: ["Demolición", "Bote de escombros", "Limpieza de terreno", "Movimiento de tierra"] },
     { id: 'legal', icon: <Scale size={20} />, title: "Asesoría Legal", items: ["Permisos", "Proyectos de ingeniería", "Cálculos estructurales", "Solvencias técnicas"] }
   ];

   const stats = useMemo(() => {
     const totalVolume = archivedBudgets.length;
     let totalPresupuestadoUSD = 0;
     let confirmedCount = 0;
     let signedCount = 0;
     
     // Initialize parent rubro counts
     const rubroCounts: { [key: string]: number } = {};
     servicesData.forEach(s => {
       rubroCounts[s.title] = 0;
     });

     archivedBudgets.forEach(b => {
       if (b.draftInvoice?.totalUSD) {
         totalPresupuestadoUSD += b.draftInvoice.totalUSD;
       }
       if (b.confirmed) {
         confirmedCount++;
       }
       if (b.signature) {
         signedCount++;
       }

       const servicesList = Array.isArray(b.servicios) ? b.servicios : [];
       servicesData.forEach(parent => {
         const hasItem = parent.items.some(item => servicesList.includes(item));
         if (hasItem) {
           rubroCounts[parent.title] += 1;
         }
       });
     });

     const approvalRate = totalVolume > 0 ? Math.round((confirmedCount / totalVolume) * 100) : 0;
     const signatureRate = totalVolume > 0 ? Math.round((signedCount / totalVolume) * 100) : 0;

     const rubroStats = servicesData.map(s => ({
       title: s.title,
       count: rubroCounts[s.title] || 0,
       percentage: totalVolume > 0 ? Math.round(((rubroCounts[s.title] || 0) / totalVolume) * 100) : 0,
       icon: s.icon
     })).sort((a, b) => b.count - a.count);

     return {
       totalVolume,
       totalPresupuestadoUSD,
       confirmedCount,
       signedCount,
       approvalRate,
       signatureRate,
       rubroStats
     };
   }, [archivedBudgets]);

   const socialData = {
    whatsapp: { label: "IR A CHAT", url: `https://wa.me/${phoneNumber}`, qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://wa.me/${phoneNumber}`, icon: (c) => <MessageCircle size={24} className={c} />, title: "WHATSAPP" },
    instagram: { label: "IR AL PERFIL", url: `https://instagram.com/${instagramUser}`, qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://instagram.com/${instagramUser}`, icon: (c) => <Instagram size={24} className={c} />, title: "INSTAGRAM" },
    facebook: { label: "IR AL PERFIL", url: `https://facebook.com/${facebookUser}`, qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://facebook.com/${facebookUser}`, icon: (c) => <Facebook size={24} className={c} />, title: "FACEBOOK" },
    email: { label: "IR A EMAIL", url: `mailto:${emailAddress}`, qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=mailto:${emailAddress}`, icon: (c) => <Mail size={24} className={c} />, title: "GMAIL" }
  };

  const handleRubroToggle = (rubro) => {
    if (selectedRubros.find(r => r.id === rubro.id)) {
      setSelectedRubros(selectedRubros.filter(r => r.id !== rubro.id));
      setSelectedServices(selectedServices.filter(s => !rubro.items.includes(s)));
    } else {
      setSelectedRubros([...selectedRubros, rubro]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      const newFiles = files.map(file => ({
        file,
        id: Math.random().toString(36).substr(2, 9),
        preview: URL.createObjectURL(file as any),
        type: (file as any).type.startsWith('video') ? 'video' : 'image'
      }));

      // If we are in portfolio view, add directly to portfolio
      if (view === 'portfolio') {
        if (isAdmin) {
          newFiles.forEach(async (nf) => {
            try {
              let b64 = nf.preview;
              if (nf.file) {
                b64 = await fileToBase64(nf.file as File);
              }
              const id = 'p_' + Math.random().toString(36).substr(2, 9);
              await setDoc(doc(db, 'portfolio', id), {
                id,
                title: "NUEVA OBRA REGISTRADA",
                url: b64,
                urlBefore: null,
                type: nf.type,
                createdAt: new Date().toISOString()
              });
            } catch (err) {
              console.error("Error al subir archivo rápido en portafolio:", err);
            }
          });
        } else {
          const portfolioEntries = newFiles.map(nf => ({
            id: nf.id,
            url: nf.preview,
            title: "NUEVA OBRA REGISTRADA",
            type: nf.type
          }));
          setPortfolioItems(prev => [...portfolioEntries, ...prev]);
        }
      } else {
        setAttachedFiles(prev => [...prev, ...newFiles]);
      }
    }
    e.target.value = '';
  };

  const handlePortfolioFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, field: 'before' | 'after') => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        if (field === 'before') {
          setNewPortfolioBeforeUrl(base64);
        } else {
          setNewPortfolioAfterUrl(base64);
        }
      } catch (err) {
        console.error("Error al leer archivo del portafolio:", err);
      }
    }
    e.target.value = '';
  };

  const handleCreatePortfolioItem = async () => {
    if (!newPortfolioTitle.trim() || !newPortfolioAfterUrl) {
      alert("Por favor escribe un título y selecciona la foto principal (Después)");
      return;
    }
    setIsSubmittingPortfolio(true);
    try {
      const id = 'p_' + Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'portfolio', id), {
        id,
        title: newPortfolioTitle.toUpperCase(),
        url: newPortfolioAfterUrl,
        urlBefore: newPortfolioBeforeUrl || null,
        type: 'image',
        createdAt: new Date().toISOString()
      });
      setNewPortfolioTitle('');
      setNewPortfolioBeforeUrl('');
      setNewPortfolioAfterUrl('');
      setShowAdminPortfolioForm(false);
    } catch (error) {
      console.error("Error al registrar obra en portafolio:", error);
      handleFirestoreError(error, OperationType.WRITE, 'portfolio');
    } finally {
      setIsSubmittingPortfolio(false);
    }
  };

  const handleDeletePortfolioItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar abrir lightbox
    if (!window.confirm("¿Seguro que deseas eliminar esta obra del portafolio?")) return;
    try {
      await deleteDoc(doc(db, 'portfolio', id));
    } catch (error) {
      console.error("Error al eliminar obra:", error);
      handleFirestoreError(error, OperationType.DELETE, `portfolio/${id}`);
    }
  };

  const removeFile = (id) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id));
    if (previewImage?.id === id) setPreviewImage(null);
  };

  const resetForm = () => {
    setSelectedRubros([]);
    setSelectedServices([]);
    setDescription('');
    setUserPhone('');
    setCountryCode('+58');
    setClientType('');
    setClientName('');
    setClientIdType('V');
    setClientIdNumber('');
    setClientEmail(user?.email || '');
    setUserLocation(null);
    setAttachedFiles([]);
  };

  const getUserLocation = () => {
    if (!navigator.geolocation) {
      alert("La geolocalización no es compatible con este navegador.");
      return;
    }
    
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setUserLocation({ lat, lon });
        setIsLocating(false);
      },
      (error) => {
        console.error("Error obteniendo ubicación:", error);
        setIsLocating(false);
        alert("No se pudo obtener la ubicación. Por favor, active el GPS o permita el acceso.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const MapPreview = ({ lat, lon }: { lat: number, lon: number }) => (
    <div 
      className="w-full h-32 rounded-2xl overflow-hidden border border-white/10 relative mt-2 group bg-zinc-800 animate-in fade-in zoom-in duration-500 hover:border-[#FFCD00]/50 transition-all"
    >
      <div className="absolute inset-0 z-10 bg-white/0 pointer-events-none" />
      <iframe
        key={`${lat}-${lon}`}
        title="Mapa de Ubicación"
        width="100%"
        height="100%"
        frameBorder="0"
        scrolling="no"
        src={`https://maps.google.com/maps?q=${lat},${lon}&hl=es&z=15&t=m&output=embed&_cache=${Date.now()}`}
        className="brightness-[0.8] contrast-[1.2] invert-[0.05] pointer-events-none"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none z-20" />
      <div className="absolute bottom-3 left-3 flex items-center gap-2 z-30">
        <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.8)]" />
        <span className="text-[7px] font-black uppercase text-[#FFCD00] tracking-[0.2em]">PUNTO DE INTERÉS FIJADO</span>
      </div>
      <div className="absolute top-2 right-2 z-30 flex items-center gap-2">
         <button 
           onClick={(e) => { 
             e.preventDefault();
             e.stopPropagation(); 
             getUserLocation(); 
           }} 
           className="p-2.5 bg-red-600 rounded-lg text-white hover:bg-[#FFCD00] hover:text-black transition-all shadow-xl active:scale-95 group/zap"
           title="Actualizar mi ubicación actual"
         >
           <Zap size={14} className={cn(isLocating ? "animate-pulse" : "")} />
         </button>
         <button 
           onClick={() => window.open(`https://www.google.com/maps?q=${lat},${lon}`, '_blank', 'noopener,noreferrer')}
           className="p-2.5 bg-black/50 backdrop-blur-md rounded-lg text-white hover:text-[#FFCD00] transition-colors shadow-xl"
           title="Ver en Google Maps"
         >
           <ExternalLink size={14} />
         </button>
      </div>
    </div>
  );

  const snoozeReminder = async (reminderId, minutes) => {
    const snoozeTime = new Date(Date.now() + minutes * 60000);
    const snoozeDateStr = snoozeTime.toISOString().split('T')[0];
    const snoozeTimeStr = snoozeTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    
    try {
      await updateDoc(doc(db, 'reminders', reminderId), {
        date: snoozeDateStr,
        time: snoozeTimeStr,
        isChatNotification: false
      });
      setActiveReminders(prev => prev.filter(r => r.id !== reminderId));
      setShowSnoozeId(null);
    } catch (error) {
      console.error("Error al posponer recordatorio en Firebase:", error);
      handleFirestoreError(error, OperationType.UPDATE, `reminders/${reminderId}`);
    }
  };

  const dismissReminder = async (reminderId) => {
    try {
      await updateDoc(doc(db, 'reminders', reminderId), {
        dismissed: true
      });
      setActiveReminders(prev => prev.filter(r => r.id !== reminderId));
    } catch (error) {
      console.error("Error al desactivar recordatorio en Firebase:", error);
      handleFirestoreError(error, OperationType.UPDATE, `reminders/${reminderId}`);
    }
  };

  const handleCloseAlert = (rem: any) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setSilencedAlertIds(prev => [...prev, rem.id]);
    setActiveReminders(prev => prev.filter(r => r.id !== rem.id));
    if (!rem.isChatNotification) {
      dismissReminder(rem.id);
    }
  };

  const sendRequest = async () => {
    if (isSubmittingBudget) return;
    setBudgetError(null);

    // VALIDACIÓN DE CORREO ESTRICTO (TERMINACIONES VÁLIDAS COMO GMAIL, HOTMAIL, OUTLOOK, YAHOO, ETC.)
    const emailError = validateClientEmail(clientEmail);
    if (emailError) {
      setBudgetError(`ERROR EN CORREO: ${emailError}`);
      return;
    }

    setIsSubmittingBudget(true);
    try {
      let nextOrderId = 1;
      const nextOrderIdQuery = query(collection(db, 'budgets'), orderBy('orderId', 'desc'), limit(1));
      const querySnapshot = await getDocs(nextOrderIdQuery);
      if (!querySnapshot.empty) {
        const highestDoc = querySnapshot.docs[0].data();
        if (highestDoc && typeof highestDoc.orderId === 'number') {
          nextOrderId = highestDoc.orderId + 1;
        }
      }

      const adminId = `REF-CA-2026-${String(nextOrderId).padStart(4, '0')}`;
      const fullClientName = clientType === 'EMPRESA' ? clientName : `${clientType}. ${clientName}`;
      const fullId = `${clientIdType}-${clientIdNumber}`;
      
      const previewsToSave = attachedFiles.map((f: any) => ({
        preview: f.preview || '',
        type: f.type || ''
      }));

      const newBudget = {
        id: adminId,
        orderId: nextOrderId,
        cliente: fullClientName,
        idDocumento: fullId,
        tipo: clientType,
        servicios: [...selectedServices],
        descripcion: description,
        telefono: `${countryCode}${userPhone}`,
        email: clientEmail,
        location: userLocation || null,
        fecha: new Date().toLocaleDateString('es-ES'),
        hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        fotos: attachedFiles.length,
        previews: previewsToSave,
        confirmed: false,
        interactions: [],
        uid: user?.uid || 'anonymous'
      };

      await setDoc(doc(db, 'budgets', adminId), newBudget);
      setLastSubmittedBudget(newBudget);
      setSelectedReceipt(newBudget);
      setSelectedBudget(newBudget);
      resetForm();
      setView('comprobante_validacion');
    } catch (error: any) {
      console.error("Error al enviar presupuesto:", error);
      const errMsg = error?.message || String(error);
      setBudgetError(`Error de envío: ${errMsg}. Por favor revise su conexión de red o contacte con soporte.`);
    } finally {
      setIsSubmittingBudget(false);
    }
  };

  const confirmBudget = async (id) => {
    const logEntry = { 
      type: 'system', 
      text: 'Presupuesto confirmado por administración. Verificación de identidad solicitada.', 
      time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), 
      date: new Date().toLocaleDateString('es-ES') 
    };
    try {
      const budgetRef = doc(db, 'budgets', id);
      const budgetDoc = archivedBudgets.find(b => b.id === id) || selectedBudget || lastSubmittedBudget || selectedReceipt;
      
      const existingInteractions = budgetDoc?.interactions || [];
      const updatedInteractions = [logEntry, ...existingInteractions];
      
      await updateDoc(budgetRef, {
        confirmed: true,
        requestID: true,
        interactions: updatedInteractions
      });

      // Actualizar estados locales inmediatamente para feedback visual instantáneo
      if (selectedBudget?.id === id) {
        setSelectedBudget(prev => prev ? { ...prev, confirmed: true, requestID: true, interactions: updatedInteractions } : null);
      }
      if (selectedReceipt?.id === id) {
        setSelectedReceipt(prev => prev ? { ...prev, confirmed: true, requestID: true, interactions: updatedInteractions } : null);
      }
      if (lastSubmittedBudget?.id === id) {
        setLastSubmittedBudget(prev => prev ? { ...prev, confirmed: true, requestID: true, interactions: updatedInteractions } : null);
      }
      setArchivedBudgets(prev => prev.map(b => b.id === id ? { ...b, confirmed: true, requestID: true, interactions: updatedInteractions } : b));
    } catch (error) {
      console.error("Error al confirmar presupuesto en Firebase:", error);
      handleFirestoreError(error, OperationType.UPDATE, `budgets/${id}`);
    }
  };

  const logInteraction = async (id, type, customText?: string) => {
    const logEntry = { 
      type, 
      text: customText || (type === 'call' ? '📞 Intento de contacto telefónico realizado' : '💬 Chat de WhatsApp iniciado'), 
      time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString('es-ES')
    };
    try {
      const budgetRef = doc(db, 'budgets', id);
      const budgetDoc = archivedBudgets.find(b => b.id === id);
      if (budgetDoc) {
        const updatedInteractions = [logEntry, ...(budgetDoc.interactions || [])];
        await updateDoc(budgetRef, {
          interactions: updatedInteractions
        });
        if (selectedBudget?.id === id) {
          setSelectedBudget(prev => prev ? { ...prev, interactions: updatedInteractions } : null);
        }
      }
    } catch (error) {
      console.error("Error al registrar interacción en Firebase:", error);
      handleFirestoreError(error, OperationType.UPDATE, `budgets/${id}`);
    }
  };

  const addReminder = async (budgetId, noteText?: string) => {
    if (!reminderConfig.date || !reminderConfig.time) return;
    const remId = Math.random().toString(36).substr(2, 9);
    const newReminder = {
      id: remId,
      budgetId,
      clientName: archivedBudgets.find(b => b.id === budgetId)?.cliente || '',
      date: reminderConfig.date,
      time: reminderConfig.time,
      note: noteText || '',
      dismissed: false
    };
    try {
      await setDoc(doc(db, 'reminders', remId), newReminder);
      setShowReminderForm(null);
      setReminderConfig({ date: '', time: '' });

      if (noteText) {
        await logInteraction(budgetId, 'note', noteText);
      }
    } catch (error) {
      console.error("Error al programar recordatorio en Firebase:", error);
      handleFirestoreError(error, OperationType.WRITE, `reminders/${remId}`);
    }
  };

  const addManualNote = (id) => {
    if (!followUpNote.trim()) return;
    logInteraction(id, 'note', followUpNote);
    setFollowUpNote('');
  };

  useEffect(() => {
    // Get active budget ID for chat depending exactly on the view to prevent cross-budget/cross-client mix-up
    const activeChatBudgetId = (view === 'comprobante_detalle' || view === 'comprobante_validacion')
      ? (selectedReceipt?.id || null)
      : (view === 'budget_details' ? (selectedBudget?.id || null) : null);

    // Limpiar inmediatamente el estado para que no se muestren mensajes del presupuesto/cliente anterior
    setChatMessages([]);

    if (!activeChatBudgetId) {
      return;
    }
    
    const q = query(
      collection(db, 'budget_chats'),
      where('budgetId', '==', activeChatBudgetId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Ordenar en memoria por timestamp para evitar errores de índice compuesto de Firestore
      msgs.sort((a: any, b: any) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeA - timeB;
      });
      setChatMessages(msgs);

      // Si soy cliente y estoy viendo este chat de presupuesto, marcar mensajes del admin como leídos de forma segura
      if (!isAdmin && activeChatBudgetId) {
        snapshot.docs.forEach(async (d) => {
          const data = d.data();
          if (data.sender === 'admin' && (!data.received || !data.read)) {
            const key = `${d.id}_read`;
            if (!processedMessageUpdatesRef.current.has(key)) {
              processedMessageUpdatesRef.current.add(key);
              await updateDoc(doc(db, 'budget_chats', d.id), { received: true, read: true });
            }
          }
        });
      }
    }, (error) => {
      console.error("Error listening to chat messages:", error);
    });
    
    return () => unsubscribe();
  }, [view, selectedBudget?.id, selectedReceipt?.id]);

  // --- REAL-TIME CLOUD SYNC FOR DIRECT CHAT SUPPORT ---
  useEffect(() => {
    if (!showDirectChatModal || !selectedDirectChatUser) {
      setDirectChatMessages([]);
      return;
    }

    const directChatId = getDirectChatId(user, selectedDirectChatUser, isAdmin);

    const q = query(
      collection(db, 'budget_chats'),
      where('budgetId', '==', directChatId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      msgs.sort((a: any, b: any) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeA - timeB;
      });
      setDirectChatMessages(msgs);

      // Si soy cliente y estoy viendo el chat soporte directo, marcar mensajes del admin como leídos de forma segura
      if (!isAdmin && showDirectChatModal) {
        snapshot.docs.forEach(async (d) => {
          const data = d.data();
          if (data.sender === 'admin' && (!data.received || !data.read)) {
            const key = `${d.id}_read`;
            if (!processedMessageUpdatesRef.current.has(key)) {
              processedMessageUpdatesRef.current.add(key);
              await updateDoc(doc(db, 'budget_chats', d.id), { received: true, read: true });
            }
          }
        });
      }
    }, (error) => {
      console.error("Error listening to direct chat messages:", error);
    });

    return () => unsubscribe();
  }, [showDirectChatModal, selectedDirectChatUser?.id, selectedDirectChatUser?.email, user?.uid, user?.email, isAdmin]);

  // Efecto para auto-scrollear al final de la conversación en chats directos de soporte
  useEffect(() => {
    if (showDirectChatModal && directChatEndRef.current) {
      const scrollTimer = setTimeout(() => {
        directChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
      return () => clearTimeout(scrollTimer);
    }
  }, [showDirectChatModal, directChatMessages.length]);

  // Sincronización única en segundo plano al cargar para que el cliente marque como "recibidos" (doble palomita gris)
  // los mensajes del administrador sin crear un listener de tiempo real infinito y pesado.
  useEffect(() => {
    if (isAdmin || !user?.uid) return;

    const performOneTimeReceivedSync = async () => {
      try {
        const clientChatId = getDirectChatId(user, null, false);
        const clientBudgetIds = archivedBudgets.map(b => b.id).filter(Boolean);
        const allChatIds = [clientChatId, ...clientBudgetIds];

        if (allChatIds.length === 0) return;

        // Dividir en grupos de 10 por la limitación de Firestore de 'in'
        for (let i = 0; i < allChatIds.length; i += 10) {
          const chunkedIds = allChatIds.slice(i, i + 10);
          const q = query(
            collection(db, 'budget_chats'),
            where('budgetId', 'in', chunkedIds)
          );
          const snapshot = await getDocs(q);
          snapshot.docs.forEach(async (d) => {
            const data = d.data();
            if (data.sender === 'admin' && !data.received) {
              const key = `${d.id}_received`;
              if (!processedMessageUpdatesRef.current.has(key)) {
                processedMessageUpdatesRef.current.add(key);
                await updateDoc(doc(db, 'budget_chats', d.id), { received: true });
              }
            }
          });
        }
      } catch (err) {
        console.warn("Error silencioso en sincronización única de recibido:", err);
      }
    };

    performOneTimeReceivedSync();
  }, [isAdmin, user?.uid, archivedBudgets.length]);

  // Sincronización segura activada por recordatorios de nuevos chats para marcar como "recibido" (doble palomita gris)
  useEffect(() => {
    if (isAdmin || !user?.uid) return;
    
    const activeChatReminders = reminders.filter(
      r => r.recipient === 'client' && r.isChatNotification && !r.dismissed
    );

    activeChatReminders.forEach(async (r) => {
      try {
        const q = query(
          collection(db, 'budget_chats'),
          where('budgetId', '==', r.budgetId)
        );
        const snapshot = await getDocs(q);
        snapshot.docs.forEach(async (d) => {
          const data = d.data();
          if (data.sender === 'admin' && !data.received) {
            const key = `${d.id}_received`;
            if (!processedMessageUpdatesRef.current.has(key)) {
              processedMessageUpdatesRef.current.add(key);
              await updateDoc(doc(db, 'budget_chats', d.id), { received: true });
            }
          }
        });
      } catch (err) {
        console.warn("Error marcando recibido por notificación:", err);
      }
    });
  }, [reminders, isAdmin, user?.uid]);

  const sendDirectChatMessage = async (text: string) => {
    if (!text.trim()) return;
    try {
      const directChatId = getDirectChatId(user, selectedDirectChatUser, isAdmin);
      
      const sender = isAdmin ? 'admin' : 'client';
      const clientName = isAdmin ? (selectedDirectChatUser.name || 'Cliente') : (user?.displayName || user?.email || 'Cliente');

      // Guardar mensaje directo en Firebase
      await addDoc(collection(db, 'budget_chats'), {
        budgetId: directChatId,
        sender,
        text,
        mediaUrl: null,
        mediaType: null,
        mediaName: null,
        timestamp: serverTimestamp()
      });

      // Crear alerta de notificación en tiempo real
      const remId = Math.random().toString(36).substr(2, 9);
      const newReminder = {
        id: remId,
        budgetId: directChatId,
        clientName: clientName,
        date: new Date().toLocaleDateString('es-ES'),
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        note: `MENSAJE DIRECTO: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`,
        dismissed: false,
        isChatNotification: true,
        recipient: isAdmin ? 'client' : 'admin'
      };
      await setDoc(doc(db, 'reminders', remId), newReminder);

    } catch (error) {
      console.error("Error sending direct chat message:", error);
    }
  };

  const editDirectChatMessage = async (msgId: string, newText: string) => {
    if (!newText.trim()) return;
    try {
      await updateDoc(doc(db, 'budget_chats', msgId), {
        text: newText,
        isEdited: true
      });
      setEditingMessageId(null);
      setEditingMessageText('');
    } catch (error) {
      console.error("Error editing direct chat message:", error);
    }
  };

  const deleteDirectChatMessage = async (msgId: string) => {
    try {
      await deleteDoc(doc(db, 'budget_chats', msgId));
    } catch (error) {
      console.error("Error deleting direct chat message:", error);
    }
  };

  const clearDirectChatHistory = async (directChatId: string, targetUserObj?: any) => {
    try {
      const q = query(
        collection(db, 'budget_chats'),
        where('budgetId', '==', directChatId)
      );
      const snapshot = await getDocs(q);
      const batchPromises = snapshot.docs.map(d => deleteDoc(doc(db, 'budget_chats', d.id)));
      await Promise.all(batchPromises);
      
      // Eliminar también recordatorios asociados
      const nQ = query(
        collection(db, 'reminders'),
        where('budgetId', '==', directChatId)
      );
      const nSnapshot = await getDocs(nQ);
      const nPromises = nSnapshot.docs.map(d => deleteDoc(doc(db, 'reminders', d.id)));
      await Promise.all(nPromises);

      // Eliminar cualquier otro recordatorio suelto o heredado que pertenezca a este usuario (por ejemplo, bitácoras)
      if (targetUserObj) {
        const allRemindersSnap = await getDocs(collection(db, 'reminders'));
        const matchingDocs = allRemindersSnap.docs.filter(docSnap => {
          const reminder = { id: docSnap.id, ...docSnap.data() };
          return isNotificationForUser(reminder, targetUserObj, archivedBudgets);
        });
        const extraPromises = matchingDocs.map(d => deleteDoc(doc(db, 'reminders', d.id)));
        await Promise.all(extraPromises);
      }
    } catch (error) {
      console.error("Error clearing direct chat history:", error);
    }
  };

  const clearAllChatsAndNotifications = async () => {
    try {
      console.log("Iniciando purga total de bitácoras de chat y notificaciones...");
      // 1. Eliminar todos los mensajes de budget_chats
      const qChats = query(collection(db, 'budget_chats'));
      const snapshotChats = await getDocs(qChats);
      const deleteChatsPromises = snapshotChats.docs.map(d => deleteDoc(doc(db, 'budget_chats', d.id)));
      await Promise.all(deleteChatsPromises);
      
      // 2. Eliminar todas las notificaciones de chat en reminders (isChatNotification: true)
      const qReminders = query(collection(db, 'reminders'));
      const snapshotReminders = await getDocs(qReminders);
      const deleteRemindersPromises = snapshotReminders.docs
        .filter(d => d.data().isChatNotification === true)
        .map(d => deleteDoc(doc(db, 'reminders', d.id)));
      await Promise.all(deleteRemindersPromises);
      
      console.log("Purga completada.");
    } catch (error) {
      console.error("Error clearing all chats and notifications:", error);
    }
  };

  const sendChatMessage = async (
    budgetId: string, 
    sender: 'admin' | 'client', 
    text: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'video' | 'file',
    mediaName?: string
  ) => {
    if (!text.trim()) return;
    try {
      const budgetRef = doc(db, 'budgets', budgetId);
      const budgetSnap = await getDoc(budgetRef);
      const budgetData = budgetSnap.exists() ? budgetSnap.data() : null;
      const clientName = budgetData?.cliente || '';
      
      // Save message to budget_chats collection
      await addDoc(collection(db, 'budget_chats'), {
        budgetId,
        sender,
        text,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        mediaName: mediaName || null,
        timestamp: serverTimestamp()
      });

      // Log interaction in budget's history
      const logEntry = {
        date: new Date().toLocaleDateString('es-ES'),
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        type: 'chat',
        text: `${sender === 'admin' ? 'ADMIN' : 'CLIENTE'}: ${text}`
      };

      if (budgetData) {
        const updatedInteractions = [logEntry, ...(budgetData.interactions || [])];
        await updateDoc(budgetRef, {
          interactions: updatedInteractions
        });
        
        // Also update local state if selected
        if (selectedBudget?.id === budgetId) {
          setSelectedBudget(prev => prev ? { ...prev, interactions: updatedInteractions } : null);
        }
        if (selectedReceipt?.id === budgetId) {
          setSelectedReceipt(prev => prev ? { ...prev, interactions: updatedInteractions } : null);
        }
      }

      // Notification / Reminder for other party
      const remId = Math.random().toString(36).substr(2, 9);
      const newReminder = {
        id: remId,
        budgetId,
        clientName: clientName || 'CLIENTE',
        date: new Date().toLocaleDateString('es-ES'),
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        note: `NUEVO CHAT: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`,
        dismissed: false,
        isChatNotification: true,
        recipient: sender === 'admin' ? 'client' : 'admin'
      };
      await setDoc(doc(db, 'reminders', remId), newReminder);

    } catch (error) {
      console.error("Error sending chat message:", error);
    }
  };

  const [isUploadingChatMedia, setIsUploadingChatMedia] = useState(false);

  const handleChatMediaSelect = async (
    e: React.ChangeEvent<HTMLInputElement>, 
    budgetId: string, 
    sender: 'admin' | 'client', 
    type: 'image' | 'video' | 'file'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Detectar dinámicamente si el archivo adjuntado es una imagen o video para tratarlo como tal
    let resolvedType = type;
    if (resolvedType === 'file') {
      if (file.type.startsWith('image/')) {
        resolvedType = 'image';
      } else if (file.type.startsWith('video/')) {
        resolvedType = 'video';
      }
    }

    setIsUploadingChatMedia(true);
    try {
      let base64 = "";
      if (resolvedType === 'image') {
        // Para imágenes de cámara o adjuntos de tipo imagen, las comprimiremos quirúrgicamente
        try {
          base64 = await compressImageFile(file, 800, 800, 0.5);
        } catch (compressErr) {
          console.warn("Fallo de compresión de imagen, leyendo original:", compressErr);
          if (file.size > 700 * 1024) {
            throw new Error("La imagen es demasiado grande para enviarse sin comprimir (límite de 700KB).");
          }
          base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve('');
          });
        }
      } else {
        // Para videos y archivos que no se pueden comprimir en navegador, limitamos a 700KB por el límite de Firestore (1MB)
        if (file.size > 700 * 1024) {
          throw new Error("El video o archivo es muy grande. El límite para subir por chat es de 700KB.");
        }
        base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve('');
        });
      }

      if (!base64) {
        throw new Error("No se pudo procesar o leer el archivo seleccionado.");
      }

      // Validar tamaño final del string Base64 para prevenir errores en Firestore (límite estricto de 1MB por documento)
      const estimatedBytes = base64.length * 0.75;
      if (estimatedBytes > 850 * 1024) {
        throw new Error("El archivo procesado excede el límite de almacenamiento de 850KB.");
      }

      await sendChatMessage(
        budgetId, 
        sender, 
        `📎 [${resolvedType.toUpperCase()}] ${file.name}`, 
        base64, 
        resolvedType, 
        file.name
      );
    } catch (err: any) {
      console.error("Error al cargar media en chat:", err);
      alert(`Error al subir archivo: ${err.message || err}`);
    } finally {
      setIsUploadingChatMedia(false);
      // Limpiar valor del input para permitir subir el mismo archivo consecutivamente si se desea
      e.target.value = '';
    }
  };

  const resetBudgetFlow = () => {
    setSelectedRubros([]);
    setSelectedServices([]);
    setClientType('');
    setClientName('');
    setClientIdNumber('');
    setClientIdType('V');
    setClientEmail(user?.email || '');
    setDescription('');
    setUserPhone('');
    setUserLocation(null);
    setCountryCode('+58');
    setFollowUpNote('');
    setBudgetError(null);
    setLastSubmittedBudget(null);
    setSelectedReceipt(null);
    safeLocalStorage.removeItem('construacha_view');
    safeLocalStorage.removeItem('construacha_selectedReceipt');
    safeLocalStorage.removeItem('construacha_lastSubmittedBudget');
  };

    const FullBrandLogo = ({ className = "", variant = "default", alignLeft = false }: { className?: string, variant?: string, alignLeft?: boolean }) => {
    const isCompact = variant === "compact";
    const isQR = variant === "qr";
    const isSocial = variant === "social";
    const isIA = variant === "ia";
    const isBitacora = variant === "bitacora";
    const isAuth = variant === "auth";
    const isHistorial = variant === "historial";
    const isCustom = variant === "default" || isQR || isSocial || isIA || isBitacora || isAuth || isHistorial;
    
    const containerClasses = cn(
      "flex flex-col origin-left",
      alignLeft ? "w-fit items-start" : "w-full items-center",
      className
    );

    // --- BLOQUEO MAESTRO TOTAL DE PARÁMETROS ---
    const logoLayer = (
      <div className={cn(
        "absolute transition-all duration-300 pointer-events-none",
        isCompact ? "h-9 -left-2 -top-1.5 w-auto" : 
        variant === "default" ? (alignLeft ? "h-12 -left-3 top-[-12px] w-auto" : "h-12 left-1 top-[-12px] w-auto") : 
        variant === "auth" ? "h-12 -left-9 top-[-12px] w-auto" : 
        variant === "historial" ? "h-12 -left-4 top-[-12px] w-auto" : 
        variant === "social" ? "h-12 left-1 top-[-12px] w-auto" : 
        variant === "bitacora" ? "h-12 left-5 top-[-12px] w-auto" : 
        variant === "ia" ? "h-12 -left-1 top-[-12px] w-auto" : 
        isQR ? "h-12 -left-6 top-[-12px] w-auto" : 
        "h-12 left-1 top-[-12px] w-auto"
      )}>
        <img 
          src="/logo_acha.png" 
          className="h-full w-auto block" 
          alt="Logo Icono" 
        />
        {/* CAPA DE DESTELLO NEGRO PARA EL LOGO (POWER-CLIP) */}
        <div className="absolute inset-0 overflow-hidden" 
             style={{ 
               WebkitMaskImage: 'url(/logo_acha.png)', 
               maskImage: 'url(/logo_acha.png)',
               WebkitMaskSize: 'contain',
               maskSize: 'contain',
               WebkitMaskRepeat: 'no-repeat',
               maskRepeat: 'no-repeat'
             }}>
          <motion.div
            initial={{ backgroundPosition: '200% 0' }}
            animate={{ backgroundPosition: '-100% 0' }}
            transition={{
              repeat: Infinity,
              duration: 3,
              repeatDelay: 4,
              ease: "easeInOut"
            }}
            className="w-full h-full"
            style={{ 
              backgroundSize: '200% 100%',
              backgroundRepeat: 'no-repeat',
              backgroundImage: 'linear-gradient(90deg, transparent 35%, rgba(139, 101, 8, 0.95) 50%, transparent 65%)'
            }}
          />
        </div>
      </div>
    );

    const textLayer = (
      <div className={cn(
        "flex items-center gap-1 transition-all duration-300 relative", 
        isCompact ? "scale-[0.8] origin-center" : 
        isCustom ? "scale-100 translate-y-1.5" : // BLOQUEO MAESTRO
        "scale-100 translate-y-1.5" // Fallback al Maestro
      )}>
        {/* CAPA BASE DE COLOR */}
        <span className="text-3xl italic font-black uppercase tracking-tighter text-white">CONSTRU</span>
        <span className="text-3xl italic font-black uppercase tracking-tighter text-[#FFCD00]">ACHA</span>

        {/* CAPA DE BRILLO (POWER-CLIP VIA BACKGROUND-CLIP: TEXT) */}
        <div className="absolute inset-0 pointer-events-none select-none z-10 overflow-hidden">
          <motion.div
            initial={{ backgroundPosition: '200% 0' }}
            animate={{ backgroundPosition: '-100% 0' }}
            transition={{
              repeat: Infinity,
              duration: 3,
              repeatDelay: 4,
              ease: "easeInOut"
            }}
            className="flex items-center gap-1 w-full h-full bg-clip-text text-transparent"
            style={{ 
              WebkitBackgroundClip: 'text',
              backgroundSize: '200% 100%',
              backgroundRepeat: 'no-repeat',
              backgroundImage: 'linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.9) 50%, transparent 65%)'
            }}
          >
            {/* Texto duplicado para definir el área de clip */}
            <span className="text-3xl italic font-black uppercase tracking-tighter">CONSTRU</span>
            <span className="text-3xl italic font-black uppercase tracking-tighter">ACHA</span>
          </motion.div>
        </div>
      </div>
    );

    const lineLayer = (
      <motion.div 
        animate={{ opacity: [0.7, 1, 0.7], scaleX: [1, 1.05, 1], boxShadow: ["0 0 10px rgba(220,38,38,0.5)", "0 0 25px rgba(220,38,38,1)", "0 0 10px rgba(220,38,38,0.5)"] }}
        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
        className={cn(
          "h-[2px] transition-all duration-300",
          alignLeft ? "bg-gradient-to-r from-red-600 to-transparent ml-[44px]" : "bg-gradient-to-r from-transparent via-red-600 to-transparent",
          isCompact ? "w-[70%] mt-1" : 
          isCustom ? "w-[85%] mt-0" : // BLOQUEO MAESTRO
          "w-[85%] mt-0" // Fallback al Maestro
        )} 
      />
    );

    const sloganLayer = (
      <p className={cn(
        "text-zinc-400 font-black uppercase tracking-[0.35em] italic leading-none max-w-[90%] transition-all duration-300",
        alignLeft ? "text-left ml-[44px] mt-2 text-[6.5px]" : "text-center mt-1.5 text-[7px]",
        isCompact ? "text-[6px] mt-1" : 
        isCustom ? "" : ""
      )}>
        TU LO SUEÑAS NOSOTROS LO CREAMOS
      </p>
    );

    return (
      <div className={containerClasses}>
        <div className={cn(
          "relative flex items-center w-full",
          alignLeft ? "justify-start pl-[44px]" : "justify-center",
          isCustom ? "mb-1.5" : "mb-1"
        )}>
          {logoLayer}
          {textLayer}
        </div>
        {lineLayer}
        {sloganLayer}
      </div>
    );
  };

  const BrandedQR = ({ value, size = 200 }: { value: string, size?: number }) => (
    <div className="relative inline-flex items-center justify-center group">
      <div className="bg-white p-4 rounded-[2rem] shadow-2xl relative overflow-hidden group-hover:scale-105 transition-transform duration-500">
        <QRCodeSVG 
          value={value} 
          size={size}
          level="H"
          marginSize={1}
          imageSettings={{
            src: "/logo_acha.png",
            x: undefined,
            y: undefined,
            height: size * 0.2,
            width: size * 0.2,
            excavate: true,
          }}
        />
        {/* El "Botón" negro central */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[22%] h-[22%] bg-black rounded-xl flex items-center justify-center shadow-2xl border border-[#FFCD00]/30 transform scale-110">
            <img src="/logo_acha.png" className="w-[70%] h-auto brightness-110" alt="Center Logo" />
          </div>
        </div>
        <div className="absolute inset-0 border-[6px] border-zinc-900/5 rounded-[2rem] pointer-events-none" />
      </div>
    </div>
  );

  const HeaderWithNav = ({ subtitle, hideBrand, logoVariant = "compact", onBack, align = "center" }: { subtitle?: string, hideBrand?: boolean, logoVariant?: string, onBack?: () => void, align?: 'center' | 'left' }) => (
    <div className="w-full flex flex-col mb-8 pt-6 relative z-50">
      <div className={cn("flex flex-col mb-6 w-full", align === "left" ? "items-start px-4" : "items-center")}>
        {!hideBrand && <FullBrandLogo className="mb-6" variant={logoVariant} alignLeft={align === "left"} />}
        {subtitle && (
          <span className={cn(
            "text-[10px] font-black uppercase text-white/50 tracking-[0.4em] italic bg-white/5 px-6 py-2 rounded-full border border-white/10 shadow-lg",
            align === "left" ? "ml-[44px]" : ""
          )}>{subtitle}</span>
        )}
      </div>
      <div className="flex justify-start px-2">
        <button 
          onClick={onBack || (() => {
            resetBudgetFlow();
            setView('home');
          })} 
          className="px-4 py-1.5 bg-[#FFCD00] border border-white/10 rounded-xl text-black shadow-lg active:scale-95 transition-all group flex items-center gap-2"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[11px] font-black uppercase italic tracking-tighter leading-none">{onBack ? 'VOLVER' : 'INICIO'}</span>
        </button>
      </div>
    </div>
  );

  const toggleAuthModal = (show: boolean) => {
    // Auth modal disabled
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-[#FFCD00] selection:text-black overflow-x-hidden">
      <AnimatePresence>
        {showIntro && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.8, ease: "circOut" }}
            className="fixed inset-0 z-[2000] bg-black flex flex-col items-center justify-center"
          >
            <div className="relative">
              <motion.div 
                initial={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                transition={{ duration: 1, delay: 0.2 }}
                className="flex flex-col items-center"
              >
                <div className="h-16 w-auto mb-6 relative overflow-hidden">
                  <motion.img 
                    initial={{ y: 60 }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.8, delay: 0.4, type: "spring" }}
                    src="/logo_acha.png" 
                    className="h-full w-auto"
                  />
                </div>
                <div className="flex gap-2 mb-2 overflow-hidden">
                  <motion.span 
                    initial={{ y: 40 }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.5, delay: 0.8 }}
                    className="text-4xl font-black italic uppercase tracking-tighter"
                  >
                    CONSTRU
                  </motion.span>
                  <motion.span 
                    initial={{ y: 40 }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.5, delay: 1 }}
                    className="text-4xl font-black italic uppercase tracking-tighter text-[#FFCD00]"
                  >
                    ACHA
                  </motion.span>
                </div>
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1, delay: 1.2 }}
                  className="h-[2px] bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.8)] mb-4"
                />
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 1.8 }}
                  className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40 italic"
                >
                  ENGINEERING & DESIGN
                </motion.p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.2, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute -inset-10 border border-[#FFCD00]/20 rounded-full scale-150 pointer-events-none"
              />
            </div>
            
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.2 }}
              className="absolute bottom-16 flex flex-col items-center gap-4"
            >
              <div className="w-12 h-[1px] bg-[#FFCD00]/20" />
              <p className="text-[8px] font-medium tracking-[0.8em] text-zinc-500 uppercase">INICIALIZANDO NÚCLEO TÉCNICO</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-md mx-auto min-h-screen flex flex-col relative px-4 pb-24 pt-6">
        <style>{`
        @keyframes soft-pulse-red { 0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(220, 38, 38, 0); } 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); } }
        @keyframes floating-enhanced { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }
        @keyframes blink-glow { 0%, 100% { opacity: 0.2; transform: scaleX(0.95); } 50% { opacity: 1; transform: scaleX(1); } }
        @keyframes sheen { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        .pulse-red { animation: soft-pulse-red 2s infinite; }
        .floating-btn-enhanced { animation: floating-enhanced 2.5s ease-in-out infinite; }
        .blink-guide-bar { animation: blink-glow 2s infinite ease-in-out; }
        .btn-sheen { position: relative; overflow: hidden; }
        .btn-sheen::after { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); animation: sheen 2.5s infinite; }
      `}</style>

      {previewImage && (
        <div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6">
          <div className="relative max-w-full max-h-[80vh]">
            {previewImage.type === 'video' ? (
              <video src={previewImage.preview} controls className="max-w-full max-h-full rounded-2xl border border-white/10" autoPlay />
            ) : (
               <img src={previewImage.preview} className="max-w-full max-h-full object-contain rounded-2xl border border-white/10" alt="Preview" />
            )}
            <div className="absolute -top-4 -right-4 flex flex-col gap-3">
              <button onClick={() => setPreviewImage(null)} className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10 active:scale-90 transition-all"><X size={20} strokeWidth={3} /></button>
              {view === 'presupuesto_paso2' && (
                <button onClick={() => { removeFile(previewImage.id); setPreviewImage(null); }} className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white shadow-xl active:scale-90 transition-all"><Trash size={20} /></button>
              )}
            </div>
          </div>
        </div>
      )}

      {showQRModal && (
        <div className="fixed inset-0 z-[500] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-[340px] bg-zinc-900 border border-[#FFCD00]/30 rounded-[2.5rem] p-8 text-center relative shadow-[0_40px_100px_rgba(0,0,0,0.8)]"
          >
            <button onClick={() => setShowQRModal(false)} className="absolute top-6 right-6 p-2 bg-white/5 rounded-full text-white/40 active:scale-90 transition-transform z-10"><X size={20} /></button>
            
            <div className="mb-6">
              <FullBrandLogo className="scale-90" variant="qr" />
            </div>

            <div className="space-y-3 mb-8">
              <h2 className="text-xl font-black italic uppercase text-[#FFCD00] tracking-tighter leading-none">INSTALACIÓN OFICIAL</h2>
              <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-[0.2em] leading-tight px-4 italic">ACCESO EXCLUSIVO PARA EL EQUIPO TÉCNICO Y CLIENTE</p>
            </div>
            
            <div className="mb-8">
              <BrandedQR value={appUrl} size={180} />
            </div>

            <div className="flex flex-col gap-3">
              {/* BOTÓN DE INSTALACIÓN DIRECTA DE LA PWA EN EL DISPOSITIVO ACTUAL */}
              {isStandalone ? (
                <button 
                  onClick={() => {
                    alert("¡ConstruAcha ya está instalada! Puedes usarla directamente desde la pantalla de inicio de tu celular para un acceso instantáneo, rápido y sin internet.");
                  }}
                  className="w-full py-4 bg-zinc-800/80 border border-[#FFCD00]/20 text-[#FFCD00] rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                >
                  <span className="w-2 h-2 rounded-full bg-[#FFCD00] animate-ping" />
                  APLICACIÓN INSTALADA
                </button>
              ) : (
                <button 
                  onClick={() => {
                    setShowQRModal(false);
                    handlePWAInstall();
                  }}
                  className="w-full py-4 bg-red-600 text-white border border-[#FFCD00]/30 rounded-xl text-[10px] font-black uppercase italic tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all animate-pulse duration-1000"
                >
                  <Download size={16} strokeWidth={3} className="animate-bounce" />
                  INSTALAR EN ESTE DISPOSITIVO
                </button>
              )}

              <button 
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: 'ConstruAcha AI',
                      text: 'Instala la aplicación oficial de ConstruAcha.',
                      url: appUrl
                    });
                  } else {
                    navigator.clipboard.writeText(appUrl);
                    alert("Enlace copiado");
                  }
                }}
                className="w-full py-4 bg-[#FFCD00] text-black rounded-xl text-[10px] font-black uppercase italic tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
              >
                <Share2 size={16} />
                COMPARTIR PLATAFORMA
              </button>
              
              <button 
                onClick={() => setShowQRModal(false)}
                className="w-full py-3 bg-white/5 border border-white/10 text-white/40 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-white transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft size={14} />
                VOLVER AL PANEL
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showPWAInstructionsModal && (
        <div className="fixed inset-0 z-[500] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-[340px] bg-zinc-900 border border-[#FFCD00]/30 rounded-[2.5rem] p-8 text-center relative shadow-[0_40px_100px_rgba(0,0,0,0.8)]"
          >
            <button onClick={() => setShowPWAInstructionsModal(false)} className="absolute top-6 right-6 p-2 bg-white/5 rounded-full text-white/40 active:scale-90 transition-transform z-10"><X size={20} /></button>
            
            <div className="mb-6 flex justify-center">
              <div className="w-16 h-16 bg-[#FFCD00]/10 border border-[#FFCD00]/30 rounded-2xl flex items-center justify-center text-[#FFCD00]">
                <Download size={32} strokeWidth={2.5} />
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <h2 className="text-xl font-black italic uppercase text-[#FFCD00] tracking-tighter leading-none">
                {isIOS ? 'Paso a Paso iOS' : 'Paso a Paso Android'}
              </h2>
              <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-[0.2em] leading-tight px-4 italic">
                {isIOS ? 'Instala la App en tu iPhone o iPad' : 'Instala la App en tu Dispositivo Android'}
              </p>
            </div>
            
            <div className="bg-black/40 border border-white/5 rounded-2xl p-4 text-left text-xs text-white/80 space-y-4 mb-6">
              {isIOS ? (
                <>
                  <div className="flex gap-3 items-start">
                    <span className="w-5 h-5 bg-[#FFCD00] text-black text-[10px] font-black rounded-full flex items-center justify-center shrink-0">1</span>
                    <p className="leading-tight text-[10px]">Toca el botón <strong>Compartir</strong> en la barra de navegación de Safari (el icono de un cuadro con una flecha hacia arriba).</p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <span className="w-5 h-5 bg-[#FFCD00] text-black text-[10px] font-black rounded-full flex items-center justify-center shrink-0">2</span>
                    <p className="leading-tight text-[10px]">Desplázate hacia abajo en la lista de opciones y selecciona <strong>"Agregar a pantalla de inicio"</strong> o <strong>"Añadir a pantalla de inicio"</strong>.</p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <span className="w-5 h-5 bg-[#FFCD00] text-black text-[10px] font-black rounded-full flex items-center justify-center shrink-0">3</span>
                    <p className="leading-tight text-[10px]">Toca <strong>"Agregar"</strong> en la esquina superior derecha para confirmar la instalación de ConstruAcha en tu celular.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex gap-3 items-start">
                    <span className="w-5 h-5 bg-[#FFCD00] text-black text-[10px] font-black rounded-full flex items-center justify-center shrink-0">1</span>
                    <p className="leading-tight text-[10px]">Si abriste el enlace desde <strong>Facebook o Messenger</strong>, toca los 3 puntos arriba a la derecha y selecciona <strong>"Abrir en Chrome"</strong>.</p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <span className="w-5 h-5 bg-[#FFCD00] text-black text-[10px] font-black rounded-full flex items-center justify-center shrink-0">2</span>
                    <p className="leading-tight text-[10px]">Ya en Google Chrome, presiona los <strong>3 puntos verticales</strong> en la esquina superior derecha.</p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <span className="w-5 h-5 bg-[#FFCD00] text-black text-[10px] font-black rounded-full flex items-center justify-center shrink-0">3</span>
                    <p className="leading-tight text-[10px]">Selecciona <strong>"Instalar aplicación"</strong> o <strong>"Agregar a pantalla de inicio"</strong> y confirma la descarga.</p>
                  </div>
                </>
              )}
            </div>

            <button 
              onClick={() => setShowPWAInstructionsModal(false)}
              className="w-full py-4 bg-[#FFCD00] text-black rounded-xl text-[10px] font-black uppercase italic tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all font-sans"
            >
              ¡ENTENDIDO!
            </button>
          </motion.div>
        </div>
      )}

      {showUsersHistoryModal && (
        <div className="fixed inset-0 z-[500] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-[360px] bg-zinc-900 border border-[#FFCD00]/30 rounded-[2.5rem] p-6 relative shadow-[0_40px_100px_rgba(0,0,0,0.8)] flex flex-col max-h-[85vh]"
          >
            <button onClick={() => setShowUsersHistoryModal(false)} className="absolute top-6 right-6 p-2 bg-white/5 rounded-full text-white/40 active:scale-90 transition-transform z-10"><X size={20} /></button>
            
            <div className="mb-4">
              <FullBrandLogo className="scale-90" variant="historial" />
            </div>

            <div className="text-center space-y-1 mb-4 shrink-0">
              <h2 className="text-lg font-black italic uppercase text-[#FFCD00] tracking-tighter leading-none">HISTORIAL DE USUARIOS</h2>
              <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-[0.18em] leading-tight px-4 italic">
                PERSONAS REGISTRADAS EN LA PLATAFORMA EN TIEMPO REAL
              </p>
            </div>

            {/* LISTA DE USUARIOS CON DESPLAZAMIENTO */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-6 min-h-[250px] max-h-[450px]">
              {appUsers.length === 0 ? (
                <div className="py-12 text-center">
                  <User size={32} className="text-zinc-600 mx-auto mb-2 animate-pulse" />
                  <p className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">No hay usuarios registrados</p>
                </div>
              ) : (
                appUsers.map((userItem) => {
                  const userChatId = getDirectChatId(null, userItem, true);
                  const hasPendingChats = adminChatNotifications.some(r => isNotificationForUser(r, userItem, archivedBudgets));
                  const pendingCount = adminChatNotifications.filter(r => isNotificationForUser(r, userItem, archivedBudgets)).length;

                  // Distinguish support notifications vs budget bitácora notifications
                  const directNotifs = adminChatNotifications.filter(r => r.budgetId === userChatId);
                  const budgetNotifs = adminChatNotifications.filter(r => r.budgetId !== userChatId && isNotificationForUser(r, userItem, archivedBudgets));
                  const isBudgetPending = budgetNotifs.length > 0;

                  return (
                    <div 
                      key={userItem.id} 
                      className={cn(
                        "flex items-center justify-between p-3 rounded-2xl border transition-all gap-2",
                        hasPendingChats 
                          ? "bg-red-950/40 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse" 
                          : "bg-black/45 border-white/5 hover:border-white/10"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-[#FFCD00]/20 bg-zinc-900 flex items-center justify-center text-[10px] font-black shrink-0 relative">
                          <img 
                            src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userItem.name || 'Cliente')}&backgroundColor=FFCD00&textColor=000000&bold=true`}
                            className="w-full h-full object-cover" 
                            alt="Avatar"
                            referrerPolicy="no-referrer"
                          />
                          {hasPendingChats && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-red-600 border border-black rounded-full animate-ping" />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0 text-left leading-none">
                          <span className="text-[10px] font-black text-white uppercase italic tracking-tighter truncate leading-tight flex items-center gap-1">
                            {userItem.name || 'Sin Nombre'}
                            {hasPendingChats && (
                              <span className="px-1.5 py-0.5 bg-[#FFCD00] text-black text-[5.5px] font-black uppercase rounded-md tracking-wider animate-bounce shrink-0 shadow-md">
                                {isBudgetPending ? '¡BITÁCORA!' : '¡SOPORTE!'}
                              </span>
                            )}
                          </span>
                          <span className="text-[7.5px] font-bold text-zinc-400 truncate leading-none mt-0.5">
                            {userItem.email}
                          </span>
                          <span className="text-[6.5px] font-medium text-[#FFCD00] uppercase tracking-widest mt-1">
                            {userItem.role === 'admin' ? 'ADMINISTRADOR' : 'CLIENTE'} 
                            {userItem.createdAt && ` • ${new Date(userItem.createdAt).toLocaleDateString('es-ES')}`}
                          </span>
                        </div>
                      </div>
                      
                      <div className="shrink-0 flex items-center gap-1.5">
                        {userItem.role !== 'admin' && (
                          <button
                            onClick={() => {
                              if (isBudgetPending) {
                                // Find the latest budget that has a notification
                                const targetNotif = budgetNotifs[0];
                                const targetBudget = archivedBudgets.find(b => b.id === targetNotif.budgetId);
                                if (targetBudget) {
                                  // Dismiss all notifications for this specific budget
                                  const targetNotifs = adminChatNotifications.filter(n => n.budgetId === targetBudget.id);
                                  targetNotifs.forEach(n => dismissReminder(n.id));
                                  setSelectedReceipt(targetBudget);
                                  setView('comprobante_validacion');
                                  setShowUsersHistoryModal(false);
                                } else {
                                  // Fallback to direct support
                                  const targetNotifs = adminChatNotifications.filter(n => isNotificationForUser(n, userItem, archivedBudgets));
                                  targetNotifs.forEach(n => dismissReminder(n.id));
                                  setSelectedDirectChatUser(userItem);
                                  setShowDirectChatModal(true);
                                  setShowUsersHistoryModal(false);
                                }
                              } else {
                                // Dismiss notifications for this specific chat
                                const targetNotifs = adminChatNotifications.filter(n => isNotificationForUser(n, userItem, archivedBudgets));
                                targetNotifs.forEach(n => dismissReminder(n.id));
                                setSelectedDirectChatUser(userItem);
                                setShowDirectChatModal(true);
                                setShowUsersHistoryModal(false);
                              }
                            }}
                            className={cn(
                              "px-2.5 py-1 text-[6.5px] font-black uppercase tracking-widest rounded-lg active:scale-95 transition-all cursor-pointer min-h-[22px] flex items-center gap-1",
                              hasPendingChats 
                                ? "bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-[0_0_12px_rgba(220,38,38,0.6)] border border-red-400/30 font-black" 
                                : "bg-[#FFCD00] hover:bg-yellow-400 text-black font-black"
                            )}
                          >
                            <MessageSquare size={8} />
                            {hasPendingChats ? (isBudgetPending ? `VER BITÁCORA (${pendingCount})` : `RESPONDER (${pendingCount})`) : 'CHAT'}
                          </button>
                        )}
                        {userItem.status === 'blocked' ? (
                          <span className="px-2 py-1 bg-red-950/40 border border-red-500/30 text-red-500 text-[6.5px] font-black uppercase tracking-widest rounded-lg">
                            BLOQUEADO
                          </span>
                        ) : (
                          userItem.role !== 'admin' && (
                            <button
                              onClick={() => blockUser(userItem.id)}
                              className="px-2 py-1 bg-zinc-800 hover:bg-red-900/20 hover:text-red-400 text-zinc-400 text-[6.5px] font-black uppercase tracking-widest rounded-lg border border-transparent hover:border-red-500/20 active:scale-95 transition-all cursor-pointer min-h-[22px]"
                              title="Bloquear Usuario"
                            >
                              BLOQUEAR
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="shrink-0">
              <button 
                onClick={() => setShowUsersHistoryModal(false)}
                className="w-full py-3.5 bg-[#FFCD00] hover:bg-yellow-400 text-black rounded-xl text-[11px] font-black uppercase italic tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg cursor-pointer"
              >
                <ArrowLeft size={14} />
                VOLVER AL PANEL
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showAdminLoginModal && (
        <div className="fixed inset-0 z-[500] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-[340px] bg-zinc-900 border border-[#FFCD00]/30 rounded-[2.5rem] p-8 relative shadow-[0_40px_100px_rgba(0,0,0,0.8)]"
          >
            <button onClick={() => setShowAdminLoginModal(false)} className="absolute top-6 right-6 p-2 bg-white/5 rounded-full text-white/40 active:scale-90 transition-transform z-10"><X size={20} /></button>
            
            <div className="mb-6 flex justify-center">
              <FullBrandLogo className="scale-90" variant="auth" />
            </div>

            <div className="text-center space-y-3 mb-4">
              <h2 className="text-lg font-black italic uppercase text-[#FFCD00] tracking-tighter leading-none">EQUIPO DIRECTIVO</h2>
              <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-[0.2em] leading-tight px-4 italic">
                {isAdminRegister ? "REGISTRAR NUEVA CLAVE DE ACCESO" : "INICIAR SESIÓN CON CREDENCIALES OFICIALES"}
              </p>
            </div>

            {typeof window !== 'undefined' && window.self !== window.top && (
              <div className="p-3.5 bg-[#FFCD00]/10 border border-[#FFCD00]/30 rounded-2xl text-center space-y-1.5 mb-4 animate-in fade-in duration-300">
                <p className="text-[8.5px] font-black uppercase text-[#FFCD00] tracking-wider">⚠️ REQUISITO PARA HUELLA / FACEID</p>
                <p className="text-[8px] font-bold text-zinc-400 uppercase leading-normal">
                  Por seguridad, la biometría está bloqueada en modo vista previa. 
                  <span className="text-white block font-black mt-1">Presiona "Abrir en pestaña nueva" arriba a la derecha para usar o enlazar tu Huella/FaceID.</span>
                </p>
              </div>
            )}

            {/* SELECTOR DE PROTOCOLO: INGRESAR O REGISTRARSE */}
            <div className="p-1 bg-black/60 border border-white/5 rounded-2xl flex items-center gap-1 mb-6 shadow-inner">
              <button 
                type="button"
                onClick={() => {
                  setIsAdminRegister(false);
                  setLoginError('');
                }}
                className={`flex-1 py-2.5 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all duration-300 ${
                  !isAdminRegister 
                    ? 'bg-[#FFCD00] text-black shadow-lg font-black' 
                    : 'text-white/40 hover:text-white'
                }`}
              >
                INGRESAR
              </button>
              <button 
                type="button"
                onClick={() => {
                  setIsAdminRegister(true);
                  setLoginError('');
                }}
                className={`flex-1 py-2.5 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all duration-300 ${
                  isAdminRegister 
                    ? 'bg-[#FFCD00] text-black shadow-lg font-black' 
                    : 'text-white/40 hover:text-white'
                }`}
              >
                REGISTRAR CLAVE
              </button>
            </div>

            <form onSubmit={handleAdminAuthSubmit} className="space-y-4">
              <div>
                <label className="text-[7.5px] font-black uppercase tracking-widest text-[#FFCD00] block mb-1.5 font-black">CORREO ELECTRÓNICO</label>
                <input 
                  type="email" 
                  value={adminEmail} 
                  onChange={(e) => setAdminEmail(e.target.value)} 
                  placeholder="CORREO DIRECTIVO..."
                  className="w-full bg-black/50 border border-white/20 rounded-xl py-4 px-4 text-[10px] font-bold uppercase focus:border-[#FFCD00] outline-none transition-all placeholder:text-white/20 text-white"
                  required
                />
              </div>

              <div>
                <label className="text-[7.5px] font-black uppercase tracking-widest text-[#FFCD00] block mb-1.5 font-black">
                  {isAdminRegister ? "CREAR CONTRASEÑA (MIN. 6 CARACTERES)" : "CONTRASEÑA DE SEGURIDAD"}
                </label>
                <input 
                  type="password" 
                  value={adminPassword} 
                  onChange={(e) => setAdminPassword(e.target.value)} 
                  placeholder="CONTRASEÑA..."
                  className="w-full bg-black/50 border border-white/20 rounded-xl py-4 px-4 text-[10px] font-bold uppercase focus:border-[#FFCD00] outline-none transition-all placeholder:text-white/20 text-white"
                  required
                />
              </div>

              {loginError && (
                <div className="p-3 bg-red-600/10 border border-red-600/30 rounded-xl text-center">
                  <p className="text-[7.5px] font-black uppercase text-red-500 tracking-wider leading-relaxed">{loginError}</p>
                </div>
              )}

              <button 
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-4 bg-[#FFCD00] text-black font-black uppercase italic tracking-widest rounded-xl text-[10px] hover:scale-[0.99] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-2xl disabled:opacity-50 mt-2"
              >
                {isLoggingIn ? "CONECTANDO PROTOCOLO..." : (isAdminRegister ? "REGISTRAR CONTRASEÑA" : "CONECTAR PROTOCOLO")}
              </button>

              {!isAdminRegister && biometricsSupported && registeredBiometrics.some(b => b.type === 'admin') && (
                <button
                  type="button"
                  onClick={() => handleBiometricLogin('admin')}
                  disabled={isLoggingIn}
                  className="w-full py-4 bg-zinc-950 hover:bg-black border border-[#FFCD00]/30 text-[#FFCD00] font-black uppercase tracking-widest rounded-xl text-[11px] transition-all flex items-center justify-center gap-2.5 shadow-xl disabled:opacity-50 mt-2"
                >
                  <Fingerprint size={16} className="animate-pulse" />
                  INGRESAR CON HUELLA / FACEID
                </button>
              )}

              {!isAdminRegister && biometricsSupported && !registeredBiometrics.some(b => b.type === 'admin') && (
                <p className="text-[7px] text-center text-zinc-500 uppercase font-bold tracking-widest leading-relaxed mt-2.5">
                  💡 ENLAZA TU HUELLA/FACEID DESDE EL PANEL DE CONTROL TRAS INICIAR SESIÓN
                </p>
              )}
            </form>

            <div className="relative my-4 flex items-center justify-center bg-transparent">
              <span className="absolute bg-zinc-900 px-3 text-[7px] font-black text-zinc-500 uppercase tracking-widest z-10 font-bold">O DIRECTIVO</span>
              <div className="w-full border-t border-white/10" />
            </div>

            <button 
              type="button"
              disabled={isLoggingIn}
              onClick={() => handleGoogleSignIn('admin')}
              className="w-full py-4 bg-black hover:bg-black/90 border border-[#FFCD00]/25 text-white font-black uppercase tracking-widest rounded-xl text-[8.5px] transition-all flex items-center justify-center gap-2.5 shadow-xl disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              ACCEDER CON GMAIL DIRECTIVO
            </button>

            <button 
              onClick={() => setShowAdminLoginModal(false)}
              className="w-full py-3 bg-white/5 border border-white/10 text-white/40 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-white transition-all flex items-center justify-center gap-2 mt-3"
            >
              <ArrowLeft size={14} />
              VOLVER AL PANEL
            </button>

            <button 
              onClick={() => {
                setShowAdminLoginModal(false);
                setIsClientRegister(false);
                setClientAuthError('');
                setShowClientAuthModal(true);
              }}
              type="button"
              className="w-full py-3 bg-[#FFCD00]/10 border border-[#FFCD00]/25 text-[#FFCD00] rounded-xl text-[8.5px] font-black uppercase tracking-widest hover:bg-[#FFCD00]/20 active:scale-95 transition-all flex items-center justify-center gap-2 mt-2 leading-none"
            >
              ¿ERES CLIENTE? INGRESAR COMO CLIENTE
            </button>
          </motion.div>
        </div>
      )}

      {showBiometricSettingsModal && (
        <div className="fixed inset-0 z-[500] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-[340px] bg-zinc-900 border border-[#FFCD00]/30 rounded-[2.5rem] p-8 relative shadow-[0_40px_100px_rgba(0,0,0,0.8)]"
          >
            <button 
              onClick={() => setShowBiometricSettingsModal(false)} 
              className="absolute top-6 right-6 p-2 bg-white/5 rounded-full text-white/40 active:scale-90 transition-transform z-10 animate-in fade-in duration-300"
            >
              <X size={20} />
            </button>

            <div className="mb-6 flex justify-center">
              <div className="p-4 bg-[#FFCD00]/10 border border-[#FFCD00]/25 text-[#FFCD00] rounded-full shadow-[0_0_20px_rgba(255,205,0,0.1)]">
                <Fingerprint size={36} className="animate-pulse" />
              </div>
            </div>

            <div className="text-center space-y-3 mb-6">
              <h2 className="text-lg font-black italic uppercase text-[#FFCD00] tracking-tighter leading-none">ACCESO BIOMÉTRICO</h2>
              <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-[0.2em] leading-tight px-4 italic">
                Enlaza tu huella dactilar o reconocimiento facial (FaceID) para ingresar al sistema de forma ultra rápida.
              </p>
            </div>

            {!window.PublicKeyCredential ? (
              <div className="p-4 bg-red-600/10 border border-red-600/25 rounded-2xl text-center space-y-2 mb-4">
                <AlertTriangle className="mx-auto text-red-500" size={24} />
                <p className="text-[9px] font-black uppercase text-red-500 tracking-wider">No compatible</p>
                <p className="text-[8px] font-bold text-zinc-400 uppercase leading-normal">
                  Este navegador o dispositivo no cuenta con hardware biométrico o soporte de seguridad WebAuthn.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3.5 bg-black/50 border border-white/5 rounded-2xl flex flex-col gap-1">
                  <span className="text-[7px] font-black text-[#FFCD00] tracking-widest uppercase">CUENTA DETECTADA</span>
                  <span className="text-[10px] font-black uppercase text-white truncate">
                    {isAdmin ? "ADMINISTRADOR" : "CLIENTE ACTIVO"}
                  </span>
                  <span className="text-[8px] font-bold text-zinc-400 truncate">
                    {isAdmin ? localAdminEmail : user?.email}
                  </span>
                </div>

                {registeredBiometrics.some(b => b.type === (isAdmin ? 'admin' : 'client') && b.email.toLowerCase() === (isAdmin ? localAdminEmail : user?.email || '').toLowerCase().trim()) ? (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="p-4 bg-green-600/10 border border-green-600/20 rounded-2xl text-center space-y-2">
                      <Check className="mx-auto text-green-500" size={24} strokeWidth={3} />
                      <p className="text-[9px] font-black uppercase text-green-400 tracking-wider">ENLACE ACTIVO</p>
                      <p className="text-[8px] font-bold text-zinc-400 uppercase leading-normal">
                        La autenticación biométrica está configurada correctamente para esta cuenta en este celular o computadora.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleDeactivateBiometric}
                      className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black uppercase italic tracking-widest rounded-xl text-[11px] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl"
                    >
                      <X size={14} strokeWidth={3.5} />
                      DESACTIVAR BIOMÉTRICO
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleRegisterBiometric} className="space-y-4 animate-in fade-in duration-300">
                    <div>
                      <label className="text-[7.5px] font-black uppercase tracking-widest text-[#FFCD00] block mb-1.5">
                        {isAdmin ? "CONFIRMA TU CONTRASEÑA DE ADMINISTRADOR" : "CONFIRMA TU CONTRASEÑA ACTUAL"}
                      </label>
                      <input 
                        type="password" 
                        value={biometricRegPassword} 
                        onChange={(e) => setBiometricRegPassword(e.target.value)} 
                        placeholder="INGRESA TU CONTRASEÑA..."
                        className="w-full bg-black/50 border border-white/20 rounded-xl py-4 px-4 text-[10px] font-bold uppercase focus:border-[#FFCD00] outline-none transition-all placeholder:text-white/20 text-white"
                        required
                      />
                    </div>

                    {biometricRegError && (
                      <div className="p-3 bg-red-600/10 border border-red-600/30 rounded-xl text-center animate-in fade-in duration-300">
                        <p className="text-[7.5px] font-black uppercase text-red-500 tracking-wider leading-relaxed">{biometricRegError}</p>
                      </div>
                    )}

                    {biometricRegSuccess && (
                      <div className="p-3 bg-green-600/10 border border-green-600/30 rounded-xl text-center animate-in fade-in duration-300">
                        <p className="text-[7.5px] font-black uppercase text-green-400 tracking-wider leading-relaxed">{biometricRegSuccess}</p>
                      </div>
                    )}

                    <button 
                      type="submit"
                      disabled={isRegisteringBiometric}
                      className="w-full py-4 bg-[#FFCD00] text-black font-black uppercase italic tracking-widest rounded-xl text-[11px] hover:scale-[0.99] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-2xl disabled:opacity-50"
                    >
                      {isRegisteringBiometric ? "ENLAZANDO..." : "🔒 ENLAZAR BIOMÉTRICO"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {biometricRegSuccess && !registeredBiometrics.some(b => b.type === (isAdmin ? 'admin' : 'client') && b.email.toLowerCase() === (isAdmin ? localAdminEmail : user?.email || '').toLowerCase().trim()) && (
              <div className="mt-4 p-3 bg-green-600/10 border border-green-600/30 rounded-xl text-center">
                <p className="text-[7.5px] font-black uppercase text-green-400 tracking-wider leading-relaxed">{biometricRegSuccess}</p>
              </div>
            )}

            <button 
              onClick={() => setShowBiometricSettingsModal(false)}
              className="w-full py-3 bg-white/5 border border-white/10 text-white/40 rounded-xl text-[11px] font-black uppercase tracking-widest hover:text-white transition-all flex items-center justify-center gap-2 mt-4"
            >
              <ArrowLeft size={14} />
              VOLVER AL PANEL
            </button>
          </motion.div>
        </div>
      )}

      {showClientAuthModal && (
        <div className="fixed inset-0 z-[500] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-[340px] bg-zinc-900 border border-[#FFCD00]/30 rounded-[2.5rem] p-8 relative shadow-[0_40px_100px_rgba(0,0,0,0.8)]"
          >
            <button 
              onClick={() => {
                setShowClientAuthModal(false);
                setPendingActionView(null);
              }} 
              className="absolute top-6 right-6 p-2 bg-white/5 rounded-full text-white/40 active:scale-90 transition-transform z-10"
            >
              <X size={20} />
            </button>
            
            <div className="mb-6 flex justify-center">
              <FullBrandLogo className="scale-90" variant="auth" />
            </div>

            <div className="text-center space-y-3 mb-4">
              <h2 className="text-lg font-black italic uppercase text-[#FFCD00] tracking-tighter leading-none">
                {isClientRecoveringPassword ? "RECUPERAR ACCESO" : isClientRegister ? "REGISTRO DE CLIENTE" : "INGRESO DE CLIENTE"}
              </h2>
              <p className="text-[7.5px] font-bold text-zinc-400 uppercase tracking-[0.2em] leading-tight px-4 italic">
                {isClientRecoveringPassword 
                  ? "Ingresa tu correo oficial para enviarte un enlace de recuperación seguro"
                  : "Crea una cuenta para solicitar presupuestos y acceder al portafolio de ConstruAcha"}
              </p>
            </div>

            {typeof window !== 'undefined' && window.self !== window.top && (
              <div className="p-3.5 bg-[#FFCD00]/10 border border-[#FFCD00]/30 rounded-2xl text-center space-y-1.5 mb-4 animate-in fade-in duration-300">
                <p className="text-[8.5px] font-black uppercase text-[#FFCD00] tracking-wider">⚠️ REQUISITO PARA HUELLA / FACEID</p>
                <p className="text-[8px] font-bold text-zinc-400 uppercase leading-normal">
                  Por seguridad, la biometría está bloqueada en modo vista previa. 
                  <span className="text-white block font-black mt-1">Presiona "Abrir en pestaña nueva" arriba a la derecha para usar o enlazar tu Huella/FaceID.</span>
                </p>
              </div>
            )}

            {isClientRecoveringPassword ? (
              /* PANEL DE RECUPERACIÓN DE CONTRASEÑA */
              <div className="space-y-4">
                <form onSubmit={handleSendPasswordReset} className="space-y-4">
                  <div>
                    <label className="text-[7.5px] font-black uppercase tracking-widest text-[#FFCD00] block mb-1.5 font-black">Correo Electrónico</label>
                    <input 
                      type="email" 
                      value={recoveryEmail} 
                      onChange={(e) => setRecoveryEmail(e.target.value)} 
                      placeholder="Tu correo..."
                      className="w-full bg-black/50 border border-white/20 rounded-xl py-4 px-4 text-[10px] font-bold uppercase focus:border-[#FFCD00] outline-none transition-all placeholder:text-white/20 text-white"
                      required
                    />
                  </div>

                  {clientAuthError && (
                    <div className="p-3 bg-red-600/10 border border-red-600/30 rounded-xl text-center">
                      <p className="text-[7.5px] font-black uppercase text-red-500 tracking-wider leading-relaxed">{clientAuthError}</p>
                    </div>
                  )}

                  {recoverySuccessMessage && (
                    <div className="p-3 bg-green-600/10 border border-green-600/30 rounded-xl text-center">
                      <p className="text-[7.5px] font-black uppercase text-green-400 tracking-wider leading-relaxed">{recoverySuccessMessage}</p>
                    </div>
                  )}

                  <button 
                    type="submit"
                    disabled={isRecoveryLoading}
                    className="w-full py-4 bg-[#FFCD00] text-black font-black uppercase italic tracking-widest rounded-xl text-[10px] hover:scale-[0.99] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-2xl disabled:opacity-50 mt-2"
                  >
                    {isRecoveryLoading ? "ENVIANDO..." : "ENVIAR ENLACE"}
                  </button>
                </form>

                <button 
                  onClick={() => {
                    setIsClientRecoveringPassword(false);
                    setClientAuthError('');
                    setRecoverySuccessMessage('');
                  }}
                  className="w-full py-3 bg-white/5 border border-white/10 text-white/40 rounded-xl text-[8.5px] font-black uppercase tracking-widest hover:text-white transition-all flex items-center justify-center gap-2 mt-2"
                >
                  <ArrowLeft size={12} />
                  VOLVER A INICIAR SESIÓN
                </button>
              </div>
            ) : (
              /* PANEL DE REGISTRO E INICIO DE SESIÓN CORRIENTE */
              <>
                {/* SELECTOR DE PROTOCOLO: REGISTRARSE O INGRESAR */}
                <div className="p-1 bg-black/60 border border-white/5 rounded-2xl flex items-center gap-1 mb-6 shadow-inner">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsClientRegister(true);
                      setClientAuthError('');
                    }}
                    className={`flex-1 py-2.5 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all duration-300 ${
                      isClientRegister 
                        ? 'bg-[#FFCD00] text-black shadow-lg font-black' 
                        : 'text-white/40 hover:text-white'
                    }`}
                  >
                    REGISTRARSE
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      setIsClientRegister(false);
                      setClientAuthError('');
                    }}
                    className={`flex-1 py-2.5 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all duration-300 ${
                      !isClientRegister 
                        ? 'bg-[#FFCD00] text-black shadow-lg font-black' 
                        : 'text-white/40 hover:text-white'
                    }`}
                  >
                    YA TENGO CUENTA
                  </button>
                </div>

                <form onSubmit={handleClientAuthSubmit} className="space-y-4">
                  {isClientRegister && (
                    <div>
                      <label className="text-[7.5px] font-black uppercase tracking-widest text-[#FFCD00] block mb-1.5 font-black">Tu Nombre Completo</label>
                      <input 
                        type="text" 
                        value={clientLoginName} 
                        onChange={(e) => setClientLoginName(e.target.value)} 
                        placeholder="Escribe tu nombre..."
                        className="w-full bg-black/50 border border-white/20 rounded-xl py-4 px-4 text-[10px] font-bold uppercase focus:border-[#FFCD00] outline-none transition-all placeholder:text-white/20 text-white"
                        required={isClientRegister}
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-[7.5px] font-black uppercase tracking-widest text-[#FFCD00] block mb-1.5 font-black">Correo Electrónico</label>
                    <input 
                      type="email" 
                      value={clientLoginEmail} 
                      onChange={(e) => setClientLoginEmail(e.target.value)} 
                      placeholder="Tu correo..."
                      className="w-full bg-black/50 border border-white/20 rounded-xl py-4 px-4 text-[10px] font-bold uppercase focus:border-[#FFCD00] outline-none transition-all placeholder:text-white/20 text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[7.5px] font-black uppercase tracking-widest text-[#FFCD00] block mb-1.5 font-black">
                      {isClientRegister ? "Crear Contraseña (mín. 6 caracteres)" : "Contraseña de Seguridad"}
                    </label>
                    <div className="relative">
                      <input 
                        type={showClientPassword ? "text" : "password"} 
                        value={clientLoginPassword} 
                        onChange={(e) => setClientLoginPassword(e.target.value)} 
                        placeholder="Escribe tu contraseña..."
                        className="w-full bg-black/50 border border-white/20 rounded-xl py-4 pl-4 pr-12 text-[10px] font-bold uppercase focus:border-[#FFCD00] outline-none transition-all placeholder:text-white/20 text-white"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowClientPassword(!showClientPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/80 active:scale-90 transition-all"
                      >
                        {showClientPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {!isClientRegister && (
                      <div className="text-right mt-1.5">
                        <button 
                          type="button"
                          onClick={() => {
                            setIsClientRecoveringPassword(true);
                            setClientAuthError('');
                            setRecoverySuccessMessage('');
                          }}
                          className="text-[7.5px] font-black uppercase tracking-widest text-zinc-500 hover:text-[#FFCD00] transition-colors font-bold"
                        >
                          ¿OLVIDASTE TU CONTRASEÑA? RECOBRAR
                        </button>
                      </div>
                    )}
                  </div>

                  {clientAuthError && (
                    <div className="p-3 bg-red-600/10 border border-red-600/30 rounded-xl text-center">
                      <p className="text-[7.5px] font-black uppercase text-red-500 tracking-wider leading-relaxed">{clientAuthError}</p>
                    </div>
                  )}

                  <button 
                    type="submit"
                    disabled={isClientAuthLoading}
                    className="w-full py-4 bg-[#FFCD00] text-black font-black uppercase italic tracking-widest rounded-xl text-[10px] hover:scale-[0.99] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-2xl disabled:opacity-50 mt-2"
                  >
                    {isClientAuthLoading ? "CONECTANDO..." : isClientRegister ? "CREAR MI CUENTA" : "INICIAR SESIÓN"}
                  </button>

                  {!isClientRegister && biometricsSupported && registeredBiometrics.some(b => b.type === 'client') && (
                    <button
                      type="button"
                      onClick={() => handleBiometricLogin('client')}
                      disabled={isClientAuthLoading}
                      className="w-full py-4 bg-zinc-950 hover:bg-black border border-[#FFCD00]/30 text-[#FFCD00] font-black uppercase tracking-widest rounded-xl text-[11px] transition-all flex items-center justify-center gap-2.5 shadow-xl disabled:opacity-50 mt-2"
                    >
                      <Fingerprint size={16} className="animate-pulse" />
                      INGRESAR CON HUELLA / FACEID
                    </button>
                  )}

                  {!isClientRegister && biometricsSupported && !registeredBiometrics.some(b => b.type === 'client') && (
                    <p className="text-[7px] text-center text-zinc-500 uppercase font-bold tracking-widest leading-relaxed mt-2.5">
                      💡 ENLAZA TU HUELLA/FACEID DESDE TU PERFIL (AVATAR) TRAS INICIAR SESIÓN
                    </p>
                  )}
                </form>

                <div className="relative my-4 flex items-center justify-center bg-transparent">
                  <span className="absolute bg-zinc-900 px-3 text-[7px] font-black text-zinc-500 uppercase tracking-widest z-10 font-bold">O CONTINÚA CON</span>
                  <div className="w-full border-t border-white/10" />
                </div>

                <button 
                  type="button"
                  disabled={isClientAuthLoading}
                  onClick={() => handleGoogleSignIn('client')}
                  className="w-full py-4 bg-black hover:bg-black/90 border border-[#FFCD00]/25 text-white font-black uppercase tracking-widest rounded-xl text-[8.5px] transition-all flex items-center justify-center gap-2.5 shadow-xl disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  ACCEDER CON GMAIL
                </button>
              </>
            )}

            <button 
              onClick={() => {
                setShowClientAuthModal(false);
                setPendingActionView(null);
                setIsClientRecoveringPassword(false);
              }}
              className="w-full py-3 bg-white/5 border border-white/10 text-white/40 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-white transition-all flex items-center justify-center gap-2 mt-3"
            >
              <ArrowLeft size={14} />
              VOLVER AL PANEL
            </button>

            <button 
              onClick={() => {
                setShowClientAuthModal(false);
                setLoginError('');
                setShowAdminLoginModal(true);
                setIsClientRecoveringPassword(false);
              }}
              type="button"
              className="w-full py-3 bg-zinc-950/40 border border-white/5 text-zinc-500 rounded-xl text-[8.5px] font-black uppercase tracking-widest hover:text-white hover:border-[#FFCD00]/20 active:scale-95 transition-all flex items-center justify-center gap-2 mt-2 leading-none"
            >
              ¿Eres Socio/Directivo? ACCESO ADMIN
            </button>
          </motion.div>
        </div>
      )}

      <div className="w-full max-w-md flex-1 flex flex-col">
        {view === 'home' && (
          <div className="flex-1 flex flex-col animate-in fade-in duration-500 relative justify-between pb-0">

            <div className="absolute -top-2 -right-2 flex flex-col gap-2 z-[60]">
              <button onClick={() => setShowQRModal(true)} className="p-4 text-white/50 hover:text-[#FFCD00] hover:scale-110 active:scale-90 transition-all bg-zinc-900/50 backdrop-blur-sm rounded-full shadow-lg border border-white/10 group">
                <QrIcon size={20} strokeWidth={3} />
                <span className="absolute right-full mr-2 px-2 py-1 bg-black text-[#FFCD00] text-[8px] font-black uppercase rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">Instalar</span>
              </button>

              {isAdmin ? (
                <>
                  <button onClick={() => setShowUsersHistoryModal(true)} className="p-4 text-[#FFCD00] hover:scale-110 active:scale-90 transition-all bg-zinc-900/50 backdrop-blur-sm rounded-full shadow-lg border border-white/10 group relative">
                    <User size={20} strokeWidth={3} />
                    <span className="absolute right-full mr-2 px-2 py-1 bg-black text-[#FFCD00] text-[8px] font-black uppercase rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">Personas</span>
                  </button>
                  <button onClick={() => setView('admin_controls')} className="p-4 text-[#FFCD00] hover:scale-110 active:scale-90 transition-all bg-zinc-900/50 backdrop-blur-sm rounded-full shadow-lg border border-white/10 group relative">
                    <ShieldCheck size={20} strokeWidth={3} />
                    <span className="absolute right-full mr-2 px-2 py-1 bg-black text-[#FFCD00] text-[8px] font-black uppercase rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">Accesos</span>
                  </button>
                  <button onClick={() => setView('admin_archive')} className="p-4 text-[#FFCD00] hover:scale-110 active:scale-90 transition-all bg-zinc-900/50 backdrop-blur-sm rounded-full shadow-lg border border-white/10 group relative">
                    <Archive size={20} strokeWidth={3} />
                    <span className="absolute right-full mr-2 px-2 py-1 bg-black text-[#FFCD00] text-[8px] font-black uppercase rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">Archivo</span>
                  </button>
                  <button onClick={() => setShowComments(true)} className="p-4 text-[#FFCD00] hover:scale-110 active:scale-90 transition-all bg-zinc-900/50 backdrop-blur-sm rounded-full shadow-lg border border-white/10 relative">
                    <MessageSquare size={20} strokeWidth={3} />
                    {unapprovedCommentsCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-[8px] font-black rounded-full flex items-center justify-center animate-bounce border-2 border-zinc-900">
                        {unapprovedCommentsCount}
                      </span>
                    )}
                  </button>
                  <button onClick={handleAdminLogout} className="p-4 text-red-500 hover:scale-110 active:scale-90 transition-all bg-zinc-900/50 backdrop-blur-sm rounded-full shadow-lg border border-red-500/20 group relative">
                    <LogOut size={20} strokeWidth={3} />
                    <span className="absolute right-full mr-2 px-2 py-1 bg-black text-red-500 text-[8px] font-black uppercase rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">Salir Admin</span>
                  </button>
                </>
              ) : (
                <>
                  {appSettings.allowComments && (
                    <button onClick={() => setShowComments(true)} className="p-4 text-white/50 hover:text-[#FFCD00] hover:scale-110 active:scale-90 transition-all bg-zinc-900/50 backdrop-blur-sm rounded-full shadow-lg border border-white/10 relative">
                      <MessageSquare size={20} strokeWidth={3} />
                    </button>
                  )}
                  <button onClick={() => setShowAdminLoginModal(true)} className="p-4 text-white/30 hover:text-[#FFCD00] hover:scale-110 active:scale-90 transition-all bg-zinc-900/40 backdrop-blur-sm rounded-full shadow-lg border border-white/5 group relative">
                    <Lock size={18} />
                    <span className="absolute right-full mr-2 px-2 py-1 bg-black text-[#FFCD00] text-[8px] font-black uppercase rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">Acceso Admin</span>
                  </button>
                </>
              )}
            </div>

            <div className="pt-4 pb-5">
              {/* BARRA DE IDENTIFICACIÓN PREMIUM OVALADA (ARRIBA DEL LOGO) */}
              <div className="flex items-center justify-start mb-2.5 animate-in fade-in slide-in-from-top-1 duration-300">
                <div
                  onClick={() => {
                    if (isAdmin || (user && !user.isAnonymous)) {
                      setBiometricRegError('');
                      setBiometricRegSuccess('');
                      setBiometricRegPassword('');
                      setShowBiometricSettingsModal(true);
                    } else {
                      setPendingActionView('home');
                      setIsClientRegister(false);
                      setClientAuthError('');
                      setShowClientAuthModal(true);
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md shadow-sm transition-all duration-300 text-left cursor-pointer hover:bg-zinc-950/40 active:scale-95 ${
                    isAdmin 
                      ? 'bg-black/90 border-[#FFCD00]/20 text-[#FFCD00]' 
                      : user && !user.isAnonymous
                        ? 'bg-zinc-950/40 border-green-500/30 text-green-400'
                        : 'bg-zinc-950/20 border-white/5 text-white/40'
                  }`}
                  id="auth-identity-badge"
                >
                  {/* Círculo interno con carga automática de avatar */}
                  <div className={`w-4.5 h-4.5 rounded-full overflow-hidden border shrink-0 bg-zinc-900 flex items-center justify-center font-black ${
                    isAdmin ? 'border-[#FFCD00]/30 shadow-[0_0_4px_rgba(255,205,0,0.1)]' : user && !user.isAnonymous ? 'border-green-500/30' : 'border-white/5'
                  }`}>
                    <img 
                      src={isAdmin 
                        ? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(localAdminEmail || 'Admin')}&backgroundColor=FFCD00&textColor=000000&bold=true`
                        : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user?.displayName || user?.email || 'Cliente')}&backgroundColor=27272a&textColor=ffffff&bold=true`
                      } 
                      className="w-full h-full object-cover" 
                      alt="Avatar"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  
                  <div className="flex flex-col pr-1 leading-none">
                    <span className={`text-[7px] font-black tracking-[0.12em] uppercase italic leading-none ${
                      isAdmin ? 'text-[#FFCD00]' : user && !user.isAnonymous ? 'text-green-400' : 'text-zinc-400'
                    }`}>
                      {isAdmin ? 'ADMINISTRADOR' : user && !user.isAnonymous ? 'CLIENTE ACTIVO' : 'INVITADO'}
                    </span>
                    <span className="text-[6px] font-bold text-zinc-400 max-w-[95px] truncate leading-none mt-0.5">
                      {isAdmin ? (localAdminEmail || 'CONSTRUACHA') : (user?.isAnonymous ? 'Sesión de Consulta' : user?.displayName || user?.email || 'Anónimo')}
                    </span>
                  </div>

                  {(isAdmin || (user && !user.isAnonymous)) && (
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (isAdmin) {
                          handleAdminLogout();
                        } else {
                          try {
                            await signOut(auth);
                          } catch (err) {
                            console.error("Error al cerrar sesión del cliente:", err);
                          }
                        }
                      }} 
                      className="ml-1 pl-2.5 py-1 border-l border-white/10 text-red-500/90 hover:text-red-400 active:scale-90 transition-all flex items-center justify-center cursor-pointer min-w-[36px] min-h-[28px]"
                      title="Cerrar sesión"
                      id="badge-logout-btn"
                    >
                      <LogOut size={12} strokeWidth={3.5} />
                    </button>
                  )}
                </div>
              </div>

              {/* LOGO DE MARCA */}
              <div className="pt-2"><FullBrandLogo variant="default" /></div>
            </div>
            
            {isAdmin && appSettings.allowNotifications && pendingRemindersCount > 0 && (
              <div className="fixed right-0 top-[40%] -translate-y-1/2 z-[180] pr-1">
                <div className="relative">
                  <div className="absolute -top-1 -left-1 bg-white text-red-600 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-red-600 z-20 shadow-lg animate-bounce">
                    {pendingRemindersCount}
                  </div>
                  <button className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center text-white shadow-[0_0_25px_rgba(220,38,38,0.6)] pulse-red border border-white/20 active:scale-90 transition-all cursor-pointer" onClick={() => setView('admin_archive')}>
                    <AlarmClock size={24} />
                  </button>
                </div>
              </div>
            )}

            {isAdmin && appSettings.allowNotifications && pendingBudgetsCount > 0 && (
              <div className="fixed right-0 top-[55%] -translate-y-1/2 z-[180] pr-1">
                <div className="relative">
                  <div className="absolute -top-1 -left-1 bg-white text-red-600 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-red-600 z-20 shadow-lg animate-bounce">
                    {pendingBudgetsCount}
                  </div>
                  <button className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center text-white shadow-[0_0_25px_rgba(220,38,38,0.6)] pulse-red border border-white/20 active:scale-90 transition-all cursor-pointer" onClick={() => setView('admin_archive')}>
                    <Bell size={24} />
                  </button>
                </div>
              </div>
            )}

            {!isAdmin && clientBudgetChatNotifications.length > 0 && (
              <div className="fixed right-0 top-[40%] -translate-y-1/2 z-[180] pr-1">
                <div className="relative">
                  <div className="absolute -top-1 -left-1 bg-white text-red-600 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-red-600 z-20 shadow-lg animate-bounce">
                    {clientBudgetChatNotifications.length}
                  </div>
                  <button 
                    className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center text-white shadow-[0_0_25px_rgba(220,38,38,0.6)] pulse-red border border-white/20 active:scale-90 transition-all cursor-pointer" 
                    onClick={() => {
                      const firstNotif = clientBudgetChatNotifications[0];
                      const targetBudget = archivedBudgets.find(b => b.id === firstNotif.budgetId);
                      if (targetBudget) {
                        setSelectedReceipt(targetBudget);
                        setView('comprobante_detalle');
                        dismissReminder(firstNotif.id);
                      }
                    }}
                    title="NUEVO MENSAJE DE CONSTRUACHA"
                  >
                    <Bell size={24} className="animate-pulse" />
                  </button>
                </div>
              </div>
            )}

            <div className="relative w-full flex-1 min-h-[420px] mb-4 rounded-[3rem] overflow-hidden border border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] bg-zinc-900 group">
              <img 
                src={mainHeroImage} 
                className="absolute inset-0 w-full h-full object-cover opacity-85 group-hover:scale-110 group-hover:opacity-100 transition-all duration-[6s] ease-out" 
                alt="Diseño Moderno" 
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-[#FFCD00]/10 via-transparent to-black/20 mix-blend-overlay pointer-events-none" />
              <div className="absolute inset-0 z-10 p-5 flex flex-col justify-end bg-gradient-to-t from-black/60 via-black/20 to-transparent">
                    <div className="grid grid-cols-3 gap-3 mb-4">
                     {(appSettings.allowServicesList || isAdmin) && (
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => requireRegistration('rubros_info')} 
                        className="relative aspect-square bg-white/[0.15] border border-white/20 shadow-xl rounded-[1.8rem] flex flex-col items-center justify-center gap-2 transition-all group overflow-hidden"
                      >
                        {isAdmin && !appSettings.allowServicesList && (
                          <span className="absolute top-1 right-2 bg-red-600 text-white text-[5px] px-1.5 py-0.5 rounded-full font-black animate-pulse z-30 leading-none">OFF CLIENTE</span>
                        )}
                        <div className="p-2.5 bg-black/10 border border-[#FFCD00]/40 rounded-[1.2rem] text-[#FFCD00] shadow-lg">
                          <LayoutGrid size={26} />
                        </div>
                        <span className="font-black italic uppercase text-[8px] text-white tracking-[0.1em] drop-shadow-[0_2px_3px_rgba(0,0,0,1)] text-center px-1">Servicios</span>
                      </motion.button>
                     )}

                     {(appSettings.allowPortfolio || isAdmin) && (
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => requireRegistration('portfolio')} 
                        className="relative aspect-square bg-white/[0.15] border border-white/20 shadow-xl rounded-[1.8rem] flex flex-col items-center justify-center gap-2 transition-all group overflow-hidden"
                      >
                        {isAdmin && !appSettings.allowPortfolio && (
                          <span className="absolute top-1 right-2 bg-red-600 text-white text-[5px] px-1.5 py-0.5 rounded-full font-black animate-pulse z-30 leading-none">OFF CLIENTE</span>
                        )}
                        <div className="p-2.5 bg-black/10 border border-[#FFCD00]/40 rounded-[1.2rem] text-[#FFCD00] shadow-lg">
                          <Briefcase size={26} />
                        </div>
                        <span className="font-black italic uppercase text-[8px] text-white tracking-[0.1em] drop-shadow-[0_2px_3px_rgba(0,0,0,1)] text-center px-1">Galería</span>
                      </motion.button>
                     )}

                     {(appSettings.allowAIChat || isAdmin) && (
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => requireRegistration('ai_chat')} 
                        className="relative aspect-square bg-[#FFCD00]/10 border-2 border-[#FFCD00]/30 shadow-[0_0_20px_rgba(255,205,0,0.1)] rounded-[1.8rem] flex flex-col items-center justify-center gap-2 transition-all group overflow-hidden"
                      >
                        {isAdmin && !appSettings.allowAIChat && (
                          <span className="absolute top-1 right-2 bg-red-600 text-white text-[5px] px-1.5 py-0.5 rounded-full font-black animate-pulse z-30 leading-none">OFF CLIENTE</span>
                        )}
                        <div className="p-2.5 bg-black/20 border border-[#FFCD00] rounded-[1.2rem] text-[#FFCD00] shadow-lg animate-pulse">
                          <Bot size={26} />
                        </div>
                        <span className="font-black italic uppercase text-[8px] text-[#FFCD00] tracking-[0.1em] drop-shadow-[0_2px_3px_rgba(0,0,0,1)] text-center px-1">Asistente IA</span>
                      </motion.button>
                     )}
                   </div>
                  <div className="w-full flex gap-2">
                     {(appSettings.allowBudgetRequest || isAdmin) && (
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => requireRegistration('presupuesto_rubros')} 
                        className="relative flex-1 py-4 bg-red-600 rounded-[1.8rem] flex items-center justify-center gap-2 transition-all shadow-xl shadow-red-600/20 btn-sheen"
                      >
                        {isAdmin && !appSettings.allowBudgetRequest && (
                          <span className="absolute top-1 right-2 bg-black/60 border border-red-500 text-red-500 text-[6px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest animate-pulse leading-none">OFF CLIENTE</span>
                        )}
                        <FileText size={16} />
                        <span className="font-black italic uppercase text-[9px] tracking-widest">SOLICITAR PRESUPUESTO</span>
                      </motion.button>
                     )}
                     {!isAdmin && appSettings.allowMyOrders && archivedBudgets.length > 0 && (
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => requireRegistration('client_comprobantes')}
                        className="relative w-16 h-16 bg-[#FFCD00] border-2 border-white/20 rounded-[1.8rem] flex flex-col items-center justify-center text-black shadow-[0_0_20px_rgba(255,205,0,0.4)] transition-all shrink-0 animate-pulse-subtle"
                      >
                        <Archive size={20} />
                        <span className="text-[6px] font-black uppercase mt-1">MIS ORDENES</span>
                      </motion.button>
                     )}
                  </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {Object.entries(socialData).map(([key, data]: any) => (
                <button 
                  key={key} 
                  onClick={() => {
                    setActiveSocial(key as any);
                    setView('social_qr');
                  }} 
                  className="aspect-square bg-zinc-900 border border-white/5 rounded-2xl flex items-center justify-center hover:bg-zinc-800 active:scale-90 transition-all group"
                >
                  {data.icon("text-[#FFCD00] group-hover:scale-110 transition-transform")}
                </button>
              ))}
            </div>
          </div>
        )}

        {view === 'social_qr' && activeSocial && (
          <div className="flex-1 flex flex-col animate-in slide-in-from-bottom duration-500">
            <HeaderWithNav subtitle={(socialData as any)[activeSocial].title} logoVariant="social" />
            <div className="flex-1 flex flex-col items-center justify-center py-4 text-center">
              <div className="mb-10">
                <BrandedQR value={(socialData as any)[activeSocial].url} size={220} />
              </div>
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => window.open((socialData as any)[activeSocial].url, '_blank')} 
                  className="w-full bg-[#FFCD00] text-black py-5 rounded-[1.8rem] font-black italic uppercase tracking-widest shadow-xl btn-sheen"
                >
                  {(socialData as any)[activeSocial].label}
                </motion.button>
            </div>
          </div>
        )}

        {view === 'presupuesto_rubros' && (
          <div className="pb-40 animate-in slide-in-from-right duration-300 w-full overflow-hidden">
            <HeaderWithNav subtitle="SELECCIÓN DE RUBROS" logoVariant="default" />
            <div className="grid grid-cols-3 gap-1.5 mt-4 px-2">
              {servicesData.map(rubro => {
                const isSelected = selectedRubros.find((r: any) => r.id === rubro.id);
                return (
                      <button 
                        key={rubro.id} 
                        onClick={() => handleRubroToggle(rubro)} 
                        className={cn(
                          "group relative flex flex-col items-center justify-center p-2.5 border-2 rounded-[1.8rem] gap-2.5 transition-all overflow-hidden aspect-square scale-90", 
                          isSelected 
                            ? 'bg-[#FFCD00]/20 border-[#FFCD00] shadow-[0_0_40px_rgba(255,205,0,0.5)]' 
                            : 'bg-zinc-900 border-[#FFCD00]/60'
                        )}
                      >
                      {isSelected && <div className="absolute inset-0 bg-noise opacity-20 pointer-events-none" />}
                      <div className={cn("transition-all", isSelected ? 'text-white scale-110 drop-shadow-[0_0_8px_rgba(255,205,0,0.5)]' : 'text-[#FFCD00] scale-100')}>
                        {React.cloneElement(rubro.icon as React.ReactElement, { size: 38 })}
                      </div>
                      <span className="font-black uppercase italic text-[9px] text-center tracking-tighter relative z-10 text-white leading-none mt-1 whitespace-pre-wrap">{rubro.title}</span>
                    </button>
                );
              })}
            </div>
            <div className="flex justify-start px-2 mt-12 mb-8">
              <button 
                onClick={() => {
                  resetBudgetFlow();
                  setView('home');
                }} 
                className="px-4 py-1.5 bg-[#FFCD00] border border-white/10 rounded-xl text-black shadow-lg active:scale-95 transition-all group flex items-center gap-2"
              >
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                <span className="text-[11px] font-black uppercase italic tracking-tighter leading-none">INICIO</span>
              </button>
            </div>
            <div className="fixed bottom-12 right-6">
              <div className="relative floating-btn-enhanced">
                {selectedRubros.length > 0 && (
                  <div className="absolute -top-2 -right-1 bg-red-600 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-black z-20 shadow-lg animate-in zoom-in">
                    {selectedRubros.length}
                  </div>
                )}
                <motion.button 
                  whileHover={selectedRubros.length > 0 ? { scale: 1.1 } : {}}
                  whileTap={selectedRubros.length > 0 ? { scale: 0.9 } : {}}
                  onClick={() => selectedRubros.length > 0 && setView('presupuesto_paso2')} 
                  className={cn("w-16 h-16 rounded-full flex items-center justify-center shadow-2xl pulse-red transition-all cursor-pointer", selectedRubros.length > 0 ? 'bg-[#FFCD00] text-black' : 'bg-red-600/20 text-white/20')}
                >
                  <ChevronRight size={40} strokeWidth={4} />
                </motion.button>
              </div>
            </div>
          </div>
        )}

        {view === 'presupuesto_paso2' && (
          <div className="pb-10 animate-in slide-in-from-right duration-300 w-full max-w-sm">
            <HeaderWithNav subtitle="FORMULARIO DE SOLICITUD" logoVariant="default" />
            <div className="space-y-8 mt-4">
              <div className="space-y-6">
                {selectedRubros.map((rubro: any) => (
                  <div key={rubro.id} className="bg-zinc-900/40 backdrop-blur-md border border-white/10 rounded-[1.8rem] p-5 mb-3 shadow-lg">
                    {/* BLOQUEO FINAL: Títulos de selección - NO MODIFICAR MÉTRICAS */}
                    <p className="text-[9px] font-black uppercase text-[#FFCD00] mb-4 tracking-widest italic ml-1">{rubro.title}</p>
                    <div className="flex flex-wrap gap-2">
                       {rubro.items.map((item: any) => (
                         <button 
                           key={item} 
                           onClick={() => {
                             if (selectedServices.includes(item as never)) setSelectedServices(selectedServices.filter(s => s !== item));
                             else setSelectedServices([...selectedServices, item as never]);
                           }} 
                           className={cn(
                             "px-4 py-2.5 rounded-xl text-[9px] font-black uppercase italic transition-all duration-300 border shadow-md flex-shrink-0",
                             selectedServices.includes(item as never) 
                               ? "bg-[#FFCD00] text-black border-white/10 scale-105 shadow-[0_8px_20px_rgba(255,205,0,0.25)]" 
                               : "bg-black/60 border-white/10 text-white/80 hover:border-[#FFCD00]/30"
                           )}
                         >
                           {item}
                         </button>
                       ))}
                    </div>
                  </div>
                ))}
                <AnimatePresence>
                  {selectedServices.length === 0 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-col items-center py-4 text-center">
                      <div className="w-[85%] h-[2px] bg-red-600 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.5)] blink-guide-bar mb-3" />
                      <p className="text-[8px] font-black uppercase text-red-500 italic tracking-[0.2em] blink-guide-bar">SELECCIONE 1 O MÁS SERVICIOS PARA CONTINUAR</p>
                    </motion.div>
                  )}
                </AnimatePresence>
                {selectedServices.length > 0 && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8 mt-4 w-full">
                  <div className="flex flex-col items-center pt-4 border-t border-white/5">
                     <p className="text-[10px] font-black uppercase text-white mb-5 tracking-[0.2em] italic">¿CÓMO DEBEMOS LLAMARTE?</p>
                     <div className="flex gap-3">
                       {/* BLOQUEO FINAL: Selección de Tipo de Cliente - NO TOCAR PROPORCIONES */}
                       {['SR', 'SRA', 'EMPRESA'].map(t => (
                         <button key={t} onClick={() => setClientType(t)} className={cn(
                           "px-4 py-3 rounded-xl text-[10px] font-black italic uppercase transition-all flex items-center justify-center min-w-[75px] shadow-md",
                           clientType === t 
                             ? 'bg-[#FFCD00] text-black scale-105 shadow-[0_10px_25px_rgba(255,205,0,0.25)] border-2 border-white/10' 
                             : 'bg-zinc-900/50 backdrop-blur-md border border-white/10 text-white/80 hover:border-[#FFCD00]/30'
                         )}>
                           {t}.
                         </button>
                       ))}
                     </div>
                  </div>

                  {clientType && (
                    <div className="animate-in slide-in-from-bottom duration-500">
                      <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={clientType === 'EMPRESA' ? "ESTABLECER RAZÓN SOCIAL..." : `${clientType}. [ESCRIBE TU NOMBRE]...`} className="w-full bg-zinc-900 border border-white/20 rounded-2xl py-5 px-5 text-xs font-bold uppercase focus:border-[#FFCD00] outline-none transition-all placeholder:text-white/40" />
                    </div>
                  )}

                  {clientName.length >= 3 && (
                    <div className="animate-in slide-in-from-bottom duration-500 flex gap-2">
                      <div className="relative">
                        <select value={clientIdType} onChange={(e) => setClientIdType(e.target.value)} className="bg-zinc-900 border border-white/20 rounded-2xl py-5 px-3 text-xs font-bold outline-none focus:border-[#FFCD00] appearance-none">
                          {['V', 'E', 'J', 'G'].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-40"><ChevronRight size={10} className="rotate-90" /></div>
                      </div>
                      <input type="tel" value={clientIdNumber} onChange={(e) => setClientIdNumber(e.target.value.replace(/\D/g, ''))} placeholder="NÚMERO DE IDENTIFICACIÓN / RIF..." className="flex-1 bg-zinc-900 border border-white/20 rounded-2xl py-5 px-5 text-xs font-bold uppercase focus:border-[#FFCD00] outline-none transition-all placeholder:text-white/40" />
                    </div>
                  )}

                  {clientIdNumber.length >= 5 && (
                    <div className="animate-in slide-in-from-bottom duration-500 relative">
                      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="DETALLES DE TU PROYECTO (MÍN. 10 CARACTERES)..." className="w-full bg-zinc-900 border border-white/20 rounded-[2.5rem] p-6 text-xs font-bold uppercase min-h-[150px] focus:border-[#FFCD00] outline-none transition-all placeholder:text-white/30" />
                      {/* BLOQUEO FINAL: Botones Multimedia y GPS en Formulario - NO MODIFICAR MÉTRICAS */}
                      <div className="grid grid-cols-5 gap-1.5 mt-4 px-1">
                        <button onClick={() => (fileInputRef as any).current?.click()} className="w-full flex flex-col items-center justify-center p-2 bg-zinc-900/50 backdrop-blur-md border border-white/10 rounded-xl gap-1 active:scale-95 transition-all group hover:border-[#FFCD00]/30 shadow-md">
                           <div className="p-1.5 bg-white/5 rounded-lg group-hover:bg-[#FFCD00] group-hover:text-black transition-all">
                             <Paperclip size={16} />
                           </div>
                           <span className="text-[9px] font-black uppercase text-white/80 tracking-tighter text-center group-hover:text-[#FFCD00] transition-colors">Subir</span>
                        </button>
                        <button onClick={() => (cameraInputRef as any).current?.click()} className="w-full flex flex-col items-center justify-center p-2 bg-zinc-900/50 backdrop-blur-md border border-white/10 rounded-xl gap-1 active:scale-95 transition-all group hover:border-[#FFCD00]/30 shadow-md">
                           <div className="p-1.5 bg-white/5 rounded-lg group-hover:bg-[#FFCD00] group-hover:text-black transition-all">
                             <Camera size={16} />
                           </div>
                           <span className="text-[9px] font-black uppercase text-white/80 tracking-tighter text-center group-hover:text-[#FFCD00] transition-colors">Cámara</span>
                        </button>
                        <button onClick={() => (videoInputRef as any).current?.click()} className="w-full flex flex-col items-center justify-center p-2 bg-zinc-900/50 backdrop-blur-md border border-white/10 rounded-xl gap-1 active:scale-95 transition-all group hover:border-[#FFCD00]/30 shadow-md">
                           <div className="p-1.5 bg-white/5 rounded-lg group-hover:bg-[#FFCD00] group-hover:text-black transition-all">
                             <Film size={16} />
                           </div>
                           <span className="text-[9px] font-black uppercase text-white/80 tracking-tighter text-center group-hover:text-[#FFCD00] transition-colors">Video</span>
                        </button>
                        <button onClick={() => (recordVideoInputRef as any).current?.click()} className="w-full flex flex-col items-center justify-center p-2 bg-zinc-900/50 backdrop-blur-md border border-white/10 rounded-xl gap-1 active:scale-95 transition-all group hover:border-[#FFCD00]/30 shadow-md">
                           <div className="p-1.5 bg-white/5 rounded-lg group-hover:bg-[#FFCD00] group-hover:text-black transition-all">
                             <Video size={16} />
                           </div>
                           <span className="text-[9px] font-black uppercase text-white/80 tracking-tighter text-center group-hover:text-[#FFCD00] transition-colors">Grabar</span>
                        </button>
                        <button onClick={getUserLocation} className={cn(
                          "w-full flex flex-col items-center justify-center p-2 backdrop-blur-md border rounded-xl gap-1 active:scale-95 transition-all group shadow-md",
                          userLocation ? "bg-[#FFCD00]/20 border-[#FFCD00]/50" : "bg-zinc-900/50 border-white/10 hover:border-[#FFCD00]/30",
                          isLocating && "animate-pulse"
                        )}>
                           <div className={cn(
                             "p-1.5 rounded-lg transition-all",
                             userLocation ? "bg-[#FFCD00] text-black" : "bg-white/5 text-[#FFCD00] group-hover:bg-[#FFCD00] group-hover:text-black"
                           )}>
                            {isLocating ? <Clock size={16} className="animate-spin" /> : <MapPin size={16} />}
                           </div>
                           <span className={cn(
                             "text-[9px] font-black uppercase tracking-tighter text-center transition-colors",
                             userLocation ? "text-[#FFCD00]" : "text-white/80 group-hover:text-[#FFCD00]"
                           )}>GPS</span>
                        </button>
                      </div>
                      {attachedFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4 px-2">
                          {attachedFiles.map((f: any) => (
                            <div key={f.id} className="relative group">
                              {f.type === 'video' ? (
                                <video src={f.preview} onClick={() => setPreviewImage(f)} className="w-14 h-14 rounded-xl object-cover border border-white/10 cursor-pointer active:scale-95 transition-all" muted playsInline preload="metadata" />
                              ) : (
                                <img src={f.preview} onClick={() => setPreviewImage(f)} className="w-14 h-14 rounded-xl object-cover border border-white/10 cursor-pointer active:scale-95 transition-all" />
                              )}
                              <button onClick={() => removeFile(f.id)} className="absolute -top-1 -right-1 bg-red-600 text-white p-1 rounded-full shadow-lg"><Trash size={8} strokeWidth={4} /></button>
                            </div>
                          ))}
                        </div>
                      )}

                      {userLocation && (
                        <div className="mt-4 px-2 animate-in slide-in-from-left duration-500">
                          <div className="w-full text-left">
                            <div onClick={() => window.open(`https://www.google.com/maps?q=${userLocation.lat},${userLocation.lon}`, '_blank')} className="w-full bg-zinc-800 p-4 rounded-t-2xl border-t border-x border-white/10 flex items-center gap-4 cursor-pointer hover:border-[#FFCD00]/30 transition-all">
                              <div className="w-12 h-12 bg-[#FFCD00] rounded-xl flex items-center justify-center text-black shadow-[0_0_15px_rgba(255,205,0,0.3)]">
                                <MapPin size={24} />
                              </div>
                              <div className="flex-1">
                                <p className="text-[10px] font-black uppercase text-[#FFCD00] italic">UBICACIÓN GPS FIJADA</p>
                                <p className="text-[7px] font-bold text-zinc-400 uppercase truncate tracking-widest">COORDENADAS: {userLocation.lat.toFixed(6)}, {userLocation.lon.toFixed(6)}</p>
                              </div>
                              <ExternalLink size={16} className="text-white/20" />
                            </div>
                            <MapPreview lat={userLocation.lat} lon={userLocation.lon} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {description.length >= 10 && (
                    <div className="animate-in slide-in-from-bottom duration-500 flex gap-2">
                      <div className="relative">
                        <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} className="bg-zinc-900 border border-white/20 rounded-2xl py-5 px-3 text-xs font-bold outline-none focus:border-[#FFCD00] appearance-none">
                          {['+58', '+57', '+51', '+56', '+54', '+52', '+34', '+1'].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-40"><ChevronRight size={10} className="rotate-90" /></div>
                      </div>
                      <input type="tel" value={userPhone} maxLength={10} onChange={(e) => setUserPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="TELÉFONO (10 DÍGITOS)..." className="flex-1 bg-zinc-900 border border-white/20 rounded-2xl py-5 px-5 text-xs font-bold uppercase focus:border-[#FFCD00] outline-none transition-all placeholder:text-white/40" />
                    </div>
                  )}

                  {userPhone.length >= 10 && (
                    <div className="animate-in slide-in-from-bottom duration-500 space-y-2">
                      <div className="relative flex items-center w-full">
                        <input 
                          type="text" 
                          value={clientEmail} 
                          onChange={(e) => setClientEmail(e.target.value)} 
                          placeholder="CORREO ELECTRÓNICO (EMAIL)..." 
                          className="w-full bg-zinc-900 border border-white/20 rounded-2xl py-5 pl-5 pr-24 text-xs font-bold uppercase focus:border-[#FFCD00] outline-none transition-all placeholder:text-white/40" 
                        />
                        {clientEmail && (
                          <button
                            type="button"
                            onClick={() => setClientEmail('')}
                            className="absolute right-4 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all font-sans"
                          >
                            BORRAR
                          </button>
                        )}
                      </div>
                      {clientEmail.length >= 4 && (() => {
                        const emailErr = validateClientEmail(clientEmail);
                        return emailErr ? (
                          <p className="text-[9px] font-bold text-red-400 uppercase italic tracking-wider px-2 leading-relaxed bg-red-950/20 border border-red-500/20 p-2.5 rounded-xl animate-pulse">
                            ⚠️ {emailErr}
                          </p>
                        ) : (
                          <p className="text-[9px] font-bold text-[#FFCD00] uppercase italic tracking-wider px-2 leading-relaxed bg-[#FFCD00]/5 border border-[#FFCD00]/15 p-2.5 rounded-xl">
                            ✅ CORREO ELECTRÓNICO TOTALMENTE VÁLIDO.
                          </p>
                        );
                      })()}
                    </div>
                  )}

                  {clientEmail.length >= 4 && (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="pt-6">
                      <button 
                        onClick={sendRequest} 
                        disabled={isSubmittingBudget || !!validateClientEmail(clientEmail)}
                        className={cn(
                          "w-full py-5 text-black rounded-[2rem] font-black uppercase italic tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 transition-all duration-300",
                          (isSubmittingBudget || !!validateClientEmail(clientEmail))
                            ? "bg-zinc-800 text-white/30 cursor-not-allowed shadow-none border border-white/5" 
                            : "bg-[#FFCD00] shadow-[#FFCD00]/10 btn-sheen hover:scale-[1.02] active:scale-95"
                        )}
                      >
                        {isSubmittingBudget ? (
                          <>
                            <Clock size={18} className="animate-spin text-[#FFCD00]" />
                            <span>ENVIANDO...</span>
                          </>
                        ) : (
                          <>
                            <Send size={18} />
                            <span>ENVIAR SOLICITUD</span>
                          </>
                        )}
                      </button>
                      
                      {budgetError && (
                        <div className="mt-4 p-4 bg-red-900/30 border border-red-500/30 rounded-2xl animate-in fade-in duration-300">
                          <p className="text-[10px] font-black uppercase text-red-400 italic text-center tracking-wider leading-relaxed">
                            {budgetError}
                          </p>
                        </div>
                      )}
                      
                      <p className="text-[7px] text-center text-white/20 mt-4 uppercase font-bold tracking-widest leading-loose">
                        AL ENVIAR, SE GENERARÁ UN RÉCORD EN NUESTRA BASE DE DATOS <br/> Y PODRÁ VER SU COMPROBANTE DE SOLICITUD.
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              )}

              <div className="flex justify-start px-2 mt-8 mb-4">
                <button 
                  onClick={() => {
                    resetBudgetFlow();
                    setView('home');
                  }} 
                  className="px-4 py-1.5 bg-[#FFCD00] border border-white/10 rounded-xl text-black shadow-lg active:scale-95 transition-all group flex items-center gap-2"
                >
                  <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                  <span className="text-[11px] font-black uppercase italic tracking-tighter leading-none">INICIO</span>
                </button>
              </div>
            </div>
          </div>
          </div>
        )}

        {view === 'rubros_info' && (
          <div className="pb-10 animate-in slide-in-from-right duration-300">
            <HeaderWithNav subtitle="SERVICIOS" logoVariant="default" />
            <div className="space-y-4">
              {servicesData.map(r => (
                <div key={r.id} className="bg-[#0A0A0A] p-6 rounded-[2.5rem] border border-white/10 shadow-2xl shadow-black transition-all hover:border-[#FFCD00]/30 min-h-[120px]">
                  <div className="flex items-center gap-4 mb-5">
                    <div className="p-3 bg-[#FFCD00] text-black rounded-2xl shadow-[0_8px_25px_rgba(255,205,0,0.35)] border border-black/10 transition-transform active:scale-95">{r.icon}</div>
                    <h3 className="font-black uppercase text-base tracking-tighter text-[#FFCD00] [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]">{r.title}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {r.items.map(item => <span key={item} className="px-3.5 py-1.5 bg-black/80 border border-white/10 rounded-xl text-[10px] font-black uppercase text-white tracking-widest italic shadow-lg shadow-black/80 [text-shadow:0_1px_2px_rgba(0,0,0,1)] border-b-2 border-b-white/5 active:bg-[#FFCD00] active:text-black transition-all">
                      {item}
                    </span>)}
                  </div>
                </div>
              ))}
              
              <div className="flex justify-start px-2 mt-8 mb-4">
                <button 
                  onClick={() => {
                    resetBudgetFlow();
                    setView('home');
                  }} 
                  className="px-4 py-1.5 bg-[#FFCD00] border border-white/10 rounded-xl text-black shadow-lg active:scale-95 transition-all group flex items-center gap-2"
                >
                  <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                  <span className="text-[11px] font-black uppercase italic tracking-tighter leading-none">INICIO</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'presupuesto_exito' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-10 animate-in zoom-in w-full bg-black min-h-screen">
            <FullBrandLogo className="scale-110 mb-8" variant="default" />
            <div className="w-24 h-24 bg-[#FFCD00] rounded-full flex items-center justify-center text-black mb-6 pulse-red"><CheckCircle2 size={48} /></div>
            <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-2 text-[#FFCD00]">¡ENVIADO!</h2>
            <div id="ticket-seguridad-descargable" className="bg-[#0A0A0A] border border-[#FFCD00] px-6 py-5 rounded-[2.5rem] mb-4 shadow-2xl relative overflow-hidden group w-full max-w-[320px]">
              <div className="absolute inset-0 bg-noise opacity-15" />
              <div className="absolute inset-0 bg-gradient-to-br from-[#FFCD00]/5 to-transparent pointer-events-none" />
              <p className="text-[7px] font-black text-zinc-500 uppercase mb-4 tracking-[0.4em] relative z-10 text-center">TICKET DE SEGURIDAD</p>
              <div className="flex items-center justify-center gap-4 mb-4 relative z-10 w-full overflow-hidden">
                 <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse shrink-0 shadow-[0_0_10px_rgba(220,38,38,0.7)]" />
                 <p className="text-lg font-black text-white tracking-widest pl-1 leading-none">{lastSubmittedBudget?.id || archivedBudgets[0]?.id || "REF-CA-2026-0001"}</p>
                 <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse shrink-0 shadow-[0_0_10px_rgba(220,38,38,0.7)]" />
              </div>
              <div className="mt-4 pt-4 border-t border-white/10 relative z-10">
                <p className="text-[9px] font-black text-[#FFCD00] italic uppercase tracking-tighter leading-tight text-center">(Pronto será atendido por nuestro personal Técnico)</p>
              </div>
            </div>

            <p className="text-[8px] font-black uppercase text-white/30 tracking-[0.2em] px-10 mb-12 leading-relaxed">TU SOLICITUD FUE PROCESADA BAJO <br/> ESTRICTO CONTROL DE CALIDAD Y SEGURIDAD.</p>
            <div className="w-full flex flex-col gap-2.5 max-w-[300px] mx-auto">
               <button 
                onClick={() => {
                  const receipt = lastSubmittedBudget || archivedBudgets[0];
                  if (receipt) {
                    setSelectedReceipt(receipt);
                    setView('comprobante_detalle');
                  }
                }} 
                className="w-full py-3.5 bg-[#FFCD00] text-black rounded-2xl font-black uppercase text-[11px] italic tracking-tighter active:scale-95 transition-all shadow-xl flex items-center justify-center gap-2"
              >
                VER COMPROBANTE DETALLADO
              </button>
              <button 
                onClick={() => setView('home')} 
                className="w-full py-3.5 bg-zinc-900 border border-white/10 text-white/50 rounded-2xl font-black uppercase text-[11px] italic tracking-tighter active:scale-95 transition-all hover:bg-zinc-800 hover:text-white"
              >
                FINALIZAR Y VOLVER AL INICIO
              </button>
            </div>
          </div>
        )}

        {/* VISTA: ARCHIVADOR DE COMPROBANTES (CLIENTE) */}
        {view === 'client_comprobantes' && (
          <div className="pb-10 animate-in slide-in-from-right duration-500 w-full">
            <HeaderWithNav subtitle="MIS COMPROBANTES" logoVariant="default" />
            
            {clientBudgetChatNotifications.length > 0 && (
              <div className="mb-6 mt-4 bg-red-600/15 border-2 border-red-600/30 p-5 rounded-[2rem] flex items-center justify-between gap-4 animate-pulse shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-red-600 rounded-full text-white shrink-0">
                    <Bell size={20} className="animate-bounce" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-red-500 tracking-tight leading-none mb-1">¡TIENES RESPUESTAS NUEVAS!</p>
                    <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest leading-none">EL ADMINISTRADOR DE CONSTRUACHA TE HA RESPONDIDO EN EL CHAT.</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const firstNotif = clientBudgetChatNotifications[0];
                    const targetBudget = archivedBudgets.find(b => b.id === firstNotif.budgetId);
                    if (targetBudget) {
                      setSelectedReceipt(targetBudget);
                      setView('comprobante_detalle');
                      dismissReminder(firstNotif.id);
                    }
                  }}
                  className="px-4 py-2.5 bg-red-600 text-white rounded-xl text-[8.5px] font-black uppercase tracking-wider shrink-0 active:scale-95 transition-transform"
                >
                  ABRIR CHAT
                </button>
              </div>
            )}

            <div className="space-y-4 mt-6">
              {archivedBudgets.length === 0 ? (
                <div className="py-20 flex flex-col items-center opacity-20">
                  <Archive size={48} className="mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">AÚN NO TIENES COMPROBANTES</p>
                </div>
              ) : (
                archivedBudgets.map(budget => {
                  const isSigned = !!budget.signature;
                  const hasDocs = !!budget.id_front && !!budget.id_back;
                  const isApproved = !!budget.confirmed;
                  const needsCorrection = !isSigned || !hasDocs;

                  const hasClientChatNotif = clientBudgetChatNotifications.some(r => r.budgetId === budget.id);
                  const hasClientPendingAction = !isSigned || !hasDocs;

                  return (
                    <div 
                      key={budget.id} 
                      onClick={() => { setSelectedReceipt(budget); setView('comprobante_detalle'); }} 
                      className="w-full bg-zinc-900/40 border border-white/5 p-6 rounded-[2.5rem] flex flex-col md:flex-row md:items-center justify-between group active:scale-95 hover:border-[#FFCD00]/20 transition-all relative overflow-hidden text-left cursor-pointer"
                    >
                      <div className="absolute inset-0 bg-noise opacity-[0.03] pointer-events-none" />
                      
                      {/* BOTONES DE NOTIFICACIÓN DE ACCESO DIRECTO EN LA PARTE SUPERIOR DERECHA */}
                      <div className="absolute top-5 right-5 z-20 flex items-center gap-1.5">
                        {hasClientChatNotif && (
                          <button
                            title="Chat nuevo de administración"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedReceipt(budget);
                              setView('comprobante_detalle');
                            }}
                            className="w-8 h-8 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-600/50 active:scale-90 transition-all animate-bounce"
                          >
                            <Bell size={14} className="animate-pulse" />
                          </button>
                        )}
                        {hasClientPendingAction && (
                          <button
                            title="Acción requerida (firma o cédula)"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedReceipt(budget);
                              setView('comprobante_detalle');
                            }}
                            className="w-8 h-8 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-600/50 active:scale-90 transition-all animate-pulse"
                          >
                            <Clock size={14} />
                          </button>
                        )}
                      </div>

                      <div className="text-left relative z-10 w-full">
                        <div className="flex items-center justify-between mb-2 w-full">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#FFCD00] shadow-[0_0_8px_rgba(255,205,0,0.4)]" />
                            <span className="text-[10px] font-black text-white uppercase tracking-tighter italic">REGISTRO: {budget.id}</span>
                          </div>
                          <div className="p-1 rounded-full bg-white/5 text-white/20 group-hover:bg-[#FFCD00] group-hover:text-black transition-all md:hidden mr-16">
                            <ChevronRight size={14} />
                          </div>
                        </div>
                        <div className="flex flex-col ml-1">
                          <span className="text-[13px] font-black text-white uppercase mb-1 tracking-tight group-hover:text-[#FFCD00] transition-colors">{(budget.servicios || []).length > 2 ? `${(budget.servicios || []).slice(0, 2).join(', ')}...` : (budget.servicios || []).join(', ')}</span>
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em] bg-white/5 px-2.5 py-1 rounded-md border border-white/5">{budget.fecha}</span>
                            <span className="text-[8px] font-black text-[#FFCD00] uppercase tracking-[0.2em]">SISTEMA SEGURO</span>
                          </div>
                          
                          {/* BADGES DE ESTADO - HISTORIAL */}
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {clientBudgetChatNotifications.some(r => r.budgetId === budget.id) && (
                              <span className="px-2 py-0.5 bg-red-600 border border-red-500/30 text-white text-[7px] font-black uppercase rounded-md flex items-center gap-1 animate-bounce shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                                <MessageSquare size={8} /> CHAT NUEVO (ADMIN)
                              </span>
                            )}

                            {isApproved ? (
                              <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 text-green-400 text-[7px] font-black uppercase rounded-md flex items-center gap-1">
                                <Check size={8} /> APROBADO ADM
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-zinc-800 border border-white/5 text-zinc-400 text-[7px] font-black uppercase rounded-md flex items-center gap-1">
                                <Clock size={8} /> PENDIENTE ADM
                              </span>
                            )}

                            {isSigned ? (
                              <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 text-green-400 text-[7px] font-black uppercase rounded-md flex items-center gap-1">
                                <Check size={8} /> FIRMADO
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-500 text-[7px] font-black uppercase rounded-md flex items-center gap-1 animate-pulse">
                                <AlertTriangle size={8} /> REQUERIDO: FIRMA
                              </span>
                            )}

                            {hasDocs ? (
                              <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 text-green-400 text-[7px] font-black uppercase rounded-md flex items-center gap-1">
                                <Check size={8} /> CÉDULA OK
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-500 text-[7px] font-black uppercase rounded-md flex items-center gap-1 animate-pulse">
                                <AlertTriangle size={8} /> REQUERIDO: CÉDULA
                              </span>
                            )}

                            {needsCorrection && (
                              <span className="px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[7px] font-black uppercase rounded-md flex items-center gap-1 animate-pulse">
                                <Edit size={8} /> ACCIÓN REQUERIDA
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="hidden md:flex p-3 rounded-full bg-white/5 text-white/20 group-hover:bg-[#FFCD00] group-hover:text-black transition-all relative z-10 shrink-0 ml-4 mr-16">
                        <ChevronRight size={18} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-12 mb-6 flex justify-center">
              <button 
                onClick={() => {
                  resetBudgetFlow();
                  setView('home');
                }} 
                className="px-8 py-3 bg-[#FFCD00] border border-white/10 rounded-2xl text-black shadow-2xl active:scale-95 transition-all group flex items-center gap-3"
              >
                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                <span className="text-[14px] font-black uppercase italic tracking-tighter leading-none">VOLVER AL PANEL</span>
              </button>
            </div>
          </div>
        )}

              {view === 'comprobante_validacion' && selectedReceipt && (() => {
                const currentReceipt = archivedBudgets.find(b => b.id === selectedReceipt.id) || selectedReceipt;
                
                const hasSignature = !!currentReceipt.signature;
                const hasIdFront = !!currentReceipt.id_front;
                const hasIdBack = !!currentReceipt.id_back;
                const hasDocuments = hasIdFront && hasIdBack;
                const isValidationComplete = hasSignature && hasDocuments;

                return (
                  <div className="pb-10 animate-in zoom-in duration-500 w-full flex flex-col items-center relative">
                     <HeaderWithNav subtitle="VALIDACIÓN EN CASCADA" logoVariant="default" align="left" />

                     <div className="w-full bg-black text-white border border-white/10 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col items-center max-w-md">
                       {/* Marcas de agua y diseño de validación */}
                       <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 opacity-50 pointer-events-none" />
                       <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#FFCD00]/5 rounded-full -ml-16 -mb-16 opacity-30 pointer-events-none" />
                       
                       <div className="flex flex-col items-center border-b-2 border-dashed border-white/10 pb-6 mb-6 w-full text-center">
                         <FullBrandLogo className="scale-110 mb-2" variant="qr" />
                         <span className="text-[8px] font-black uppercase tracking-[0.3em] text-[#FFCD00]">CONSENTIMIENTO DE SEGURIDAD</span>
                         <h2 className="text-xl font-black uppercase italic text-white tracking-tighter mt-1 leading-tight">VALIDAR PRESUPUESTO</h2>
                         <p className="text-[10px] font-bold text-zinc-500 uppercase mt-1">ID TRANSACCIÓN: #{currentReceipt.id}</p>
                       </div>

                       {/* PASOS EN CASCADA */}
                       <div className="w-full space-y-6">
                         
                         {/* PASO 1: FIRMA DIGITAL */}
                         <div className={`p-5 rounded-2xl border transition-all ${hasSignature ? 'bg-green-950/10 border-green-500/20' : 'bg-zinc-900 border-white/5'}`}>
                           <div className="flex items-center justify-between mb-3">
                             <div className="flex items-center gap-2">
                               <span className={`w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center leading-none ${hasSignature ? 'bg-green-500 text-black' : 'bg-[#FFCD00] text-black'}`}>1</span>
                               <span className="text-[11px] font-black uppercase tracking-wider text-white italic">PASO 1: FIRMA DIGITAL</span>
                             </div>
                             {hasSignature && (
                               <span className="text-[8px] font-black text-green-400 uppercase tracking-widest flex items-center gap-1">
                                 <CheckCircle2 size={10} /> LISTO
                               </span>
                             )}
                           </div>
                           
                           {hasSignature ? (
                             <div className="bg-white/5 rounded-xl border border-white/10 p-3 flex flex-col items-center justify-center relative min-h-[80px]">
                               <img 
                                 src={currentReceipt.signature} 
                                 className="max-h-16 w-auto object-contain brightness-110 contrast-125" 
                                 alt="Firma del Cliente" 
                                />
                               <button 
                                 onClick={() => setShowSignaturePad(true)}
                                 className="absolute top-1 right-2 text-[8px] font-black text-[#FFCD00] uppercase hover:underline"
                               >
                                 VOLVER A FIRMAR
                               </button>
                             </div>
                           ) : (
                             <div className="space-y-3">
                               <p className="text-[9.5px] font-medium text-zinc-400 uppercase tracking-wider leading-normal">
                                 La firma digitaliza tu consentimiento técnico para procesar este presupuesto con prioridad inmediata.
                               </p>
                               <button 
                                 onClick={() => setShowSignaturePad(true)} 
                                 className="w-full py-3.5 bg-zinc-950 border border-[#FFCD00]/20 hover:border-[#FFCD00]/50 hover:bg-black rounded-xl text-[11px] font-black uppercase italic tracking-widest text-[#FFCD00] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
                               >
                                 <PencilRuler size={14} />
                                 DIBUJAR FIRMA DIGITAL
                               </button>
                             </div>
                           )}
                         </div>

                         {/* PASO 2: CÉDULA DE IDENTIDAD / PASAPORTE */}
                         <div className={`p-5 rounded-2xl border transition-all ${hasDocuments ? 'bg-green-950/10 border-green-500/20' : 'bg-zinc-900 border-white/5'}`}>
                           <div className="flex items-center justify-between mb-3">
                             <div className="flex items-center gap-2">
                               <span className={`w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center leading-none ${hasDocuments ? 'bg-green-500 text-black' : 'bg-[#FFCD00] text-black'}`}>2</span>
                               <span className="text-[11px] font-black uppercase tracking-wider text-white italic">PASO 2: SUBIR DOCUMENTO</span>
                             </div>
                             {hasDocuments && (
                               <span className="text-[8px] font-black text-green-400 uppercase tracking-widest flex items-center gap-1">
                                 <CheckCircle2 size={10} /> LISTO
                               </span>
                             )}
                           </div>
                           
                           <p className="text-[9.5px] font-medium text-zinc-400 uppercase tracking-wider mb-4 leading-normal">
                             Para formalizar legalmente tu solicitud y agilizar su aprobación, sube una foto nítida de tu cédula o pasaporte por ambas caras.
                           </p>

                           <div className="grid grid-cols-2 gap-3">
                             {/* Subir Anverso (Frente) */}
                             <div className="flex flex-col items-center text-center">
                               <span className="text-[7px] font-black text-white/40 uppercase mb-1.5 tracking-wider">FRENTE (ANVERSO)</span>
                               {currentReceipt.id_front ? (
                                 <div className="relative aspect-[1.6/1] w-full bg-white/5 rounded-xl border border-white/10 overflow-hidden group flex items-center justify-center">
                                   <img src={currentReceipt.id_front} className="w-full h-full object-cover" alt="ID Frente" />
                                   <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 cursor-pointer transition-opacity">
                                     <Camera size={14} className="text-[#FFCD00]" />
                                     <span className="text-[6px] font-black uppercase text-[#FFCD00]">CAMBIAR</span>
                                     <input 
                                       type="file" 
                                       accept="image/*" 
                                       capture="environment"
                                       onChange={(e) => handleIDDocumentSelect(e, currentReceipt.id, 'front')} 
                                       className="hidden" 
                                     />
                                   </label>
                                   <div className="absolute bottom-1.5 right-1.5 p-0.5 bg-green-600 rounded-full text-white shadow-md">
                                     <CheckCircle2 size={8} />
                                   </div>
                                 </div>
                               ) : (
                                 <label className="aspect-[1.6/1] w-full bg-black/40 border border-dashed border-white/15 hover:border-[#FFCD00]/40 rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all">
                                   {isUploadingID === 'front' ? (
                                     <span className="text-[7px] font-bold text-white/50 uppercase animate-pulse">CARGANDO...</span>
                                   ) : (
                                     <>
                                       <Camera size={14} className="text-[#FFCD00]" />
                                       <span className="text-[7px] font-black text-white/70 uppercase tracking-wider">TOMAR FOTO</span>
                                     </>
                                   )}
                                   <input 
                                     type="file" 
                                     accept="image/*" 
                                     capture="environment"
                                     onChange={(e) => handleIDDocumentSelect(e, currentReceipt.id, 'front')} 
                                     disabled={isUploadingID !== null}
                                     className="hidden" 
                                   />
                                 </label>
                               )}
                             </div>

                             {/* Subir Reverso (Atrás) */}
                             <div className="flex flex-col items-center text-center">
                               <span className="text-[7px] font-black text-white/40 uppercase mb-1.5 tracking-wider">ATRÁS (REVERSO)</span>
                               {currentReceipt.id_back ? (
                                 <div className="relative aspect-[1.6/1] w-full bg-white/5 rounded-xl border border-white/10 overflow-hidden group flex items-center justify-center">
                                   <img src={currentReceipt.id_back} className="w-full h-full object-cover" alt="ID Atrás" />
                                   <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 cursor-pointer transition-opacity">
                                     <Camera size={14} className="text-[#FFCD00]" />
                                     <span className="text-[6px] font-black uppercase text-[#FFCD00]">CAMBIAR</span>
                                     <input 
                                       type="file" 
                                       accept="image/*" 
                                       capture="environment"
                                       onChange={(e) => handleIDDocumentSelect(e, currentReceipt.id, 'back')} 
                                       className="hidden" 
                                     />
                                   </label>
                                   <div className="absolute bottom-1.5 right-1.5 p-0.5 bg-green-600 rounded-full text-white shadow-md">
                                     <CheckCircle2 size={8} />
                                   </div>
                                 </div>
                               ) : (
                                 <label className="aspect-[1.6/1] w-full bg-black/40 border border-dashed border-white/15 hover:border-[#FFCD00]/40 rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all">
                                   {isUploadingID === 'back' ? (
                                     <span className="text-[7px] font-bold text-white/50 uppercase animate-pulse">CARGANDO...</span>
                                   ) : (
                                     <>
                                       <Camera size={14} className="text-[#FFCD00]" />
                                       <span className="text-[7px] font-black text-white/70 uppercase tracking-wider">TOMAR FOTO</span>
                                     </>
                                   )}
                                   <input 
                                     type="file" 
                                     accept="image/*" 
                                     capture="environment"
                                     onChange={(e) => handleIDDocumentSelect(e, currentReceipt.id, 'back')} 
                                     disabled={isUploadingID !== null}
                                     className="hidden" 
                                   />
                                 </label>
                               )}
                             </div>
                           </div>
                         </div>

                         {/* PASO 3: CONFIRMAR ENVÍO */}
                         <div className={`p-5 rounded-2xl border transition-all ${isValidationComplete ? 'bg-yellow-500/5 border-[#FFCD00]/30' : 'bg-zinc-900/50 border-white/5 opacity-60'}`}>
                           <div className="flex items-center gap-2 mb-3">
                             <span className={`w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center leading-none ${isValidationComplete ? 'bg-[#FFCD00] text-black animate-bounce' : 'bg-zinc-800 text-zinc-500'}`}>3</span>
                             <span className="text-[11px] font-black uppercase tracking-wider text-white italic">PASO 3: CONFIRMAR SOLICITUD</span>
                           </div>

                           {!isValidationComplete ? (
                             <div className="p-3 bg-zinc-950 rounded-xl border border-white/5 text-center">
                               <p className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-wider leading-relaxed">
                                 POR FAVOR COMPLETA EL **PASO 1 (FIRMA)** Y EL **PASO 2 (DOCUMENTO)** PARA DESBLOQUEAR EL ENVÍO.
                               </p>
                             </div>
                           ) : (
                             <div className="space-y-3">
                               <p className="text-[9.5px] font-bold text-[#FFCD00] uppercase tracking-wider leading-normal">
                                 ¡VALIDACIÓN COMPLETADA CORRECTAMENTE! PRESIONA EL BOTÓN DE ABAJO PARA FINALIZAR EL TRÁMITE.
                               </p>
                               <button 
                                 onClick={async () => {
                                   try {
                                     // Set confirmed as true in the database for the budget
                                     const budgetRef = doc(db, 'budgets', currentReceipt.id);
                                     const logEntry = {
                                       type: 'system',
                                       text: 'COMPROBANTE FIRMADO DIGITALMENTE POR EL CLIENTE',
                                       time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                                       date: new Date().toLocaleDateString('es-ES')
                                     };
                                     const updatedInteractions = [logEntry, ...(currentReceipt.interactions || [])];
                                     await updateDoc(budgetRef, { 
                                       interactions: updatedInteractions 
                                     });
                                     
                                     const updatedReceipt = { ...currentReceipt, interactions: updatedInteractions };
                                     
                                     // Also update current state so ticket of security is confirmed and logs updated
                                     setArchivedBudgets(prev => prev.map(b => b.id === currentReceipt.id ? updatedReceipt : b));
                                     setSelectedReceipt(updatedReceipt);
                                     setLastSubmittedBudget(updatedReceipt);
                                     
                                     // Go to final success view with security ticket
                                     setView('presupuesto_exito');
                                   } catch (err) {
                                     console.error("Error al confirmar el presupuesto:", err);
                                     setView('presupuesto_exito');
                                   }
                                 }}
                                 className="w-full py-4 bg-[#FFCD00] text-black rounded-xl text-[11px] font-black uppercase italic tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl shadow-[#FFCD00]/20 font-sans"
                               >
                                 <CheckCircle2 size={16} />
                                 CONFIRMAR Y FINALIZAR ENVÍO
                               </button>
                             </div>
                           )}
                         </div>

                         {isAdmin && !currentReceipt.confirmed && (
                           <div className="mt-4 pt-4 border-t border-dashed border-white/10 w-full">
                             <button
                               onClick={() => confirmBudget(currentReceipt.id)}
                               className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl text-[11px] font-black uppercase italic tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl shadow-red-600/20 font-sans"
                             >
                               <CheckCircle2 size={16} />
                               CONFIRMAR RECEPCIÓN (ADMIN)
                             </button>
                           </div>
                         )}

                       </div>

                       {/* BOTÓN VOLVER AL PANEL (SI DESEAN VOLVER SIN COMPLETAR) */}
                       <div className="mt-8 pt-6 border-t border-dashed border-white/10 w-full flex justify-center">
                         <button 
                           onClick={() => {
                             setView('home');
                           }} 
                           className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white/60 hover:text-white active:scale-95 transition-all flex items-center gap-2"
                         >
                           <ArrowLeft size={14} />
                           <span className="text-[10px] font-black uppercase italic tracking-wider leading-none">VOLVER AL PANEL</span>
                         </button>
                       </div>

                     </div>
                  </div>
                );
              })()}

              {view === 'comprobante_detalle' && selectedReceipt && (() => {
                const currentReceipt = archivedBudgets.find(b => b.id === selectedReceipt.id) || selectedReceipt;
                return (
                  <div className="pb-10 animate-in zoom-in duration-500 w-full flex flex-col items-center relative">
                     <HeaderWithNav subtitle="COMPROBANTE DE SOLICITUD" logoVariant="default" align="left" />

                     {/* CARTEL FLOTANTE DE REGISTRO EXITOSO SI ES RECIÉN ENVIADO */}
                     {lastSubmittedBudget?.id === currentReceipt.id && (
                       <motion.div 
                         initial={{ opacity: 0, y: -10 }} 
                         animate={{ opacity: 1, y: 0 }} 
                         className="w-full max-w-sm mb-6 bg-gradient-to-r from-green-950/40 via-emerald-950/40 to-green-950/40 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3 shadow-xl shadow-green-950/10"
                       >
                         <div className="w-8 h-8 bg-green-500/10 border border-green-500/40 rounded-full flex items-center justify-center text-green-400 shrink-0">
                           <CheckCircle2 size={16} />
                         </div>
                         <div className="text-left leading-tight">
                           <p className="text-[10px] font-black text-green-400 uppercase tracking-wider">¡SOLICITUD ENVIADA CON ÉXITO!</p>
                           <p className="text-[8px] font-bold text-zinc-400 uppercase mt-0.5">Por favor, firma y sube tu cédula abajo para validar.</p>
                         </div>
                       </motion.div>
                     )}

             {/* BOTONES DE COMPARTIR Y DESCARGA DE COMPROBANTE DETALLADO (OPCIÓN A) */}
             <div className="flex flex-col gap-2 mb-6 w-full max-w-sm px-2 animate-in slide-in-from-top duration-500">
               <button 
                 onClick={() => {
                   const serviciosStr = (Array.isArray(currentReceipt.servicios) ? currentReceipt.servicios : []).join(', ');
                   const totalStr = currentReceipt.draftInvoice ? `\n💰 *Total Estimado:* $${currentReceipt.draftInvoice.totalUSD.toLocaleString()} USD` : '';
                   const text = `🚧 *CONSTRUACHA - PRESUPUESTO OFICIAL* 🚧\n\nEstimado(a) *${currentReceipt.cliente}*,\nAdjuntamos la información de su presupuesto de rubros:\n\n📋 *Detalles:* \n• *ID:* #${currentReceipt.id}\n• *Documento:* ${currentReceipt.idDocumento}\n• *Servicios:* ${serviciosStr}${totalStr}\n\n🔗 *Ver Expediente Digital:* \n${window.location.origin}?view=comprobante_detalle&receiptId=${currentReceipt.id}\n\n_¡Gracias por confiar en ConstruAcha! Calidad y seguridad garantizadas._`;
                   window.open(`https://wa.me/${currentReceipt.telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
                 }}
                 className="w-full py-4 bg-[#FFCD00] hover:bg-[#FFE066] text-black rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2.5 shadow-xl shadow-[#FFCD00]/5 font-sans"
               >
                 <MessageCircle size={14} className="text-black fill-black" />
                 COMPARTIR POR WHATSAPP
               </button>
               
               <div className="flex gap-2 w-full">
                 <button 
                   onClick={() => downloadDetailPDF(currentReceipt.id)}
                   className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-850 border border-white/10 hover:border-[#FFCD00]/30 text-white rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg font-sans"
                 >
                   <Download size={12} className="text-[#FFCD00]" />
                   DESCARGAR PDF
                 </button>
                 <button 
                   onClick={() => downloadDetailImage(currentReceipt.id)}
                   className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-850 border border-white/10 hover:border-[#FFCD00]/30 text-white rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg font-sans"
                 >
                   <ImageIcon size={12} className="text-[#FFCD00]" />
                   GUARDAR IMAGEN
                 </button>
               </div>
             </div>

            <div id="ticket-detalle-descargable" className="w-full bg-black text-white border border-white/10 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden flex flex-col items-center">
               {/* Marcas de agua y diseño de ticket */}
               <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 opacity-50" />
               <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mb-16 opacity-50" />
               
               <div className="flex flex-col items-start border-b-2 border-dashed border-white/10 pb-6 mb-6 w-full px-2">
                 <FullBrandLogo className="scale-110 mb-2" variant="default" alignLeft={true} />
                 <p className="text-[8px] font-black uppercase tracking-[0.3em] text-[#FFCD00]/40 py-2 pl-[44px]">ID TRANSACCIÓN: #{currentReceipt.id}</p>
               </div>

               <div className="space-y-6 w-full">
                 <section>
                   <p className="text-[7px] font-black text-red-600/60 uppercase mb-3 tracking-[0.3em]">DATOS DEL SOLICITANTE</p>
                   <div className="space-y-1.5">
                     <p className="text-base font-black uppercase italic leading-none text-white tracking-tighter">{currentReceipt.cliente}</p>
                     <p className="text-[10px] font-bold text-zinc-500 uppercase">ID: <span className="text-zinc-400">{currentReceipt.idDocumento}</span></p>
                     <p className="text-[10px] font-bold text-zinc-500 uppercase">TEL: <span className="text-zinc-400">{currentReceipt.telefono}</span></p>
                     <p className="text-[10px] font-bold text-zinc-500 uppercase truncate">EMAIL: <span className="text-zinc-400">{currentReceipt.email}</span></p>
                   </div>
                 </section>

                  {/* PROPUESTA DE PRESUPUESTO Y DISEÑO 3D ENVIADA POR ADMIN */}
                  {currentReceipt.draftInvoice && (
                    <section className="bg-zinc-950 border border-[#FFCD00]/20 p-6 rounded-[2.5rem] space-y-6 w-full text-left relative overflow-hidden shadow-2xl">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFCD00]/5 rounded-full -mr-16 -mt-16 opacity-30 blur-2xl pointer-events-none" />
                      
                      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                        <Sparkles size={16} className="text-[#FFCD00] animate-pulse" />
                        <div>
                          <p className="text-[7.5px] font-black text-[#FFCD00] uppercase tracking-[0.2em] leading-none">PRESUPUESTO ELITE CONSTRUACHA</p>
                          <p className="text-[6px] font-black text-white/30 uppercase mt-0.5">ESTIMACIÓN FORMAL EN DÓLARES AMERICANOS ($)</p>
                        </div>
                      </div>

                      {/* Items List */}
                      <div className="space-y-3">
                        {(currentReceipt.draftInvoice.items || []).map((item: any, idx: number) => (
                          <div key={item.id || idx} className="flex justify-between items-start bg-black/40 p-3 rounded-xl border border-white/5">
                            <div className="text-left max-w-[70%]">
                              <p className="text-[9px] font-black uppercase text-white leading-tight">{item.description}</p>
                              <p className="text-[7px] font-bold text-white/40 uppercase mt-0.5">CANTIDAD: {item.quantity} • UNITARIO: ${item.price}</p>
                            </div>
                            <span className="font-mono font-black text-xs text-[#FFCD00]">${(item.quantity * item.price).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>

                      {/* Calculations summary */}
                      <div className="bg-black/80 p-5 rounded-2xl border border-white/5 space-y-2.5 text-right font-mono text-xs">
                        <div className="flex justify-between items-center text-white/40 text-[8px] font-black uppercase">
                          <span>SUBTOTAL BRUTO</span>
                          <span>${((currentReceipt.draftInvoice.totalUSD || 0) / (1 + (currentReceipt.draftInvoice.ivaPercentage || 16) / 100)).toLocaleString(undefined, {maximumFractionDigits:2})}</span>
                        </div>
                        <div className="flex justify-between items-center text-white/40 text-[8px] font-black uppercase">
                          <span>IMPUESTO DE LEY (IVA {currentReceipt.draftInvoice.ivaPercentage || 16}%)</span>
                          <span>${((currentReceipt.draftInvoice.totalUSD || 0) - ((currentReceipt.draftInvoice.totalUSD || 0) / (1 + (currentReceipt.draftInvoice.ivaPercentage || 16) / 100))).toLocaleString(undefined, {maximumFractionDigits:2})}</span>
                        </div>
                        <div className="h-px bg-white/10 my-1" />
                        <div className="flex justify-between items-center text-sm font-black text-[#FFCD00]">
                          <span className="text-[9px] uppercase tracking-wider italic">TOTAL A PAGAR ($)</span>
                          <span>${(currentReceipt.draftInvoice.totalUSD || 0).toLocaleString()}</span>
                        </div>
                      </div>

                      {/* PDF download if attached */}
                      {currentReceipt.draftInvoice.attachedPdfName && (
                        <div className="bg-white/5 p-4 rounded-xl border border-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText size={16} className="text-[#FFCD00]" />
                            <div className="text-left">
                              <p className="text-[8px] font-black uppercase text-white truncate max-w-[150px]">{currentReceipt.draftInvoice.attachedPdfName}</p>
                              <p className="text-[5.5px] font-mono text-white/40 uppercase">DOCUMENTO ANEXADO POR ADMIN ({currentReceipt.draftInvoice.attachedPdfSize || 'S/N'})</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => window.open('#', '_blank')}
                            className="px-3 py-1.5 bg-[#FFCD00] text-black text-[7px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1 active:scale-95 transition-all"
                          >
                            <Download size={10} /> DESCARGAR
                          </button>
                        </div>
                      )}

                      {/* Legal Conditions */}
                      {currentReceipt.draftInvoice.additionalTerms && (
                        <div className="bg-black/60 p-4 rounded-2xl border border-white/5">
                          <p className="text-[6.5px] font-black text-[#FFCD00] uppercase tracking-widest mb-1.5">CONDICIONES GENERALES Y PLAZOS</p>
                          <p className="text-[8px] font-bold text-white/60 uppercase leading-relaxed whitespace-pre-line">{currentReceipt.draftInvoice.additionalTerms}</p>
                        </div>
                      )}

                      {/* Admin signature verification seal */}
                      {currentReceipt.draftInvoice.adminSignature ? (
                        <div className="border border-green-500/20 bg-green-500/5 rounded-2xl p-4 flex items-center gap-3">
                          <ShieldCheck size={18} className="text-green-500 shrink-0" />
                          <div className="text-left">
                            <p className="text-[8.5px] font-black text-green-400 uppercase tracking-wider">PRESUPUESTO AVALADO POR EL ADMINISTRADOR</p>
                            <p className="text-[6.5px] font-bold text-white/40 uppercase mt-0.5">CONTIENE FIRMA DIGITAL ELECTRÓNICA REGISTRADA</p>
                          </div>
                        </div>
                      ) : (
                        <div className="border border-red-500/20 bg-red-500/5 rounded-2xl p-4 flex items-center gap-3 animate-pulse">
                          <AlertTriangle size={18} className="text-red-500 shrink-0" />
                          <div className="text-left">
                            <p className="text-[8.5px] font-black text-red-500 uppercase tracking-wider">PROPUESTA DE PRESUPUESTO EN BORRADOR</p>
                            <p className="text-[6.5px] font-bold text-white/40 uppercase mt-0.5">EL ADMINISTRADOR AÚN ESTÁ EDITANDO LOS RENDERS</p>
                          </div>
                        </div>
                      )}

                      {/* RENDERING CANVAS PREVIEW */}
                      {currentReceipt.draftCanvas?.elements?.length > 0 && (
                        <div className="space-y-2.5">
                          <p className="text-[7px] font-black text-white/40 uppercase tracking-widest">PLANO DE DISEÑO Y RENDER 3D ASOCIADO</p>
                          <div className="relative bg-black rounded-2xl border border-white/5 overflow-hidden p-2 flex flex-col items-center">
                            
                            <canvas 
                              id={`client-preview-canvas-${currentReceipt.id}`}
                              width={340}
                              height={220}
                              ref={(el) => {
                                if (el) {
                                  const ctx = el.getContext('2d');
                                  if (ctx) {
                                    ctx.clearRect(0, 0, el.width, el.height);
                                    
                                    // Draw background layout grid
                                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
                                    ctx.lineWidth = 1;
                                    for (let i = -el.width; i < el.width * 2; i += 20) {
                                      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + el.height * 1.732, el.height); ctx.stroke();
                                      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - el.height * 1.732, el.height); ctx.stroke();
                                    }

                                    // Render 3D isometric items scaled down
                                    const elements = currentReceipt.draftCanvas.elements || [];
                                    const sortedElements = [...elements].sort((a: any, b: any) => (a.y + a.x * 0.5) - (b.y + b.x * 0.5));
                                    
                                    const scaleX = el.width / 800;
                                    const scaleY = el.height / 500;

                                    sortedElements.forEach((item: any) => {
                                      const x = item.x * scaleX;
                                      const y = item.y * scaleY;
                                      const w = item.width * scaleX;
                                      const h = item.height * scaleY;
                                      const d = (item.depth || 30) * scaleY;

                                      ctx.save();
                                      ctx.translate(x, y);

                                      const colorBase = item.color || '#7E7E7E';
                                      ctx.fillStyle = colorBase;
                                      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                                      ctx.lineWidth = 0.5;

                                      ctx.beginPath();
                                      ctx.moveTo(-w/2, h/4 - d); ctx.lineTo(0, -d); ctx.lineTo(w/2, h/4 - d); ctx.lineTo(0, h/2 - d); ctx.closePath(); ctx.fill(); ctx.stroke();

                                      ctx.fillStyle = 'rgba(0,0,0,0.3)';
                                      ctx.beginPath();
                                      ctx.moveTo(-w/2, h/4); ctx.lineTo(0, h/2); ctx.lineTo(0, h/2 - d); ctx.lineTo(-w/2, h/4 - d); ctx.closePath(); ctx.fill(); ctx.stroke();

                                      ctx.fillStyle = 'rgba(0,0,0,0.15)';
                                      ctx.beginPath();
                                      ctx.moveTo(0, h/2); ctx.lineTo(w/2, h/4); ctx.lineTo(w/2, h/4 - d); ctx.lineTo(0, h/2 - d); ctx.closePath(); ctx.fill(); ctx.stroke();

                                      ctx.restore();
                                    });

                                    ctx.fillStyle = 'rgba(255, 205, 0, 0.7)';
                                    ctx.font = 'bold 7px monospace';
                                    ctx.textAlign = 'center';
                                    ctx.fillText("PREVISUALIZACIÓN DE TENDER 3D AUTOCARGADA", el.width / 2, el.height - 10);
                                  }
                                }
                              }}
                              className="w-full max-w-sm rounded-xl block bg-[#030303]"
                            />
                          </div>
                        </div>
                      )}

                    </section>
                  )}

                  {/* SECCIÓN DE ACCIONES DE VALIDACIÓN DIGITAL (FIRMA Y CÉDULA DE IDENTIDAD) */}
                  <div className="border-t border-b border-dashed border-white/10 py-6 space-y-6 w-full text-left">
                    <p className="text-[7.5px] font-black text-[#FFCD00] uppercase tracking-[0.3em] leading-none mb-2">VALIDACIÓN DE IDENTIDAD Y CONSENTIMIENTO</p>

                    {/* FIRMA DIGITAL */}
                    <div className="bg-zinc-950/80 p-5 rounded-2xl border border-white/5 relative overflow-hidden shadow-inner">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFCD00]/5 rounded-full -mr-12 -mt-12 opacity-50 blur-xl pointer-events-none" />
                      <p className="text-[7px] font-black text-[#FFCD00] uppercase mb-3 tracking-[0.3em]">FIRMA DIGITAL AUTORIZADA</p>
                      
                      {currentReceipt.signature ? (
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-full bg-white/5 rounded-2xl border border-white/10 p-4 flex items-center justify-center relative min-h-[100px]">
                            <img 
                              src={currentReceipt.signature} 
                              className="max-h-20 w-auto object-contain brightness-110 contrast-125" 
                              alt="Firma del Cliente" 
                            />
                            <div className="absolute bottom-1 right-2 flex items-center gap-1 opacity-40">
                              <ShieldCheck size={10} className="text-green-500" />
                              <span className="text-[6px] font-black uppercase tracking-widest text-green-500">VERIFICADO</span>
                            </div>
                          </div>
                          <div className="text-center leading-none">
                            <p className="text-[9px] font-black uppercase text-green-400 italic">COMPROBANTE FIRMADO</p>
                            <p className="text-[6.5px] font-bold text-zinc-500 uppercase tracking-widest mt-1">LA FIRMA VINCULA JURÍDICAMENTE LA SOLICITUD</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-zinc-500 text-[8px] font-black uppercase tracking-widest">
                          SIN FIRMA REGISTRADA
                        </div>
                      )}
                    </div>

                    {/* VERIFICACIÓN DE IDENTIDAD */}
                    <div className="bg-zinc-950/80 p-5 rounded-2xl border border-[#FFCD00]/20 relative overflow-hidden shadow-inner">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFCD00]/10 rounded-full -mr-12 -mt-12 opacity-50 blur-xl pointer-events-none" />
                      <div className="flex items-center gap-2.5 mb-3">
                        <ShieldCheck size={16} className="text-[#FFCD00] animate-pulse" />
                        <p className="text-[8px] font-black text-[#FFCD00] uppercase tracking-[0.2em] leading-none">CÉDULA DE IDENTIDAD / PASAPORTE</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 mb-2">
                        {/* Anverso (Frente) */}
                        <div className="flex flex-col items-center text-center">
                          <span className="text-[6.5px] font-black text-white/40 uppercase mb-1.5">FRENTE (ANVERSO)</span>
                          {currentReceipt.id_front ? (
                            <div className="relative aspect-[1.6/1] w-full bg-white/5 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center">
                              <img src={currentReceipt.id_front} className="w-full h-full object-cover" alt="ID Frente" />
                              <div className="absolute bottom-1 right-1 p-0.5 bg-green-600 rounded-full text-white shadow-md">
                                <CheckCircle2 size={8} />
                              </div>
                            </div>
                          ) : (
                            <div className="aspect-[1.6/1] w-full bg-black/40 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-zinc-500 text-[6px] font-black uppercase">
                              NO CARGADO
                            </div>
                          )}
                        </div>

                        {/* Reverso (Atrás) */}
                        <div className="flex flex-col items-center text-center">
                          <span className="text-[6.5px] font-black text-white/40 uppercase mb-1.5">ATRÁS (REVERSO)</span>
                          {currentReceipt.id_back ? (
                            <div className="relative aspect-[1.6/1] w-full bg-white/5 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center">
                              <img src={currentReceipt.id_back} className="w-full h-full object-cover" alt="ID Atrás" />
                              <div className="absolute bottom-1 right-1 p-0.5 bg-green-600 rounded-full text-white shadow-md">
                                <CheckCircle2 size={8} />
                              </div>
                            </div>
                          ) : (
                            <div className="aspect-[1.6/1] w-full bg-black/40 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-zinc-500 text-[6px] font-black uppercase">
                              NO CARGADO
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {currentReceipt.location && (
                   <section className="bg-zinc-900 p-5 rounded-2xl border border-white/10">
                     <p className="text-[7px] font-black text-white/40 uppercase mb-4 tracking-widest text-center">UBICACIÓN GPS REGISTRADA</p>
                     <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 bg-[#FFCD00] text-black rounded-[1.5rem] flex items-center justify-center shadow-[0_10px_20px_rgba(255,205,0,0.2)] mb-1">
                          <MapPin size={32} />
                        </div>
                        <div className="text-center">
                          <p className="text-[16px] font-black text-white tracking-[0.1em] italic leading-none">{(currentReceipt.location?.lat || 0).toFixed(6)}</p>
                          <p className="text-[16px] font-black text-white tracking-[0.1em] italic leading-none mt-1">{(currentReceipt.location?.lon || 0).toFixed(6)}</p>
                        </div>
                        <button onClick={() => window.open(`https://www.google.com/maps?q=${currentReceipt.location?.lat || 0},${currentReceipt.location?.lon || 0}`, '_blank')} className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[8px] font-black text-[#FFCD00] uppercase tracking-widest active:scale-95 transition-all">Ver en Google Maps Externo</button>
                     </div>
                   </section>
                 )}

                 <section className="bg-white/5 p-5 rounded-xl border border-white/5 shadow-inner">
                   <p className="text-[7px] font-black text-[#FFCD00]/80 uppercase mb-4 tracking-[0.3em]">SERVICIOS REQUERIDOS</p>
                   <div className="space-y-3">
                     {(Array.isArray(currentReceipt.servicios) ? currentReceipt.servicios : []).map((s: any, i: number) => (
                       <div key={i} className="flex items-start gap-3">
                         <div className="w-1.5 h-1.5 bg-red-600 rounded-full mt-1.5 shrink-0 shadow-[0_0_5px_rgba(220,38,38,0.5)]" />
                         <p className="text-[11px] font-black uppercase text-zinc-300 leading-tight italic tracking-tight">{s}</p>
                       </div>
                     ))}
                   </div>
                 </section>

                 <section>
                   <p className="text-[7px] font-black text-white/20 uppercase mb-3 tracking-[0.3em]">DESCRIPCIÓN DE LA OBRA</p>
                   <div className="bg-white/5 p-5 rounded-xl border border-white/5">
                     <p className="text-[10px] font-medium uppercase text-zinc-400 leading-relaxed italic">
                       {currentReceipt.descripcion}
                     </p>
                   </div>
                 </section>

                 {currentReceipt.previews && currentReceipt.previews.length > 0 && (
                   <section>
                     <p className="text-[7px] font-black text-white/40 uppercase mb-3 tracking-widest">EVIDENCIA ADJUNTA ({currentReceipt.fotos})</p>
                     <div className="flex flex-wrap gap-2">
                       {(currentReceipt.previews || []).map((p: any, i: number) => (
                         <button key={i} onClick={() => setShowFullEvidence(p)} className="w-14 h-14 rounded-lg border border-white/10 overflow-hidden bg-zinc-900 active:scale-95 transition-all">
                           {p.type === 'video' ? (
                             <div className="w-full h-full relative">
                               <video src={p.preview} className="w-full h-full object-cover opacity-60" preload="metadata" />
                               <div className="absolute inset-0 flex items-center justify-center">
                                 <Video size={14} className="text-[#FFCD00]" />
                               </div>
                             </div>
                           ) : (
                             <img src={p.preview} className="w-full h-full object-cover" alt="Evidencia" />
                           )}
                         </button>
                       ))}
                     </div>
                   </section>
                 )}

                  {/* CHAT DIRECTO EN TIEMPO REAL - CLIENTE */}
                  <div className="bg-zinc-900 p-6 rounded-[2.5rem] border border-white/5 space-y-4 my-6">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <MessageSquare size={16} className="text-[#FFCD00]" />
                        <p className="text-[7px] font-black text-[#FFCD00] uppercase tracking-[0.2em] leading-none">CHAT CON SOPORTE CONSTRUACHA</p>
                      </div>
                      {chatMessages.length > 0 && (
                        <button
                          onClick={() => {
                            setCustomConfirm({
                              isOpen: true,
                              title: "VACIAR HISTORIAL DEL CHAT",
                              message: "¿CONFIRMAS QUE DESEAS ELIMINAR TODO EL HISTORIAL DE ESTE CHAT? ESTA ACCIÓN ES TOTALMENTE IRREVERSIBLE.",
                              onConfirm: async () => {
                                await clearDirectChatHistory(currentReceipt.id);
                              }
                            });
                          }}
                          className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-500/30 text-[6.5px] font-black uppercase tracking-widest rounded-lg transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 size={8} />
                          VACIAR HISTORIAL
                        </button>
                      )}
                    </div>

                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 flex flex-col gap-2">
                      {(Array.isArray(chatMessages) ? chatMessages : []).map((msg) => {
                        const isAdminMsg = msg.sender === 'admin';
                        const canEditOrDelete = isAdmin || (!isAdmin && !isAdminMsg);
                        let timeStr = "";
                        try {
                          let d = new Date();
                          if (msg.timestamp) {
                            if (msg.timestamp.seconds) {
                              d = new Date(msg.timestamp.seconds * 1000);
                            } else if (typeof msg.timestamp.toDate === 'function') {
                              d = msg.timestamp.toDate();
                            } else {
                              d = new Date(msg.timestamp);
                            }
                          }
                          if (isNaN(d.getTime())) {
                            d = new Date();
                          }
                          timeStr = d.toLocaleDateString('es-ES') + " " + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                        } catch (err) {
                          const now = new Date();
                          timeStr = now.toLocaleDateString('es-ES') + " " + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                        }
                        return (
                          <div 
                            key={msg.id} 
                            onClick={() => {
                              if (canEditOrDelete) {
                                setSelectedMessageOptions(msg);
                              }
                            }}
                            className={cn(
                              "max-w-[85%] rounded-2xl p-3 text-[10px] font-bold uppercase tracking-wider leading-relaxed flex flex-col gap-1 shadow-md cursor-pointer select-none transition-all active:brightness-95",
                              isAdminMsg 
                                ? "bg-zinc-950 border border-[#FFCD00]/20 text-[#FFCD00] self-start" 
                                : "bg-[#FFCD00] text-black self-end"
                            )}
                            title={canEditOrDelete ? "Toca para editar o eliminar" : undefined}
                          >
                            <div className="flex items-center justify-between gap-4 pointer-events-none">
                              <p className="text-[6px] opacity-60 font-black">
                                {isAdminMsg ? "CONSTRUACHA (ADMIN)" : "MIPRESUPUESTO (TÚ)"}
                              </p>
                              {msg.isEdited && (
                                <span className="text-[5.5px] opacity-40 font-black uppercase italic tracking-widest">
                                  (EDITADO)
                                </span>
                              )}
                            </div>
                            
                            {editingMessageId === msg.id ? (
                              <div className="mt-1.5 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <textarea
                                  value={editingMessageText}
                                  onChange={(e) => setEditingMessageText(e.target.value)}
                                  className="w-full p-2 bg-black text-white text-[9px] font-bold border border-[#FFCD00]/40 rounded-lg focus:outline-none focus:border-[#FFCD00] resize-none uppercase"
                                  rows={2}
                                />
                                <div className="flex gap-1 justify-end">
                                  <button
                                    onClick={() => {
                                      setEditingMessageId(null);
                                      setEditingMessageText('');
                                    }}
                                    className="px-2 py-1 bg-zinc-800 text-white text-[6.5px] font-black uppercase rounded-md active:scale-95 transition-all"
                                  >
                                    CANCELAR
                                  </button>
                                  <button
                                    onClick={() => editDirectChatMessage(msg.id, editingMessageText)}
                                    className="px-2 py-1 bg-[#FFCD00] text-black text-[6.5px] font-black uppercase rounded-md active:scale-95 transition-all"
                                  >
                                    GUARDAR
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[10px] whitespace-pre-wrap break-words leading-snug pointer-events-none">{msg.text}</p>
                            )}

                            {/* Renderizado de Media Adjunta */}
                            {msg.mediaUrl && msg.mediaType === 'image' && (
                              <div className="mt-2 rounded-xl overflow-hidden border border-white/10 max-w-full cursor-pointer" onClick={() => setActiveMediaPreview({ url: msg.mediaUrl, type: 'image' })}>
                                <img src={msg.mediaUrl} className="max-h-36 w-auto object-cover rounded-lg" alt="Imagen" />
                              </div>
                            )}
                            {msg.mediaUrl && msg.mediaType === 'video' && (
                              <div className="mt-2 rounded-xl overflow-hidden border border-white/10 max-w-full cursor-pointer" onClick={() => setActiveMediaPreview({ url: msg.mediaUrl, type: 'video' })}>
                                <div className="relative">
                                  <video src={msg.mediaUrl} className="max-h-48 w-full object-contain bg-black rounded-lg pointer-events-none" />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/15 transition-colors">
                                    <div className="w-10 h-10 bg-[#FFCD00] text-black rounded-full flex items-center justify-center shadow-lg">
                                      <Video size={16} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            {msg.mediaUrl && msg.mediaType === 'file' && (
                              <a 
                                href={msg.mediaUrl} 
                                download={msg.mediaName || "archivo"} 
                                className={cn(
                                  "mt-2 p-2 rounded-xl border flex items-center gap-1.5 text-[8px] font-black transition-colors uppercase tracking-wider leading-relaxed",
                                  isAdminMsg 
                                    ? "bg-zinc-900 border-white/10 text-[#FFCD00] hover:bg-zinc-800" 
                                    : "bg-white/20 border-black/10 text-black hover:bg-white/30"
                                )}
                              >
                                <Paperclip size={10} className={isAdminMsg ? "text-[#FFCD00]" : "text-black"} />
                                <span className="truncate max-w-[120px]">{msg.mediaName || "VER ARCHIVO"}</span>
                              </a>
                            )}

                            {/* Marca de fecha y hora */}
                            <div className="text-[6.5px] opacity-50 text-right mt-1.5 font-black tracking-wider uppercase flex items-center justify-end gap-1.5 pointer-events-none">
                              <span>{timeStr}</span>
                              {isAdmin && isAdminMsg && (
                                <span className="flex items-center">
                                  {msg.read ? (
                                    <span className="text-sky-400 flex" title="Leído">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="w-2.5 h-2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7M10 17l4 4L22 9" />
                                      </svg>
                                    </span>
                                  ) : msg.received ? (
                                    <span className="text-zinc-400 flex" title="Entregado">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="w-2.5 h-2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7M10 17l4 4L22 9" />
                                      </svg>
                                    </span>
                                  ) : (
                                    <span className="text-zinc-600 flex" title="Enviado">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="w-2.5 h-2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {chatMessages.length === 0 && (
                        <p className="text-[7.5px] font-black text-white/10 uppercase italic text-center py-4 tracking-widest">SIN MENSAJES EN EL CHAT</p>
                      )}
                    </div>

                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!chatInputText.trim()) return;
                        sendChatMessage(currentReceipt.id, 'client', chatInputText);
                        setChatInputText('');
                      }} 
                      className="flex flex-col gap-2"
                    >
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={chatInputText}
                          onChange={(e) => setChatInputText(e.target.value)}
                          placeholder="ESCRIBE UN MENSAJE AL ADMIN..." 
                          className="flex-1 bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold uppercase italic text-white placeholder-zinc-500 focus:outline-none focus:border-[#FFCD00]/50 transition-all"
                        />
                        <button 
                          type="submit" 
                          className="p-3 bg-[#FFCD00] text-black rounded-xl active:scale-95 transition-all shadow-lg flex items-center justify-center shrink-0"
                        >
                          <Send size={14} />
                        </button>
                      </div>

                      {/* Botones de Cámara y Adjuntar para Cliente */}
                      <div className="flex flex-col gap-2 pt-1">
                        <div className="grid grid-cols-2 gap-2 w-full">
                          <label className="cursor-pointer p-2 bg-zinc-950 hover:bg-zinc-800 border border-white/5 hover:border-[#FFCD00]/20 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all w-full">
                            <input 
                              type="file" 
                              accept="image/*" 
                              capture="environment" 
                              className="hidden" 
                              onChange={(e) => handleChatMediaSelect(e, currentReceipt.id, 'client', 'image')}
                              disabled={isUploadingChatMedia}
                            />
                            <Camera size={12} className="text-[#FFCD00]" />
                            <span className="text-[8px] font-black uppercase text-zinc-400">CÁMARA</span>
                          </label>

                          <label className="cursor-pointer p-2 bg-zinc-950 hover:bg-zinc-800 border border-white/5 hover:border-[#FFCD00]/20 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all w-full">
                            <input 
                              type="file" 
                              className="hidden" 
                              onChange={(e) => handleChatMediaSelect(e, currentReceipt.id, 'client', 'file')}
                              disabled={isUploadingChatMedia}
                            />
                            <Paperclip size={12} className="text-[#FFCD00]" />
                            <span className="text-[8px] font-black uppercase text-zinc-400">ADJUNTAR</span>
                          </label>
                        </div>

                        {isUploadingChatMedia && (
                          <div className="flex items-center gap-1.5 justify-center py-1">
                            <div className="w-3.5 h-3.5 border-2 border-[#FFCD00] border-t-transparent rounded-full animate-spin" />
                            <span className="text-[8px] font-black uppercase text-[#FFCD00] animate-pulse">CARGANDO ARCHIVO...</span>
                          </div>
                        )}
                      </div>
                    </form>
                  </div>

                 <section>
                   <p className="text-[7px] font-black text-white/40 uppercase mb-2 tracking-widest">FECHA DE REGISTRO</p>
                   <div className="flex justify-between items-end">
                     <div>
                       <p className="text-[12px] font-black uppercase text-white">{currentReceipt.fecha}</p>
                       <p className="text-[10px] font-bold text-white/60 uppercase">{currentReceipt.hora}</p>
                     </div>
                     <div className="text-right">
                        <button 
                          onClick={() => setShowQRVerification(true)} 
                          className="flex flex-col items-end opacity-80 hover:opacity-100 transition-all active:scale-95"
                        >
                          <QrIcon size={40} className="text-[#FFCD00]" />
                          <p className="text-[5px] font-black uppercase mt-1 text-[#FFCD00]">VERIFICAR DOCUMENTO</p>
                        </button>
                     </div>
                   </div>
                 </section>

                 {(!currentReceipt.signature || !currentReceipt.id_front || !currentReceipt.id_back) && (
                   <button
                     onClick={() => {
                       setSelectedReceipt(currentReceipt);
                       setView('comprobante_validacion');
                     }}
                     className="w-full mt-6 py-4 bg-red-600/90 hover:bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-600/10 border border-red-500/20"
                   >
                     <PenTool size={14} />
                     <span>COMPLETAR VALIDACIÓN Y FIRMA</span>
                   </button>
                 )}

                 {isAdmin && !currentReceipt.confirmed && (
                   <button
                     onClick={() => confirmBudget(currentReceipt.id)}
                     className="w-full mt-4 py-5 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg shadow-red-600/20 border border-red-500/30 font-sans"
                   >
                     <CheckCircle2 size={16} />
                     <span>CONFIRMAR RECEPCIÓN (ADMIN)</span>
                   </button>
                 )}
               </div>

                <div className="mt-8 pt-6 border-t-2 border-dashed border-white/10 text-center">
                 <p className="text-[8px] font-black uppercase italic tracking-tighter leading-relaxed mb-4 text-white/60">
                   ESTE DOCUMENTO ES UN REGISTRO OFICIAL DE SU SOLICITUD TÉCNICA.<br/>
                   POR FAVOR, ESPERE A SER CONTACTADO POR NUESTROS ASESORES.
                 </p>
                 <div className="w-full h-10 bg-[#FFCD00] text-black flex items-center justify-center rounded-lg">
                    <p className="text-[10px] font-bold tracking-[0.4em]">CONSTRUACHA 2026</p>
                 </div>
               </div>
            </div>
            
            <p className="text-white/10 text-[7px] font-black uppercase tracking-[0.4em] mt-8 px-10 leading-relaxed text-center">
              DERECHOS RESERVADOS • SEGURIDAD Y CONTROL DE OBRAS <br/>
              ESTA COPIA ES INMUTABLE Y NO PUEDE SER MODIFICADA.
            </p>

            <div className="mt-8 mb-10">
              <button 
                onClick={() => {
                  setView('home');
                }} 
                className="px-8 py-3 bg-[#FFCD00] border border-white/10 rounded-2xl text-black shadow-2xl active:scale-95 transition-all group flex items-center gap-3"
              >
                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                <span className="text-[14px] font-black uppercase italic tracking-tighter leading-none">VOLVER AL PANEL</span>
              </button>
            </div>

            <AnimatePresence>
              {showQRVerification && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6">
                  <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-zinc-900 border border-[#FFCD00]/20 rounded-[2.5rem] p-8 w-full max-w-sm text-center relative shadow-3xl">
                    <div className="mb-6">
                      <FullBrandLogo className="scale-90" variant="qr" />
                    </div>
                    <div className="w-16 h-16 bg-[#FFCD00]/10 border-2 border-[#FFCD00] rounded-full flex items-center justify-center text-[#FFCD00] mx-auto mb-6">
                      <ShieldCheck size={32} />
                    </div>
                    <h3 className="text-2xl font-black italic uppercase text-[#FFCD00] mb-2 tracking-tighter">CERTIFICADO VÁLIDO</h3>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-2 mb-6">
                      <div className="flex justify-between items-center text-[8px] uppercase font-black text-white/40">
                        <span>Código:</span>
                        <span className="text-white">{currentReceipt.id}</span>
                      </div>
                      <div className="flex justify-between items-center text-[8px] uppercase font-black text-white/40">
                        <span>Fecha Emisión:</span>
                        <span className="text-white">{currentReceipt.fecha}</span>
                      </div>
                      <div className="flex justify-between items-center text-[8px] uppercase font-black text-white/40">
                        <span>Estado:</span>
                        <span className="text-green-500">AUTENTICADO</span>
                      </div>
                    </div>
                    <p className="text-[8px] font-bold text-white/40 uppercase mb-8 leading-relaxed">
                      ESTE DOCUMENTO HA SIDO FIRMADO DIGITALMENTE Y REPRESENTA UNA SOLICITUD LEGÍTIMA EN LOS SERVIDORES DE CONSTRUACHA.
                    </p>
                    <button 
                      onClick={() => setShowQRVerification(false)}
                      className="w-full py-5 bg-[#FFCD00] text-black rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-[#FFCD00]/20"
                    >
                      CERRAR VERIFICACIÓN
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        );
      })()}

        {/* VISTA: GALERÍA PÚBLICA (CLIENTE) */}
        {view === 'portfolio' && (
          <div className="pb-20 animate-in slide-in-from-right duration-500 w-full flex flex-col items-center">
            <HeaderWithNav subtitle="NUESTRA GALERÍA" logoVariant="default" />
            
            <div className="w-full flex-1 space-y-6 mt-4">
              {/* Call to Action */}
              <div className="bg-red-600/10 border border-red-600/20 p-6 rounded-[2rem] text-center mb-8 pulse-red">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600 leading-relaxed italic">
                  ¿QUIERES QUE TUS PROYECTOS <br/> ESTÉN AQUÍ? SOLICITA TU PRESUPUESTO
                </p>
                <button onClick={() => setView('presupuesto_rubros')} className="mt-4 px-8 py-3 bg-red-600 text-white rounded-full font-black uppercase text-[8px] tracking-widest active:scale-95 transition-all">
                  SOLICITAR AHORA
                </button>
              </div>

              {/* BLOQUEO FINAL: Botones de Acción Portfolio - NO MODIFICAR MÉTRICAS */}
              <div className="grid grid-cols-4 gap-2.5 mb-8 px-2">
                <label htmlFor="file-upload" className="flex flex-col items-center justify-center p-2.5 bg-zinc-900/50 backdrop-blur-md border border-white/10 rounded-2xl gap-1.5 active:scale-95 transition-all group cursor-pointer hover:border-[#FFCD00]/30 shadow-lg">
                   <div className="p-2 bg-white/5 rounded-lg group-hover:bg-[#FFCD00] group-hover:text-black transition-all shadow-inner">
                    <ImageIcon size={18} />
                   </div>
                   <span className="text-[9px] font-black uppercase text-white/80 tracking-widest group-hover:text-[#FFCD00] transition-colors">Subir</span>
                </label>
                <label htmlFor="camera-upload" className="flex flex-col items-center justify-center p-2.5 bg-zinc-900/50 backdrop-blur-md border border-white/10 rounded-2xl gap-1.5 active:scale-95 transition-all group cursor-pointer hover:border-[#FFCD00]/30 shadow-lg">
                   <div className="p-2 bg-white/5 rounded-lg group-hover:bg-[#FFCD00] group-hover:text-black transition-all shadow-inner">
                    <Camera size={18} />
                   </div>
                   <span className="text-[9px] font-black uppercase text-white/80 tracking-widest group-hover:text-[#FFCD00] transition-colors">Cámara</span>
                </label>
                <label htmlFor="video-upload" className="flex flex-col items-center justify-center p-2.5 bg-zinc-900/50 backdrop-blur-md border border-white/10 rounded-2xl gap-1.5 active:scale-95 transition-all group cursor-pointer hover:border-[#FFCD00]/30 shadow-lg">
                   <div className="p-2 bg-white/5 rounded-lg group-hover:bg-[#FFCD00] group-hover:text-black transition-all shadow-inner">
                    <Film size={18} />
                   </div>
                   <span className="text-[9px] font-black uppercase text-white/80 tracking-widest group-hover:text-[#FFCD00] transition-colors">Video</span>
                </label>
                <label htmlFor="record-upload" className="flex flex-col items-center justify-center p-2.5 bg-zinc-900/50 backdrop-blur-md border border-white/10 rounded-2xl gap-1.5 active:scale-95 transition-all group cursor-pointer hover:border-[#FFCD00]/30 shadow-lg">
                   <div className="p-2 bg-white/5 rounded-lg group-hover:bg-[#FFCD00] group-hover:text-black transition-all shadow-inner">
                    <Video size={18} />
                   </div>
                   <span className="text-[9px] font-black uppercase text-white/80 tracking-widest group-hover:text-[#FFCD00] transition-colors">Grabar</span>
                </label>
              </div>

              {/* PANEL ADMIN: SUBIR OBRA CON ANTES/DESPUÉS */}
              {isAdmin && (
                <div className="bg-zinc-950/80 border border-[#FFCD00]/20 rounded-[2.5rem] p-6 mb-8 mt-2 shadow-2xl backdrop-blur-md">
                  <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                    <p className="text-[10px] font-black uppercase text-[#FFCD00] tracking-widest flex items-center gap-2">
                      <FolderEdit size={14} /> GESTIONAR PORTAFOLIO EN LA NUBE
                    </p>
                    <button 
                      onClick={() => setShowAdminPortfolioForm(!showAdminPortfolioForm)}
                      className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-[#FFCD00]/20 hover:text-[#FFCD00] text-[8px] font-black uppercase tracking-wider transition-all"
                    >
                      {showAdminPortfolioForm ? "OCULTAR FORMULARIO" : "AÑADIR OBRA"}
                    </button>
                  </div>

                  {showAdminPortfolioForm && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                      <div>
                        <label className="text-[7.5px] font-black uppercase tracking-widest text-white/40 block mb-1.5 font-black">TÍTULO DEL PROYECTO OBRA</label>
                        <input 
                          type="text" 
                          value={newPortfolioTitle} 
                          onChange={(e) => setNewPortfolioTitle(e.target.value)} 
                          placeholder="EJ: RESIDENCIA MONOLÍTICA, CONSTRUCCIÓN DÚPLEX..." 
                          className="w-full bg-zinc-900 border border-white/20 rounded-xl py-4 px-4 text-[10px] font-bold uppercase focus:border-[#FFCD00] outline-none transition-all placeholder:text-white/20 text-white" 
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[7.5px] font-black uppercase tracking-widest text-[#FFCD00] block mb-1.5 font-black">REGISTRAR DESPUÉS (TERMINADA)</label>
                          <div className="relative">
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={(e) => handlePortfolioFileSelect(e, 'after')} 
                              className="hidden" 
                              id="admin-after-upload" 
                            />
                            <label 
                              htmlFor="admin-after-upload" 
                              className="flex items-center justify-center p-4 bg-zinc-900/50 hover:bg-[#FFCD00]/10 border border-dashed border-white/20 rounded-xl cursor-pointer hover:border-[#FFCD00]/50 transition-all text-center gap-2 min-h-[70px]"
                            >
                              {newPortfolioAfterUrl ? (
                                <img src={newPortfolioAfterUrl} className="w-16 h-10 object-cover rounded-lg border border-white/20" alt="Vista previa después" />
                              ) : (
                                <span className="text-[7.5px] font-black uppercase tracking-wider text-white/50 leading-relaxed font-black">SUBIR FOTO PRINCIPAL</span>
                              )}
                            </label>
                          </div>
                        </div>

                        <div>
                          <label className="text-[7.5px] font-black uppercase tracking-widest text-white/40 block mb-1.5 font-black">REGISTRAR ANTES (OPCIONAL)</label>
                          <div className="relative">
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={(e) => handlePortfolioFileSelect(e, 'before')} 
                              className="hidden" 
                              id="admin-before-upload" 
                            />
                            <label 
                              htmlFor="admin-before-upload" 
                              className="flex items-center justify-center p-4 bg-zinc-900/50 hover:bg-[#FFCD00]/10 border border-dashed border-white/20 rounded-xl cursor-pointer hover:border-[#FFCD00]/50 transition-all text-center gap-2 min-h-[70px]"
                            >
                              {newPortfolioBeforeUrl ? (
                                <img src={newPortfolioBeforeUrl} className="w-16 h-10 object-cover rounded-lg border border-white/20" alt="Vista previa antes" />
                              ) : (
                                <span className="text-[7.5px] font-black uppercase tracking-wider text-white/30 leading-relaxed font-black">AÑADIR COMPARATIVA</span>
                              )}
                            </label>
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={handleCreatePortfolioItem}
                        disabled={isSubmittingPortfolio}
                        className="w-full py-4 bg-[#FFCD00] text-black font-black uppercase italic tracking-widest rounded-xl text-[9px] hover:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-2xl disabled:opacity-50"
                      >
                        {isSubmittingPortfolio ? (
                          <span>GUARDANDO EN CLOUD...</span>
                        ) : (
                          <>
                            <UploadCloud size={14} />
                            <span>SUBIR OBRA A LA NUBE</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Portfolio Gallery */}
              <div className="grid grid-cols-1 gap-6 px-1">
                {portfolioItems.map((item, i) => (
                  <motion.div 
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    onClick={() => {
                      setSelectedPortfolioItem(item);
                      setCompareMode('after');
                    }}
                    className="group relative aspect-[16/10] w-full rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl bg-zinc-900 cursor-pointer active:scale-[0.98] transition-all"
                  >
                    {item.type === 'video' ? (
                      <video src={item.url} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-700" muted playsInline loop autoPlay />
                    ) : (
                      <img src={item.url} className="w-full h-full object-cover opacity-90 group-hover:scale-110 group-hover:opacity-100 transition-all duration-700" alt={item.title} />
                    )}
                    
                    {/* Botón Eliminar Obra - Solo Administrador */}
                    {isAdmin && (
                      <button 
                        onClick={(e) => handleDeletePortfolioItem(item.id, e)}
                        className="absolute top-4 right-4 z-40 p-2.5 bg-red-600 hover:bg-red-500 rounded-xl text-white hover:text-white shadow-2xl active:scale-95 transition-all border border-white/10"
                      >
                        <Trash size={12} />
                      </button>
                    )}

                    {/* Badge de Comparativa Antes y Después */}
                    {item.urlBefore && (
                      <div className="absolute top-4 left-4 z-30 px-3 py-1 bg-black/80 backdrop-blur-md border border-[#FFCD00]/20 rounded-full flex items-center gap-1.5 shadow-lg">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#FFCD00] animate-pulse" />
                        <span className="text-[7.5px] font-black uppercase text-[#FFCD00] tracking-wider leading-none font-black">ANTES / DESPUÉS</span>
                      </div>
                    )}

                    {/* Secure Overlay */}
                    <div className="absolute inset-0 bg-noise opacity-10 pointer-events-none z-10" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-8 flex flex-col justify-end">
                        <div className="flex items-center gap-4">
                           <p className="text-[12px] font-black uppercase text-white tracking-[0.1em] italic leading-tight mb-1">{item.title}</p>
                        </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <p className="text-white/20 text-[8px] font-black uppercase tracking-widest mt-12 px-10 leading-relaxed text-center italic">
              CADA OBRA ES UNA PIEZA DE INGENIERÍA DISEÑADA PARA PERDURAR. <br/>
              EXCELENCIA SIN COMPROMISOS.
            </p>

            <div className="flex justify-start w-full px-2 mt-8 mb-4">
              <button 
                onClick={() => {
                  resetBudgetFlow();
                  setView('home');
                }} 
                className="px-4 py-1.5 bg-[#FFCD00] border border-white/10 rounded-xl text-black shadow-lg active:scale-95 transition-all group flex items-center gap-2"
              >
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                <span className="text-[11px] font-black uppercase italic tracking-tighter leading-none">INICIO</span>
              </button>
            </div>
          </div>
        )}

        {/* Portfolio / Archive View (ADMIN VIEW - CAN BE HIDDEN FROM CLIENT LATER) */}
        {view === 'admin_archive' && (
          <div className="pb-10 animate-in slide-in-from-right duration-300 w-full max-w-md mx-auto px-2">
            <HeaderWithNav subtitle="BITÁCORA & ESTADÍSTICAS" logoVariant="default" />

            {/* SELECTOR DE SUBVISTAS DE ADMINISTRACIÓN - OPCIÓN C */}
            <div className="flex bg-zinc-950 p-1 rounded-[1.5rem] border border-white/5 w-full mb-6 mt-6">
              <button 
                onClick={() => setAdminSubView('solicitudes')}
                className={cn(
                  "flex-1 py-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all font-sans cursor-pointer",
                  adminSubView === 'solicitudes' 
                    ? "bg-[#FFCD00] text-black shadow-lg shadow-[#FFCD00]/10" 
                    : "text-white/40 hover:text-white"
                )}
              >
                SOLICITUDES ({archivedBudgets.length})
              </button>
              <button 
                onClick={() => setAdminSubView('estadisticas')}
                className={cn(
                  "flex-1 py-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all font-sans cursor-pointer",
                  adminSubView === 'estadisticas' 
                    ? "bg-[#FFCD00] text-black shadow-lg shadow-[#FFCD00]/10" 
                    : "text-white/40 hover:text-white"
                )}
              >
                ESTADÍSTICAS (KPI)
              </button>
            </div>

            {adminSubView === 'solicitudes' ? (
              <div className="space-y-4">
                {archivedBudgets.length === 0 ? (
                  <div className="py-20 flex flex-col items-center opacity-20">
                    <Archive size={48} className="mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">SIN REGISTROS ACTIVOS</p>
                  </div>
                ) : (
                  archivedBudgets.map(budget => {
                    const hasAdminChatNotif = adminChatNotifications.some(r => r.budgetId === budget.id);
                    const hasAdminReminder = reminders.some(r => !r.dismissed && !r.isChatNotification && r.budgetId === budget.id);
                    const hasAdminPendingApproval = !budget.confirmed;
                    const hasAdminClockNotif = hasAdminReminder || hasAdminPendingApproval;

                    return (
                      <div 
                        key={budget.id} 
                        onClick={() => { setSelectedBudget(budget); setView('budget_details'); }} 
                        className="w-full bg-[#0A0A0A] border border-white/5 p-5 rounded-[2rem] flex items-center justify-between group hover:border-[#FFCD00]/20 active:scale-95 transition-all cursor-pointer relative"
                      >
                        {/* BOTONES DE NOTIFICACIÓN DE ACCESO DIRECTO EN LA PARTE SUPERIOR DERECHA */}
                        <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">
                          {budget.isDraftActive && (
                            <button
                              title="Reanudar presupuesto (Borrador activo)"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBudget(budget);
                                setView('budget_details');
                                setShowDesignStudio(true);
                              }}
                              className="w-8 h-8 bg-[#FFCD00] hover:bg-[#FFE066] text-black rounded-full flex items-center justify-center shadow-lg shadow-[#FFCD00]/50 active:scale-90 transition-all animate-pulse border border-black/10"
                            >
                              <Save size={14} className="animate-pulse" />
                            </button>
                          )}
                          {hasAdminChatNotif && (
                            <button
                              title="Chat nuevo del cliente"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBudget(budget);
                                setView('budget_details');
                              }}
                              className="w-8 h-8 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-600/50 active:scale-90 transition-all animate-bounce"
                            >
                              <Bell size={14} className="animate-pulse" />
                            </button>
                          )}
                          {hasAdminClockNotif && (
                            <button
                              title={hasAdminReminder ? "Recordatorio programado" : "Pendiente de aprobación"}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBudget(budget);
                                setView('budget_details');
                              }}
                              className="w-8 h-8 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-600/50 active:scale-90 transition-all animate-pulse"
                            >
                              <Clock size={14} />
                            </button>
                          )}
                        </div>

                        <div className="text-left relative z-10 pr-16 w-full">
                          <div className="flex items-center gap-2 mb-1">
                            <div className={cn("w-2 h-2 rounded-full", budget.confirmed ? "bg-[#FFCD00]" : "bg-red-600 animate-pulse")} />
                            <span className="text-[10px] font-black text-white/80 uppercase">{budget.cliente}</span>
                          </div>
                          <div className="flex flex-col ml-4 gap-1">
                            <span className="text-[7px] font-black text-white/30 uppercase tracking-widest">{budget.id} • {budget.fecha}</span>
                            {budget.interactions && budget.interactions.length > 0 && budget.interactions.find(i => i.type === 'note') && (
                              <p className="text-[7px] font-medium text-[#FFCD00] uppercase italic truncate max-w-[150px]">
                                NOTA: {budget.interactions.find(i => i.type === 'note')?.text}
                              </p>
                            )}
                            <span className="text-[7px] font-medium text-white/40 uppercase">{budget.telefono}</span>
                            
                            {/* BADGES DE ESTADO - VISTA ADMINISTRADOR */}
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {budget.isDraftActive && (
                                <span className="px-2 py-0.5 bg-[#FFCD00]/20 border border-[#FFCD00]/40 text-[#FFCD00] text-[7px] font-black uppercase rounded-md flex items-center gap-1 animate-pulse">
                                  <Save size={8} /> BORRADOR ACTIVO
                                </span>
                              )}

                              {hasAdminChatNotif && (
                                <span className="px-2 py-0.5 bg-red-600 border border-red-500/30 text-white text-[7px] font-black uppercase rounded-md flex items-center gap-1 animate-bounce shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                                  <MessageSquare size={8} /> CHAT NUEVO (CLIENTE)
                                </span>
                              )}

                              {budget.confirmed ? (
                                <span className="px-2 py-0.5 bg-[#FFCD00]/10 border border-[#FFCD00]/20 text-[#FFCD00] text-[7px] font-black uppercase rounded-md flex items-center gap-1">
                                  <Check size={8} /> APROBADO
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-red-600/10 border border-red-500/20 text-red-500 text-[7px] font-black uppercase rounded-md flex items-center gap-1 animate-pulse">
                                  <AlertTriangle size={8} /> POR APROBAR
                                </span>
                              )}

                              {budget.signature ? (
                                <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 text-green-400 text-[7px] font-black uppercase rounded-md flex items-center gap-1">
                                  <Check size={8} /> FIRMADO
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-zinc-800 border border-white/5 text-zinc-400 text-[7px] font-black uppercase rounded-md flex items-center gap-1">
                                  <Clock size={8} /> SIN FIRMA
                                </span>
                              )}

                              {(budget.id_front && budget.id_back) ? (
                                <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 text-green-400 text-[7px] font-black uppercase rounded-md flex items-center gap-1">
                                  <Check size={8} /> CÉDULA OK
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-zinc-800 border border-white/5 text-zinc-400 text-[7px] font-black uppercase rounded-md flex items-center gap-1">
                                  <Clock size={8} /> SIN CÉDULA
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="p-2 rounded-full bg-white/5 text-white/20 group-hover:text-[#FFCD00] group-hover:bg-[#FFCD00]/10 transition-colors shrink-0">
                          <ChevronRight size={16} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              /* VISTA DE ESTADÍSTICAS COMPLETA Y PROFESIONAL - OPCIÓN C */
              <div className="space-y-6 animate-in fade-in duration-500">
                
                {/* GRID DE KPIs */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#0A0A0A] p-5 rounded-[2rem] border border-white/5 text-left relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-[#FFCD00]/5 rounded-full -mr-8 -mt-8 opacity-40" />
                    <p className="text-[7.5px] font-black text-zinc-500 uppercase tracking-widest leading-none">TOTAL SOLICITADO</p>
                    <p className="text-3xl font-black text-[#FFCD00] italic mt-2.5 leading-none">{stats.totalVolume}</p>
                    <p className="text-[6.5px] font-bold text-zinc-400 uppercase mt-2 tracking-wide leading-none">EXPEDIENTES CREADOS</p>
                  </div>

                  <div className="bg-[#0A0A0A] p-5 rounded-[2rem] border border-white/5 text-left relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-[#FFCD00]/5 rounded-full -mr-8 -mt-8 opacity-40" />
                    <p className="text-[7.5px] font-black text-zinc-500 uppercase tracking-widest leading-none">PRESUPUESTADO</p>
                    <p className="text-2xl font-black text-white italic mt-3 leading-none">${stats.totalPresupuestadoUSD.toLocaleString()}</p>
                    <p className="text-[6.5px] font-bold text-zinc-400 uppercase mt-2 tracking-wide leading-none">VOLUMEN BRUTO EN USD</p>
                  </div>
                </div>

                {/* TASAS DE CONVERSIÓN (MEDIDORES RADIALES / SVG RINGS) */}
                <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-[2.5rem] shadow-2xl text-left">
                  <p className="text-[7.5px] font-black text-[#FFCD00] uppercase tracking-[0.2em] mb-6">MÉTRICAS DE CIERRE Y CONVERSIÓN</p>
                  
                  <div className="flex justify-around items-center gap-4">
                    {/* MEDIDOR 1: TASA DE APROBACIÓN */}
                    <div className="flex flex-col items-center text-center space-y-2.5">
                      <div className="relative w-20 h-20 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="40" cy="40" r="32" stroke="#1f1f1f" strokeWidth="6" fill="transparent" />
                          <circle cx="40" cy="40" r="32" stroke="#FFCD00" strokeWidth="6" fill="transparent" 
                            strokeDasharray={`${2 * Math.PI * 32}`}
                            strokeDashoffset={`${2 * Math.PI * 32 * (1 - stats.approvalRate / 100)}`}
                            strokeLinecap="round"
                            className="transition-all duration-1000"
                          />
                        </svg>
                        <span className="absolute text-xs font-black italic text-white">{stats.approvalRate}%</span>
                      </div>
                      <p className="text-[8px] font-black text-zinc-400 uppercase tracking-wider">APROBADAS POR CLIENTE</p>
                    </div>

                    {/* MEDIDOR 2: TASA DE FIRMA */}
                    <div className="flex flex-col items-center text-center space-y-2.5">
                      <div className="relative w-20 h-20 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="40" cy="40" r="32" stroke="#1f1f1f" strokeWidth="6" fill="transparent" />
                          <circle cx="40" cy="40" r="32" stroke="#FFCD00" strokeWidth="6" fill="transparent" 
                            strokeDasharray={`${2 * Math.PI * 32}`}
                            strokeDashoffset={`${2 * Math.PI * 32 * (1 - stats.signatureRate / 100)}`}
                            strokeLinecap="round"
                            className="transition-all duration-1000"
                          />
                        </svg>
                        <span className="absolute text-xs font-black italic text-white">{stats.signatureRate}%</span>
                      </div>
                      <p className="text-[8px] font-black text-zinc-400 uppercase tracking-wider">FIRMADO CON RESPALDO</p>
                    </div>
                  </div>
                </div>

                {/* HISTOGRAMA / RANKING DE RUBROS SOLICITADOS */}
                <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-[2.5rem] shadow-2xl text-left">
                  <p className="text-[7.5px] font-black text-[#FFCD00] uppercase tracking-[0.2em] mb-5">RUBROS Y SERVICIOS MÁS SOLICITADOS</p>
                  
                  <div className="space-y-4">
                    {stats.rubroStats.map((r, index) => (
                      <div key={r.title} className="space-y-2 bg-black/40 p-4 rounded-2xl border border-white/5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="text-[#FFCD00] scale-90">{r.icon}</div>
                            <span className="text-[9px] font-black uppercase text-white tracking-wide leading-none">{r.title}</span>
                          </div>
                          <div className="text-right flex items-baseline gap-0.5 leading-none">
                            <span className="text-xs font-black text-[#FFCD00]">{r.count}</span>
                            <span className="text-[7px] font-bold text-zinc-500 uppercase pl-0.5">REQ.</span>
                          </div>
                        </div>
                        <div className="relative w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                          <div 
                            className="absolute top-0 left-0 h-full bg-[#FFCD00] rounded-full transition-all duration-1000" 
                            style={{ width: `${Math.max(1.5, r.percentage)}%` }} 
                          />
                        </div>
                        <div className="flex justify-between items-center text-[7px] font-bold text-zinc-500">
                          <span>POSICIÓN #{index + 1}</span>
                          <span>{r.percentage}% DEL HISTORIAL GENERAL</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

            <div className="mt-12 mb-6 flex justify-center">
              <button 
                onClick={() => {
                  resetBudgetFlow();
                  setView('home');
                }} 
                className="px-8 py-3 bg-[#FFCD00] border border-white/10 rounded-2xl text-black shadow-2xl active:scale-95 transition-all group flex items-center gap-3 cursor-pointer"
              >
                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                <span className="text-[14px] font-black uppercase italic tracking-tighter leading-none">VOLVER AL PANEL</span>
              </button>
            </div>
          </div>
        )}

        {view === 'admin_controls' && (
          <div className="pb-10 animate-in slide-in-from-right duration-300 w-full text-center flex flex-col items-center">
            <div className="w-full max-w-sm flex flex-col items-center">
              <HeaderWithNav subtitle="CONTROL DE ACCESOS" logoVariant="default" />
              
              <div className="mt-6 mb-8 p-6 bg-zinc-900/80 border-2 border-[#FFCD00]/20 rounded-[2rem] shadow-xl w-full">
                <div className="flex items-center gap-3 mb-5 border-b border-white/5 pb-3">
                  <ShieldCheck size={20} className="text-[#FFCD00] animate-pulse" />
                  <div className="text-left">
                    <h3 className="text-[11px] font-black uppercase text-[#FFCD00] tracking-[0.15em] italic leading-tight">CONTROL DE ACCESOS CLIENTE</h3>
                    <p className="text-[7.5px] font-bold text-white/40 uppercase tracking-widest mt-0.5 leading-snug">Activa o desactiva las funciones visibles del cliente en la App en tiempo real.</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {[
                    {
                      key: 'allowBudgetRequest',
                      title: 'SOLICITAR PRESUPUESTO',
                      desc: 'Permite al cliente ver y usar el formulario para solicitar cotizaciones.',
                      icon: <FileText size={18} className="text-[#FFCD00]" />
                    },
                    {
                      key: 'allowServicesList',
                      title: 'CATEGORÍAS DE SERVICIOS',
                      desc: 'Muestra la lista interactiva de especialidades de ConstruAcha.',
                      icon: <LayoutGrid size={18} className="text-[#FFCD00]" />
                    },
                    {
                      key: 'allowPortfolio',
                      title: 'GALERÍA DE PROYECTOS',
                      desc: 'Visualización del portafolio fotográfico de obras ejecutadas.',
                      icon: <Briefcase size={18} className="text-[#FFCD00]" />
                    },
                    {
                      key: 'allowAIChat',
                      title: 'CHAT INTELIGENTE IA',
                      desc: 'Asistente IA interactivo que responde preguntas de ingeniería.',
                      icon: <Bot size={18} className="text-[#FFCD00]" />
                    },
                    {
                      key: 'allowMyOrders',
                      title: 'MIS ORDENES / COMPROBANTES',
                      desc: 'Historial de órdenes y comprobantes del cliente en la app.',
                      icon: <Archive size={18} className="text-[#FFCD00]" />
                    },
                    {
                      key: 'allowComments',
                      title: 'BITÁCORA DE CLIENTES',
                      desc: 'Muestra u oculta la sección de opiniones de los clientes.',
                      icon: <MessageSquare size={18} className="text-[#FFCD00]" />
                    },
                    {
                      key: 'allowSupportChat',
                      title: 'CHAT DE SOPORTE DIRECTO',
                      desc: 'Muestra u oculta la burbuja de chat de soporte directo para clientes.',
                      icon: <MessageSquare size={18} className="text-[#FFCD00]" />
                    },
                    {
                      key: 'allowNotifications',
                      title: 'CAMPANA DE NOTIFICACIONES',
                      desc: 'Permite silenciar u ocultar las campanas flotantes de avisos de presupuestos.',
                      icon: <Bell size={18} className="text-[#FFCD00]" />
                    }
                  ].map((setting) => {
                    const isActive = (appSettings as any)[setting.key] !== false;
                    return (
                      <div key={setting.key} className="flex items-center justify-between p-4 bg-black/45 hover:bg-black/60 border border-white/5 hover:border-white/10 rounded-2xl transition-all">
                        <div className="flex items-start gap-3 text-left flex-1 mr-4">
                          <div className="p-2 bg-white/5 rounded-xl border border-white/10 shadow-sm shrink-0">
                            {setting.icon}
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-white uppercase italic tracking-tighter leading-snug">{setting.title}</p>
                            <p className="text-[7.5px] font-medium text-white/50 uppercase tracking-widest mt-0.5 leading-relaxed">{setting.desc}</p>
                          </div>
                        </div>
                        
                        {/* Elegante Interruptor (Switch) de Control */}
                        <button 
                          onClick={() => updateAppSetting(setting.key, !isActive)}
                          className={cn(
                            "w-12 h-6 rounded-full p-1 transition-all relative flex items-center shrink-0 border cursor-pointer",
                            isActive 
                              ? "bg-[#FFCD00]/25 border-[#FFCD00]/60" 
                              : "bg-zinc-800 border-white/10"
                          )}
                        >
                          <motion.div 
                            layout
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            className={cn(
                              "w-4 h-4 rounded-full shadow-md",
                              isActive ? "bg-[#FFCD00] ml-6" : "bg-zinc-500 ml-0"
                            )}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* MANTENIMIENTO DE BASE DE DATOS (EXCLUSIVO DEL ADMINISTRADOR) */}
              {isAdmin && (
                <div className="mt-6 p-6 bg-zinc-900/80 border-2 border-red-900/30 rounded-[2rem] shadow-xl w-full text-left">
                  <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-3">
                    <Trash2 size={20} className="text-red-500 animate-pulse" />
                    <div>
                      <h3 className="text-[11px] font-black uppercase text-red-500 tracking-[0.15em] italic leading-tight">MANTENIMIENTO DE BASE DE DATOS</h3>
                      <p className="text-[7.5px] font-bold text-white/40 uppercase tracking-widest mt-0.5 leading-snug">Herramientas de depuración del chat y resolución de notificaciones fantasma.</p>
                    </div>
                  </div>
                  
                  <p className="text-[8px] font-medium text-white/65 uppercase tracking-wider mb-4 leading-relaxed">
                    Si observas una notificación en rojo y no tienes mensajes nuevos, pulsa el botón inferior para restablecer y purgar todos los registros de chat y notificaciones fantasmas de manera segura.
                  </p>
                  
                  <button
                    onClick={() => {
                      setCustomConfirm({
                        isOpen: true,
                        title: "PURGAR CHATS Y NOTIFICACIONES",
                        message: "¿CONFIRMAS QUE DESEAS PURGAR TODOS LOS HISTORIALES DE CHAT Y NOTIFICACIONES DE SOPORTE? ESTA ACCIÓN ES TOTALMENTE IRREVERSIBLE Y ELIMINARÁ TODOS LOS DIÁLOGOS DE LA BITÁCORA.",
                        onConfirm: async () => {
                          try {
                            await clearAllChatsAndNotifications();
                            setCustomConfirm({
                              isOpen: true,
                              title: "PURGA EXITOSA",
                              message: "¡PURGA COMPLETADA! TODAS LAS BITÁCORAS DE CHAT Y NOTIFICACIONES FANTASMA HAN SIDO ELIMINADAS POR COMPLETO DE MANERA SEGURA.",
                              onConfirm: () => {}
                            });
                          } catch (err) {
                            console.error("Error al purgar:", err);
                          }
                        }
                      });
                    }}
                    className="w-full py-3 bg-red-950/50 hover:bg-red-900/40 text-red-400 border border-red-500/30 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Trash2 size={12} />
                    PURGAR CHATS Y NOTIFICACIONES
                  </button>
                </div>
              )}

              {/* SECCIÓN DE CALIBRACIÓN DEL MOTOR DE RENDERIZADO IA */}
              <div className="mt-6 mb-8 p-6 bg-zinc-900/80 border-2 border-[#FFCD00]/20 rounded-[2rem] shadow-xl w-full">
                <div className="flex items-center gap-3 mb-5 border-b border-white/5 pb-3">
                  <Cpu size={20} className="text-[#FFCD00] animate-pulse" />
                  <div className="text-left">
                    <h3 className="text-[11px] font-black uppercase text-[#FFCD00] tracking-[0.15em] italic leading-tight">CALIBRACIÓN DEL MOTOR DE RENDERIZADO IA</h3>
                    <p className="text-[7.5px] font-bold text-white/40 uppercase tracking-widest mt-0.5 leading-snug">Configura los parámetros del generador visual de ideas y renders en tiempo real para administración.</p>
                  </div>
                </div>

                <div className="space-y-4 text-left">
                  {/* Selector de Modelo de Inteligencia */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black uppercase text-[#FFCD00] tracking-wider">MODELO IA PARA ADMINISTRACIÓN</label>
                    <select
                      value={appSettings.aiModel || 'flash'}
                      onChange={(e) => updateAppSetting('aiModel', e.target.value)}
                      className="w-full bg-black border border-white/10 hover:border-[#FFCD00]/30 rounded-xl px-3 py-2 text-[10px] font-bold uppercase text-white focus:outline-none focus:border-[#FFCD00]/50 transition-all cursor-pointer"
                    >
                      <option value="flash">GÉMINI FLASH (RÁPIDO Y PRECISO)</option>
                      <option value="pro">GÉMINI PRO (CÁLCULO Y ANÁLISIS AVANZADO)</option>
                    </select>
                    <span className="text-[7px] font-bold text-white/30 uppercase tracking-wider font-sans">El modelo Pro ofrece análisis arquitectónico de mayor calidad y razonamiento detallado.</span>
                  </div>

                  {/* Selector de Estilo de Diseño */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black uppercase text-[#FFCD00] tracking-wider">ESTILO DE RENDER / ARQUITECTURA</label>
                    <select
                      value={appSettings.renderStyle || 'Moderno'}
                      onChange={(e) => updateAppSetting('renderStyle', e.target.value)}
                      className="w-full bg-black border border-white/10 hover:border-[#FFCD00]/30 rounded-xl px-3 py-2 text-[10px] font-bold uppercase text-white focus:outline-none focus:border-[#FFCD00]/50 transition-all cursor-pointer"
                    >
                      <option value="Moderno">MODERNO (LÍNEAS LIMPIAS, VIDRIO Y ACERO)</option>
                      <option value="Industrial">INDUSTRIAL (CONCRETO EXPUESTO, DETALLES METÁLICOS)</option>
                      <option value="Minimalista">MINIMALISTA (SENCILLEZ MÁXIMA, TONOS NEUTROS)</option>
                      <option value="Rústico">RÚSTICO (MADERA, PIEDRA, ELEMENTOS ACOGEDORES)</option>
                      <option value="Futurista">BRUTALISTA / FUTURISTA (ÁNGULOS IMPONENTES Y GEOMÉTRICOS)</option>
                    </select>
                    <span className="text-[7px] font-bold text-white/30 uppercase tracking-wider font-sans">Ajusta el estilo visual que aplicará el generador al recrear frentes, casas o terrenos.</span>
                  </div>

                  {/* Textarea de Prompt Template */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black uppercase text-[#FFCD00] tracking-wider">PROMPT MAESTRO DE RENDERIZADO</label>
                    <textarea
                      value={appSettings.renderPrompt || ''}
                      onChange={(e) => updateAppSetting('renderPrompt', e.target.value)}
                      placeholder="Escribe el prompt base..."
                      className="w-full bg-black border border-white/10 hover:border-[#FFCD00]/30 rounded-xl px-3 py-2 text-[9px] font-mono text-zinc-300 focus:outline-none focus:border-[#FFCD00]/50 transition-all h-20 resize-none uppercase"
                    />
                    <span className="text-[7px] font-bold text-white/30 uppercase tracking-wider font-sans">Usa <code className="text-[#FFCD00] font-black font-mono">[prompt]</code> como marcador de posición donde se insertarán las indicaciones específicas escritas en el chat.</span>
                  </div>

                  <div className="flex items-center gap-2 justify-center pt-2 border-t border-white/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#FFCD00] animate-ping" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400">AJUSTES SINCRONIZADOS EN LA NUBE</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 mb-6 flex justify-center">
                <button 
                  onClick={() => {
                    setView('home');
                  }} 
                  className="px-8 py-3 bg-[#FFCD00] border border-[#FFCD00]/25 rounded-2xl text-black shadow-2xl active:scale-95 transition-all group flex items-center gap-3 font-bold"
                >
                  <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                  <span className="text-[14px] font-black uppercase italic tracking-tighter leading-none">VOLVER AL PANEL</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'budget_details' && (
          <div className="pb-10 animate-in slide-in-from-right duration-300 w-full text-center flex flex-col items-center">
            {(() => {
              try {
                if (!selectedBudget) {
                  setTimeout(() => setView('home'), 0);
                  return null;
                }
                const currentBudget = archivedBudgets.find(b => b.id === selectedBudget.id) || selectedBudget;
                if (!currentBudget) {
                  setTimeout(() => setView('home'), 0);
                  return null;
                }
                return (
                  <div className="w-full max-w-sm flex flex-col items-center">
                    <HeaderWithNav subtitle="EXPEDIENTE DIGITAL" logoVariant="default" />
                    
                    <div className="space-y-4 w-full">
                      <div className="bg-zinc-900 p-6 rounded-[2.5rem] border border-white/5 relative overflow-hidden text-left">
                <div className="absolute top-0 right-0 p-4 opacity-5"><Building2 size={80} /></div>
                <h3 className="text-xl font-black italic uppercase tracking-tighter text-white mb-1">{currentBudget.cliente}</h3>
                <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-6">{currentBudget.idDocumento} • {currentBudget.tipo}</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div>
                      <p className="text-[6px] font-black text-[#FFCD00] uppercase tracking-widest mb-1">SERVICIOS</p>
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(currentBudget.servicios) ? currentBudget.servicios : []).map((s: any) => <span key={s} className="px-2 py-0.5 bg-white/5 rounded-md text-[6px] font-black uppercase text-white/60">{s}</span>)}
                      </div>
                    </div>
                    <div>
                      <p className="text-[6px] font-black text-[#FFCD00] uppercase tracking-widest mb-1">SOLICITADO</p>
                      <p className="text-[8px] font-black text-white/80 uppercase">{currentBudget.fecha} • {currentBudget.hora}</p>
                    </div>
                  </div>
                  <div className="flex flex-col justify-between items-end text-right">
                    <div className={cn("px-4 py-2 rounded-xl text-[8px] font-black uppercase italic tracking-widest", currentBudget.confirmed ? "bg-[#FFCD00] text-black" : "bg-red-600 text-white")}>
                      {currentBudget.confirmed ? "CONFIRMADO" : "PENDIENTE"}
                    </div>
                    <div className="mt-2">
                       <p className="text-[6px] font-black text-[#FFCD00] uppercase tracking-widest mb-1">CONTACTO</p>
                       <p className="text-[8px] font-black text-white/60 uppercase">{currentBudget.telefono}</p>
                       <p className="text-[8px] font-black text-white/60 lowercase">{currentBudget.email}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* FIRMA Y DOCUMENTACIÓN DEL CLIENTE (VISTA ADMINISTRADOR) */}
              <div className="bg-zinc-900 p-6 rounded-[2.5rem] border border-white/5 space-y-4 text-left">
                <p className="text-[6px] font-black text-[#FFCD00] uppercase tracking-widest">VALIDACIÓN DE IDENTIDAD Y CONTRATO</p>
                
                {/* 1. Imagen de la Firma Digital */}
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                  <p className="text-[7px] font-black text-white/50 uppercase mb-2 tracking-widest">FIRMA DIGITAL REGISTRADA</p>
                  {currentBudget.signature ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-full bg-white/5 rounded-xl border border-white/10 p-4 flex items-center justify-center relative min-h-[90px]">
                        <img 
                          src={currentBudget.signature} 
                          className="max-h-16 w-auto object-contain brightness-110 contrast-125" 
                          alt="Firma del Cliente" 
                        />
                        <div className="absolute bottom-1 right-2 flex items-center gap-1 opacity-60">
                          <ShieldCheck size={10} className="text-green-500" />
                          <span className="text-[5px] font-black uppercase tracking-widest text-green-500">AUTÉNTICA</span>
                        </div>
                      </div>
                      <span className="text-[6.5px] font-bold text-zinc-500 uppercase tracking-widest text-center">FIRMADO EL {currentBudget.fecha} A LAS {currentBudget.hora}</span>
                    </div>
                  ) : (
                    <div className="py-4 text-center">
                      <p className="text-[8.5px] font-bold text-red-500 uppercase italic">PENDIENTE DE FIRMA POR EL CLIENTE</p>
                    </div>
                  )}
                </div>

                {/* 2. Documentos de Identidad (Cédula / Pasaporte) */}
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                  <p className="text-[7px] font-black text-white/50 uppercase mb-3 tracking-widest">DOCUMENTO DE IDENTIDAD (CÉDULA / PASAPORTE)</p>
                  
                  {currentBudget.id_front || currentBudget.id_back ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[6px] font-black text-white/30 uppercase mb-1.5 text-center">ANVERSO (FRENTE)</p>
                        {currentBudget.id_front ? (
                          <div 
                            onClick={() => setPreviewImage({ preview: currentBudget.id_front, type: 'image', id: 'id_f' })}
                            className="aspect-[1.6/1] bg-white/5 rounded-xl border border-white/10 overflow-hidden cursor-pointer relative group flex items-center justify-center"
                          >
                            <img src={currentBudget.id_front} className="w-full h-full object-cover group-hover:scale-105 transition-all" alt="ID Anverso" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                              <Eye size={14} />
                            </div>
                          </div>
                        ) : (
                          <div className="aspect-[1.6/1] bg-white/5 rounded-xl border border-dashed border-white/5 flex items-center justify-center">
                            <span className="text-[6.5px] font-black text-white/20 uppercase">SIN CARGAR</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-[6px] font-black text-white/30 uppercase mb-1.5 text-center">REVERSO (ATRÁS)</p>
                        {currentBudget.id_back ? (
                          <div 
                            onClick={() => setPreviewImage({ preview: currentBudget.id_back, type: 'image', id: 'id_b' })}
                            className="aspect-[1.6/1] bg-white/5 rounded-xl border border-white/10 overflow-hidden cursor-pointer relative group flex items-center justify-center"
                          >
                            <img src={currentBudget.id_back} className="w-full h-full object-cover group-hover:scale-105 transition-all" alt="ID Reverso" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                              <Eye size={14} />
                            </div>
                          </div>
                        ) : (
                          <div className="aspect-[1.6/1] bg-white/5 rounded-xl border border-dashed border-white/5 flex items-center justify-center">
                            <span className="text-[6.5px] font-black text-white/20 uppercase">SIN CARGAR</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-center">
                      <p className="text-[8px] font-bold text-zinc-500 uppercase italic">
                        {currentBudget.requestID 
                          ? "PENDIENTE DE CARGA POR EL CLIENTE (SOLICITADO)" 
                          : "NO SOLICITADO AÚN POR LA ADMINISTRACIÓN"
                        }
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-zinc-900 p-6 rounded-[2.5rem] border border-white/5">
                <p className="text-[6px] font-black text-[#FFCD00] uppercase tracking-widest mb-3">DESCRIPCIÓN TÉCNICA</p>
                <div className="bg-black/40 p-4 rounded-2xl text-[9px] font-bold uppercase text-white/70 leading-relaxed italic border border-white/5 mb-3">
                  {currentBudget.descripcion}
                </div>

                {currentBudget.location && (
                  <div className="bg-black/40 p-4 rounded-[2rem] border border-white/5 mb-3">
                    <div onClick={() => window.open(`https://www.google.com/maps?q=${currentBudget.location?.lat || 0},${currentBudget.location?.lon || 0}`, '_blank')} className="flex items-center gap-3 cursor-pointer hover:border-[#FFCD00]/20 transition-all mb-4">
                      <div className="w-10 h-10 bg-[#FFCD00]/20 rounded-xl flex items-center justify-center text-[#FFCD00]">
                        <MapPin size={20} />
                      </div>
                      <div className="flex-1">
                        <p className="text-[9px] font-black text-[#FFCD00] uppercase italic">PUNTO GPS REGISTRADO</p>
                        <p className="text-[6px] font-black text-white/20 uppercase">VER MAPA EXTERNO</p>
                      </div>
                      <ExternalLink size={14} className="text-white/10" />
                    </div>
                    <MapPreview lat={currentBudget.location?.lat || 0} lon={currentBudget.location?.lon || 0} />
                  </div>
                )}

                {currentBudget.previews && currentBudget.previews.length > 0 && (
                   <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
                     {currentBudget.previews.map((item: any, i: number) => {
                       const isOldData = typeof item === 'string';
                       const previewUrl = isOldData ? item : item.preview;
                       const type = isOldData ? 'image' : item.type;
                       
                       return type === 'video' ? (
                         <video key={i} src={previewUrl} onClick={() => setPreviewImage({ preview: previewUrl, type: 'video', id: i })} className="w-16 h-16 rounded-xl object-cover border border-white/10 active:scale-95 transition-all" muted playsInline preload="metadata" />
                       ) : (
                         <img key={i} src={previewUrl} onClick={() => setPreviewImage({ preview: previewUrl, type: 'image', id: i })} className="w-16 h-16 rounded-xl object-cover border border-white/10 active:scale-95 transition-all" />
                       );
                     })}
                   </div>
                )}
              </div>


              <div className="bg-zinc-900 p-6 rounded-[2.5rem] border border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[6px] font-black text-[#FFCD00] uppercase tracking-widest">REGISTRAR NOTA / RECORDATORIO</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowReminderForm(selectedBudget.id)} className="p-2 bg-[#FFCD00]/20 text-[#FFCD00] rounded-lg active:scale-90 transition-all border border-[#FFCD00]/30"><AlarmClock size={12}/></button>
                    <button onClick={() => addManualNote(selectedBudget.id)} className="p-2 bg-[#FFCD00] text-black rounded-lg active:scale-90 transition-all"><MessageSquare size={12}/></button>
                  </div>
                </div>
                
                <div className="mb-4">
                  <textarea value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} placeholder="ESCRIBIR NOTA PREQUISA O DETALLE DEL CLIENTE..." className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-[10px] font-bold uppercase min-h-[80px] focus:border-[#FFCD00] outline-none transition-all placeholder:text-white/10" />
                </div>

                <AnimatePresence>
                  {showReminderForm === selectedBudget.id && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-6 space-y-3 bg-black/40 p-4 rounded-2xl border border-white/5 overflow-hidden">
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" value={reminderConfig.date} onChange={(e) => setReminderConfig({...reminderConfig, date: e.target.value})} className="bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-[9px] font-bold text-white uppercase outline-none focus:border-[#FFCD00]" />
                        <input type="time" value={reminderConfig.time} onChange={(e) => setReminderConfig({...reminderConfig, time: e.target.value})} className="bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-[9px] font-bold text-white uppercase outline-none focus:border-[#FFCD00]" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setShowReminderForm(null)} className="flex-1 py-3 bg-white/5 rounded-xl text-[8px] font-black uppercase">CANCELAR</button>
                        <button onClick={() => addReminder(selectedBudget.id, followUpNote)} className="flex-1 py-3 bg-[#FFCD00] text-black rounded-xl text-[8px] font-black uppercase shadow-lg">AGENDAR CON NOTA</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-3">
                  {reminders.filter(r => r.budgetId === selectedBudget.id && !r.dismissed).map(rem => (
                    <div key={rem.id} className="flex flex-col bg-black/30 p-3 rounded-xl border border-[#FFCD00]/20">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <Clock size={12} className="text-[#FFCD00]" />
                          <span className="text-[8px] font-black uppercase text-white/60">{rem.date} @ {rem.time}</span>
                        </div>
                        <button onClick={() => dismissReminder(rem.id)} className="text-red-500 hover:text-red-400 p-1"><Trash size={12} /></button>
                      </div>
                      {rem.note && <p className="text-[7px] font-bold text-white/40 uppercase italic border-t border-white/5 pt-2">{rem.note}</p>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-900 p-6 rounded-[2.5rem] border border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[6px] font-black text-[#FFCD00] uppercase tracking-widest">BITÁCORA TOTAL DE INTERACCIONES</p>
                  <div className="flex gap-2">
                    <button onClick={() => setInteractionFilter('all')} className={cn("px-2 py-1 rounded-md text-[6px] font-black uppercase transition-all", interactionFilter === 'all' ? "bg-[#FFCD00] text-black" : "bg-white/5 text-white/40")}>TODAS</button>
                    <button onClick={() => setInteractionFilter('note')} className={cn("px-2 py-1 rounded-md text-[6px] font-black uppercase transition-all", interactionFilter === 'note' ? "bg-red-600 text-white" : "bg-white/5 text-white/40")}>ALERTAS/NOTAS</button>
                  </div>
                </div>
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                  {(currentBudget.interactions || [])
                    .filter((entry: any) => interactionFilter === 'all' || entry.type === interactionFilter)
                    .map((entry: any, i: number) => (
                    <button key={i} onClick={() => setSelectedNote({...entry, client: currentBudget})} className="w-full flex gap-3 relative text-left hover:bg-white/5 p-2 rounded-xl transition-all group">
                      <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 border border-white/10 shadow-lg z-10", 
                        entry.type === 'call' ? 'bg-red-600/20 text-red-500' : 
                        entry.type === 'whatsapp' ? 'bg-[#FFCD00]/20 text-[#FFCD00]' : 
                        entry.type === 'note' ? 'bg-zinc-700 text-white' : 'bg-white/5 text-white/40'
                      )}>
                        {entry.type === 'call' ? <Phone size={10} /> : 
                         entry.type === 'whatsapp' ? <MessageCircle size={10} /> : 
                         entry.type === 'note' ? <AlertCircle size={10} /> : <Zap size={10} />}
                      </div>
                        <div className="flex-1 pb-2">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[7px] font-black text-white/20 uppercase">{entry.date} • {entry.time}</p>
                            {entry.type === 'note' && <span className="text-[6px] font-black uppercase text-[#FFCD00] transition-opacity">PREVISUALIZAR ALERTA</span>}
                          </div>
                          <p className={cn("text-[10px] font-bold uppercase leading-tight line-clamp-3", entry.type === 'note' ? 'text-[#FFCD00]' : 'text-white/50')}>
                            {entry.text}
                          </p>
                        </div>
                    </button>
                  ))}
                  {(!currentBudget.interactions || currentBudget.interactions.length === 0) && (
                    <p className="text-[7px] font-black text-white/10 uppercase italic text-center py-4">SIN ACTIVIDAD REGISTRADA</p>
                  )}
                </div>
              </div>

              {/* CHAT DIRECTO EN TIEMPO REAL - ADMINISTRADOR */}
              <div className="bg-zinc-900 p-6 rounded-[2.5rem] border border-white/5 space-y-4">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={16} className="text-[#FFCD00]" />
                    <p className="text-[7px] font-black text-[#FFCD00] uppercase tracking-[0.2em] leading-none">CHAT DIRECTO EN TIEMPO REAL</p>
                  </div>
                  {chatMessages.length > 0 && (
                    <button
                      onClick={() => {
                        setCustomConfirm({
                          isOpen: true,
                          title: "VACIAR HISTORIAL DEL CHAT",
                          message: "¿CONFIRMAS QUE DESEAS ELIMINAR TODO EL HISTORIAL DE ESTE CHAT? ESTA ACCIÓN ES TOTALMENTE IRREVERSIBLE.",
                          onConfirm: async () => {
                            await clearDirectChatHistory(currentBudget.id);
                          }
                        });
                      }}
                      className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-500/30 text-[6.5px] font-black uppercase tracking-widest rounded-lg transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 size={8} />
                      VACIAR HISTORIAL
                    </button>
                  )}
                </div>

                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 flex flex-col gap-2">
                  {(Array.isArray(chatMessages) ? chatMessages : []).map((msg) => {
                    const isAdminMsg = msg.sender === 'admin';
                    const canEditOrDelete = isAdmin || (!isAdmin && !isAdminMsg);
                    let timeStr = "";
                    try {
                      let d = new Date();
                      if (msg.timestamp) {
                        if (msg.timestamp.seconds) {
                          d = new Date(msg.timestamp.seconds * 1000);
                        } else if (typeof msg.timestamp.toDate === 'function') {
                          d = msg.timestamp.toDate();
                        } else {
                          d = new Date(msg.timestamp);
                        }
                      }
                      if (isNaN(d.getTime())) {
                        d = new Date();
                      }
                      timeStr = d.toLocaleDateString('es-ES') + " " + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                    } catch (err) {
                      const now = new Date();
                      timeStr = now.toLocaleDateString('es-ES') + " " + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                    }
                    return (
                      <div 
                        key={msg.id} 
                        onClick={() => {
                          if (canEditOrDelete) {
                            setSelectedMessageOptions(msg);
                          }
                        }}
                        className={cn(
                          "max-w-[85%] rounded-2xl p-3 text-[10px] font-bold uppercase tracking-wider leading-relaxed flex flex-col gap-1 shadow-md cursor-pointer select-none transition-all active:brightness-95",
                          isAdminMsg 
                            ? "bg-zinc-950 border border-[#FFCD00]/20 text-[#FFCD00] self-end" 
                            : "bg-[#FFCD00] text-black self-start"
                        )}
                        title={canEditOrDelete ? "Toca para editar o eliminar" : undefined}
                      >
                        <div className="flex items-center justify-between gap-4 pointer-events-none">
                          <p className="text-[6px] opacity-60 font-black">
                            {isAdminMsg ? "CONSTRUACHA (ADMIN)" : (currentBudget.cliente || "CLIENTE")}
                          </p>
                          {msg.isEdited && (
                            <span className="text-[5.5px] opacity-40 font-black uppercase italic tracking-widest">
                              (EDITADO)
                            </span>
                          )}
                        </div>
                        
                        {editingMessageId === msg.id ? (
                          <div className="mt-1.5 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <textarea
                              value={editingMessageText}
                              onChange={(e) => setEditingMessageText(e.target.value)}
                              className="w-full p-2 bg-black text-white text-[9px] font-bold border border-[#FFCD00]/40 rounded-lg focus:outline-none focus:border-[#FFCD00] resize-none uppercase"
                              rows={2}
                            />
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => {
                                  setEditingMessageId(null);
                                  setEditingMessageText('');
                                }}
                                  className="px-2 py-1 bg-zinc-800 text-white text-[6.5px] font-black uppercase rounded-md active:scale-95 transition-all"
                              >
                                CANCELAR
                              </button>
                              <button
                                onClick={() => editDirectChatMessage(msg.id, editingMessageText)}
                                className="px-2 py-1 bg-[#FFCD00] text-black text-[6.5px] font-black uppercase rounded-md active:scale-95 transition-all"
                              >
                                GUARDAR
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[10px] whitespace-pre-wrap break-words leading-snug pointer-events-none">{msg.text}</p>
                        )}

                        {/* Renderizado de Media Adjunta */}
                        {msg.mediaUrl && msg.mediaType === 'image' && (
                          <div className="mt-2 rounded-xl overflow-hidden border border-white/10 max-w-full cursor-pointer" onClick={() => setActiveMediaPreview({ url: msg.mediaUrl, type: 'image' })}>
                            <img src={msg.mediaUrl} className="max-h-36 w-auto object-cover rounded-lg" alt="Imagen" />
                          </div>
                        )}
                        {msg.mediaUrl && msg.mediaType === 'video' && (
                          <div className="mt-2 rounded-xl overflow-hidden border border-white/10 max-w-full cursor-pointer" onClick={() => setActiveMediaPreview({ url: msg.mediaUrl, type: 'video' })}>
                            <div className="relative">
                              <video src={msg.mediaUrl} className="max-h-48 w-full object-contain bg-black rounded-lg pointer-events-none" />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/15 transition-colors">
                                <div className="w-10 h-10 bg-[#FFCD00] text-black rounded-full flex items-center justify-center shadow-lg">
                                  <Video size={16} />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {msg.mediaUrl && msg.mediaType === 'file' && (
                          <a 
                            href={msg.mediaUrl} 
                            download={msg.mediaName || "archivo"} 
                            className={cn(
                              "mt-2 p-2 rounded-xl border flex items-center gap-1.5 text-[8px] font-black transition-colors uppercase tracking-wider leading-relaxed",
                              isAdminMsg 
                                ? "bg-zinc-900 border-white/10 text-[#FFCD00] hover:bg-zinc-800" 
                                : "bg-white/20 border-black/10 text-black hover:bg-white/30"
                            )}
                          >
                            <Paperclip size={10} className={isAdminMsg ? "text-[#FFCD00]" : "text-black"} />
                            <span className="truncate max-w-[120px]">{msg.mediaName || "VER ARCHIVO"}</span>
                          </a>
                        )}

                        {/* Marca de fecha y hora */}
                        <div className="text-[6.5px] opacity-50 text-right mt-1.5 font-black tracking-wider uppercase flex items-center justify-end gap-1.5 pointer-events-none">
                          <span>{timeStr}</span>
                          {isAdmin && isAdminMsg && (
                            <span className="flex items-center">
                              {msg.read ? (
                                <span className="text-sky-400 flex" title="Leído">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="w-2.5 h-2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7M10 17l4 4L22 9" />
                                  </svg>
                                </span>
                              ) : msg.received ? (
                                <span className="text-zinc-400 flex" title="Entregado">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="w-2.5 h-2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7M10 17l4 4L22 9" />
                                  </svg>
                                </span>
                              ) : (
                                <span className="text-zinc-600 flex" title="Enviado">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="w-2.5 h-2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {chatMessages.length === 0 && (
                    <p className="text-[7.5px] font-black text-white/10 uppercase italic text-center py-4 tracking-widest">SIN MENSAJES EN EL CHAT</p>
                  )}
                </div>

                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!chatInputText.trim()) return;
                    sendChatMessage(currentBudget.id, 'admin', chatInputText);
                    setChatInputText('');
                  }} 
                  className="flex flex-col gap-2"
                >
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={chatInputText}
                      onChange={(e) => setChatInputText(e.target.value)}
                      placeholder="ESCRIBE UN MENSAJE..." 
                      className="flex-1 bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold uppercase italic text-white placeholder-zinc-500 focus:outline-none focus:border-[#FFCD00]/50 transition-all"
                    />
                    <button 
                      type="submit" 
                      className="p-3 bg-[#FFCD00] text-black rounded-xl active:scale-95 transition-all shadow-lg flex items-center justify-center shrink-0"
                    >
                      <Send size={14} />
                    </button>
                  </div>

                  {/* Botones de Cámara y Adjuntar para Admin */}
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <label className="cursor-pointer p-2 bg-zinc-950 hover:bg-zinc-800 border border-white/5 hover:border-[#FFCD00]/20 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all w-full">
                        <input 
                          type="file" 
                          accept="image/*" 
                          capture="environment" 
                          className="hidden" 
                          onChange={(e) => handleChatMediaSelect(e, currentBudget.id, 'admin', 'image')}
                          disabled={isUploadingChatMedia}
                        />
                        <Camera size={12} className="text-[#FFCD00]" />
                        <span className="text-[8px] font-black uppercase text-zinc-400">CÁMARA</span>
                      </label>

                      <label className="cursor-pointer p-2 bg-zinc-950 hover:bg-zinc-800 border border-white/5 hover:border-[#FFCD00]/20 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all w-full">
                        <input 
                          type="file" 
                          className="hidden" 
                          onChange={(e) => handleChatMediaSelect(e, currentBudget.id, 'admin', 'file')}
                          disabled={isUploadingChatMedia}
                        />
                        <Paperclip size={12} className="text-[#FFCD00]" />
                        <span className="text-[8px] font-black uppercase text-zinc-400">ADJUNTAR</span>
                      </label>
                    </div>

                    {isUploadingChatMedia && (
                      <div className="flex items-center gap-1.5 justify-center py-1">
                        <div className="w-3.5 h-3.5 border-2 border-[#FFCD00] border-t-transparent rounded-full animate-spin" />
                        <span className="text-[8px] font-black uppercase text-[#FFCD00] animate-pulse">CARGANDO ARCHIVO...</span>
                      </div>
                    )}
                  </div>
                </form>
              </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => { logInteraction(currentBudget.id, 'call'); window.open(`tel:${currentBudget.telefono}`); }} className="flex flex-col items-center justify-center p-6 bg-zinc-900 rounded-[2rem] border border-white/5 hover:border-[#FFCD00]/30 transition-all gap-2 text-center">
                        <Phone size={20} className="text-[#FFCD00]" />
                        <span className="text-[8px] font-black uppercase italic">LLAMAR</span>
                      </button>
                      <button onClick={() => { logInteraction(currentBudget.id, 'whatsapp'); window.open(`https://wa.me/${currentBudget.telefono.replace('+', '')}`, '_blank'); }} className="flex flex-col items-center justify-center p-6 bg-zinc-900 rounded-[2rem] border border-white/5 hover:border-[#FFCD00]/30 transition-all gap-2 text-center">
                        <MessageCircle size={20} className="text-[#FFCD00]" />
                        <span className="text-[8px] font-black uppercase italic">WHATSAPP</span>
                      </button>
                    </div>

                    {!currentBudget.confirmed && (
                      <button onClick={() => confirmBudget(currentBudget.id)} className="w-full py-5 bg-red-600 text-white rounded-[2rem] font-black uppercase italic tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3">
                        <CheckCircle2 size={18} />
                        <span>CONFIRMAR RECEPCIÓN</span>
                      </button>
                    )}
                  </div>

                  <div className="mt-12 mb-6">
                    <button 
                      onClick={() => {
                        resetBudgetFlow();
                        setView('home');
                      }} 
                      className="px-8 py-3 bg-[#FFCD00] border border-white/10 rounded-2xl text-black shadow-2xl active:scale-95 transition-all group flex items-center gap-3"
                    >
                      <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                      <span className="text-[14px] font-black uppercase italic tracking-tighter leading-none">VOLVER AL PANEL</span>
                    </button>
                  </div>
                    </div>
                  );
                } catch (err) {
                  console.error("Error en budget_details:", err);
                  setTimeout(() => setView('home'), 0);
                  return null;
                }
              })()}
            </div>
          )}
      </div>

      {selectedNote && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-white/5 rounded-[2.5rem] p-8 w-full max-w-sm shadow-3xl text-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-[#FFCD00] mx-auto mb-6">
              <MessageSquare size={32} />
            </div>
            <p className="text-[7px] font-black text-white/30 uppercase tracking-[0.3em] mb-1">CLIENTE: {selectedNote.client.cliente}</p>
            <p className="text-[6px] font-black text-white/20 uppercase mb-6">{selectedNote.date} • {selectedNote.time}</p>
            
            <div className="bg-black/40 p-6 rounded-2xl border border-white/5 mb-8">
              <p className="text-[11px] font-bold text-white uppercase italic leading-relaxed">
                {selectedNote.text}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <button onClick={() => { logInteraction(selectedNote.client.id, 'call'); window.open(`tel:${selectedNote.client.telefono}`); }} className="py-5 bg-red-600 text-white rounded-2xl flex flex-col items-center justify-center gap-1 shadow-lg active:scale-95 transition-all">
                <Phone size={14} />
                <span className="text-[7px] font-black tracking-widest">LLAMAR</span>
              </button>
              <button onClick={() => { logInteraction(selectedNote.client.id, 'whatsapp'); window.open(`https://wa.me/${selectedNote.client.telefono.replace('+', '')}`, '_blank'); }} className="py-5 bg-green-600 text-white rounded-2xl flex flex-col items-center justify-center gap-1 shadow-lg active:scale-95 transition-all">
                <MessageCircle size={14} />
                <span className="text-[7px] font-black tracking-widest">WHATSAPP</span>
              </button>
            </div>

            <button onClick={() => setSelectedNote(null)} className="w-full py-4 bg-white/5 text-white/40 rounded-2xl text-[8px] font-black uppercase tracking-widest">CERRAR NOTA</button>
          </motion.div>
        </div>
      )}
      {/* PORTFOLIO LIGHTBOX MODAL */}
      <AnimatePresence>
        {selectedPortfolioItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 md:p-10 select-none overflow-hidden"
          >
            <div className="absolute inset-0 bg-noise opacity-[0.05] pointer-events-none" />
            
            <motion.button 
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => setSelectedPortfolioItem(null)}
              className="absolute top-8 right-8 z-[1010] w-14 h-14 bg-zinc-900 border border-white/10 rounded-2xl flex items-center justify-center text-white active:scale-90 transition-all hover:bg-[#FFCD00] hover:text-black shadow-2xl"
            >
              <X size={28} />
            </motion.button>

            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-6xl aspect-video rounded-[3rem] overflow-hidden border border-white/10 shadow-[0_0_100px_rgba(255,205,0,0.1)] bg-zinc-950"
            >
              {/* COMPARATIVA ANTES Y DESPUÉS (Control de Selección) */}
              {selectedPortfolioItem.urlBefore && (
                <div className="absolute top-6 left-6 z-40 p-1 bg-black/85 backdrop-blur-md border border-white/10 rounded-2xl flex items-center gap-1 shadow-2xl">
                  <button 
                    onClick={() => setCompareMode('before')}
                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${
                      compareMode === 'before' 
                        ? 'bg-[#FFCD00] text-black shadow-inner font-black' 
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    ANTES
                  </button>
                  <button 
                    onClick={() => setCompareMode('after')}
                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${
                      compareMode === 'after' 
                        ? 'bg-[#FFCD00] text-black shadow-inner font-black' 
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    DESPUÉS
                  </button>
                </div>
              )}

              {selectedPortfolioItem.type === 'video' ? (
                <video 
                  src={selectedPortfolioItem.url} 
                  className="w-full h-full object-cover"
                  autoPlay
                  controls
                />
              ) : (
                <div className="w-full h-full relative">
                  <AnimatePresence mode="wait">
                    <motion.img 
                      key={compareMode === 'before' && selectedPortfolioItem.urlBefore ? 'before' : 'after'}
                      src={compareMode === 'before' && selectedPortfolioItem.urlBefore ? selectedPortfolioItem.urlBefore : selectedPortfolioItem.url} 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="w-full h-full object-cover"
                      alt={selectedPortfolioItem.title}
                    />
                  </AnimatePresence>
                </div>
              )}

              {/* Secure Info Overlay */}
              <div className="absolute bottom-0 left-0 w-full p-8 bg-gradient-to-t from-black via-black/40 to-transparent z-30 flex items-end justify-between pointer-events-none">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-8 bg-[#FFCD00] rounded-full shadow-[0_0_15px_rgba(255,205,0,0.5)]" />
                    <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white drop-shadow-2xl">{selectedPortfolioItem.title}</h2>
                  </div>
                  <div className="flex items-center gap-4 text-[8px] font-black uppercase tracking-[0.3em] text-white/40">
                    <span className="flex items-center gap-2"><ShieldCheck size={10} className="text-[#FFCD00]" /> VISTA PREVIA SEGURA</span>
                    <div className="w-1 h-1 rounded-full bg-white/20" />
                    <span>REF: {selectedPortfolioItem.id.toUpperCase()}</span>
                    <div className="w-1 h-1 rounded-full bg-white/20" />
                    <span>© 2026 CONSTRUACHA</span>
                  </div>
                </div>
              </div>
            </motion.div>

            <p className="mt-8 text-[8px] font-black uppercase tracking-[0.4em] text-zinc-600 italic text-center leading-relaxed">
              DERECHOS RESERVADOS • CONTENIDO PROTEGIDO POR LEY.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <input type="file" id="file-upload" ref={fileInputRef as any} className="opacity-0 absolute pointer-events-none" multiple onChange={handleFileChange} accept="image/*,video/*" />
      <input type="file" id="camera-upload" ref={cameraInputRef as any} className="opacity-0 absolute pointer-events-none" capture="environment" onChange={handleFileChange} accept="image/*" />
      <input type="file" id="video-upload" ref={videoInputRef as any} className="opacity-0 absolute pointer-events-none" multiple onChange={handleFileChange} accept="video/*" />
      <input type="file" id="record-upload" ref={recordVideoInputRef as any} className="opacity-0 absolute pointer-events-none" capture="environment" onChange={handleFileChange} accept="video/*" />

      <AnimatePresence>
        {showComments && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed inset-0 z-[1000] bg-zinc-950 flex flex-col">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,205,0,0.05),transparent_70%)] pointer-events-none" />
            
            <div className="pt-6 relative z-10 w-full flex flex-col items-center">
                <HeaderWithNav subtitle="BITÁCORA DE CLIENTES" logoVariant="bitacora" onBack={() => setShowComments(false)} />
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-black">
              <p className="text-[7px] font-black text-white/20 uppercase tracking-[0.4em] text-center italic">BITÁCORA TÉCNICA - OPINIONES DE CLIENTES</p>
              {(() => {
                const filteredComments = isAdmin ? comments : comments.filter((c: any) => c.approved);
                if (filteredComments.length === 0) {
                  return (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-20 py-20">
                      <MessageSquare size={50} className="text-white" />
                      <p className="text-[9px] font-black uppercase tracking-[0.3em]">SIN REGISTROS ACTUALES</p>
                    </div>
                  );
                }
                return filteredComments.map((c: any) => (
                  <motion.div 
                    key={c.id} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => {
                      if (isAdmin) {
                        setSelectedCommentForAction(c);
                      }
                    }}
                    className={cn(
                      "p-6 rounded-[2.5rem] border relative overflow-hidden transition-all shadow-2xl",
                      c.approved ? "bg-zinc-900 border-white/5" : "bg-zinc-900/40 border-red-600/30 border-dashed",
                      isAdmin && "cursor-pointer hover:border-[#FFCD00]/30"
                    )}
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-10 h-10 rounded-full border-2 border-[#FFCD00] bg-black flex items-center justify-center">
                        <User size={18} className="text-[#FFCD00]" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-[10px] font-black uppercase text-white tracking-widest leading-none">{c.userName || 'CLIENTE'}</h4>
                        <p className="text-[6px] font-black text-white/20 uppercase tracking-[0.2em] mt-1">
                          {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString('es-ES') : 'FECHA PROTEGIDA'}
                        </p>
                      </div>
                      {!c.approved && <span className="px-3 py-1 bg-red-600/20 text-red-500 rounded-md text-[6px] font-black uppercase italic">PENDIENTE PRUEBA</span>}
                    </div>
                    <p className="text-[11px] font-bold text-white/80 uppercase leading-relaxed italic tracking-tight mb-4">"{c.content}"</p>
                    
                    {isAdmin && (
                      <div className="flex gap-2 pt-4 border-t border-white/5">
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            toggleCommentApproval(c.id, c.approved); 
                          }} 
                          className={cn("px-4 py-1.5 rounded-lg text-[7px] font-black uppercase tracking-widest transition-all", c.approved ? "bg-red-600/20 text-red-500" : "bg-green-600/20 text-green-500")}
                        >
                          {c.approved ? "RESTRINGIR" : "VALIDAR"}
                        </button>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            deleteComment(c.id); 
                          }} 
                          className="ml-auto p-2 text-red-600/40 hover:text-red-500 transition-colors"
                        >
                          <Trash size={12} />
                        </button>
                      </div>
                    )}
                  </motion.div>
                ));
              })()}
            </div>
            
            <div className="p-6 bg-zinc-900/80 backdrop-blur-xl border-t border-white/5 pb-10">
              <div className="relative">
                <div className="flex items-end gap-2 bg-black/40 border border-[#FFCD00]/20 rounded-2xl p-2 focus-within:border-[#FFCD00]/50 transition-all shadow-2xl">
                  <textarea 
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="ESCRIBE TU EXPERIENCIA AQUÍ..."
                    className="flex-1 bg-transparent px-4 py-3 text-[10px] font-bold outline-none text-white placeholder:text-white/20 italic resize-none h-[44px] leading-snug uppercase tracking-widest"
                  />
                  <button 
                    onClick={submitComment}
                    disabled={isSubmittingComment || !newComment.trim()}
                    className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center text-black shadow-xl transition-all disabled:opacity-30",
                      isSubmittingComment ? "bg-zinc-800" : "bg-[#FFCD00] hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(255,205,0,0.3)]"
                    )}
                  >
                    <Send size={18} strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>
            
            <p className="pb-4 text-[6px] font-black text-white/10 uppercase tracking-[0.4em] text-center">NÚCLEO DE MODERACIÓN TÉCNICA CONSTRUACHA - 2026</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAIChat && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed inset-0 z-[2000] bg-black flex flex-col uppercase font-black"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(255,205,0,0.05),transparent_70%)] pointer-events-none" />
            
            <div className="pt-6 px-6 relative z-10 w-full flex flex-col items-center">
                <HeaderWithNav subtitle="NÚCLEO DE INTELIGENCIA ESPECIALIZADA" logoVariant="ia" onBack={() => {
                  if (typeof window !== 'undefined' && window.speechSynthesis) {
                    try {
                      window.speechSynthesis.cancel();
                    } catch (e) {}
                  }
                  setShowAIChat(false);
                }} />
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4 bg-black scroll-smooth">
              {aiHistory.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center py-10 opacity-5">
                  <Cpu size={40} className="text-[#FFCD00]" />
                </div>
              )}

              {aiHistory.map((msg, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex flex-col max-w-[90%]",
                    msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div className={cn(
                    "p-3 rounded-2xl text-[12px] font-bold leading-snug shadow-md border-2",
                    msg.role === 'user' 
                      ? "bg-red-600 text-white border-white/10 rounded-tr-none" 
                      : "bg-[#FFCD00] text-black border-black/10 rounded-tl-none"
                  )}>
                    {msg.parts.map((part, pi) => (
                      <div key={pi}>
                        {part.text && <p className="whitespace-pre-wrap select-text drop-shadow-md">{part.text}</p>}
                        {part.inlineData && (
                          <div className="mt-3 rounded-xl overflow-hidden border-2 border-black/20 shadow-lg bg-black cursor-pointer">
                            {part.inlineData.mimeType.startsWith('image') ? (
                              <img 
                                src={part.inlineData.data.startsWith('blob:') || part.inlineData.data.startsWith('http') ? part.inlineData.data : `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`} 
                                className="max-w-full h-auto" 
                                referrerPolicy="no-referrer"
                                alt="Análisis"
                                onClick={() => setPreviewImage({ preview: part.inlineData.data.startsWith('blob:') || part.inlineData.data.startsWith('http') ? part.inlineData.data : `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`, type: 'image', id: pi })}
                              />
                            ) : (
                              <video 
                                src={part.inlineData.data.startsWith('blob:') || part.inlineData.data.startsWith('http') ? part.inlineData.data : `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`}
                                className="w-full aspect-video object-cover"
                                controls
                                playsInline
                              />
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="w-full flex items-center justify-between mt-3 px-2">
                    <span className="text-[11px] font-black text-[#FFCD00] uppercase tracking-[0.3em] flex items-center gap-2 drop-shadow-xl">
                      {msg.role === 'user' ? <User size={14} className={isAdmin ? "text-[#FFCD00]" : "text-red-500"} /> : <Bot size={14} className="text-[#FFCD00]" />}
                      {msg.role === 'user' 
                        ? (isAdmin ? 'ADMINISTRADOR' : 'CLIENTE CONSTRUACHA') 
                        : (isAdmin ? 'CENTRO DE MANDO' : 'NÚCLEO CONSTRUACHA')}
                    </span>
                    
                    {msg.role === 'model' && (
                      <button 
                        onClick={() => {
                          if (typeof window !== 'undefined' && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
                            try {
                              window.speechSynthesis.cancel();
                              const fullText = msg.parts.map(p => p.text || '').join(' ');
                              const cleanText = fullText
                                .replace(/[*#_~`>\[\]\(\)]/g, '')
                                .replace(/[⚠️🔧🏗️🚜📏📐🔩🏗️]/gu, '')
                                .replace(/\s+/g, ' ')
                                .trim();
                              const utterance = new SpeechSynthesisUtterance(cleanText);
                              utterance.lang = 'es-ES';
                              window.speechSynthesis.speak(utterance);
                            } catch (e) {
                              console.warn("Read aloud failed:", e);
                            }
                          }
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 bg-[#FFCD00]/10 hover:bg-[#FFCD00]/20 border border-[#FFCD00]/20 text-[#FFCD00] text-[8px] font-black uppercase rounded-lg transition-all active:scale-95"
                        title="Escuchar este mensaje"
                      >
                        <Volume2 size={10} />
                        <span>Escuchar</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
              
              {isAILoading && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-start max-w-[85%]"
                >
                  <div className="p-5 bg-[#FFCD00] border-2 border-black/10 text-black rounded-3xl rounded-tl-none flex items-center gap-4 shadow-[0_0_30px_rgba(255,205,0,0.3)]">
                    <div className="flex gap-1.5">
                      <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2.5 h-2.5 bg-black rounded-full" />
                      <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2.5 h-2.5 bg-black rounded-full" />
                      <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2.5 h-2.5 bg-black rounded-full" />
                    </div>
                    <span className="text-[12px] font-black uppercase tracking-widest italic">PROCESANDO DATOS TÉCNICOS...</span>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-zinc-900/80 backdrop-blur-xl border-t border-white/5 pb-8">
              {aiMedia.length > 0 && (
                <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
                  {aiMedia.map((m, i) => (
                    <div key={i} className="relative shrink-0">
                      <img src={m.preview} className="w-12 h-12 rounded-lg object-cover border-2 border-[#FFCD00]" alt="Preview" />
                      <button 
                        onClick={() => setAIMedia(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1 -right-1 bg-red-600 text-white p-0.5 rounded-full shadow-lg"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative">
                <div className="flex items-end gap-1.5 bg-black/40 border border-[#FFCD00]/20 rounded-xl p-1 focus-within:border-[#FFCD00]/50 transition-all shadow-2xl">
                  <button 
                    onClick={() => document.getElementById('ai-file-upload')?.click()}
                    className="p-2 text-[#FFCD00] hover:bg-white/5 rounded-lg transition-all"
                  >
                    <Camera size={16} />
                  </button>
                  <button 
                    onClick={toggleListening}
                    className={cn(
                      "p-2 rounded-lg transition-all",
                      isListening ? "bg-red-600 text-white animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.5)]" : "text-zinc-500 hover:bg-white/5"
                    )}
                  >
                    <Mic size={16} />
                  </button>
                  <button 
                    onClick={() => {
                      const newMuted = !isMicMuted;
                      setIsMicMuted(newMuted);
                      try {
                        safeLocalStorage.setItem('construacha_ai_mic_muted', JSON.stringify(newMuted));
                      } catch (e) {}
                      if (newMuted && typeof window !== 'undefined' && window.speechSynthesis) {
                        try {
                          window.speechSynthesis.cancel();
                        } catch (e) {}
                      }
                    }}
                    title={isMicMuted ? "Activar lectura por voz" : "Silenciar lectura por voz"}
                    className={cn(
                      "p-2 rounded-lg transition-all",
                      isMicMuted ? "text-red-500 hover:bg-red-500/10" : "text-[#FFCD00] hover:bg-white/5"
                    )}
                  >
                    {isMicMuted ? <VolumeX size={16} className="animate-pulse" /> : <Volume2 size={16} />}
                  </button>
                  <textarea 
                    value={aiInput}
                    onChange={(e) => setAIInput(e.target.value)}
                    placeholder={isAdmin ? "CONSULTA INTERNA DE ADMINISTRACIÓN..." : "PREGÚNTAME SOBRE CÁLCULOS O DISEÑOS..."}
                    className="flex-1 bg-transparent px-1 py-1.5 text-[9px] font-bold outline-none text-white placeholder:text-zinc-700 italic resize-none h-[32px] leading-tight uppercase tracking-widest"
                  />
                  <button 
                    onClick={() => {
                      if (!isAILoading && (aiInput.trim() || aiMedia.length > 0)) {
                        void handleSendMessage();
                      }
                    }}
                    disabled={(!aiInput.trim() && aiMedia.length === 0) || isAILoading}
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center text-black shadow-xl transition-all disabled:opacity-30",
                      isAILoading ? "bg-zinc-800" : "bg-[#FFCD00] hover:scale-105 active:scale-95"
                    )}
                  >
                    {isAILoading ? (
                      <div className="flex gap-0.5">
                        <motion.div animate={{ height: [4, 8, 4] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-0.5 bg-black/50 rounded-full" />
                        <motion.div animate={{ height: [4, 8, 4] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-0.5 bg-black/50 rounded-full" />
                      </div>
                    ) : <Send size={18} strokeWidth={3} />}
                  </button>
                </div>
              </div>
            </div>
            
            <p className="pb-4 text-[6px] font-black text-white/10 uppercase tracking-[0.4em] text-center">NÚCLEO TÉCNICO CONSTRUACHA - ASISTENCIA AVANZADA</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL DEL LIENZO DE FIRMA DIGITAL (GLOBAL) */}
      <AnimatePresence>
        {showSignaturePad && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.9, y: 20 }} 
              className="bg-zinc-900 border border-[#FFCD00]/20 rounded-[2.5rem] p-6 w-full max-w-sm text-center relative shadow-3xl"
            >
              <button 
                onClick={() => setShowSignaturePad(false)} 
                className="absolute top-6 right-6 p-2 bg-white/5 rounded-full text-white/40 active:scale-90 transition-transform z-10"
              >
                <X size={16} />
              </button>
              
              <div className="mb-4">
                <FullBrandLogo className="scale-90" variant="qr" />
              </div>
              
              <div className="text-center space-y-1.5 mb-5">
                <h3 className="text-xl font-black italic uppercase text-[#FFCD00] tracking-tighter leading-none">FIRMA DIGITAL DE SEGURIDAD</h3>
                <p className="text-[7.5px] font-bold text-zinc-500 uppercase tracking-widest leading-none">DIBUJA TU FIRMA DENTRO DEL RECUADRO AMARILLO</p>
              </div>

              {/* LIENZO DE DIBUJO */}
              <div className="w-full bg-black border-2 border-dashed border-[#FFCD00]/30 rounded-2xl p-2 relative overflow-hidden mb-5">
                <canvas
                  ref={signatureCanvasRef}
                  width={500}
                  height={250}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-auto aspect-[2/1] bg-black block cursor-crosshair rounded-xl touch-none"
                />
                <div className="absolute top-3 left-3 flex items-center gap-1.5 opacity-25 pointer-events-none">
                  <PencilRuler size={10} className="text-[#FFCD00]" />
                  <span className="text-[6px] font-black uppercase tracking-widest text-[#FFCD00]">LIENZO DE FIRMA</span>
                </div>
              </div>

              {/* CONTROLES DE PINCELES Y PRECISIÓN */}
              <div className="bg-black/40 p-4 rounded-2xl border border-white/5 mb-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black uppercase text-white/40 tracking-wider">HERRAMIENTA</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEraser(false)}
                      className={cn("px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider flex items-center gap-1 transition-all", 
                        !isEraser ? "bg-[#FFCD00] text-black" : "bg-white/5 text-white/60 hover:bg-white/10"
                      )}
                    >
                      <PencilRuler size={10} />
                      <span>LÁPIZ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEraser(true)}
                      className={cn("px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider flex items-center gap-1 transition-all", 
                        isEraser ? "bg-[#FFCD00] text-black" : "bg-white/5 text-white/60 hover:bg-white/10"
                      )}
                    >
                      <Trash size={10} />
                      <span>BORRADOR</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black uppercase text-white/40 tracking-wider">GROSOR</span>
                  <div className="flex gap-1.5">
                    {[2, 4, 8, 12].map((width) => (
                      <button
                        key={width}
                        type="button"
                        onClick={() => setStrokeWidth(width)}
                        className={cn("w-7 h-7 rounded-lg text-[8px] font-black uppercase flex items-center justify-center transition-all", 
                          strokeWidth === width ? "bg-[#FFCD00] text-black" : "bg-white/5 text-white/60 hover:bg-white/10"
                        )}
                      >
                        {width === 2 ? '1x' : width === 4 ? '2x' : width === 8 ? '3x' : '4x'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <button 
                    onClick={() => setShowEraseOptions(!showEraseOptions)}
                    type="button"
                    className="w-full py-4 bg-white/5 border border-white/10 text-white/40 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-white transition-all flex items-center justify-center gap-1.5"
                  >
                    <Trash size={12} />
                    <span>BORRAR</span>
                  </button>
                  {showEraseOptions && (
                    <div className="absolute bottom-full left-0 mb-2 w-[180px] bg-zinc-950 border border-white/10 rounded-2xl p-2.5 shadow-2xl flex flex-col gap-1.5 z-30 animate-in slide-in-from-bottom-2 duration-200">
                      <p className="text-[7.5px] font-black uppercase tracking-widest text-[#FFCD00] text-center mb-1.5 italic">OPCIONES DE BORRADO</p>
                      <button
                        onClick={() => {
                          clearSignature();
                          setIsEraser(false);
                          setShowEraseOptions(false);
                        }}
                        type="button"
                        className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[8px] font-black uppercase tracking-wider transition-all"
                      >
                        BORRADO TOTAL
                      </button>
                      <button
                        onClick={() => {
                          setIsEraser(true);
                          setShowEraseOptions(false);
                        }}
                        type="button"
                        className="w-full py-2 bg-white/5 hover:bg-white/10 text-[#FFCD00] border border-[#FFCD00]/20 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all"
                      >
                        BORRAR POR PARTES
                      </button>
                    </div>
                  )}
                </div>
                <button 
                  onClick={saveSignature}
                  disabled={isSignatureSaving}
                  type="button"
                  className="py-4 bg-[#FFCD00] text-black rounded-xl text-[9px] font-black uppercase italic tracking-widest hover:scale-[0.99] active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-[#FFCD00]/10 disabled:opacity-50"
                >
                  {isSignatureSaving ? "GUARDANDO..." : "CONFIRMAR FIRMA"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL DE EVIDENCIA EN DETALLE (GLOBAL) */}
      <AnimatePresence>
        {showFullEvidence && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6">
            <div className="relative max-w-full max-h-[80vh]">
              {showFullEvidence.type === 'video' ? (
                <video src={showFullEvidence.preview} controls className="max-w-full max-h-full rounded-2xl" autoPlay />
              ) : (
                <img src={showFullEvidence.preview} className="max-w-full max-h-full object-contain rounded-2xl" alt="Evidence Preview" />
              )}
              <button onClick={() => setShowFullEvidence(null)} className="absolute -top-12 -right-0 p-3 bg-red-600 rounded-full text-white shadow-xl">
                <X size={24} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewMedia && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/95 flex flex-col items-center justify-center p-4 md:p-12"
          >
            <button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPreviewMedia(null);
              }}
              className="absolute top-6 right-6 p-3 bg-red-600 text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all z-[1001]"
            >
              <X size={24} />
            </button>
            <div className="relative w-full h-full flex items-center justify-center">
              {previewMedia.mimeType.startsWith('video') ? (
                <video 
                  src={`data:${previewMedia.mimeType};base64,${previewMedia.data}`}
                  controls
                  autoPlay
                  className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl border border-white/10"
                />
              ) : (
                <img 
                  src={`data:${previewMedia.mimeType};base64,${previewMedia.data}`}
                  alt="Preview"
                  className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl border border-white/10"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
            
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 px-8 py-3 bg-white/5 backdrop-blur-xl rounded-full border border-white/10 border-t-white/20">
              <p className="text-[10px] font-black uppercase italic text-[#FFCD00] tracking-[0.3em]">Vista Técnica de Alta Resolución</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OVERLAY DE CARGA PARA EXPORTACIÓN */}
      <AnimatePresence>
        {isExporting && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[300] bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6"
          >
            <div className="bg-zinc-900 border border-[#FFCD00]/20 rounded-[2.5rem] p-8 max-w-xs text-center space-y-4 shadow-2xl">
              <div className="w-12 h-12 border-4 border-[#FFCD00] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-black uppercase tracking-widest text-[#FFCD00] italic">PROCESANDO DOCUMENTO</p>
              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">{exportMessage || "GENERANDO ARCHIVO DE ALTA DEFINICIÓN..."}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL DE COMPROBANTE GENERADO (VISTA PREVIA DE DESCARGA DIRECTA / MANUAL) */}
      <AnimatePresence>
        {exportedImagePreview && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[250] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.9, y: 20 }} 
              className="bg-zinc-900 border border-[#FFCD00]/20 rounded-[2.5rem] p-6 w-full max-w-sm text-center relative shadow-3xl flex flex-col max-h-[90vh]"
            >
              <button 
                onClick={() => setExportedImagePreview(null)} 
                className="absolute top-6 right-6 p-2 bg-white/5 rounded-full text-white/40 active:scale-90 transition-transform z-10"
              >
                <X size={16} />
              </button>

              <div className="mb-4 shrink-0">
                <FullBrandLogo className="scale-90" variant="qr" />
              </div>

              <div className="text-center space-y-1 mb-4 shrink-0">
                <h3 className="text-sm font-black italic uppercase text-[#FFCD00] tracking-tighter leading-none">{exportedImagePreview.title}</h3>
                <p className="text-[7.5px] font-bold text-zinc-400 uppercase tracking-widest leading-none">VISTA PREVIA Y DESCARGA MANUAL</p>
              </div>

              {/* IMAGEN RENDERIZADA */}
              <div className="flex-1 overflow-y-auto bg-black border border-white/5 rounded-2xl p-2 mb-4 scrollbar-hide flex items-center justify-center">
                <img 
                  src={exportedImagePreview.url} 
                  className="max-h-[45vh] w-auto object-contain rounded-xl shadow-lg border border-white/10" 
                  alt="Comprobante" 
                />
              </div>

              <div className="bg-black/60 p-4 rounded-2xl border border-white/5 mb-4 shrink-0">
                <p className="text-[8px] font-bold text-[#FFCD00] uppercase tracking-wider leading-relaxed">
                  💡 NOTA: Si la descarga automática no inició en tu dispositivo, puedes mantener presionada la imagen para guardarla en tu galería o hacer click derecho para "Guardar imagen como".
                </p>
              </div>

              <div className="flex gap-2 w-full shrink-0">
                {exportedImagePreview.pdfUrl && (
                  <button 
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = exportedImagePreview.pdfUrl!;
                      link.download = exportedImagePreview.pdfFileName || "comprobante.pdf";
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="flex-1 py-4 bg-[#FFCD00] text-black rounded-xl text-[10px] font-black uppercase italic tracking-widest hover:scale-[0.99] active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-lg"
                  >
                    <FileText size={13} />
                    <span>DESCARGAR PDF</span>
                  </button>
                )}
                
                <button 
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = exportedImagePreview.url;
                    link.download = `${exportedImagePreview.title.toLowerCase().replace(/\s+/g, '-')}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className={cn(
                    "py-4 rounded-xl text-[10px] font-black uppercase italic tracking-widest hover:scale-[0.99] active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-lg",
                    exportedImagePreview.pdfUrl ? "flex-1 bg-zinc-800 text-white border border-white/10" : "w-full bg-[#FFCD00] text-black"
                  )}
                >
                  <ImageIcon size={13} />
                  <span>{exportedImagePreview.pdfUrl ? "DESCARGAR PNG" : "DESCARGAR COMPROBANTE"}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OVERLAY GLOBAL DE ALERTAS Y RECORDATORIOS */}
      <AnimatePresence>
        {activeReminders.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
            {activeReminders.map(rem => {
              const budget = archivedBudgets.find(b => b.id === rem.budgetId);
              return (
                <motion.div key={rem.id} initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-zinc-900 border-2 border-red-600 rounded-[2.5rem] p-8 w-full max-w-sm shadow-[0_0_50px_rgba(220,38,38,0.3)] text-center relative overflow-hidden">
                  <button onClick={() => {
                    handleCloseAlert(rem);
                  }} className="absolute top-6 right-6 p-2 bg-white/5 text-white/40 rounded-full hover:bg-white/10 transition-all z-10">
                    <X size={16} />
                  </button>
                  <div className="absolute top-0 left-0 w-full h-1 bg-red-600 animate-pulse" />
                  <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center text-white mx-auto mb-6 pulse-red relative">
                    <AlarmClock size={40} />
                    <div className="absolute -top-1 -right-1 bg-white text-red-600 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-red-600">!</div>
                  </div>
                  <h3 className="text-2xl font-black italic uppercase text-red-600 mb-2 tracking-tighter">ALERTA DE SEGUIMIENTO</h3>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase mb-2 tracking-widest">PROYECTO: <span className="text-white font-black">{rem.clientName}</span></p>
                  
                  {rem.note && (
                    <div className="mb-6">
                      <p className="text-[7px] font-black text-[#FFCD00]/80 uppercase tracking-[0.3em] mb-2">NOTA ADJUNTA</p>
                      <p className="text-[10px] font-medium text-zinc-400 italic uppercase bg-white/5 p-4 rounded-xl border border-white/5 leading-relaxed">"{rem.note}"</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => { 
                        handleCloseAlert(rem);
                      }} className="py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase text-white/40 hover:bg-white/10 transition-all font-black">DESACTIVAR</button>
                      <div className="relative">
                        <button onClick={() => setShowSnoozeId(showSnoozeId === rem.id ? null : rem.id)} className="w-full py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-xl active:scale-95 transition-all">POSPONER</button>
                        <AnimatePresence>
                          {showSnoozeId === rem.id && (
                            <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute bottom-full left-0 w-full mb-3 bg-zinc-800 rounded-2xl border border-white/10 p-2 grid grid-cols-3 gap-1 shadow-2xl z-50">
                              {[5, 10, 15, 20, 25, 30].map(m => (
                                <button key={m} onClick={(e) => { e.stopPropagation(); snoozeReminder(rem.id, m); }} className="py-3 bg-white/5 rounded-xl text-[9px] font-black hover:bg-[#FFCD00] hover:text-black transition-all flex flex-col items-center">
                                  <span>{m}</span>
                                  <span className="text-[5px] uppercase">MIN</span>
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <AnimatePresence>
                      {expandedAlertId === rem.id && budget && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-3 pt-3 overflow-hidden">
                          <div className="p-4 bg-black/40 rounded-2xl border border-white/5 text-left">
                            <p className="text-[7px] font-black text-zinc-500 uppercase tracking-[0.4em] mb-4">INF. CLIENTE Y BITÁCORA</p>
                            <div className="flex flex-col gap-1 mb-4">
                              <p className="text-[11px] font-black uppercase text-white/90 tracking-tighter">{budget.cliente}</p>
                              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{budget.telefono}</p>
                            </div>
                            <div className="space-y-2 max-h-[100px] overflow-y-auto pr-1">
                              {(budget.interactions || []).slice(0, 3).map((it, idx) => (
                                <div key={idx} className="bg-white/5 p-2.5 rounded-lg border border-white/5 flex gap-2 items-start">
                                   <div className="w-1.5 h-1.5 rounded-full bg-[#FFCD00] shadow-[0_0_5px_rgba(255,205,0,0.5)] mt-1.5 shrink-0" />
                                   <p className="text-[9px] font-black text-zinc-400 uppercase italic leading-tight">{it.text}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="grid grid-cols-2 gap-2">
                              <button onClick={() => { logInteraction(rem.budgetId, 'call'); window.open(`tel:${budget.telefono}`); }} className="py-3 bg-red-600 text-white rounded-xl flex items-center justify-center gap-2 shadow-lg">
                                <Phone size={12} />
                                <span className="text-[7px] font-black uppercase">LLAMAR</span>
                              </button>
                              <button onClick={() => { logInteraction(rem.budgetId, 'whatsapp'); window.open(`https://wa.me/${budget.telefono.replace('+', '')}`, '_blank'); }} className="py-3 bg-green-600 text-white rounded-xl flex items-center justify-center gap-2 shadow-lg">
                                <MessageCircle size={12} />
                                <span className="text-[7px] font-black uppercase">WHATSAPP</span>
                              </button>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <button onClick={() => setExpandedAlertId(expandedAlertId === rem.id ? null : rem.id)} className="w-full py-5 bg-white/5 text-white/40 border border-white/10 rounded-2xl text-[10px] font-black uppercase italic tracking-widest flex items-center justify-center gap-2">
                      <img src="/src/favicon.ico" className="w-3.5 h-3.5 object-contain hidden" alt="" />
                      <Info size={14} />
                      <span>{expandedAlertId === rem.id ? "REDUCIR VISTA" : "VER DATOS Y BITÁCORA"}</span>
                    </button>
                    
                    {!isAdmin && rem.isChatNotification ? (
                      <button 
                        onClick={() => {
                          if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
                          dismissReminder(rem.id);
                          const b = archivedBudgets.find(x => x.id === rem.budgetId);
                          if (b) {
                            setSelectedReceipt(b);
                            setView('comprobante_detalle');
                          }
                        }} 
                        className="w-full py-5 bg-[#FFCD00] text-black rounded-2xl text-[10px] font-black uppercase italic tracking-widest shadow-[0_10px_20px_rgba(255,205,0,0.2)]"
                      >
                        VER CHAT Y RESPONDER
                      </button>
                    ) : (
                      <button onClick={() => { 
                        if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
                        dismissReminder(rem.id);
                        if (isAdmin) {
                          setSelectedBudget(budget); 
                          setView('budget_details'); 
                        } else {
                          const b = archivedBudgets.find(x => x.id === rem.budgetId);
                          if (b) {
                            setSelectedReceipt(b);
                            setView('comprobante_detalle');
                          }
                        }
                      }} className="w-full py-5 bg-[#FFCD00] text-black rounded-2xl text-[10px] font-black uppercase italic tracking-widest shadow-[0_10px_20px_rgba(255,205,0,0.2)]">
                        {isAdmin ? "IR AL EXPEDIENTE" : "VER EXPEDIENTE"}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            }).slice(0, 1)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL DE PREVISUALIZACIÓN DE IMÁGENES Y VIDEOS */}
      <AnimatePresence>
        {activeMediaPreview && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[250] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-between p-6 select-none"
          >
            {/* Header de la previsualización */}
            <div className="w-full flex items-center justify-between max-w-lg mt-2">
              <span className="text-[10px] font-black uppercase italic tracking-[0.25em] text-[#FFCD00]">
                VISTA PREVIA DEL ARCHIVO
              </span>
              <button 
                onClick={() => setActiveMediaPreview(null)}
                className="p-3 bg-zinc-900 border border-white/10 hover:border-red-500/50 text-white rounded-full transition-all active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            {/* Contenedor del Media (Imagen o Video) */}
            <div className="flex-1 w-full max-w-lg flex items-center justify-center my-6 overflow-hidden">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full h-full max-h-[70vh] flex items-center justify-center bg-zinc-950/40 rounded-[2.5rem] border border-white/5 p-3 relative overflow-hidden"
              >
                {activeMediaPreview.type === 'image' ? (
                  <img 
                    src={activeMediaPreview.url} 
                    alt="Previsualización" 
                    className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <video 
                    src={activeMediaPreview.url} 
                    controls 
                    autoPlay
                    className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl bg-black"
                  />
                )}
              </motion.div>
            </div>

            {/* Footer con el Botón Volver al Panel */}
            <div className="w-full max-w-lg mb-4 flex flex-col gap-3">
              <button 
                onClick={() => setActiveMediaPreview(null)}
                className="w-full py-4 bg-[#FFCD00] text-black rounded-2xl text-[10px] font-black uppercase italic tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <ArrowLeft size={14} />
                VOLVER AL PANEL
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ESTACIÓN DE DISEÑO Y PRESUPUESTACIÓN DE CONSTRUACHA */}
      <AnimatePresence>
        {showDesignStudio && selectedBudget && createPortal(
          <BudgetDesignStudio 
            budget={archivedBudgets.find(b => b.id === selectedBudget.id) || selectedBudget} 
            onClose={() => setShowDesignStudio(false)} 
            onSaveSuccess={(updatedBudget) => {
              setSelectedBudget(updatedBudget);
              setArchivedBudgets(prev => prev.map(b => b.id === updatedBudget.id ? updatedBudget : b));
            }}
          />,
          document.body
        )}
      </AnimatePresence>

      {/* BOTÓN FLOTANTE DE SOPORTE CHAT DIRECTO (PARA CLIENTES REGISTRADOS Y ADMINISTRADORES) */}
      {(view === 'home' && ((!isAdmin && user && !user.isAnonymous && appSettings.allowSupportChat !== false) || isAdmin)) && (() => {
        const directChatId = !isAdmin ? getDirectChatId(user, null, false) : '';
        const hasUnread = !isAdmin 
          ? clientDirectChatNotifications.length > 0
          : adminChatNotifications.length > 0;
        
        const unreadCount = !isAdmin 
          ? clientDirectChatNotifications.length
          : adminChatNotifications.length;

        return (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-md h-0 pointer-events-none z-[100]">
            <div className="relative w-full h-full">
              <div 
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{
                  transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
                  touchAction: 'none'
                }}
                className="absolute bottom-0 right-6 z-[100] flex flex-col items-end gap-2 animate-in fade-in duration-500 select-none cursor-grab active:cursor-grabbing pointer-events-auto"
              >
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => {
                    if (draggedDistance > 10) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    if (isAdmin) {
                      // Admin click logic
                      if (adminChatNotifications.length === 1) {
                        const notif = adminChatNotifications[0];
                        const isDirect = notif.budgetId && notif.budgetId.startsWith('direct_');
                        
                        if (isDirect) {
                          const matchingUser = appUsers.find(u => isNotificationForUser(notif, u, archivedBudgets));
                          if (matchingUser) {
                            const targetNotifs = adminChatNotifications.filter(n => isNotificationForUser(n, matchingUser, archivedBudgets));
                            targetNotifs.forEach(n => dismissReminder(n.id));
                            setSelectedDirectChatUser(matchingUser);
                            setShowDirectChatModal(true);
                          } else {
                            setShowUsersHistoryModal(true);
                          }
                        } else {
                          // Budget bitácora chat! Open it directly
                          const targetBudget = archivedBudgets.find(b => b.id === notif.budgetId);
                          if (targetBudget) {
                            const targetNotifs = adminChatNotifications.filter(n => n.budgetId === targetBudget.id);
                            targetNotifs.forEach(n => dismissReminder(n.id));
                            setSelectedReceipt(targetBudget);
                            setView('comprobante_validacion');
                          } else {
                            setShowUsersHistoryModal(true);
                          }
                        }
                      } else {
                        // Open users history list so admin can see and choose
                        setShowUsersHistoryModal(true);
                      }
                    } else {
                      // Client click logic
                      clientDirectChatNotifications.forEach(n => dismissReminder(n.id));
                      setSelectedDirectChatUser({ id: 'admin', name: 'CONSTRUACHA' });
                      setShowDirectChatModal(true);
                    }
                  }}
                  className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center border-2 active:scale-95 transition-all relative cursor-pointer backdrop-blur-md",
                    hasUnread 
                      ? "bg-red-600/40 text-white border-red-500/50 shadow-[0_8px_32px_rgba(220,38,38,0.3)] animate-pulse" 
                      : "bg-[#FFCD00]/45 text-[#FFCD00] border-[#FFCD00]/50 shadow-[0_8px_32px_rgba(255,205,0,0.2)] hover:bg-[#FFCD00]/60 hover:text-black hover:border-black"
                  )}
                >
                  <MessageSquare size={24} />
                  {hasUnread && (
                    <span className="absolute -top-1 -right-1 bg-white text-red-600 text-[8.5px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-red-600 shadow-md pointer-events-none">
                      {unreadCount}
                    </span>
                  )}
                </motion.button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL DE CHAT SOPORTE DIRECTO */}
      <AnimatePresence>
        {showDirectChatModal && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[600] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center sm:p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.95, y: 20 }}
              className="w-full h-full sm:h-auto sm:max-w-[380px] sm:max-h-[85vh] bg-zinc-950 sm:border sm:border-[#FFCD00]/40 sm:rounded-[2.5rem] rounded-none p-4 sm:p-6 relative shadow-[0_40px_120px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden"
            >
              {/* CABECERA COMPACTA INTELIGENTE (LIBERA ESPACIO VISUAL CRÍTICO EN MÓVILES) */}
              <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3 shrink-0">
                <div className="flex flex-col">
                  <h2 className="text-xs sm:text-sm font-black italic uppercase text-[#FFCD00] tracking-tighter leading-none">
                    {isAdmin ? "SOPORTE DIRECTO ADMIN" : "SOPORTE CONSTRUACHA"}
                  </h2>
                  <p className="text-[6.5px] sm:text-[7.5px] font-bold text-zinc-500 uppercase tracking-[0.1em] mt-1.5 italic">
                    {isAdmin 
                      ? `CON: ${selectedDirectChatUser?.name || 'CLIENTE'}` 
                      : "CHAT EN TIEMPO REAL"
                    }
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setShowDirectChatModal(false);
                    setEditingMessageId(null);
                    setEditingMessageText('');
                    setSelectedMessageOptions(null);
                  }} 
                  className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full text-white/60 active:scale-90 transition-transform"
                >
                  <X size={16} />
                </button>
              </div>

              {/* CONTROLES EXCLUSIVOS DEL ADMINISTRADOR: VACIAR CHAT */}
              {isAdmin && (
                <div className="mb-2.5 shrink-0 flex justify-end">
                  <button
                    onClick={() => {
                      setCustomConfirm({
                        isOpen: true,
                        title: "VACIAR HISTORIAL DEL CHAT",
                        message: "¿CONFIRMAS QUE DESEAS ELIMINAR TODO EL HISTORIAL DE ESTE CHAT? ESTA ACCIÓN ES TOTALMENTE IRREVERSIBLE.",
                        onConfirm: async () => {
                          await clearDirectChatHistory(getDirectChatId(user, selectedDirectChatUser, isAdmin), selectedDirectChatUser);
                        }
                      });
                    }}
                    className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-500/30 text-[6.5px] font-black uppercase tracking-widest rounded-lg transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={8} />
                    VACIAR HISTORIAL
                  </button>
                </div>
              )}

              {/* AREA DE MENSAJES (USA flex-1 min-h-0 PARA ENCOGERSE AUTOMÁTICAMENTE AL DESPLEGAR EL TECLADO) */}
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 mb-3 flex flex-col scrollbar-thin">
                {directChatMessages.length === 0 ? (
                  <div className="my-auto text-center py-10">
                    <MessageSquare size={32} className="text-[#FFCD00]/25 mx-auto mb-2 animate-pulse" />
                    <p className="text-[8.5px] font-black uppercase text-zinc-500 tracking-widest leading-normal">
                      SIN MENSAJES PREVIOS
                    </p>
                    <p className="text-[7px] font-bold text-zinc-600 uppercase tracking-wider mt-1 px-4 leading-normal">
                      {isAdmin 
                        ? "ESCRIBE UN MENSAJE DIRECTO PARA PROMOCIONAR O INCENTIVAR A TU CLIENTE." 
                        : "ESCRIBE TU CONSULTA Y NUESTRO EQUIPO TE RESPONDERÁ DE INMEDIATO."
                      }
                    </p>
                  </div>
                ) : (
                  directChatMessages.map((msg) => {
                    const isMsgFromAdmin = msg.sender === 'admin';
                    // El admin puede editar/borrar cualquier mensaje. El cliente puede editar/borrar solo los suyos.
                    const canEditOrDelete = isAdmin || (!isAdmin && !isMsgFromAdmin);
                    
                    let timeStr = "";
                    try {
                      let d = new Date();
                      if (msg.timestamp) {
                        if (msg.timestamp.seconds) {
                          d = new Date(msg.timestamp.seconds * 1000);
                        } else if (typeof msg.timestamp.toDate === 'function') {
                          d = msg.timestamp.toDate();
                        } else {
                          d = new Date(msg.timestamp);
                        }
                      }
                      timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                    } catch (err) {
                      timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                    }

                    return (
                      <div 
                        key={msg.id} 
                        onClick={() => {
                          // Al tocar el mensaje, se abre el modal inferior de opciones (fácil acceso táctil en móviles)
                          if (canEditOrDelete) {
                            setSelectedMessageOptions(msg);
                          }
                        }}
                        className={cn(
                          "max-w-[85%] rounded-2xl p-3 text-[10px] font-bold uppercase tracking-wider leading-relaxed flex flex-col gap-1 shadow-md relative cursor-pointer select-none transition-all active:brightness-95",
                          isMsgFromAdmin 
                            ? "bg-zinc-900 border border-[#FFCD00]/20 text-[#FFCD00] self-start rounded-tl-sm" 
                            : "bg-[#FFCD00] text-black self-end rounded-tr-sm"
                        )}
                        title={canEditOrDelete ? "Toca para editar o eliminar" : undefined}
                      >
                        {/* Remitente */}
                        <div className="flex items-center justify-between gap-4 pointer-events-none">
                          <span className="text-[6px] opacity-60 font-black tracking-wider uppercase">
                            {isMsgFromAdmin ? "CONSTRUACHA (ADMIN)" : "CLIENTE"}
                          </span>
                          {msg.isEdited && (
                            <span className="text-[5.5px] opacity-40 font-black uppercase italic tracking-widest">
                              (EDITADO)
                            </span>
                          )}
                        </div>

                        {/* Texto del mensaje */}
                        {editingMessageId === msg.id ? (
                          <div className="mt-1.5 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <textarea
                              value={editingMessageText}
                              onChange={(e) => setEditingMessageText(e.target.value)}
                              className="w-full p-2 bg-black text-white text-[9px] font-bold border border-[#FFCD00]/40 rounded-lg focus:outline-none focus:border-[#FFCD00] resize-none uppercase"
                              rows={2}
                            />
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => {
                                  setEditingMessageId(null);
                                  setEditingMessageText('');
                                }}
                                className="px-2 py-1 bg-zinc-800 text-white text-[6.5px] font-black uppercase rounded-md active:scale-95 transition-all"
                              >
                                CANCELAR
                              </button>
                              <button
                                onClick={() => editDirectChatMessage(msg.id, editingMessageText)}
                                className="px-2 py-1 bg-[#FFCD00] text-black text-[6.5px] font-black uppercase rounded-md active:scale-95 transition-all"
                              >
                                GUARDAR
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[9.5px] whitespace-pre-wrap break-words leading-snug pointer-events-none">{msg.text}</p>
                        )}

                        {/* timestamp */}
                        <div className="text-[5.5px] opacity-50 text-right mt-1 font-black uppercase tracking-widest pointer-events-none flex items-center justify-end gap-1.5">
                          <span>{timeStr}</span>
                          {isAdmin && isMsgFromAdmin && (
                            <span className="flex items-center">
                              {msg.read ? (
                                <span className="text-sky-400 flex" title="Leído">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="w-2.5 h-2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7M10 17l4 4L22 9" />
                                  </svg>
                                </span>
                              ) : msg.received ? (
                                <span className="text-zinc-400 flex" title="Entregado">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="w-2.5 h-2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7M10 17l4 4L22 9" />
                                  </svg>
                                </span>
                              ) : (
                                <span className="text-zinc-600 flex" title="Enviado">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="w-2.5 h-2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={directChatEndRef} />
              </div>

              {/* INPUT FORMULARIO */}
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!directChatInputText.trim()) return;
                  await sendDirectChatMessage(directChatInputText);
                  setDirectChatInputText('');
                }} 
                className="shrink-0 space-y-2.5 mt-auto"
              >
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={directChatInputText}
                    onChange={(e) => setDirectChatInputText(e.target.value)}
                    placeholder={isAdmin ? "ESCRIBE MENSAJE O PROMOCIÓN..." : "ESCRIBE TU PREGUNTA AQUÍ..."} 
                    className="flex-1 bg-black/70 border border-white/10 rounded-xl px-3 py-2.5 text-[9.5px] font-bold uppercase italic text-white placeholder-zinc-500 focus:outline-none focus:border-[#FFCD00]/50 transition-all"
                  />
                  <button 
                    type="submit" 
                    className="p-2.5 bg-[#FFCD00] text-black rounded-xl active:scale-95 transition-all shadow-lg flex items-center justify-center shrink-0 hover:bg-yellow-400 cursor-pointer"
                  >
                    <Send size={12} />
                  </button>
                </div>

                <button 
                  type="button"
                  onClick={() => {
                    setShowDirectChatModal(false);
                    setEditingMessageId(null);
                    setEditingMessageText('');
                    setSelectedMessageOptions(null);
                  }}
                  className="hidden sm:flex w-full py-3 bg-[#FFCD00] hover:bg-yellow-400 text-black rounded-xl text-[10px] font-black uppercase italic tracking-widest items-center justify-center gap-2 active:scale-95 transition-all shadow-lg cursor-pointer"
                >
                  <ArrowLeft size={12} />
                  VOLVER AL PANEL
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MENÚ DE ACCIONES / HOJA DE OPCIONES INFERIOR TÁCTIL (COMO WHATSAPP/TELEGRAM) */}
      <AnimatePresence>
        {selectedMessageOptions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedMessageOptions(null)}
            className="fixed inset-0 z-[700] bg-black/80 backdrop-blur-sm flex items-end justify-center p-4"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[360px] bg-zinc-950 border border-[#FFCD00]/30 rounded-t-[2rem] p-5 shadow-[0_-20px_50px_rgba(0,0,0,0.8)] flex flex-col gap-3.5"
            >
              <div className="w-10 h-1 bg-zinc-800 rounded-full mx-auto mb-1" />
              
              <div className="text-center space-y-1">
                <p className="text-[7.5px] font-black uppercase text-zinc-500 tracking-widest italic">MENSAJE SELECCIONADO</p>
                <p className="text-[9px] font-bold text-white uppercase italic max-h-[44px] overflow-hidden text-ellipsis line-clamp-2 leading-relaxed bg-white/5 rounded-lg p-2 border border-white/5">
                  "{selectedMessageOptions.text}"
                </p>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <button
                  onClick={() => {
                    setEditingMessageId(selectedMessageOptions.id);
                    setEditingMessageText(selectedMessageOptions.text);
                    setSelectedMessageOptions(null);
                  }}
                  className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-[#FFCD00] text-[9px] font-black uppercase tracking-wider rounded-xl border border-[#FFCD00]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Edit size={12} />
                  EDITAR MENSAJE
                </button>
                <button
                  onClick={() => {
                    const msgId = selectedMessageOptions.id;
                    setSelectedMessageOptions(null);
                    setCustomConfirm({
                      isOpen: true,
                      title: "ELIMINAR MENSAJE",
                      message: "¿CONFIRMAS QUE DESEAS ELIMINAR ESTE MENSAJE DEL CHAT?",
                      onConfirm: async () => {
                        await deleteDirectChatMessage(msgId);
                      }
                    });
                  }}
                  className="w-full py-3 bg-red-950/40 hover:bg-red-950 text-red-500 text-[9px] font-black uppercase tracking-wider rounded-xl border border-red-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 size={12} />
                  ELIMINAR MENSAJE
                </button>
                <button
                  onClick={() => setSelectedMessageOptions(null)}
                  className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-[9px] font-black uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all mt-1"
                >
                  CANCELAR
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL DE ACCIONES DE COMENTARIO PARA EL ADMINISTRADOR */}
      <AnimatePresence>
        {isAdmin && selectedCommentForAction && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-md flex items-end justify-center p-4"
            onClick={() => setSelectedCommentForAction(null)}
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="w-full max-w-md bg-[#0A0A0A] border-2 border-[#FFCD00]/25 rounded-t-[2.5rem] p-6 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-zinc-800 rounded-full mx-auto mb-1" />

              <div className="text-center space-y-2 border-b border-white/5 pb-4">
                <h3 className="text-xs font-black uppercase text-[#FFCD00] tracking-widest italic">MODERACIÓN DE COMENTARIO</h3>
                <p className="text-[7.5px] font-black uppercase tracking-widest text-white/40">Cliente: {selectedCommentForAction.userName || 'Anónimo'}</p>
                <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                  <p className="text-[10px] font-bold text-white/85 italic uppercase tracking-wider leading-relaxed">
                    "{selectedCommentForAction.content}"
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button 
                  onClick={async () => {
                    const cid = selectedCommentForAction.id;
                    const approved = selectedCommentForAction.approved;
                    setSelectedCommentForAction(null);
                    await toggleCommentApproval(cid, approved);
                  }}
                  className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/5 text-[9px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                >
                  {selectedCommentForAction.approved ? "⚠️ RESTRINGIR COMENTARIO" : "✅ VALIDAR COMENTARIO"}
                </button>

                <button 
                  onClick={async () => {
                    const cid = selectedCommentForAction.id;
                    setSelectedCommentForAction(null);
                    await deleteComment(cid, true);
                  }}
                  className="w-full py-3 bg-red-950/40 hover:bg-red-900/40 text-red-500 border border-red-500/20 text-[9px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Trash size={12} />
                  ELIMINAR COMENTARIO
                </button>

                {selectedCommentForAction.userId && selectedCommentForAction.userId !== 'anonymous' && (
                  <button 
                    onClick={async () => {
                      const uid = selectedCommentForAction.userId;
                      setSelectedCommentForAction(null);
                      await blockCommenter(uid);
                    }}
                    className="w-full py-3 bg-red-600/20 hover:bg-red-600/30 text-red-500 border border-red-600/30 text-[9px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    🚫 BLOQUEAR CLIENTE EN COMENTARIOS
                  </button>
                )}

                <button 
                  onClick={() => setSelectedCommentForAction(null)}
                  className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-[9px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] cursor-pointer text-center"
                >
                  CANCELAR
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DIÁLOGO DE CONFIRMACIÓN PERSONALIZADO (CONSTRUACHA DESIGN) */}
      <AnimatePresence>
        {customConfirm?.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[3000] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => setCustomConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="w-full max-w-[340px] bg-zinc-950 border-2 border-[#FFCD00]/30 rounded-[2.5rem] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.9)] space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Encabezado */}
              <div className="text-center space-y-1">
                <p className="text-[7.5px] font-black uppercase text-[#FFCD00] tracking-[0.25em] italic">CONSTRUACHA - ACCIÓN CRÍTICA</p>
                <h3 className="text-sm font-black uppercase text-white leading-tight tracking-tight italic">
                  {customConfirm.title}
                </h3>
              </div>

              {/* Mensaje */}
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-center">
                <p className="text-[9.5px] font-bold text-zinc-300 uppercase leading-relaxed italic tracking-wide">
                  {customConfirm.message}
                </p>
              </div>

              {/* Botones */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  onClick={() => setCustomConfirm(null)}
                  className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-white/60 text-[8.5px] font-black uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all cursor-pointer"
                >
                  CANCELAR
                </button>
                <button
                  onClick={() => {
                    try {
                      customConfirm.onConfirm();
                    } catch (e) {
                      console.error(e);
                    }
                    setCustomConfirm(null);
                  }}
                  className="w-full py-3 bg-[#FFCD00] hover:bg-yellow-400 text-black text-[8.5px] font-black uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all cursor-pointer shadow-[0_4px_12px_rgba(255,205,0,0.2)]"
                >
                  CONFIRMAR
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
};

export default App;
