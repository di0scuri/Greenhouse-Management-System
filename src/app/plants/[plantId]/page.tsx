'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { doc, getDoc, collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { ref, get } from "firebase/database";
import { firestore, auth, database } from '@/app/lib/firebase/config';
import { useAuthState } from 'react-firebase-hooks/auth';

import emailjs from '@emailjs/browser';

import Sidebar from '@/components/Sidebar';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
    Loader2, AlertTriangle, Leaf, ImageOff, Thermometer, Droplets, TestTube2, Zap, Menu, X, Clock,
    ListChecks, History, DollarSign, ShoppingCart, Settings, PlusCircle, Package, FileText, BarChart3, Lightbulb, Check, AlertCircle, Activity, Info, FlaskConical, MailWarning // Added MailWarning
} from 'lucide-react';
import Link from 'next/link';

interface PlantDetails {
  id: string;
  name: string;
  type: string;
  imageUrl?: string | null;
  datePlanted: Date;
  status: string;
  locationZone?: string;
  ownerUid: string;
  seedId?: string;
  initialSeedQuantity?: number;
}

interface SensorReading {
  id: string;
  timestamp: Date;
  temperature?: number;
  humidity?: number;
  ph?: number;
  ec?: number;
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
}

interface PlantEvent {
  id: string;
  timestamp: Date;
  createdAt: Date;
  type: string;
  message: string;
  plantId: string;
  status?: string;
  userId: string;
}

interface InventoryLogEntry {
  id: string;
  itemId: string;
  itemName: string;
  timestamp: Date;
  type: 'Purchase' | 'Seed Planted' | 'Fertilizer Used' | 'Material Used' | 'Sale' | 'Adjustment' | 'Initial Stock';
  quantityChange: number;
  costOrValuePerUnit: number;
  totalCostOrValue: number;
  notes?: string;
  userId?: string;
  plantId?: string; 
}

interface StageRequirements {
    name: string;
    startDay: number;
    description?: string;
    // Environmental Thresholds
    minTempC?: number;
    maxTempC?: number;
    minHumidityPercent?: number;
    maxHumidityPercent?: number;
    minPH?: number;
    maxPH?: number;
    minEC_mS_cm?: number;
    maxEC_mS_cm?: number;
  
    lowN_threshold?: number;
    highN_threshold?: number;
    lowP_threshold?: number;
    highP_threshold?: number;
    lowK_threshold?: number;
    highK_threshold?: number;
    targetN_ppm?: number;
    targetP_ppm?: number;
    targetK_ppm?: number;
}

interface PlantLifecycle {
  name: string;
  fertilizeDays: number[];
  maturityDays: number;
  harvestDays: number;
  spacingCm: number;
  stages: StageRequirements[];
}

interface UserSettings {
    defaultProfitMargin?: number;
}

 interface FertilizerItem {
    id: string;
    name: string;
    stock: number;
    unit: string;
    n_percentage?: number; 
    p_percentage?: number;
    k_percentage?: number;
}


// --- Helper Functions ---
const formatCurrency = (value: number, forceZeroDisplay = false): string => {
    if (value === 0 && !forceZeroDisplay) return '-';
    if (isNaN(value) || !isFinite(value)) return 'N/A';
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
};

const formatDate = (date: Date | null | undefined): string => {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-CA') + ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
 };

const getLogTypeStyle = (type: InventoryLogEntry['type']) => {
    switch (type) {
      case 'Purchase': return { Icon: ShoppingCart, color: 'text-blue-600', bgColor: 'bg-blue-100' };
      case 'Seed Planted': return { Icon: Leaf, color: 'text-green-700', bgColor: 'bg-green-100' };
      case 'Fertilizer Used': return { Icon: Droplets, color: 'text-sky-600', bgColor: 'bg-sky-100' };
      case 'Material Used': return { Icon: Package, color: 'text-orange-600', bgColor: 'bg-orange-100' };
      case 'Sale': return { Icon: DollarSign, color: 'text-emerald-600', bgColor: 'bg-emerald-100' };
      case 'Adjustment': return { Icon: Settings, color: 'text-purple-600', bgColor: 'bg-purple-100' };
      case 'Initial Stock': return { Icon: PlusCircle, color: 'text-teal-600', bgColor: 'bg-teal-100' };
      default: return { Icon: FileText, color: 'text-gray-600', bgColor: 'bg-gray-100' };
    }
};

type RequirementStatus = 'Optimal' | 'Low' | 'High' | 'N/A' | 'OK (>= Min)' | 'OK (<= Max)';
interface StatusResult { status: RequirementStatus; color: string; }

const checkThreshold = (currentValue?: number, minThreshold?: number, maxThreshold?: number): StatusResult => {
    if (currentValue === undefined || currentValue === null || isNaN(currentValue)) return { status: 'N/A', color: 'text-gray-500' };
    const minIsValid = typeof minThreshold === 'number' && !isNaN(minThreshold);
    const maxIsValid = typeof maxThreshold === 'number' && !isNaN(maxThreshold);
    if (minIsValid && currentValue < minThreshold) return { status: 'Low', color: 'text-orange-600' };
    if (maxIsValid && currentValue > maxThreshold) return { status: 'High', color: 'text-red-600' };
    if (minIsValid && maxIsValid && currentValue >= minThreshold && currentValue <= maxThreshold) return { status: 'Optimal', color: 'text-green-600' };
    if (minIsValid && !maxIsValid && currentValue >= minThreshold) return { status: 'OK (>= Min)', color: 'text-gray-700'};
    if (maxIsValid && !minIsValid && currentValue <= maxThreshold) return { status: 'OK (<= Max)', color: 'text-gray-700'};
    return { status: 'N/A', color: 'text-gray-500' };
};

const getNpkStatus = (currentValue?: number, lowThreshold?: number, highThreshold?: number): StatusResult => {
    return checkThreshold(currentValue, lowThreshold, highThreshold);
};

type NotificationCooldown = {
    [key in 'tempLow' | 'tempHigh' | 'humidityLow' | 'humidityHigh' | 'phLow' | 'phHigh' | 'ecLow' | 'ecHigh' | 'nLow' | 'nHigh' | 'pLow' | 'pHigh' | 'kLow' | 'kHigh']?: number; // Store timestamp
};
const COOLDOWN_PERIOD_MS = 6 * 60 * 60 * 1000;

