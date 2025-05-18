'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { doc, getDoc, collection, query, where, orderBy, getDocs, Timestamp, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, get } from "firebase/database"; // For RTDB image fetching
import { firestore, auth, database } from '@/app/lib/firebase/config';
import { useAuthState } from 'react-firebase-hooks/auth';

import emailjs from '@emailjs/browser';

import Sidebar from '@/components/Sidebar';
import LoadingSpinner from '@/components/LoadingSpinner';
import AddSensorReadingModal, { SensorReadingData } from '@/components/AddSensorReadingModal'; // Ensure this path is correct

import {
    Loader2, AlertTriangle, Leaf, ImageOff, Thermometer, Droplets, TestTube2, Zap, Menu, X, Clock,
    ListChecks, History, DollarSign, ShoppingCart, Settings, PlusCircle, Package, FileText, BarChart3, Lightbulb, Check, AlertCircle, Activity, Info, FlaskConical, MailWarning, Plus
} from 'lucide-react';
import Link from 'next/link';

// --- Interfaces ---
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
  notes?: string;
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
  unit?: string;
}

interface StageSpecificRequirements { // Renamed from StageRequirements for clarity
    name: string;
    startDay: number;
    description?: string;
    minN?: number;
    maxN?: number;
    minP?: number;
    maxP?: number;
    minK?: number;
    maxK?: number;
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
  // Top-level environmental thresholds
  minTemp?: number;
  maxTemp?: number;
  minHumidity?: number;
  maxHumidity?: number;
  minPH?: number;
  maxPH?: number;
  minEC?: number; // Assuming this is the field name from Firestore for EC
  maxEC?: number; // Assuming this is the field name from Firestore for EC
  stages: StageSpecificRequirements[];
}

// This interface represents the combined requirements for the CURRENT stage
interface CurrentStageCombinedRequirements extends StageSpecificRequirements {
    minTempC?: number;
    maxTempC?: number;
    minHumidityPercent?: number;
    maxHumidityPercent?: number;
    minPH?: number;
    maxPH?: number;
    minEC_mS_cm?: number; // This will be mapped from PlantLifecycle.minEC
    maxEC_mS_cm?: number; // This will be mapped from PlantLifecycle.maxEC
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

interface FormattedFertilizerRecommendation {
    name: string;
    reason: string;
    score: number;
    npk_display?: string;
    amount?: string;
    unit?: string;
}

// --- Helper Functions ---
const formatCurrency = (value: number, forceZeroDisplay = false): string => {
    if (value === 0 && !forceZeroDisplay && value !== null && value !== undefined) return '-';
    if (isNaN(value) || value === null || value === undefined) return 'N/A';
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
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

type NotificationCooldownKey = 'tempLow' | 'tempHigh' | 'humidityLow' | 'humidityHigh' | 'phLow' | 'phHigh' | 'ecLow' | 'ecHigh' | 'nLow' | 'nHigh' | 'pLow' | 'pHigh' | 'kLow' | 'kHigh';
type NotificationCooldown = {
    [key in NotificationCooldownKey]?: number;
};
const COOLDOWN_PERIOD_MS = 6 * 60 * 60 * 1000;

const alertTypeMapping: Record<NotificationCooldownKey, string> = {
    tempLow: "Low Temperature", tempHigh: "High Temperature",
    humidityLow: "Low Humidity", humidityHigh: "High Humidity",
    phLow: "Low pH", phHigh: "High pH",
    ecLow: "Low EC", ecHigh: "High EC",
    nLow: "Low Nitrogen", nHigh: "High Nitrogen",
    pLow: "Low Phosphorus", pHigh: "High Phosphorus",
    kLow: "Low Potassium", kHigh: "High Potassium",
};

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
  const [plantLifecycleData, setPlantLifecycleData] = useState<PlantLifecycle | null>(null);
  const [isLifecycleLoading, setIsLifecycleLoading] = useState<boolean>(true);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings>({});
  const [isSettingsLoading, setIsSettingsLoading] = useState<boolean>(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [currentStageRequirements, setCurrentStageRequirements] = useState<CurrentStageCombinedRequirements | null>(null);
  type DetailTab = 'Status' | 'Events' | 'Costs' | 'Sensors';
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('Status');
  const notificationCooldowns = useRef<NotificationCooldown>({});
  const [emailError, setEmailError] = useState<string | null>(null);
  const [availableFertilizers, setAvailableFertilizers] = useState<FertilizerItem[]>([]);
  const [isFertilizersLoading, setIsFertilizersLoading] = useState<boolean>(true);
  const [fertilizersError, setFertilizersError] = useState<string | null>(null);
  const [isAddSensorModalOpen, setIsAddSensorModalOpen] = useState(false);

  useEffect(() => {
    if (!loadingAuth && !user && !errorAuth) {
        router.push('/login');
    }
  }, [user, loadingAuth, errorAuth, router]);

  // Fetch Plant Details & Image
  useEffect(() => {
    if (!loadingAuth && user && firestore && plantId) {
      const fetchPlantAndImage = async () => {
          setIsLoading(true); setIsImageLoading(true); setError(null); setImageData(null);
          try {
              const plantDocRef = doc(firestore, 'plants', plantId);
              const plantDocSnap = await getDoc(plantDocRef);
              if (!plantDocSnap.exists()) { throw new Error("Plant not found."); }
              const data = plantDocSnap.data();
              if (data.ownerUid !== user.uid) { throw new Error("Permission denied to view this plant."); }
              const fetchedPlantDetails: PlantDetails = {
                  id: plantDocSnap.id, name: data.name || 'N/A', type: data.type || 'N/A',
                  imageUrl: data.imageUrl || null,
                  datePlanted: data.datePlanted instanceof Timestamp ? data.datePlanted.toDate() : new Date(data.datePlanted || Date.now()),
                  status: data.status || 'N/A', locationZone: data.locationZone, ownerUid: data.ownerUid,
                  seedId: data.seedId, initialSeedQuantity: data.initialSeedQuantity
              };
              setPlantDetails(fetchedPlantDetails);
              if (fetchedPlantDetails.imageUrl) {
                if (fetchedPlantDetails.imageUrl.startsWith('plantImages/')) {
                    if (!database) { console.warn("RTDB not initialized"); setIsImageLoading(false); return; }
                    const imageRefRTDB = ref(database, fetchedPlantDetails.imageUrl);
                    const imageSnapshot = await get(imageRefRTDB);
                    if (imageSnapshot.exists()) {
                        const base64Data = imageSnapshot.val();
                        if (typeof base64Data === 'string' && base64Data.startsWith('data:image/')) {
                            setImageData(base64Data);
                        } else { console.warn("Invalid image format in RTDB for:", fetchedPlantDetails.imageUrl); }
                    } else { console.warn("Image not found in RTDB at path:", fetchedPlantDetails.imageUrl); }
                } else if (fetchedPlantDetails.imageUrl.startsWith('http')) { setImageData(fetchedPlantDetails.imageUrl); }
                else { console.warn("Unknown imageUrl format:", fetchedPlantDetails.imageUrl); }
              }
          } catch (err: any) { console.error("Fetch plant error:", err); setError(err.message); setPlantDetails(null); }
          finally { setIsLoading(false); setIsImageLoading(false); }
      };
      fetchPlantAndImage();
    } else if (!plantId && !loadingAuth) { setError("Plant ID missing in URL."); setIsLoading(false); setIsImageLoading(false); }
      else if ((!firestore || !database) && !loadingAuth && user) { setError("Database service is not available."); setIsLoading(false); setIsImageLoading(false); }
  }, [plantId, user, loadingAuth]); // firestore and database are stable, no need in deps if initialized once globally

  // Fetch Plant Lifecycle Data
 useEffect(() => {
    if (plantDetails?.type && firestore) {
        const fetchLifecycleData = async () => {
            setIsLifecycleLoading(true); setLifecycleError(null);
            const typeDocRef = doc(firestore, 'plantTypes', plantDetails.type);
            const defaultTypeDocRef = doc(firestore, 'plantTypes', 'Default');
            try {
                let docSnap = await getDoc(typeDocRef);
                if (!docSnap.exists()) {
                    console.warn(`Lifecycle data not found for type: ${plantDetails.type}. Trying Default.`);
                    docSnap = await getDoc(defaultTypeDocRef);
                }
                if (docSnap.exists()) { setPlantLifecycleData(docSnap.data() as PlantLifecycle); }
                else { setLifecycleError(`Plant configuration not found for type "${plantDetails.type}" or Default.`); setPlantLifecycleData(null); }
            } catch (err) { console.error("Fetch lifecycle error:", err); setLifecycleError("Failed to load plant lifecycle configuration."); setPlantLifecycleData(null); }
            finally { setIsLifecycleLoading(false); }
        };
        fetchLifecycleData();
    } else if (plantDetails && !plantDetails.type) { setIsLifecycleLoading(false); setLifecycleError("Plant type is missing for this plant."); setPlantLifecycleData(null); }
    else if (!plantDetails && !isLoading) { setIsLifecycleLoading(false); }
  }, [plantDetails, firestore, isLoading]);

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
              } catch (err) { console.error("Fetch settings error:", err); setSettingsError("Failed to load user settings."); }
              finally { setIsSettingsLoading(false); }
          };
          fetchUserSettings();
      } else { setIsSettingsLoading(false); if (!user && !loadingAuth) setUserSettings({});}
  }, [user, firestore, loadingAuth]);

  // Fetch Sensor History
  useEffect(() => {
      if (user && firestore && plantId) {
          const fetchSensorHistory = async () => {
              setIsSensorHistoryLoading(true); setSensorHistoryError(null); setSensorHistory([]);
              try {
                  const readingsCollectionRef = collection(firestore, 'sensorReadings');
                  const qReadings = query(readingsCollectionRef, where("plantId", "==", plantId), orderBy("timestamp", "desc"));
                  const readingsSnapshot = await getDocs(qReadings);
                  const fetchedReadings: SensorReading[] = [];
                  readingsSnapshot.forEach((docSnap) => {
                      const readingData = docSnap.data();
                      fetchedReadings.push({ id: docSnap.id, timestamp: readingData.timestamp instanceof Timestamp ? readingData.timestamp.toDate() : new Date(readingData.timestamp), temperature: typeof readingData.temperature === 'number' ? readingData.temperature : undefined, humidity: typeof readingData.humidity === 'number' ? readingData.humidity : undefined, ph: typeof readingData.ph === 'number' ? readingData.ph : undefined, ec: typeof readingData.ec === 'number' ? readingData.ec : undefined, nitrogen: typeof readingData.nitrogen === 'number' ? readingData.nitrogen : undefined, phosphorus: typeof readingData.phosphorus === 'number' ? readingData.phosphorus : undefined, potassium: typeof readingData.potassium === 'number' ? readingData.potassium : undefined, notes: readingData.notes });
                  });
                  setSensorHistory(fetchedReadings);
              } catch (err: any) { console.error("Fetch sensor error:", err); setSensorHistoryError("Failed to load sensor history."); }
              finally { setIsSensorHistoryLoading(false); }
          };
          fetchSensorHistory();
      } else { setIsSensorHistoryLoading(false); if(!plantId && user) setSensorHistory([]);}
  }, [plantId, user, firestore]);

  // Fetch Plant Events
  useEffect(() => {
      if (user && firestore && plantId) {
          const fetchPlantEvents = async () => {
              setIsPlantEventsLoading(true); setPlantEventsError(null); setPlantEvents([]);
              try {
                  const eventsRef = collection(firestore, 'events');
                  const q = query( eventsRef, where("plantId", "==", plantId), where("userId", "==", user.uid), orderBy("timestamp", "desc") );
                  const querySnapshot = await getDocs(q);
                  const fetchedEvents: PlantEvent[] = [];
                  querySnapshot.forEach((docSnap) => {
                      const data = docSnap.data();
                      fetchedEvents.push({ id: docSnap.id, timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp), createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt), type: data.type || 'Unknown', message: data.message || 'No description', plantId: data.plantId, status: data.status, userId: data.userId });
                  });
                  setPlantEvents(fetchedEvents);
              } catch (err: any) { console.error("Fetch events error:", err); setPlantEventsError("Failed to load event history."); }
              finally { setIsPlantEventsLoading(false); }
          };
          fetchPlantEvents();
      } else { setIsPlantEventsLoading(false); if(!plantId && user) setPlantEvents([]);}
  }, [plantId, user, firestore]);

  // Fetch Cost Logs
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
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if ([...costTypes, saleType].includes(data.type)) {
                const quantityChange = Number(data.quantityChange) || 0;
                const costOrValuePerUnit = Number(data.costOrValuePerUnit) || 0;
                fetchedLogs.push({ id: docSnap.id, itemId: data.itemId || 'N/A', itemName: data.itemName || 'N/A', timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp), type: data.type as InventoryLogEntry['type'], quantityChange: quantityChange, costOrValuePerUnit: costOrValuePerUnit, totalCostOrValue: Math.abs(quantityChange) * costOrValuePerUnit, notes: data.notes || '', userId: data.userId, plantId: data.plantId, unit: data.unit });
            }
          });
          setCostLogs(fetchedLogs);
        } catch (err: any) { console.error("Fetch cost logs error:", err); setCostError("Failed to load cost history for this plant."); }
        finally { setIsCostLoading(false); }
      };
      fetchCostLogs();
    } else { setIsCostLoading(false); if(!plantId && user) setCostLogs([]);}
  }, [plantId, user, firestore]);

  // Determine Current Stage Requirements
  useEffect(() => {
      if (plantDetails?.datePlanted && plantLifecycleData?.stages && plantLifecycleData.stages.length > 0) {
          const today = new Date();
          const plantedDate = plantDetails.datePlanted instanceof Date ? plantDetails.datePlanted : new Date(plantDetails.datePlanted);
          if (isNaN(plantedDate.getTime())) {
              console.warn("Invalid datePlanted for current stage calculation.");
              setCurrentStageRequirements(null);
              return;
          }
          const timeDiff = today.getTime() - plantedDate.getTime();
          const daysSincePlanted = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));

          let activeStage: StageSpecificRequirements | null = null;
          for (let i = plantLifecycleData.stages.length - 1; i >= 0; i--) {
              if (daysSincePlanted >= plantLifecycleData.stages[i].startDay) {
                  activeStage = plantLifecycleData.stages[i];
                  break;
              }
          }
          if (!activeStage && plantLifecycleData.stages.length > 0) {
              activeStage = plantLifecycleData.stages[0];
          }

          if (activeStage) {
              const combinedReqs: CurrentStageCombinedRequirements = {
                  ...activeStage,
                  minTempC: plantLifecycleData.minTemp,
                  maxTempC: plantLifecycleData.maxTemp,
                  minHumidityPercent: plantLifecycleData.minHumidity,
                  maxHumidityPercent: plantLifecycleData.maxHumidity,
                  minPH: plantLifecycleData.minPH,
                  maxPH: plantLifecycleData.maxPH,
                  minEC_mS_cm: plantLifecycleData.minEC,
                  maxEC_mS_cm: plantLifecycleData.maxEC,
              };
              setCurrentStageRequirements(combinedReqs);
          } else {
              console.warn("No active stage could be determined for plant:", plantDetails.name);
              setCurrentStageRequirements(null);
          }
      } else {
          setCurrentStageRequirements(null);
      }
  }, [plantDetails, plantLifecycleData]);

  // Fetch available fertilizers
  useEffect(() => {
      if (user && firestore) {
          const fetchFertilizers = async () => {
              setIsFertilizersLoading(true); setFertilizersError(null); setAvailableFertilizers([]);
              const inventoryRef = collection(firestore, 'inventory');
              const q = query(inventoryRef, where("category", "==", "fertilizers"), where("stock", ">", 0));
              try {
                  const querySnapshot = await getDocs(q);
                  const fetchedFertilizers: FertilizerItem[] = [];
                  querySnapshot.forEach((docSnap) => {
                      const data = docSnap.data();
                      fetchedFertilizers.push({
                          id: docSnap.id, name: data.name || 'Unnamed Fertilizer', stock: data.stock || 0, unit: data.unit || 'unit',
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
  }, [user, firestore]);


  const latestReading = useMemo(() => sensorHistory.length > 0 ? sensorHistory[0] : null, [sensorHistory]);
  const { totalCost, totalRevenue } = useMemo(() => {
      if (isCostLoading || costLogs.length === 0) return { totalCost: 0, totalRevenue: 0 };
      let cost = 0; let revenue = 0;
      const costTypes: InventoryLogEntry['type'][] = ['Seed Planted', 'Fertilizer Used', 'Material Used', 'Purchase'];
      costLogs.forEach(log => {
          if (costTypes.includes(log.type)) { cost += log.totalCostOrValue; }
          else if (log.type === 'Sale') { revenue += log.totalCostOrValue; }
      });
      return { totalCost: cost, totalRevenue: revenue };
  }, [costLogs, isCostLoading]);

  const suggestedPrice = useMemo(() => {
      if (isCostLoading || isSettingsLoading || totalCost <= 0) return null;
      const margin = userSettings.defaultProfitMargin ?? 0.20;
      return totalCost * (1 + margin);
  }, [totalCost, userSettings, isCostLoading, isSettingsLoading]);

  const environmentStatus = useMemo(() => {
      if (isSensorHistoryLoading || !latestReading || !currentStageRequirements) {
          return { temp: null, humidity: null, ph: null, ec: null };
      }
      return {
          temp: checkThreshold(latestReading.temperature, currentStageRequirements.minTempC, currentStageRequirements.maxTempC),
          humidity: checkThreshold(latestReading.humidity, currentStageRequirements.minHumidityPercent, currentStageRequirements.maxHumidityPercent),
          ph: checkThreshold(latestReading.ph, currentStageRequirements.minPH, currentStageRequirements.maxPH),
          ec: checkThreshold(latestReading.ec, currentStageRequirements.minEC_mS_cm, currentStageRequirements.maxEC_mS_cm)
      };
  }, [latestReading, currentStageRequirements, isSensorHistoryLoading]);

  const npkStatus = useMemo(() => {
      if (isSensorHistoryLoading || !latestReading || !currentStageRequirements) {
          return { n: { status: 'N/A', color: 'text-gray-500' } as StatusResult, p: { status: 'N/A', color: 'text-gray-500' } as StatusResult, k: { status: 'N/A', color: 'text-gray-500' } as StatusResult };
      }
      return {
          n: getNpkStatus(latestReading.nitrogen, currentStageRequirements.minN, currentStageRequirements.maxN),
          p: getNpkStatus(latestReading.phosphorus, currentStageRequirements.minP, currentStageRequirements.maxP),
          k: getNpkStatus(latestReading.potassium, currentStageRequirements.minK, currentStageRequirements.maxK),
      };
  }, [latestReading, currentStageRequirements, isSensorHistoryLoading]);

  const fertilizerRecommendations = useMemo((): FormattedFertilizerRecommendation[] => {
    if (isFertilizersLoading || !npkStatus || !availableFertilizers || availableFertilizers.length === 0 || !currentStageRequirements || !plantDetails) {
        return [];
    }
    const recommendations: FormattedFertilizerRecommendation[] = [];
    const needsN = npkStatus.n.status === 'Low';
    const needsP = npkStatus.p.status === 'Low';
    const needsK = npkStatus.k.status === 'Low';
    const highN = npkStatus.n.status === 'High';
    const highP = npkStatus.p.status === 'High';
    const highK = npkStatus.k.status === 'High';
    const optimalN = npkStatus.n.status === 'Optimal' || npkStatus.n.status === 'OK (>= Min)' || npkStatus.n.status === 'OK (<= Max)';
    const optimalP = npkStatus.p.status === 'Optimal' || npkStatus.p.status === 'OK (>= Min)' || npkStatus.p.status === 'OK (<= Max)';
    const optimalK = npkStatus.k.status === 'Optimal' || npkStatus.k.status === 'OK (>= Min)' || npkStatus.k.status === 'OK (<= Max)';

    if (!needsN && !needsP && !needsK) return [];

    availableFertilizers.forEach(fert => {
        const n_perc = fert.n_percentage ?? 0;
        const p_perc = fert.p_percentage ?? 0;
        const k_perc = fert.k_percentage ?? 0;
        let suitabilityScore = 0.0;
        let reasons: string[] = [];
        let addressesAtLeastOneNeed = false;
        let deficienciesMetCount = 0;

        if (highN && n_perc > 1) { suitabilityScore -= 200; reasons.push(`Adds N (${n_perc}%) (N is High)`); }
        if (highP && p_perc > 1) { suitabilityScore -= 200; reasons.push(`Adds P (${p_perc}%) (P is High)`); }
        if (highK && k_perc > 1) { suitabilityScore -= 200; reasons.push(`Adds K (${k_perc}%) (K is High)`); }
        if (needsN && n_perc > 1) { suitabilityScore += 100 + n_perc; reasons.push(`Provides needed N (${n_perc}%)`); addressesAtLeastOneNeed = true; deficienciesMetCount++; }
        if (needsP && p_perc > 1) { suitabilityScore += 100 + p_perc; reasons.push(`Provides needed P (${p_perc}%)`); addressesAtLeastOneNeed = true; deficienciesMetCount++; }
        if (needsK && k_perc > 1) { suitabilityScore += 100 + k_perc; reasons.push(`Provides needed K (${k_perc}%)`); addressesAtLeastOneNeed = true; deficienciesMetCount++; }
        if (deficienciesMetCount > 1) { suitabilityScore += deficienciesMetCount * 25; reasons.push(`Addresses ${deficienciesMetCount} deficiencies`); }
        if (optimalN && !needsN && n_perc > 5) { suitabilityScore -= 15; reasons.push(`Adds N (${n_perc}%) (N is Optimal)`);}
        if (optimalP && !needsP && p_perc > 5) { suitabilityScore -= 15; reasons.push(`Adds P (${p_perc}%) (P is Optimal)`);}
        if (optimalK && !needsK && k_perc > 5) { suitabilityScore -= 15; reasons.push(`Adds K (${k_perc}%) (K is Optimal)`);}

        if (addressesAtLeastOneNeed && suitabilityScore > 0) {
            let prescribedAmountText = "Qty pending";
            const TARGET_GRAMS_NUTRIENT_PER_PLANT_EVENT = 0.25;
            let primaryNutrientPercentageForCalc = 0.0;
            if (deficienciesMetCount === 1) {
                if (needsN && n_perc > 0) primaryNutrientPercentageForCalc = n_perc;
                else if (needsP && p_perc > 0) primaryNutrientPercentageForCalc = p_perc;
                else if (needsK && k_perc > 0) primaryNutrientPercentageForCalc = k_perc;
            } else if (deficienciesMetCount > 1) {
                let tempMaxPerc = 0;
                if (needsN && n_perc > tempMaxPerc) tempMaxPerc = n_perc;
                if (needsP && p_perc > tempMaxPerc) tempMaxPerc = p_perc;
                if (needsK && k_perc > tempMaxPerc) tempMaxPerc = k_perc;
                primaryNutrientPercentageForCalc = tempMaxPerc;
            }
            if (primaryNutrientPercentageForCalc > 0) {
                const numPlants = plantDetails.initialSeedQuantity || 1;
                const gramsOfProductPerPlantEvent = (TARGET_GRAMS_NUTRIENT_PER_PLANT_EVENT / (primaryNutrientPercentageForCalc / 100));
                const totalGramsOfProduct = gramsOfProductPerPlantEvent * Math.max(1, numPlants);
                prescribedAmountText = totalGramsOfProduct.toFixed(1);
            }
            recommendations.push({
                name: fert.name, reason: reasons.join('. '), score: parseFloat(suitabilityScore.toFixed(2)),
                npk_display: `${n_perc.toFixed(0)}-${p_perc.toFixed(0)}-${k_perc.toFixed(0)}`,
                amount: prescribedAmountText, unit: fert.unit || 'units'
            });
        }
    });
    return recommendations.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [npkStatus, availableFertilizers, isFertilizersLoading, currentStageRequirements, plantDetails]);


  const sendEmailNotification = useCallback(async (internalAlertType: NotificationCooldownKey, currentValue: string | number, thresholdValue: string | number | undefined) => {
    setEmailError(null);
    if (!plantDetails || !firestore) {
        console.warn("[EmailJS] Plant details or Firestore not available for notification.");
        return;
    }
    const now = Date.now();
    const cooldownKeyForPlantAlert = `${plantId}_${internalAlertType}`;
    // @ts-ignore
    const lastSent = notificationCooldowns.current[cooldownKeyForPlantAlert];
    if (lastSent && (now - lastSent < COOLDOWN_PERIOD_MS)) {
        console.log(`[EmailJS] Cooldown active for ${internalAlertType} on plant ${plantId}.`);
        return;
    }
    const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
    const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
    const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
    if (!serviceId || !templateId || !publicKey) {
        console.error("[EmailJS] Credentials missing in .env.local");
        setEmailError("Email service not configured correctly.");
        return;
    }
    const descriptiveAlertType = alertTypeMapping[internalAlertType] || internalAlertType;
    try {
        const usersCollectionRef = collection(firestore, 'users');
        const usersSnapshot = await getDocs(usersCollectionRef);
        if (usersSnapshot.empty) {
            console.warn("[EmailJS] No users found in 'users' collection.");
            return;
        }
        console.log(`[EmailJS] Alert: ${descriptiveAlertType} for Plant: ${plantDetails.name}. Current: ${currentValue}, Threshold: ${thresholdValue}. Attempting to notify ${usersSnapshot.size} users.`);
        let emailsSentCount = 0;
        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            const recipientEmail = userData.email;
            const recipientName = userData.displayName || 'User';
            if (recipientEmail && typeof recipientEmail === 'string' && recipientEmail.trim() !== '') {
                const templateParams = {
                    plant_name: plantDetails.name, alert_type: descriptiveAlertType, current_value: String(currentValue),
                    threshold_value: String(thresholdValue ?? 'N/A'), email: recipientEmail,
                    user_name: recipientName, plant_link: `${window.location.origin}/plants/${plantId}`
                };
                console.log(`[EmailJS] Preparing to send to: ${recipientEmail} with params:`, JSON.stringify(templateParams));
                try {
                    await emailjs.send(serviceId, templateId, templateParams, publicKey);
                    console.log(`[EmailJS] Notification sent to ${recipientEmail} for ${descriptiveAlertType}`);
                    emailsSentCount++;
                } catch (emailError: any) {
                    console.error(`[EmailJS] Failed to send to ${recipientEmail}:`, emailError.status, emailError.text);
                    setEmailError(prev => prev ? `${prev}, Failed for ${recipientEmail}` : `Failed for ${recipientEmail}: ${emailError.text || 'Unknown EmailJS error'}`);
                }
            } else {
                console.warn(`[EmailJS] User document ${userDoc.id} missing valid email.`);
            }
        }
        if (emailsSentCount > 0) {
            // @ts-ignore
            notificationCooldowns.current[cooldownKeyForPlantAlert] = now;
            console.log(`[EmailJS] Attempted to send ${emailsSentCount} emails for ${descriptiveAlertType} on plant ${plantId}.`);
        } else {
            console.warn(`[EmailJS] No emails sent for ${descriptiveAlertType} on plant ${plantId}.`);
            if (!emailError) { setEmailError("No valid recipients found or all email attempts failed."); }
        }
    } catch (fetchUsersError: any) {
        console.error("[EmailJS] Error fetching users for notification:", fetchUsersError);
        setEmailError("Failed to fetch user list for notifications.");
    }
  }, [plantDetails, plantId, firestore]);

  useEffect(() => {
    if (!isSensorHistoryLoading && !isLifecycleLoading && latestReading && currentStageRequirements && plantDetails) {
        if (environmentStatus.temp?.status === 'Low') sendEmailNotification('tempLow', latestReading.temperature ?? 'N/A', currentStageRequirements.minTempC);
        if (environmentStatus.temp?.status === 'High') sendEmailNotification('tempHigh', latestReading.temperature ?? 'N/A', currentStageRequirements.maxTempC);
        if (environmentStatus.humidity?.status === 'Low') sendEmailNotification('humidityLow', latestReading.humidity ?? 'N/A', currentStageRequirements.minHumidityPercent);
        if (environmentStatus.humidity?.status === 'High') sendEmailNotification('humidityHigh', latestReading.humidity ?? 'N/A', currentStageRequirements.maxHumidityPercent);
        if (environmentStatus.ph?.status === 'Low') sendEmailNotification('phLow', latestReading.ph ?? 'N/A', currentStageRequirements.minPH);
        if (environmentStatus.ph?.status === 'High') sendEmailNotification('phHigh', latestReading.ph ?? 'N/A', currentStageRequirements.maxPH);
        if (environmentStatus.ec?.status === 'Low') sendEmailNotification('ecLow', latestReading.ec ?? 'N/A', currentStageRequirements.minEC_mS_cm);
        if (environmentStatus.ec?.status === 'High') sendEmailNotification('ecHigh', latestReading.ec ?? 'N/A', currentStageRequirements.maxEC_mS_cm);
        if (npkStatus.n.status === 'Low') sendEmailNotification('nLow', latestReading.nitrogen ?? 'N/A', currentStageRequirements.minN);
        if (npkStatus.n.status === 'High') sendEmailNotification('nHigh', latestReading.nitrogen ?? 'N/A', currentStageRequirements.maxN);
        if (npkStatus.p.status === 'Low') sendEmailNotification('pLow', latestReading.phosphorus ?? 'N/A', currentStageRequirements.minP);
        if (npkStatus.p.status === 'High') sendEmailNotification('pHigh', latestReading.phosphorus ?? 'N/A', currentStageRequirements.maxP);
        if (npkStatus.k.status === 'Low') sendEmailNotification('kLow', latestReading.potassium ?? 'N/A', currentStageRequirements.minK);
        if (npkStatus.k.status === 'High') sendEmailNotification('kHigh', latestReading.potassium ?? 'N/A', currentStageRequirements.maxK);
    }
  }, [latestReading, currentStageRequirements, environmentStatus, npkStatus, isSensorHistoryLoading, isLifecycleLoading, plantDetails, sendEmailNotification]);


  const handleAddSensorReadingSubmit = async (data: SensorReadingData) => {
    if (!user || !firestore || !plantId) {
        console.error("User, Firestore, or Plant ID is not available for adding sensor reading.");
        throw new Error("Cannot save sensor reading: missing critical information.");
    }
    const readingDataToSave: any = {
        plantId: plantId,
        userId: user.uid,
        timestamp: serverTimestamp(),
    };
    (Object.keys(data) as Array<keyof SensorReadingData>).forEach(key => {
        const value = data[key];
        if (key === 'notes' && typeof value === 'string' && value.trim() !== '') {
            readingDataToSave[key] = value.trim();
        } else if (typeof value === 'string' && value.trim() !== '' && key !== 'notes') {
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) { readingDataToSave[key] = numValue; }
        } else if (typeof value === 'number' && !isNaN(value)) { readingDataToSave[key] = value; }
    });
    const numericKeys: (keyof SensorReadingData)[] = ['temperature', 'humidity', 'ph', 'ec', 'nitrogen', 'phosphorus', 'potassium'];
    const numericValuesPresent = numericKeys.some(key => typeof readingDataToSave[key] === 'number');
    if (!numericValuesPresent && !readingDataToSave.notes) {
        throw new Error("At least one sensor value or a note must be provided.");
    }
    try {
        const sensorReadingsCollectionRef = collection(firestore, 'sensorReadings');
        const newReadingDocRef = await addDoc(sensorReadingsCollectionRef, readingDataToSave);
        const newReadingForState: SensorReading = {
            id: newReadingDocRef.id, timestamp: new Date(),
            temperature: readingDataToSave.temperature, humidity: readingDataToSave.humidity,
            ph: readingDataToSave.ph, ec: readingDataToSave.ec,
            nitrogen: readingDataToSave.nitrogen, phosphorus: readingDataToSave.phosphorus,
            potassium: readingDataToSave.potassium, notes: readingDataToSave.notes,
        };
        setSensorHistory(prev => [newReadingForState, ...prev].sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime()));
        setIsAddSensorModalOpen(false);
    } catch (error) {
        console.error("Error adding sensor reading to Firestore:", error);
        if (error instanceof Error) { throw new Error(`Failed to save sensor reading: ${error.message}`); }
        throw new Error("An unknown error occurred while saving sensor reading.");
    }
  };

  if (loadingAuth) { return <LoadingSpinner message="Authenticating..." />; }
  if (!user && !errorAuth) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 text-center">
            <div className="bg-white p-8 md:p-12 rounded-xl shadow-2xl max-w-md w-full">
                <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-6" />
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-3">Access Denied</h2>
                <p className="text-gray-600 mb-8 text-sm md:text-base">You need to be logged in to view plant details.</p>
                <Link href="/login" className="w-full inline-flex justify-center items-center px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">Go to Login Page</Link>
            </div>
        </div>
    );
  }
  if (errorAuth && !loadingAuth) {
     return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 text-center">
            <div className="bg-white p-8 md:p-12 rounded-xl shadow-2xl max-w-md w-full">
                <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-6" />
                <h2 className="text-2xl md:text-3xl font-bold text-red-700 mb-3">Authentication Error</h2>
                <p className="text-gray-600 mb-8 text-sm md:text-base">{errorAuth.message}</p>
                <p className="text-gray-500 text-xs mb-6">Please try logging out and logging in again.</p>
                <Link href="/login" className="w-full inline-flex justify-center items-center px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">Go to Login Page</Link>
            </div>
        </div>
     );
  }
  if (isLoading || (isLifecycleLoading && !plantLifecycleData && plantDetails) || (isSettingsLoading && Object.keys(userSettings).length === 0 && plantDetails) ) {
      return <LoadingSpinner message={ isLoading ? "Loading Plant Details..." : isLifecycleLoading ? "Loading Plant Config..." : isSettingsLoading ? "Loading User Settings..." : "Loading data..."} />;
  }
  if (error && !isLoading) {
      return (
          <div className="flex h-screen bg-gray-100">
              <Sidebar />
              <main className="flex-1 p-8 flex flex-col items-center justify-center text-center">
                  <AlertTriangle className="h-16 w-16 text-red-500 mb-4" />
                  <h2 className="text-2xl font-semibold text-red-700 mb-2">Error Loading Plant Data</h2>
                  <p className="text-gray-600 mb-6">{error}</p>
                  <Link href="/dashboard" className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors">Go to Dashboard</Link>
              </main>
          </div>
      );
  }
  if (!plantDetails && !isLoading && !error) {
      return <LoadingSpinner message="Plant data not found or initializing..." />;
  }

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm relative z-10 border-b">
          <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-semibold text-gray-800 flex items-center">
                  <Leaf className="h-6 w-6 mr-2 text-green-600" />
                  Plant Details: {plantDetails?.name ?? 'Loading...'}
                </h1>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8 relative">
          {(lifecycleError || settingsError || sensorHistoryError || plantEventsError || costError || fertilizersError || emailError) && (
              <div className="mb-4 text-sm text-red-700 bg-red-100 p-3 rounded-md border border-red-200" role="alert">
                  <AlertTriangle size={16} className="inline mr-1.5 align-text-bottom"/>
                  <strong>Data Loading Issues:</strong>
                  {lifecycleError && <p>- Plant Config: {lifecycleError}</p>}
                  {settingsError && <p>- User Settings: {settingsError}</p>}
                  {sensorHistoryError && <p>- Sensor Data: {sensorHistoryError}</p>}
                  {plantEventsError && <p>- Events: {plantEventsError}</p>}
                  {costError && <p>- Costs: {costError}</p>}
                  {fertilizersError && <p>- Fertilizers: {fertilizersError}</p>}
                  {emailError && <p>- Email Service: {emailError}</p>}
              </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold text-gray-700 mb-3">Image</h2>
                <div className="w-full aspect-square relative bg-gray-200 rounded flex items-center justify-center text-gray-400 overflow-hidden">
                  {isImageLoading ? ( <Loader2 size={40} className="animate-spin text-gray-500" /> )
                   : imageData ? ( <img src={imageData} alt={plantDetails?.name} className="absolute inset-0 w-full h-full object-cover" /> )
                   : plantDetails?.imageUrl && plantDetails.imageUrl.startsWith('http') ? ( <img src={plantDetails.imageUrl} alt={plantDetails?.name} className="absolute inset-0 w-full h-full object-cover" /> )
                   : ( <ImageOff size={48} /> )}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold text-gray-700 mb-3">Details</h2>
                <dl className="space-y-2 text-sm">
                    <div className="flex justify-between"><dt className="text-gray-500">Name:</dt><dd className="text-gray-800 font-medium">{plantDetails?.name}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Type:</dt><dd className="text-gray-800">{plantDetails?.type}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Status:</dt><dd className="text-gray-800">{plantDetails?.status}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Date Planted:</dt><dd className="text-gray-800">{plantDetails?.datePlanted?.toLocaleDateString() ?? 'N/A'}</dd></div>
                    {plantDetails?.locationZone && <div className="flex justify-between"><dt className="text-gray-500">Zone:</dt><dd className="text-gray-800">{plantDetails.locationZone}</dd></div>}
                    {plantDetails?.seedId && <div className="flex justify-between"><dt className="text-gray-500">Seed Ref:</dt><dd className="text-gray-800 text-xs truncate" title={plantDetails.seedId}>{plantDetails.seedId}</dd></div>}
                    {plantDetails?.initialSeedQuantity !== undefined && <div className="flex justify-between"><dt className="text-gray-500">Seeds Planted:</dt><dd className="text-gray-800">{plantDetails.initialSeedQuantity}</dd></div>}
                </dl>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center"> <BarChart3 size={18} className="mr-2 text-blue-600" /> Cost & Pricing </h2>
                {isCostLoading || isSettingsLoading ? ( <div className="flex items-center justify-center text-gray-500 py-4"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading financial data...</div> )
                : costError || settingsError ? ( <div className="text-sm text-red-600 text-center py-4">{costError || settingsError}</div> )
                : ( <dl className="space-y-2 text-sm">
                      <div className="flex justify-between"> <dt className="text-gray-500">Total Production Cost:</dt> <dd className="text-gray-800 font-medium">{formatCurrency(totalCost, false)}</dd> </div>
                      {totalRevenue > 0 && ( <> <div className="flex justify-between"> <dt className="text-gray-500">Total Revenue (Sales):</dt> <dd className="text-green-600 font-medium">{formatCurrency(totalRevenue)}</dd> </div> <div className="flex justify-between border-t pt-2 mt-2"> <dt className="text-gray-500 font-semibold">Net Profit/Loss:</dt> <dd className={`font-bold ${totalRevenue - totalCost >= 0 ? 'text-green-700' : 'text-red-600'}`}> {formatCurrency(totalRevenue - totalCost)} </dd> </div> </> )}
                      <div className="flex justify-between border-t pt-2 mt-2"> <dt className="text-gray-500">Suggested Sell Price:</dt> <dd className="text-blue-600 font-semibold">{suggestedPrice !== null ? formatCurrency(suggestedPrice) : 'N/A'}</dd> </div>
                      <p className="text-xs text-gray-400 text-right">(Based on {((userSettings.defaultProfitMargin ?? 0.2) * 100).toFixed(0)}% margin)</p>
                    </dl>
                )}
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-lg shadow">
                <div className="border-b border-gray-200">
                  <nav className="-mb-px flex space-x-4 sm:space-x-8 px-4 sm:px-6 overflow-x-auto" aria-label="Tabs">
                    <button onClick={() => setActiveDetailTab('Status')} className={`whitespace-nowrap flex items-center py-4 px-1 border-b-2 font-medium text-sm focus:outline-none ${activeDetailTab === 'Status' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`} > <Info size={16} className="mr-1.5" /> Status & Recs </button>
                    <button onClick={() => setActiveDetailTab('Events')} className={`whitespace-nowrap flex items-center py-4 px-1 border-b-2 font-medium text-sm focus:outline-none ${activeDetailTab === 'Events' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`} > <History size={16} className="mr-1.5" /> Event History </button>
                    <button onClick={() => setActiveDetailTab('Costs')} className={`whitespace-nowrap flex items-center py-4 px-1 border-b-2 font-medium text-sm focus:outline-none ${activeDetailTab === 'Costs' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`} > <DollarSign size={16} className="mr-1.5" /> Cost Log </button>
                    <button onClick={() => setActiveDetailTab('Sensors')} className={`whitespace-nowrap flex items-center py-4 px-1 border-b-2 font-medium text-sm focus:outline-none ${activeDetailTab === 'Sensors' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`} > <Activity size={16} className="mr-1.5" /> Sensor History </button>
                  </nav>
                </div>

                <div className="p-6 min-h-[400px]">
                  {activeDetailTab === 'Status' && (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-md font-semibold text-gray-700 mb-3">Latest Sensor Readings</h3>
                            {isSensorHistoryLoading ? <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin inline-block text-gray-400"/></div>
                            : sensorHistoryError ? <p className="text-red-600 text-sm">{sensorHistoryError}</p>
                            : latestReading ? (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-3">
                                        <div className="p-2 rounded bg-orange-50 border border-orange-200"> <p className="text-xs text-gray-600 font-medium flex items-center justify-center"><Thermometer size={12} className="mr-1 text-orange-500"/>Temp</p> <p className="text-xl font-bold text-orange-700">{latestReading.temperature?.toFixed(1) ?? 'N/A'}°C</p> </div>
                                        <div className="p-2 rounded bg-blue-50 border border-blue-200"> <p className="text-xs text-gray-600 font-medium flex items-center justify-center"><Droplets size={12} className="mr-1 text-blue-500"/>Humidity</p> <p className="text-xl font-bold text-blue-700">{latestReading.humidity?.toFixed(0) ?? 'N/A'}%</p> </div>
                                        <div className="p-2 rounded bg-purple-50 border border-purple-200"> <p className="text-xs text-gray-600 font-medium flex items-center justify-center"><TestTube2 size={12} className="mr-1 text-purple-500"/>pH</p> <p className="text-xl font-bold text-purple-700">{latestReading.ph?.toFixed(1) ?? 'N/A'}</p> </div>
                                        <div className="p-2 rounded bg-yellow-50 border border-yellow-200"> <p className="text-xs text-gray-600 font-medium flex items-center justify-center"><Zap size={12} className="mr-1 text-yellow-500"/>EC</p> <p className="text-xl font-bold text-yellow-700">{latestReading.ec?.toFixed(1) ?? 'N/A'}<span className="text-xs"> mS/cm</span></p> </div>
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
                        <div>
                            <h3 className="text-md font-semibold text-gray-700 mt-4 mb-3 pt-4 border-t">Recommendations & Status</h3>
                            {isSensorHistoryLoading || isLifecycleLoading || isFertilizersLoading || !plantDetails ? ( <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin inline-block text-gray-400"/> Loading status...</div> )
                            : sensorHistoryError || lifecycleError || fertilizersError ? ( <p className="text-red-600 text-sm">{sensorHistoryError || lifecycleError || fertilizersError}</p> )
                            : !latestReading ? ( <p className="text-sm text-gray-500">No sensor data for status.</p> )
                            : !currentStageRequirements ? ( <p className="text-sm text-gray-500">Plant stage or configuration missing for status.</p> )
                            : (
                                <div className="space-y-4">
                                    <p className="text-sm text-gray-600">Current Stage: <span className='font-medium text-gray-800'>{currentStageRequirements.name}</span> (Day {plantDetails?.datePlanted ? Math.max(0, Math.floor((new Date().getTime() - new Date(plantDetails.datePlanted).getTime()) / (1000 * 60 * 60 * 24))) : 'N/A'}) </p>
                                    <div>
                                        <p className="text-sm font-medium text-gray-700 mb-1">Environment:</p>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs">
                                            {environmentStatus.temp && <div className={`p-1.5 rounded ${environmentStatus.temp.color.replace('text-', 'bg-').replace('-600', '-100')}`}> <p className="font-semibold text-gray-900">Temp</p> <p className={environmentStatus.temp.color}>{environmentStatus.temp.status}</p> </div>}
                                            {environmentStatus.humidity && <div className={`p-1.5 rounded ${environmentStatus.humidity.color.replace('text-', 'bg-').replace('-600', '-100')}`}> <p className="font-semibold text-gray-900">Humidity</p> <p className={environmentStatus.humidity.color}>{environmentStatus.humidity.status}</p> </div>}
                                            {environmentStatus.ph && <div className={`p-1.5 rounded ${environmentStatus.ph.color.replace('text-', 'bg-').replace('-600', '-100')}`}> <p className="font-semibold text-gray-900">pH</p> <p className={environmentStatus.ph.color}>{environmentStatus.ph.status}</p> </div>}
                                            {environmentStatus.ec && <div className={`p-1.5 rounded ${environmentStatus.ec.color.replace('text-', 'bg-').replace('-600', '-100')}`}> <p className="font-semibold text-gray-900">EC</p> <p className={environmentStatus.ec.color}>{environmentStatus.ec.status}</p> </div>}
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
                                    <div>
                                        <p className="text-sm font-medium text-gray-700 mb-1 mt-3">Nutrients (NPK):</p>
                                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                            <div className={`p-1.5 rounded ${npkStatus.n.color.replace('text-', 'bg-').replace('-600', '-100')}`}> <p className="font-semibold text-gray-900">N</p> <p className={npkStatus.n.color}>{npkStatus.n.status}</p> </div>
                                            <div className={`p-1.5 rounded ${npkStatus.p.color.replace('text-', 'bg-').replace('-600', '-100')}`}> <p className="font-semibold text-gray-900">P</p> <p className={npkStatus.p.color}>{npkStatus.p.status}</p> </div>
                                            <div className={`p-1.5 rounded ${npkStatus.k.color.replace('text-', 'bg-').replace('-600', '-100')}`}> <p className="font-semibold text-gray-900">K</p> <p className={npkStatus.k.color}>{npkStatus.k.status}</p> </div>
                                        </div>
                                    </div>
                                    <div className="mt-3">
                                        <p className="text-sm font-medium text-gray-700 mb-1">Fertilizer Prescription:</p>
                                        {(npkStatus.n.status === 'Low' || npkStatus.p.status === 'Low' || npkStatus.k.status === 'Low') ? (
                                            fertilizerRecommendations.length > 0 ? (
                                                <div className="space-y-2 p-3 bg-sky-50 border border-sky-200 rounded-md">
                                                    <p className="text-sm text-sky-800 font-medium flex items-center"><FlaskConical size={16} className="mr-1.5 flex-shrink-0"/>Top Suggestions:</p>
                                                    <ul className="list-none space-y-1.5 text-sm text-gray-700">
                                                        {fertilizerRecommendations.map((rec, index) => (
                                                            <li key={index} className="p-2 bg-white rounded shadow-sm border border-gray-200">
                                                                <p className="font-semibold text-gray-800">{rec.name} <span className="text-xs text-gray-500">(NPK: {rec.npk_display})</span></p>
                                                                <p className="text-xs text-gray-600 mt-0.5">Reason: {rec.reason}</p>
                                                                {rec.amount && rec.unit && (<p className="text-sm text-blue-600 font-semibold mt-1">Apply: {rec.amount} {rec.unit}</p>)}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ) : (<p className="text-sm text-orange-600 mt-1 flex items-center"><AlertCircle size={16} className="mr-1"/>Nutrient deficiency detected, but no suitable fertilizer found in inventory or recommendations could not be generated.</p>)
                                        ) : (npkStatus.n.status === 'Optimal' && npkStatus.p.status === 'Optimal' && npkStatus.k.status === 'Optimal') ? (
                                            <p className="text-sm text-green-700 mt-1 flex items-center"><Check size={16} className="mr-1"/>NPK levels appear optimal.</p>
                                        ) : (npkStatus.n.status === 'High' || npkStatus.p.status === 'High' || npkStatus.k.status === 'High') ? (
                                            <p className="text-sm text-red-700 mt-1 flex items-center"><AlertCircle size={16} className="mr-1"/>Nutrient levels high. Avoid adding {[npkStatus.n.status === 'High' && 'N', npkStatus.p.status === 'High' && 'P', npkStatus.k.status === 'High' && 'K'].filter(Boolean).join(', ')}.</p>
                                        ) : (<p className="text-xs text-gray-500 mt-1">NPK status could not be determined or thresholds not defined.</p>)}
                                    </div>
                                    {emailError && <p className="text-xs text-red-500 mt-2 flex items-center"><MailWarning size={14} className="mr-1"/> {emailError}</p>}
                                </div>
                            )}
                        </div>
                    </div>
                  )}
                  {activeDetailTab === 'Events' && (
                    <div>
                      <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center"> <History size={18} className="mr-2" /> Plant Event History </h2>
                      {isPlantEventsLoading ? ( <div className="text-center py-6"><Loader2 className="h-6 w-6 animate-spin inline-block text-gray-500"/></div> )
                      : plantEventsError ? ( <p className="text-red-600 text-sm">{plantEventsError}</p> )
                      : plantEvents.length > 0 ? ( <div className="max-h-96 overflow-y-auto"> <ul className="divide-y divide-gray-200">{plantEvents.map(event => ( <li key={event.id} className="p-3 hover:bg-gray-50"> <p className="font-medium text-gray-800 text-sm mb-1">{event.message}</p> <div className="flex items-center text-xs text-gray-500 space-x-2"> <Clock size={12} /> <span>{formatDate(event.timestamp)}</span> <span className="font-semibold">({event.type})</span> {event.status && <span className={`px-1.5 py-0.5 rounded-full text-xs ${event.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>{event.status}</span>} </div> </li> ))}</ul> </div> )
                      : ( <p className="text-sm text-gray-500 text-center py-6">No event history found for this plant.</p> )}
                    </div>
                  )}
                  {activeDetailTab === 'Costs' && (
                    <div>
                      <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center"> <DollarSign size={18} className="mr-2" /> Cost & Usage Log </h2>
                      {isCostLoading ? ( <div className="text-center py-6"><Loader2 className="h-6 w-6 animate-spin inline-block text-gray-500"/></div> )
                      : costError ? ( <p className="text-red-600 text-sm">{costError}</p> )
                      : costLogs.length > 0 ? (
                        <div className="overflow-x-auto max-h-96">
                          <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Item</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Cost/Value</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {costLogs.map(log => {
                                const { Icon, color } = getLogTypeStyle(log.type);
                                const isCost = ['Seed Planted', 'Fertilizer Used', 'Material Used', 'Purchase'].includes(log.type);
                                return (
                                  <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDate(log.timestamp)}</td>
                                    <td className="px-3 py-2 whitespace-nowrap"><span className={`inline-flex items-center text-xs font-medium ${color}`}><Icon size={14} className="mr-1.5" />{log.type}</span></td>
                                    <td className="px-3 py-2 whitespace-nowrap text-gray-800">{log.itemName}</td>
                                    <td className={`px-3 py-2 whitespace-nowrap text-right ${log.quantityChange > 0 && log.type !== 'Sale' ? 'text-green-600' : 'text-red-600'}`}>{log.quantityChange > 0 && log.type !== 'Sale' ? '+' : ''}{log.quantityChange}{log.unit ? ` ${log.unit}` : ''}</td>
                                    <td className={`px-3 py-2 whitespace-nowrap text-right font-medium ${isCost ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(log.totalCostOrValue)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : ( <p className="text-sm text-gray-500 text-center py-6">No cost or usage logs found for this plant.</p> )}
                    </div>
                  )}
                  {activeDetailTab === 'Sensors' && (
                    <div>
                      <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center"> <Activity size={18} className="mr-2" /> Full Sensor History </h2>
                      {isSensorHistoryLoading ? ( <div className="text-center py-6"><Loader2 className="h-6 w-6 animate-spin inline-block text-gray-500"/></div> )
                      : sensorHistoryError ? ( <p className="text-red-600 text-sm">{sensorHistoryError}</p> )
                      : sensorHistory.length > 0 ? (
                        <div className="overflow-x-auto max-h-96">
                          <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Temp (°C)</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Humid (%)</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">pH</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">EC (mS/cm)</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">N (ppm)</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">P (ppm)</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">K (ppm)</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {sensorHistory.map(reading => (
                                <tr key={reading.id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDate(reading.timestamp)}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-800 text-right">{reading.temperature?.toFixed(1) ?? '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-800 text-right">{reading.humidity?.toFixed(0) ?? '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-800 text-right">{reading.ph?.toFixed(1) ?? '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-800 text-right">{reading.ec?.toFixed(1) ?? '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-800 text-right">{reading.nitrogen?.toFixed(0) ?? '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-800 text-right">{reading.phosphorus?.toFixed(0) ?? '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-800 text-right">{reading.potassium?.toFixed(0) ?? '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : ( <p className="text-sm text-gray-500 text-center py-6">No historical sensor readings found for this plant.</p> )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {plantDetails && (
            <button
                onClick={() => setIsAddSensorModalOpen(true)}
                className="fixed bottom-8 right-8 z-30 bg-green-600 text-white p-4 rounded-full shadow-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition ease-in-out duration-150 hover:scale-110 active:scale-100"
                aria-label="Add Sensor Reading"
                title="Add New Sensor Reading"
            >
                <Plus size={24} />
            </button>
          )}
        </main>
      </div>

      {isAddSensorModalOpen && plantDetails && (
        <AddSensorReadingModal
            isOpen={isAddSensorModalOpen}
            onClose={() => setIsAddSensorModalOpen(false)}
            onSubmit={handleAddSensorReadingSubmit}
            plantName={plantDetails.name}
        />
      )}
    </div>
  );
}