export default function PlantDetailPage() {
  const [user, loadingAuth, errorAuth] = useAuthState(auth);
  const router = useRouter();
  const params = useParams();
  const plantId = typeof params?.plantId === 'string' ? params.plantId : Array.isArray(params?.plantId) ? params.plantId[0] : null;

  const [plantDetails, setPlantDetails] = useState<PlantDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState<boolean>(false);
  const [sensorHistory, setSensorHistory] = useState<SensorReading[]>([]);
  const [isSensorHistoryLoading, setIsSensorHistoryLoading] = useState<boolean>(true);
  const [sensorHistoryError, setSensorHistoryError] = useState<string | null>(null);
  const [plantEvents, setPlantEvents] = useState<PlantEvent[]>([]);
  const [isPlantEventsLoading, setIsPlantEventsLoading] = useState<boolean>(true);
  const [plantEventsError, setPlantEventsError] = useState<string | null>(null);
  const [costLogs, setCostLogs] = useState<InventoryLogEntry[]>([]);
  const [isCostLoading, setIsCostLoading] = useState<boolean>(true);
  const [costError, setCostError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [plantLifecycleData, setPlantLifecycleData] = useState<PlantLifecycle | null>(null);
  const [isLifecycleLoading, setIsLifecycleLoading] = useState<boolean>(true);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings>({});
  const [isSettingsLoading, setIsSettingsLoading] = useState<boolean>(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [currentStageRequirements, setCurrentStageRequirements] = useState<StageRequirements | null>(null);
  type DetailTab = 'Status' | 'Events' | 'Costs' | 'Sensors';
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('Status');
  const notificationCooldowns = useRef<NotificationCooldown>({});
  const [emailError, setEmailError] = useState<string | null>(null);
  const [availableFertilizers, setAvailableFertilizers] = useState<FertilizerItem[]>([]);
  const [isFertilizersLoading, setIsFertilizersLoading] = useState<boolean>(true);
  const [fertilizersError, setFertilizersError] = useState<string | null>(null);


  useEffect(() => { if (!loadingAuth && !user) router.push('/login'); }, [user, loadingAuth, router]);

  useEffect(() => {
    if (!loadingAuth && user && firestore && database && plantId) {
      const fetchPlantAndImage = async () => {
          setIsLoading(true); setIsImageLoading(true); setError(null); setImageData(null);
          try {
              const plantDocRef = doc(firestore, 'plants', plantId);
              const plantDocSnap = await getDoc(plantDocRef);
              if (!plantDocSnap.exists()) { throw new Error("Plant not found."); }
              const data = plantDocSnap.data();
              if (data.ownerUid !== user.uid) { throw new Error("Permission denied."); }
              const fetchedPlantDetails: PlantDetails = { id: plantDocSnap.id, name: data.name || 'N/A', type: data.type || 'N/A', imageUrl: data.imageUrl || null, datePlanted: data.datePlanted instanceof Timestamp ? data.datePlanted.toDate() : new Date(), status: data.status || 'N/A', locationZone: data.locationZone, ownerUid: data.ownerUid, seedId: data.seedId, initialSeedQuantity: data.initialSeedQuantity };
              setPlantDetails(fetchedPlantDetails);
              if (fetchedPlantDetails.imageUrl && fetchedPlantDetails.imageUrl.startsWith('plantImages/')) {
                  const imageRefRTDB = ref(database, fetchedPlantDetails.imageUrl);
                  const imageSnapshot = await get(imageRefRTDB);
                  if (imageSnapshot.exists()) { const base64Data = imageSnapshot.val(); if (typeof base64Data === 'string' && base64Data.startsWith('data:image/')) { setImageData(base64Data); } else { console.warn("Invalid image format"); } } else { console.warn("Image not found in RTDB"); }
              }
          } catch (err: any) { console.error("Fetch plant error:", err); setError(err.message); setPlantDetails(null); }
          finally { setIsLoading(false); setIsImageLoading(false); }
      };
      fetchPlantAndImage();
    } else if (!plantId && !loadingAuth) { setError("Plant ID missing."); setIsLoading(false); setIsImageLoading(false); }
      else if (!firestore || !database) { setError("DB service unavailable."); setIsLoading(false); setIsImageLoading(false); }
  }, [plantId, user, loadingAuth]);

  // Fetch Plant Lifecycle Data
  useEffect(() => {
      if (plantDetails?.type && firestore) {
          const fetchLifecycleData = async () => {
              setIsLifecycleLoading(true); setLifecycleError(null);
              const typeDocRef = doc(firestore, 'plantTypes', plantDetails.type);
              const defaultTypeDocRef = doc(firestore, 'plantTypes', 'Default');
              try {
                  let docSnap = await getDoc(typeDocRef);
                  if (!docSnap.exists()) { console.warn(`Lifecycle data not found for type: ${plantDetails.type}. Trying Default.`); docSnap = await getDoc(defaultTypeDocRef); }
                  if (docSnap.exists()) { setPlantLifecycleData(docSnap.data() as PlantLifecycle); }
                  else { setLifecycleError("Plant configuration not found."); setPlantLifecycleData(null); }
              } catch (err) { console.error("Fetch lifecycle error:", err); setLifecycleError("Failed to load config."); setPlantLifecycleData(null); }
              finally { setIsLifecycleLoading(false); }
          };
          fetchLifecycleData();
      } else if (plantDetails) { setIsLifecycleLoading(false); setLifecycleError("Plant type missing."); }
  }, [plantDetails]);

  // Fetch User Settings
  useEffect(() => {
      if (user && firestore) {
          const fetchUserSettings = async () => {
              setIsSettingsLoading(true); setSettingsError(null);
              const userDocRef = doc(firestore, 'users', user.uid);
              try {
                  const docSnap = await getDoc(userDocRef);
                  if (docSnap.exists()) { setUserSettings(docSnap.data() as UserSettings); }
                  else { setUserSettings({}); }
              } catch (err) { console.error("Fetch settings error:", err); setSettingsError("Failed to load settings."); }
              finally { setIsSettingsLoading(false); }
          };
          fetchUserSettings();
      } else { setIsSettingsLoading(false); }
  }, [user]);

  useEffect(() => {
      if (user && firestore && plantId) {
          const fetchSensorHistory = async () => {
              setIsSensorHistoryLoading(true); setSensorHistoryError(null); setSensorHistory([]);
              try {
                  const readingsCollectionRef = collection(firestore, 'sensorReadings');
                  const qReadings = query(readingsCollectionRef, where("plantId", "==", plantId), orderBy("timestamp", "desc"));
                  const readingsSnapshot = await getDocs(qReadings);
                  const fetchedReadings: SensorReading[] = [];
                  readingsSnapshot.forEach((doc) => {
                      const readingData = doc.data();
                      fetchedReadings.push({ id: doc.id, timestamp: readingData.timestamp instanceof Timestamp ? readingData.timestamp.toDate() : new Date(), temperature: typeof readingData.temperature === 'number' ? readingData.temperature : undefined, humidity: typeof readingData.humidity === 'number' ? readingData.humidity : undefined, ph: typeof readingData.ph === 'number' ? readingData.ph : undefined, ec: typeof readingData.ec === 'number' ? readingData.ec : undefined, nitrogen: typeof readingData.nitrogen === 'number' ? readingData.nitrogen : undefined, phosphorus: typeof readingData.phosphorus === 'number' ? readingData.phosphorus : undefined, potassium: typeof readingData.potassium === 'number' ? readingData.potassium : undefined });
                  });
                  setSensorHistory(fetchedReadings);
              } catch (err: any) { console.error("Fetch sensor error:", err); setSensorHistoryError("Failed to load sensor history."); }
              finally { setIsSensorHistoryLoading(false); }
          };
          fetchSensorHistory();
      } else { setIsSensorHistoryLoading(false); }
  }, [plantId, user]);

  useEffect(() => {
      if (user && firestore && plantId) {
          const fetchPlantEvents = async () => {
              setIsPlantEventsLoading(true); setPlantEventsError(null); setPlantEvents([]);
              try {
                  const eventsRef = collection(firestore, 'events');
                  const q = query( eventsRef, where("plantId", "==", plantId), where("userId", "==", user.uid), orderBy("timestamp", "desc") );
                  const querySnapshot = await getDocs(q);
                  const fetchedEvents: PlantEvent[] = [];
                  querySnapshot.forEach((doc) => {
                      const data = doc.data();
                      fetchedEvents.push({ id: doc.id, timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(), createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(), type: data.type || 'Unknown', message: data.message || 'No description', plantId: data.plantId, status: data.status, userId: data.userId });
                  });
                  setPlantEvents(fetchedEvents);
              } catch (err: any) { console.error("Fetch events error:", err); setPlantEventsError("Failed to load event history."); }
              finally { setIsPlantEventsLoading(false); }
          };
          fetchPlantEvents();
      } else { setIsPlantEventsLoading(false); }
  }, [plantId, user]);

  useEffect(() => {
    if (user && firestore && plantId) {
      const fetchCostLogs = async () => {
        setIsCostLoading(true); setCostError(null); setCostLogs([]);
        try {
          const logCollectionRef = collection(firestore, 'inventory_log');
          const costTypes: InventoryLogEntry['type'][] = ['Seed Planted', 'Fertilizer Used', 'Material Used', 'Purchase'];
          const saleType: InventoryLogEntry['type'] = 'Sale';
          const q = query( logCollectionRef, where("plantId", "==", plantId), where("userId", "==", user.uid), orderBy("timestamp", "desc") );
          const querySnapshot = await getDocs(q);
          const fetchedLogs: InventoryLogEntry[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            if ([...costTypes, saleType].includes(data.type)) {
                const quantityChange = Number(data.quantityChange) || 0;
                const costOrValuePerUnit = Number(data.costOrValuePerUnit) || 0;
                fetchedLogs.push({ id: doc.id, itemId: data.itemId || 'N/A', itemName: data.itemName || 'N/A', timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(), type: data.type as InventoryLogEntry['type'], quantityChange: quantityChange, costOrValuePerUnit: costOrValuePerUnit, totalCostOrValue: Math.abs(quantityChange) * costOrValuePerUnit, notes: data.notes || '', userId: data.userId, plantId: data.plantId });
            }
          });
          setCostLogs(fetchedLogs);
        } catch (err: any) { console.error("Fetch cost logs error:", err); setCostError("Failed to load cost history."); }
        finally { setIsCostLoading(false); }
      };
      fetchCostLogs();
    } else { setIsCostLoading(false); }
  }, [plantId, user]);

  useEffect(() => {
      if (plantDetails?.datePlanted && plantLifecycleData?.stages) {
          const today = new Date();
          const plantedDate = plantDetails.datePlanted instanceof Date ? plantDetails.datePlanted : new Date();
          const timeDiff = today.getTime() - plantedDate.getTime();
          const daysSincePlanted = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));
          let currentStage: StageRequirements | null = null;
          for (let i = plantLifecycleData.stages.length - 1; i >= 0; i--) {
              if (daysSincePlanted >= plantLifecycleData.stages[i].startDay) {
                  currentStage = plantLifecycleData.stages[i];
                  break;
              }
          }
          setCurrentStageRequirements(currentStage);
      } else { setCurrentStageRequirements(null); }
  }, [plantDetails, plantLifecycleData]);

  useEffect(() => {
      if (user && firestore) {
          const fetchFertilizers = async () => {
              setIsFertilizersLoading(true); setFertilizersError(null); setAvailableFertilizers([]);
              const inventoryRef = collection(firestore, 'inventory');
              const q = query(inventoryRef, where("category", "==", "fertilizers"), where("stock", ">", 0));
              try {
                  const querySnapshot = await getDocs(q);
                  const fetchedFertilizers: FertilizerItem[] = [];
                  querySnapshot.forEach((doc) => {
                      const data = doc.data();
                      fetchedFertilizers.push({
                          id: doc.id, name: data.name || 'Unnamed Fertilizer', stock: data.stock || 0, unit: data.unit || 'unit',
                          n_percentage: typeof data.n_percentage === 'number' ? data.n_percentage : undefined,
                          p_percentage: typeof data.p_percentage === 'number' ? data.p_percentage : undefined,
                          k_percentage: typeof data.k_percentage === 'number' ? data.k_percentage : undefined,
                      });
                  });
                  setAvailableFertilizers(fetchedFertilizers);
              } catch (error: any) { console.error("Error fetching fertilizers:", error); setFertilizersError("Failed to load available fertilizers."); }
              finally { setIsFertilizersLoading(false); }
          };
          fetchFertilizers();
      } else { setIsFertilizersLoading(false); setAvailableFertilizers([]); }
  }, [user]);


  const latestReading = useMemo(() => sensorHistory.length > 0 ? sensorHistory[0] : null, [sensorHistory]);
  const { totalCost, totalRevenue } = useMemo(() => {
      if (isCostLoading || costLogs.length === 0) return { totalCost: 0, totalRevenue: 0 };
      let cost = 0; let revenue = 0;
      const costTypes: InventoryLogEntry['type'][] = ['Seed Planted', 'Fertilizer Used', 'Material Used', 'Purchase'];
      costLogs.forEach(log => { if (costTypes.includes(log.type)) { cost += log.totalCostOrValue; } else if (log.type === 'Sale') { revenue += log.totalCostOrValue; } });
      return { totalCost: cost, totalRevenue: revenue };
  }, [costLogs, isCostLoading]);
  const suggestedPrice = useMemo(() => {
      if (isCostLoading || isSettingsLoading || totalCost <= 0) return null;
      const margin = userSettings.defaultProfitMargin ?? 0.20;
      return totalCost * (1 + margin);
  }, [totalCost, userSettings, isCostLoading, isSettingsLoading]);
  const environmentStatus = useMemo(() => {
      if (isSensorHistoryLoading || !latestReading || !currentStageRequirements) { return { temp: null, humidity: null, ph: null, ec: null }; }
      return {
          temp: checkThreshold(latestReading.temperature, currentStageRequirements.minTempC, currentStageRequirements.maxTempC),
          humidity: checkThreshold(latestReading.humidity, currentStageRequirements.minHumidityPercent, currentStageRequirements.maxHumidityPercent),
          ph: checkThreshold(latestReading.ph, currentStageRequirements.minPH, currentStageRequirements.maxPH),
          ec: checkThreshold(latestReading.ec, currentStageRequirements.minEC_mS_cm, currentStageRequirements.maxEC_mS_cm)
      };
  }, [latestReading, currentStageRequirements, isSensorHistoryLoading]);
  const npkStatus = useMemo(() => {
      if (isSensorHistoryLoading || !latestReading || !currentStageRequirements) { return { n: { status: 'N/A', color: 'text-gray-500' }, p: { status: 'N/A', color: 'text-gray-500' }, k: { status: 'N/A', color: 'text-gray-500' } }; }
      return {
          n: getNpkStatus(latestReading.nitrogen, currentStageRequirements.lowN_threshold, currentStageRequirements.highN_threshold),
          p: getNpkStatus(latestReading.phosphorus, currentStageRequirements.lowP_threshold, currentStageRequirements.highP_threshold),
          k: getNpkStatus(latestReading.potassium, currentStageRequirements.lowK_threshold, currentStageRequirements.highK_threshold),
      };
  }, [latestReading, currentStageRequirements, isSensorHistoryLoading]);

  // Fertilizer Recommendation Logic
  // TODO: Make a proper Prescriptive Model
  const fertilizerRecommendations = useMemo(() => {
      if (isFertilizersLoading || !npkStatus || !availableFertilizers || availableFertilizers.length === 0) return [];

      const recommendations: { name: string; reason: string; score: number }[] = [];
      const needsN = npkStatus.n.status === 'Low';
      const needsP = npkStatus.p.status === 'Low';
      const needsK = npkStatus.k.status === 'Low';
      const highN = npkStatus.n.status === 'High';
      const highP = npkStatus.p.status === 'High';
      const highK = npkStatus.k.status === 'High';

      if (!needsN && !needsP && !needsK) return [];

      availableFertilizers.forEach(fert => {
          const n = fert.n_percentage ?? 0;
          const p = fert.p_percentage ?? 0;
          const k = fert.k_percentage ?? 0;
          let suitabilityScore = 0;
          let reasons: string[] = [];
          let suitable = false; 
          if (needsN && n > 5) { suitabilityScore += n; reasons.push('Provides N'); suitable = true; }
          if (needsP && p > 5) { suitabilityScore += p; reasons.push('Provides P'); suitable = true; }
          if (needsK && k > 5) { suitabilityScore += k; reasons.push('Provides K'); suitable = true; }

          if (highN && n > 5) suitabilityScore -= 50;
          if (highP && p > 5) suitabilityScore -= 50;
          if (highK && k > 5) suitabilityScore -= 50;

          if (suitable && suitabilityScore > 0) {
              recommendations.push({ name: fert.name, reason: reasons.join(', '), score: suitabilityScore });
          }
      });

      recommendations.sort((a, b) => b.score - a.score);
      return recommendations.slice(0, 2);

  }, [npkStatus, availableFertilizers, isFertilizersLoading]);


  // --- Email Sending Function ---
  const sendEmailNotification = async (alertType: string, currentValue: string | number, thresholdValue: string | number) => {
      setEmailError(null);
      if (!user || !user.email || !plantDetails) { console.warn("Missing user/plant data for notification."); return; }
      const now = Date.now();
      const lastSent = notificationCooldowns.current[alertType as keyof NotificationCooldown];
      if (lastSent && (now - lastSent < COOLDOWN_PERIOD_MS)) { console.log(`Cooldown active for ${alertType}.`); return; }
      const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
      const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
      const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
      if (!serviceId || !templateId || !publicKey) { console.error("EmailJS credentials missing."); setEmailError("Email service not configured."); return; }
      const templateParams = { plant_name: plantDetails.name, alert_type: alertType, current_value: String(currentValue), threshold_value: String(thresholdValue), user_email: user.email, user_name: user.displayName || 'User', plant_link: `${window.location.origin}/plants/${plantId}` };
      console.log("Attempting notification:", templateParams);
      try {
          await emailjs.send(serviceId, templateId, templateParams, publicKey);
          console.log(`EmailJS sent for ${alertType}`);
          notificationCooldowns.current[alertType as keyof NotificationCooldown] = now;
      } catch (error) { console.error('EmailJS failed:', error); setEmailError(`Failed to send ${alertType} notification.`); }
  };

  useEffect(() => {
      if (!isSensorHistoryLoading && !isLifecycleLoading && latestReading && currentStageRequirements && user?.email) {
          console.log("Checking thresholds for notifications...");
          if (environmentStatus.temp?.status === 'Low') sendEmailNotification('Low Temperature', latestReading.temperature ?? 'N/A', currentStageRequirements.minTempC ?? 'N/A');
          if (environmentStatus.temp?.status === 'High') sendEmailNotification('High Temperature', latestReading.temperature ?? 'N/A', currentStageRequirements.maxTempC ?? 'N/A');
          if (environmentStatus.humidity?.status === 'Low') sendEmailNotification('Low Humidity', latestReading.humidity ?? 'N/A', currentStageRequirements.minHumidityPercent ?? 'N/A');
          if (environmentStatus.humidity?.status === 'High') sendEmailNotification('High Humidity', latestReading.humidity ?? 'N/A', currentStageRequirements.maxHumidityPercent ?? 'N/A');
          if (environmentStatus.ph?.status === 'Low') sendEmailNotification('Low pH', latestReading.ph ?? 'N/A', currentStageRequirements.minPH ?? 'N/A');
          if (environmentStatus.ph?.status === 'High') sendEmailNotification('High pH', latestReading.ph ?? 'N/A', currentStageRequirements.maxPH ?? 'N/A');
          if (environmentStatus.ec?.status === 'Low') sendEmailNotification('Low EC', latestReading.ec ?? 'N/A', currentStageRequirements.minEC_mS_cm ?? 'N/A');
          if (environmentStatus.ec?.status === 'High') sendEmailNotification('High EC', latestReading.ec ?? 'N/A', currentStageRequirements.maxEC_mS_cm ?? 'N/A');
          if (npkStatus.n.status === 'Low') sendEmailNotification('Low Nitrogen', latestReading.nitrogen ?? 'N/A', currentStageRequirements.lowN_threshold ?? 'N/A');
          if (npkStatus.n.status === 'High') sendEmailNotification('High Nitrogen', latestReading.nitrogen ?? 'N/A', currentStageRequirements.highN_threshold ?? 'N/A');
          if (npkStatus.p.status === 'Low') sendEmailNotification('Low Phosphorus', latestReading.phosphorus ?? 'N/A', currentStageRequirements.lowP_threshold ?? 'N/A');
          if (npkStatus.p.status === 'High') sendEmailNotification('High Phosphorus', latestReading.phosphorus ?? 'N/A', currentStageRequirements.highP_threshold ?? 'N/A');
          if (npkStatus.k.status === 'Low') sendEmailNotification('Low Potassium', latestReading.potassium ?? 'N/A', currentStageRequirements.lowK_threshold ?? 'N/A');
          if (npkStatus.k.status === 'High') sendEmailNotification('High Potassium', latestReading.potassium ?? 'N/A', currentStageRequirements.highK_threshold ?? 'N/A');
      }
  }, [latestReading, currentStageRequirements, isSensorHistoryLoading, isLifecycleLoading, user?.email, environmentStatus, npkStatus, sendEmailNotification]); // Added sendEmailNotification to dependencies


  const isPageLoading = loadingAuth || isLoading || isSettingsLoading || isLifecycleLoading || isFertilizersLoading;
  if (isPageLoading && !error && !plantDetails) { return <LoadingSpinner message={loadingAuth ? "Authenticating..." : isLoading ? "Loading Plant..." : isSettingsLoading ? "Loading Settings..." : isLifecycleLoading ? "Loading Config..." : "Loading Data..."} />; }
  if (!user && !loadingAuth) { return null; }
  if (error && !plantDetails && !isLoading) { return ( <div className="flex h-screen bg-gray-100"><Sidebar /><main className="flex-1 p-8 flex items-center justify-center text-center"><div className="text-red-600"><AlertTriangle className="h-12 w-12 mx-auto mb-4" /><h2 className="text-xl font-semibold mb-2">Error Loading Plant</h2><p>{error}</p><Link href="/dashboard" className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"> Go to Dashboard </Link></div></main></div> ); }
  if (!plantDetails && !isLoading) { return <LoadingSpinner message="Initializing..." />; }


  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm relative z-10 border-b">
           <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8"> <div className="flex justify-between items-center h-16"> <div className="flex items-center"> <h1 className="text-xl font-semibold text-gray-800 flex items-center"> <Leaf className="h-6 w-6 mr-2 text-green-600" /> Plant Details: {plantDetails?.name ?? 'Loading...'} </h1> </div> </div> </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {(error || lifecycleError || settingsError || sensorHistoryError || plantEventsError || costError || fertilizersError || emailError) && ( <div className="mb-4 text-sm text-red-700 bg-red-100 p-3 rounded-md border border-red-200" role="alert"> <AlertTriangle size={16} className="inline mr-1"/> {error || lifecycleError || settingsError || sensorHistoryError || plantEventsError || costError || fertilizersError || emailError} </div> )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Left Column: Image, Details, Cost Summary */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-lg shadow p-4"> <h2 className="text-lg font-semibold text-gray-700 mb-3">Image</h2> <div className="w-full aspect-square relative bg-gray-200 rounded flex items-center justify-center text-gray-400 overflow-hidden"> {isImageLoading ? ( <Loader2 size={40} className="animate-spin text-gray-500" /> ) : imageData ? ( <img src={imageData} alt={plantDetails?.name} className="absolute inset-0 w-full h-full object-cover" /> ) : ( <ImageOff size={48} /> )} </div> </div>
              <div className="bg-white rounded-lg shadow p-4"> <h2 className="text-lg font-semibold text-gray-700 mb-3">Details</h2> <dl className="space-y-2 text-sm"> <div className="flex justify-between"><dt className="text-gray-500">Name:</dt><dd className="text-gray-800 font-medium">{plantDetails?.name}</dd></div> <div className="flex justify-between"><dt className="text-gray-500">Type:</dt><dd className="text-gray-800">{plantDetails?.type}</dd></div> <div className="flex justify-between"><dt className="text-gray-500">Status:</dt><dd className="text-gray-800">{plantDetails?.status}</dd></div> <div className="flex justify-between"><dt className="text-gray-500">Date Planted:</dt><dd className="text-gray-800">{plantDetails?.datePlanted.toLocaleDateString()}</dd></div> {plantDetails?.locationZone && <div className="flex justify-between"><dt className="text-gray-500">Zone:</dt><dd className="text-gray-800">{plantDetails.locationZone}</dd></div>} {plantDetails?.seedId && <div className="flex justify-between"><dt className="text-gray-500">Seed Ref:</dt><dd className="text-gray-800 text-xs truncate" title={plantDetails.seedId}>{plantDetails.seedId}</dd></div>} {plantDetails?.initialSeedQuantity !== undefined && <div className="flex justify-between"><dt className="text-gray-500">Seeds Planted:</dt><dd className="text-gray-800">{plantDetails.initialSeedQuantity}</dd></div>} </dl> </div>
              <div className="bg-white rounded-lg shadow p-4"> <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center"> <BarChart3 size={18} className="mr-2 text-blue-600" /> Cost & Pricing </h2> {isCostLoading || isSettingsLoading ? ( <div className="flex items-center justify-center text-gray-500 py-4"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading financial data...</div> ) : costError || settingsError ? ( <div className="text-sm text-red-600 text-center py-4">{costError || settingsError}</div> ) : ( <dl className="space-y-2 text-sm"> <div className="flex justify-between"> <dt className="text-gray-500">Total Production Cost:</dt> <dd className="text-gray-800 font-medium">{formatCurrency(totalCost, true)}</dd> </div> {totalRevenue > 0 && ( <> <div className="flex justify-between"> <dt className="text-gray-500">Total Revenue (Sales):</dt> <dd className="text-green-600 font-medium">{formatCurrency(totalRevenue)}</dd> </div> <div className="flex justify-between border-t pt-2 mt-2"> <dt className="text-gray-500 font-semibold">Net Profit/Loss:</dt> <dd className={`font-bold ${totalRevenue - totalCost >= 0 ? 'text-green-700' : 'text-red-600'}`}> {formatCurrency(totalRevenue - totalCost)} </dd> </div> </> )} <div className="flex justify-between border-t pt-2 mt-2"> <dt className="text-gray-500">Suggested Sell Price:</dt> <dd className="text-blue-600 font-semibold">{suggestedPrice !== null ? formatCurrency(suggestedPrice) : 'N/A'}</dd> </div> <p className="text-xs text-gray-400 text-right">(Based on {((userSettings.defaultProfitMargin ?? 0.2) * 100).toFixed(0)}% margin)</p> </dl> )} </div>
            </div>

            {/* Right Column: Tabbed Content */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-lg shadow">
                  <div className="border-b border-gray-200"> <nav className="-mb-px flex space-x-8 px-6 overflow-x-auto" aria-label="Tabs"> <button onClick={() => setActiveDetailTab('Status')} className={`whitespace-nowrap flex items-center py-4 px-1 border-b-2 font-medium text-sm focus:outline-none ${activeDetailTab === 'Status' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`} > <Info size={16} className="mr-1.5" /> Status & Recs </button> <button onClick={() => setActiveDetailTab('Events')} className={`whitespace-nowrap flex items-center py-4 px-1 border-b-2 font-medium text-sm focus:outline-none ${activeDetailTab === 'Events' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`} > <History size={16} className="mr-1.5" /> Event History </button> <button onClick={() => setActiveDetailTab('Costs')} className={`whitespace-nowrap flex items-center py-4 px-1 border-b-2 font-medium text-sm focus:outline-none ${activeDetailTab === 'Costs' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`} > <DollarSign size={16} className="mr-1.5" /> Cost Log </button> <button onClick={() => setActiveDetailTab('Sensors')} className={`whitespace-nowrap flex items-center py-4 px-1 border-b-2 font-medium text-sm focus:outline-none ${activeDetailTab === 'Sensors' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`} > <Activity size={16} className="mr-1.5" /> Sensor History </button> </nav> </div>

                  <div className="p-6 min-h-[300px]">
                      {/* Status & Recommendations Tab */}
                      {activeDetailTab === 'Status' && (
                          <div className="space-y-6">
                              {/* Latest Sensor Readings */}
                              <div>
                                  <h3 className="text-md font-semibold text-gray-700 mb-3">Latest Sensor Readings</h3>
                                  {isSensorHistoryLoading ? <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin inline-block"/></div> : sensorHistoryError ? <p className="text-red-600 text-sm">{sensorHistoryError}</p> : latestReading ? (
                                      <>
                                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-3">
                                              <div className="p-2 rounded bg-orange-50"> <p className="text-xs text-orange-600 font-medium flex items-center justify-center"><Thermometer size={12} className="mr-1"/>Temp</p> <p className="text-xl font-bold text-orange-700">{latestReading.temperature?.toFixed(1) ?? 'N/A'}°C</p> </div>
                                              <div className="p-2 rounded bg-blue-50"> <p className="text-xs text-blue-600 font-medium flex items-center justify-center"><Droplets size={12} className="mr-1"/>Humidity</p> <p className="text-xl font-bold text-blue-700">{latestReading.humidity?.toFixed(0) ?? 'N/A'}%</p> </div>
                                              <div className="p-2 rounded bg-purple-50"> <p className="text-xs text-purple-600 font-medium flex items-center justify-center"><TestTube2 size={12} className="mr-1"/>pH</p> <p className="text-xl font-bold text-purple-700">{latestReading.ph?.toFixed(1) ?? 'N/A'}</p> </div>
                                              <div className="p-2 rounded bg-yellow-50"> <p className="text-xs text-yellow-600 font-medium flex items-center justify-center"><Zap size={12} className="mr-1"/>EC</p> <p className="text-xl font-bold text-yellow-700">{latestReading.ec?.toFixed(1) ?? 'N/A'}<span className="text-xs"> mS/cm</span></p> </div>
                                          </div>
                                          {(latestReading.nitrogen !== undefined || latestReading.phosphorus !== undefined || latestReading.potassium !== undefined) && (
                                              <div className="grid grid-cols-3 gap-4 text-center border-t pt-3 mt-3">
                                                  <div><p className="text-xs text-gray-500">N (ppm)</p><p className="text-lg font-bold text-green-600">{latestReading.nitrogen ?? '-'}</p></div>
                                                  <div><p className="text-xs text-gray-500">P (ppm)</p><p className="text-lg font-bold text-blue-600">{latestReading.phosphorus ?? '-'}</p></div>
                                                  <div><p className="text-xs text-gray-500">K (ppm)</p><p className="text-lg font-bold text-orange-500">{latestReading.potassium ?? '-'}</p></div>
                                              </div>
                                          )}
                                          <p className="col-span-full text-xs text-gray-400 text-right mt-2"> Reading taken: {formatDate(latestReading.timestamp)} </p>
                                      </>
                                  ) : <p className="text-sm text-gray-500 text-center py-4">No sensor readings available yet.</p>}
                              </div>
                              {/* Recommendations */}
                              <div>
                                  <h3 className="text-md font-semibold text-gray-700 mt-4 mb-3 pt-4 border-t">Recommendations & Status</h3>
                                   {isSensorHistoryLoading || isLifecycleLoading || isFertilizersLoading ? ( <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin inline-block"/></div> )
                                   : sensorHistoryError || lifecycleError || fertilizersError ? ( <p className="text-red-600 text-sm">{sensorHistoryError || lifecycleError || fertilizersError}</p> )
                                   : !latestReading ? ( <p className="text-sm text-gray-500">No sensor data available.</p> )
                                   : !currentStageRequirements ? ( <p className="text-sm text-gray-500">Plant stage or configuration missing.</p> )
                                   : (
                                       <div className="space-y-4">
                                           <p className="text-sm text-gray-600">Current Stage: <span className='font-medium text-gray-800'>{currentStageRequirements.name}</span> (Day {Math.max(0, Math.floor((new Date().getTime() - plantDetails.datePlanted.getTime()) / (1000 * 60 * 60 * 24)))}) </p>
                                           {/* Environment Status */}
                                           <div>
                                              <p className="text-sm font-medium text-gray-700 mb-1">Environment Status:</p>
                                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs">
                                                  {environmentStatus.temp && <div className={`p-1.5 rounded ${environmentStatus.temp.color.replace('text-', 'bg-').replace('-600', '-100')}`}> <p className="font-semibold">Temp</p> <p className={environmentStatus.temp.color}>{environmentStatus.temp.status}</p> </div>}
                                                  {environmentStatus.humidity && <div className={`p-1.5 rounded ${environmentStatus.humidity.color.replace('text-', 'bg-').replace('-600', '-100')}`}> <p className="font-semibold">Humidity</p> <p className={environmentStatus.humidity.color}>{environmentStatus.humidity.status}</p> </div>}
                                                  {environmentStatus.ph && <div className={`p-1.5 rounded ${environmentStatus.ph.color.replace('text-', 'bg-').replace('-600', '-100')}`}> <p className="font-semibold">pH</p> <p className={environmentStatus.ph.color}>{environmentStatus.ph.status}</p> </div>}
                                                  {environmentStatus.ec && <div className={`p-1.5 rounded ${environmentStatus.ec.color.replace('text-', 'bg-').replace('-600', '-100')}`}> <p className="font-semibold">EC</p> <p className={environmentStatus.ec.color}>{environmentStatus.ec.status}</p> </div>}
                                              </div>
                                              {environmentStatus.temp?.status === 'Low' && <p className="text-xs text-orange-600 mt-1 flex items-center"><AlertCircle size={14} className="mr-1"/> Consider increasing temperature.</p>}
                                              {environmentStatus.temp?.status === 'High' && <p className="text-xs text-red-600 mt-1 flex items-center"><AlertCircle size={14} className="mr-1"/> Consider decreasing temperature.</p>}
                                              {environmentStatus.humidity?.status === 'Low' && <p className="text-xs text-orange-600 mt-1 flex items-center"><AlertCircle size={14} className="mr-1"/> Consider increasing humidity.</p>}
                                              {environmentStatus.humidity?.status === 'High' && <p className="text-xs text-red-600 mt-1 flex items-center"><AlertCircle size={14} className="mr-1"/> Consider decreasing humidity/increasing ventilation.</p>}
                                              {environmentStatus.ph?.status === 'Low' && <p className="text-xs text-orange-600 mt-1 flex items-center"><AlertCircle size={14} className="mr-1"/> pH is low, consider adjusting upwards.</p>}
                                              {environmentStatus.ph?.status === 'High' && <p className="text-xs text-red-600 mt-1 flex items-center"><AlertCircle size={14} className="mr-1"/> pH is high, consider adjusting downwards.</p>}
                                              {environmentStatus.ec?.status === 'Low' && <p className="text-xs text-orange-600 mt-1 flex items-center"><AlertCircle size={14} className="mr-1"/> EC is low, consider increasing nutrient concentration.</p>}
                                              {environmentStatus.ec?.status === 'High' && <p className="text-xs text-red-600 mt-1 flex items-center"><AlertCircle size={14} className="mr-1"/> EC is high, consider diluting nutrient solution or flushing.</p>}
                                           </div>
                                           {/* NPK Status Display */}
                                           <div>
                                              <p className="text-sm font-medium text-gray-700 mb-1">Nutrient Status (NPK):</p>
                                              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                                  <div className={`p-1.5 rounded ${npkStatus.n.color.replace('text-', 'bg-').replace('-600', '-100')}`}> <p className="font-semibold">N</p> <p className={npkStatus.n.color}>{npkStatus.n.status}</p> </div>
                                                  <div className={`p-1.5 rounded ${npkStatus.p.color.replace('text-', 'bg-').replace('-600', '-100')}`}> <p className="font-semibold">P</p> <p className={npkStatus.p.color}>{npkStatus.p.status}</p> </div>
                                                  <div className={`p-1.5 rounded ${npkStatus.k.color.replace('text-', 'bg-').replace('-600', '-100')}`}> <p className="font-semibold">K</p> <p className={npkStatus.k.color}>{npkStatus.k.status}</p> </div>
                                              </div>
                                          </div>
                                           {/* Fertilizer Recommendations */}
                                          <div>
                                              <p className="text-sm font-medium text-gray-700 mb-1">Fertilizer Suggestions:</p>
                                              {(npkStatus.n.status === 'Low' || npkStatus.p.status === 'Low' || npkStatus.k.status === 'Low') ? (
                                                  fertilizerRecommendations.length > 0 ? (
                                                      <div className="space-y-2 p-3 bg-orange-50 border border-orange-200 rounded-md">
                                                          <p className="text-sm text-orange-800 font-medium flex items-center"><AlertCircle size={16} className="mr-1 flex-shrink-0"/>Nutrient deficiency detected. Consider using:</p>
                                                          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 pl-5">
                                                              {fertilizerRecommendations.map(rec => (
                                                                  <li key={rec.name}>
                                                                      <span className="font-semibold">{rec.name}</span> ({rec.reason})
                                                                  </li>
                                                              ))}
                                                          </ul>
                                                      </div>
                                                  ) : (
                                                      <p className="text-sm text-orange-600 mt-1 flex items-center"><AlertCircle size={16} className="mr-1"/>Nutrient deficiency detected, but no suitable fertilizer found in inventory.</p>
                                                  )
                                              ) : (npkStatus.n.status === 'Optimal' && npkStatus.p.status === 'Optimal' && npkStatus.k.status === 'Optimal') ? (
                                                   <p className="text-sm text-green-700 mt-1 flex items-center"><Check size={16} className="mr-1"/>NPK levels appear optimal.</p>
                                              ) : (npkStatus.n.status === 'High' || npkStatus.p.status === 'High' || npkStatus.k.status === 'High') ? (
                                                   <p className="text-sm text-red-700 mt-1 flex items-center"><AlertCircle size={16} className="mr-1"/>Nutrient levels high. Avoid adding {[npkStatus.n.status === 'High' && 'N', npkStatus.p.status === 'High' && 'P', npkStatus.k.status === 'High' && 'K'].filter(Boolean).join(', ')}.</p>
                                              ) : (
                                                   <p className="text-xs text-gray-500 mt-1">NPK status could not be determined or thresholds not defined.</p>
                                              )}
                                          </div>
                                          {/* Email Error Display */}
                                          {emailError && <p className="text-xs text-red-500 mt-2 flex items-center"><MailWarning size={14} className="mr-1"/> {emailError}</p>}
                                       </div>
                                   )}
                              </div>
                          </div>
                      )}

                      {/* Event History Tab */}
                      {activeDetailTab === 'Events' && (
                          <div className="bg-white rounded-lg">
                              <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center"> <History size={18} className="mr-2" /> Plant Event History </h2>
                              {isPlantEventsLoading ? ( <div className="text-center py-6"><Loader2 className="h-6 w-6 animate-spin inline-block text-gray-500"/></div> )
                              : plantEventsError ? ( <p className="text-red-600 text-sm">{plantEventsError}</p> )
                              : plantEvents.length > 0 ? ( <div className="max-h-96 overflow-y-auto"> <ul className="divide-y divide-gray-200"> {plantEvents.map(event => ( <li key={event.id} className="p-3 hover:bg-gray-50"> <p className="font-medium text-gray-800 text-sm mb-1">{event.message}</p> <div className="flex items-center text-xs text-gray-500 space-x-2"> <Clock size={12} /> <span>{formatDate(event.timestamp)}</span> <span className="font-semibold">({event.type})</span> {event.status && <span className={`px-1.5 py-0.5 rounded-full text-xs ${event.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>{event.status}</span>} </div> </li> ))} </ul> </div> )
                              : ( <p className="text-sm text-gray-500 text-center py-6">No event history found.</p> )}
                          </div>
                      )}

                      {/* Cost Log Tab */}
                      {activeDetailTab === 'Costs' && (
                         <div className="bg-white rounded-lg">
                             <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center"> <DollarSign size={18} className="mr-2" /> Cost & Usage Log </h2>
                             {isCostLoading ? ( <div className="text-center py-6"><Loader2 className="h-6 w-6 animate-spin inline-block text-gray-500"/></div> )
                             : costError ? ( <p className="text-red-600 text-sm">{costError}</p> )
                             : costLogs.length > 0 ? ( <div className="overflow-x-auto max-h-96 overflow-y-auto"> <table className="min-w-full divide-y divide-gray-200 text-sm"> <thead className="bg-gray-50 sticky top-0 z-10"> <tr> <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Date</th> <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Type</th> <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Item</th> <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Qty</th> <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Cost/Value</th> </tr> </thead> <tbody className="bg-white divide-y divide-gray-200"> {costLogs.map(log => { const { Icon, color } = getLogTypeStyle(log.type); const isCost = ['Seed Planted', 'Fertilizer Used', 'Material Used', 'Purchase'].includes(log.type); return ( <tr key={log.id} className="hover:bg-gray-50"> <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDate(log.timestamp)}</td> <td className="px-3 py-2 whitespace-nowrap"><span className={`inline-flex items-center text-xs font-medium ${color}`}><Icon size={14} className="mr-1.5" />{log.type}</span></td> <td className="px-3 py-2 whitespace-nowrap text-gray-800">{log.itemName}</td> <td className={`px-3 py-2 whitespace-nowrap text-right ${log.quantityChange > 0 ? 'text-green-600' : 'text-red-600'}`}>{log.quantityChange > 0 ? '+' : ''}{log.quantityChange}</td> <td className={`px-3 py-2 whitespace-nowrap text-right font-medium ${isCost ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(log.totalCostOrValue)}</td> </tr> ); })} </tbody> </table> </div> )
                             : ( <p className="text-sm text-gray-500 text-center py-6">No cost or usage logs found.</p> )}
                         </div>
                      )}

                      {/* Sensor History Tab */}
                      {activeDetailTab === 'Sensors' && (
                         <div className="bg-white rounded-lg">
                             <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center"> <Activity size={18} className="mr-2" /> Full Sensor History </h2>
                             {isSensorHistoryLoading ? ( <div className="text-center py-6"><Loader2 className="h-6 w-6 animate-spin inline-block text-gray-500"/></div> )
                             : sensorHistoryError ? ( <p className="text-red-600 text-sm">{sensorHistoryError}</p> )
                             : sensorHistory.length > 0 ? ( <div className="overflow-x-auto max-h-96 overflow-y-auto"> <table className="min-w-full divide-y divide-gray-200 text-sm"> <thead className="bg-gray-50 sticky top-0 z-10"> <tr> <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Timestamp</th> <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Temp</th> <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Humid</th> <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">pH</th> <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">EC</th> <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">N</th> <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">P</th> <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">K</th> </tr> </thead> <tbody className="bg-white divide-y divide-gray-200"> {sensorHistory.map(reading => ( <tr key={reading.id} className="hover:bg-gray-50"> <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDate(reading.timestamp)}</td> <td className="px-3 py-2 whitespace-nowrap text-gray-800 text-right">{reading.temperature?.toFixed(1) ?? '-'}</td> <td className="px-3 py-2 whitespace-nowrap text-gray-800 text-right">{reading.humidity?.toFixed(0) ?? '-'}</td> <td className="px-3 py-2 whitespace-nowrap text-gray-800 text-right">{reading.ph?.toFixed(1) ?? '-'}</td> <td className="px-3 py-2 whitespace-nowrap text-gray-800 text-right">{reading.ec?.toFixed(1) ?? '-'}</td> <td className="px-3 py-2 whitespace-nowrap text-gray-800 text-right">{reading.nitrogen ?? '-'}</td> <td className="px-3 py-2 whitespace-nowrap text-gray-800 text-right">{reading.phosphorus ?? '-'}</td> <td className="px-3 py-2 whitespace-nowrap text-gray-800 text-right">{reading.potassium ?? '-'}</td> </tr> ))} </tbody> </table> </div> )
                             : ( <p className="text-sm text-gray-500 text-center py-6">No historical sensor readings found.</p> )}
                         </div>
                      )}
                  </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
