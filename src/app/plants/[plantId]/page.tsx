'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
  doc, getDoc, collection, query, where, orderBy, getDocs,
  Timestamp, addDoc, serverTimestamp, runTransaction, increment
} from 'firebase/firestore';
import { ref, get } from "firebase/database"; // For Firebase Realtime Database (if used for images)
import { firestore, auth, database } from '@/app/lib/firebase/config'; // Adjust path if needed
import { useAuthState } from 'react-firebase-hooks/auth';

import emailjs from '@emailjs/browser';

import Sidebar from '@/components/Sidebar'; // Adjust path if needed
import LoadingSpinner from '@/components/LoadingSpinner'; // Adjust path if needed
import AddSensorReadingModal, { SensorReadingData } from '@/components/AddSensorReadingModal'; // Adjust path
// UseItemModal is imported but its invocation is commented out as SelectItemForUsageModal now handles integrated usage logging.
import UseItemModal from '@/components/UseItemModal'; 
import SelectItemForUsageModal, { InventoryItem as SelectableInventoryItem } from '@/components/SelectItemForUsageModal'; // Adjust path

import {
    Loader2, AlertTriangle, Leaf, ImageOff, Thermometer, Droplets, TestTube2, Zap, Clock,
    History, DollarSign, ShoppingCart, Settings, PlusCircle, Package, FileText, BarChart3,
    Check, AlertCircle, Activity, Info, FlaskConical, MailWarning, MinusCircle as UseIcon
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

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  pricePerUnit: number;
  lowStockThreshold?: number;
  lastUpdated?: Date;
  ownerUid?: string;
  n_percentage?: number;
  p_percentage?: number;
  k_percentage?: number;
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

interface StageSpecificRequirements {
    name: string;
    startDay: number;
    description?: string;
    minN?: number;    maxN?: number;
    minP?: number;    maxP?: number;
    minK?: number;    maxK?: number;
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
  minTemp?: number;  maxTemp?: number;
  minHumidity?: number; maxHumidity?: number;
  minPH?: number; maxPH?: number;
  minEC?: number; maxEC?: number;
  stages: StageSpecificRequirements[];
}

interface CurrentStageCombinedRequirements extends StageSpecificRequirements {
    minTempC?: number;    maxTempC?: number;
    minHumidityPercent?: number; maxHumidityPercent?: number;
    minPH?: number;    maxPH?: number;
    minEC_mS_cm?: number; maxEC_mS_cm?: number;
}

interface UserSettings {
    defaultProfitMargin?: number;
}

interface FertilizerForRecommendation {
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

const PLANT_ALERT_COOLDOWN_KEY_PREFIX = "plant_alert_summary_";
const PLANT_ALERT_COOLDOWN_PERIOD_MS = 6 * 60 * 60 * 1000; // 6 hours

// --- Helper Functions ---
const formatCurrency = (value: number, forceZeroDisplay = false): string => {
    if (value === 0 && !forceZeroDisplay && value !== null && value !== undefined) return '-';
    if (isNaN(value) || value === null || value === undefined) return 'N/A';
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
};

const formatDate = (date: Date | null | undefined): string => {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
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
  const plantAlertCooldowns = useRef<{[plantId: string]: number}>({});
  const [emailError, setEmailError] = useState<string | null>(null);
  const [allInventoryItems, setAllInventoryItems] = useState<InventoryItem[]>([]);
  const [isInventoryLoading, setIsInventoryLoading] = useState<boolean>(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [isAddSensorModalOpen, setIsAddSensorModalOpen] = useState(false);
  const [isSelectItemModalOpen, setIsSelectItemModalOpen] = useState(false);
  // itemToUseForCost and isUseItemForCostModalOpen are related to UseItemModal, 
  // which might be a separate modal or its functionality is now merged into SelectItemForUsageModal.
  // For clarity, if SelectItemForUsageModal handles everything, these might not be needed at this page level.
  // const [itemToUseForCost, setItemToUseForCost] = useState<InventoryItem | null>(null); 
  // const [isUseItemForCostModalOpen, setIsUseItemForCostModalOpen] = useState(false); 


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
              if (data.ownerUid !== user.uid) { throw new Error("Permission denied. You do not own this plant."); }
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
                    if (!database) { console.warn("RTDB not initialized for image fetching."); setIsImageLoading(false); return; }
                    const imageRefRTDB = ref(database, fetchedPlantDetails.imageUrl);
                    const imageSnapshot = await get(imageRefRTDB);
                    if (imageSnapshot.exists()) {
                        const base64Data = imageSnapshot.val();
                        if (typeof base64Data === 'string' && base64Data.startsWith('data:image/')) { setImageData(base64Data); } 
                        else { console.warn("Invalid image format in RTDB:", fetchedPlantDetails.imageUrl); }
                    } else { console.warn("Image not found in RTDB at path:", fetchedPlantDetails.imageUrl); }
                } else if (fetchedPlantDetails.imageUrl.startsWith('http')) { setImageData(fetchedPlantDetails.imageUrl); }
                else { console.warn("Unknown imageUrl format:", fetchedPlantDetails.imageUrl); }
              }
          } catch (err: any) { console.error("Error fetching plant details:", err); setError(err.message); setPlantDetails(null); }
          finally { setIsLoading(false); setIsImageLoading(false); }
      };
      fetchPlantAndImage();
    } else if (!plantId && !loadingAuth) { setError("Plant ID is missing in the URL."); setIsLoading(false); setIsImageLoading(false); }
      else if ((!firestore || !database) && !loadingAuth && user) { setError("Database services are not fully available."); setIsLoading(false); setIsImageLoading(false); }
  }, [plantId, user, loadingAuth, firestore, database]);

  // Fetch Plant Lifecycle Data
  useEffect(() => {
    if (plantDetails?.type && firestore && !isLoading) { 
        const fetchLifecycleData = async () => {
            setIsLifecycleLoading(true); setLifecycleError(null); setPlantLifecycleData(null);
            const typeDocRef = doc(firestore, 'plantTypes', plantDetails.type);
            const defaultTypeDocRef = doc(firestore, 'plantTypes', 'Default');
            try {
                let docSnap = await getDoc(typeDocRef);
                if (!docSnap.exists()) {
                    console.warn(`Lifecycle data for type "${plantDetails.type}" not found. Attempting to load "Default" configuration.`);
                    docSnap = await getDoc(defaultTypeDocRef);
                }
                if (docSnap.exists()) { setPlantLifecycleData(docSnap.data() as PlantLifecycle); }
                else { setLifecycleError(`Plant configuration not found for type "${plantDetails.type}" or for "Default".`); }
            } catch (err:any) { console.error("Error fetching plant lifecycle data:", err); setLifecycleError(`Failed to load plant lifecycle config: ${err.message}`); }
            finally { setIsLifecycleLoading(false); }
        };
        fetchLifecycleData();
    } else if (plantDetails && !plantDetails.type && !isLoading) { setIsLifecycleLoading(false); setLifecycleError("Plant type is missing, cannot load lifecycle data."); }
      else if (!plantDetails && !isLoading) { setIsLifecycleLoading(false); }
  }, [plantDetails, firestore, isLoading]);

  // Fetch User Settings
  useEffect(() => {
      if (user && firestore && !loadingAuth) {
          const fetchUserSettings = async () => {
              setIsSettingsLoading(true); setSettingsError(null); setUserSettings({});
              const userDocRef = doc(firestore, 'users', user.uid);
              try {
                  const docSnap = await getDoc(userDocRef);
                  if (docSnap.exists()) { setUserSettings(docSnap.data() as UserSettings); }
                  else { console.warn("User settings document not found."); }
              } catch (err:any) { console.error("Error fetching user settings:", err); setSettingsError(`Failed to load user settings: ${err.message}`); }
              finally { setIsSettingsLoading(false); }
          };
          fetchUserSettings();
      } else if (!user && !loadingAuth) { setIsSettingsLoading(false); setUserSettings({});}
  }, [user, firestore, loadingAuth]);

  // Fetch Sensor History
  useEffect(() => {
      if (user && firestore && plantId && !loadingAuth) {
          const fetchSensorHistory = async () => {
              setIsSensorHistoryLoading(true); setSensorHistoryError(null); setSensorHistory([]);
              try {
                  const readingsCollectionRef = collection(firestore, 'sensorReadings');
                  const qReadings = query(readingsCollectionRef, where("plantId", "==", plantId), orderBy("timestamp", "desc"));
                  const readingsSnapshot = await getDocs(qReadings);
                  const fetchedReadings: SensorReading[] = [];
                  readingsSnapshot.forEach((docSnap) => {
                      const readingData = docSnap.data();
                      fetchedReadings.push({ 
                          id: docSnap.id, 
                          timestamp: readingData.timestamp instanceof Timestamp ? readingData.timestamp.toDate() : new Date(readingData.timestamp), 
                          temperature: typeof readingData.temperature === 'number' ? readingData.temperature : undefined, 
                          humidity: typeof readingData.humidity === 'number' ? readingData.humidity : undefined, 
                          ph: typeof readingData.ph === 'number' ? readingData.ph : undefined, 
                          ec: typeof readingData.ec === 'number' ? readingData.ec : undefined, 
                          nitrogen: typeof readingData.nitrogen === 'number' ? readingData.nitrogen : undefined, 
                          phosphorus: typeof readingData.phosphorus === 'number' ? readingData.phosphorus : undefined, 
                          potassium: typeof readingData.potassium === 'number' ? readingData.potassium : undefined, 
                          notes: readingData.notes 
                      });
                  });
                  setSensorHistory(fetchedReadings);
              } catch (err: any) { console.error("Error fetching sensor history:", err); setSensorHistoryError(`Failed to load sensor history: ${err.message}`); }
              finally { setIsSensorHistoryLoading(false); }
          };
          fetchSensorHistory();
      } else if (!plantId && user && !loadingAuth) { setIsSensorHistoryLoading(false); setSensorHistory([]);}
  }, [plantId, user, firestore, loadingAuth]);

  // Fetch Plant Events
  useEffect(() => {
      if (user && firestore && plantId && !loadingAuth) {
          const fetchPlantEvents = async () => {
              setIsPlantEventsLoading(true); setPlantEventsError(null); setPlantEvents([]);
              try {
                  const eventsRef = collection(firestore, 'events');
                  const q = query( eventsRef, where("plantId", "==", plantId), where("userId", "==", user.uid), orderBy("timestamp", "desc") );
                  const querySnapshot = await getDocs(q);
                  const fetchedEvents: PlantEvent[] = [];
                  querySnapshot.forEach((docSnap) => {
                      const data = docSnap.data();
                      fetchedEvents.push({ 
                          id: docSnap.id, 
                          timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp), 
                          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt), 
                          type: data.type || 'Unknown', message: data.message || 'No description', 
                          plantId: data.plantId, status: data.status, userId: data.userId 
                      });
                  });
                  setPlantEvents(fetchedEvents);
              } catch (err: any) { console.error("Error fetching plant events:", err); setPlantEventsError(`Failed to load event history: ${err.message}`); }
              finally { setIsPlantEventsLoading(false); }
          };
          fetchPlantEvents();
      } else if (!plantId && user && !loadingAuth) { setIsPlantEventsLoading(false); setPlantEvents([]);}
  }, [plantId, user, firestore, loadingAuth]);

  // Fetch Cost Logs
  useEffect(() => {
    if (user && firestore && plantId && !loadingAuth) {
      const fetchCostLogs = async () => {
        setIsCostLoading(true); setCostError(null); setCostLogs([]);
        try {
          const logCollectionRef = collection(firestore, 'inventory_log');
          const q = query( logCollectionRef, where("plantId", "==", plantId), where("userId", "==", user.uid), orderBy("timestamp", "desc") );
          const querySnapshot = await getDocs(q);
          const fetchedLogs: InventoryLogEntry[] = [];
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const quantityChange = Number(data.quantityChange) || 0;
            const costOrValuePerUnit = Number(data.costOrValuePerUnit) || 0;
            fetchedLogs.push({ 
                id: docSnap.id, 
                itemId: data.itemId || 'N/A', 
                itemName: data.itemName || 'N/A', 
                timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp), 
                type: data.type as InventoryLogEntry['type'], 
                quantityChange: quantityChange, 
                costOrValuePerUnit: costOrValuePerUnit, 
                totalCostOrValue: Math.abs(quantityChange) * costOrValuePerUnit,
                notes: data.notes || '', 
                userId: data.userId, 
                plantId: data.plantId, 
                unit: data.unit 
            });
          });
          setCostLogs(fetchedLogs);
        } catch (err: any) { console.error("Error fetching cost logs:", err); setCostError(`Failed to load cost logs: ${err.message}`); }
        finally { setIsCostLoading(false); }
      };
      fetchCostLogs();
    } else if (!plantId && user && !loadingAuth) { setIsCostLoading(false); setCostLogs([]);}
  }, [plantId, user, firestore, loadingAuth]);

  // Fetch All (In-Stock) Inventory Items
  useEffect(() => {
    if (user && firestore && !loadingAuth) { 
      const fetchAllInventory = async () => {
        console.log("[PlantDetailPage] Attempting to fetch all in-stock inventory items...");
        setIsInventoryLoading(true);
        setInventoryError(null);
        setAllInventoryItems([]);
        const inventoryRef = collection(firestore, 'inventory');
        const q = query(inventoryRef, where("stock", ">", 0)); 
        try {
          console.log("[PlantDetailPage] Executing inventory query: category='any', stock > 0.");
          const querySnapshot = await getDocs(q);
          console.log("[PlantDetailPage] All inventory querySnapshot received. Size:", querySnapshot.size);
          const fetchedItems: InventoryItem[] = [];
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            fetchedItems.push({
              id: docSnap.id, name: data.name || 'Unnamed Item', category: data.category || 'other',
              stock: Number(data.stock) || 0, unit: data.unit || 'unit',
              pricePerUnit: Number(data.pricePerUnit) || 0,
              lowStockThreshold: data.lowStockThreshold !== undefined ? Number(data.lowStockThreshold) : undefined,
              lastUpdated: data.lastUpdated instanceof Timestamp ? data.lastUpdated.toDate() : (data.lastUpdated ? new Date(data.lastUpdated) : undefined),
              ownerUid: data.ownerUid, 
              n_percentage: typeof data.n_percentage === 'number' ? data.n_percentage : undefined,
              p_percentage: typeof data.p_percentage === 'number' ? data.p_percentage : undefined,
              k_percentage: typeof data.k_percentage === 'number' ? data.k_percentage : undefined,
            });
          });
          setAllInventoryItems(fetchedItems.sort((a, b) => a.name.localeCompare(b.name)));
          if (querySnapshot.empty) { console.log("[PlantDetailPage] No inventory items found matching criteria (stock > 0)."); } 
          else { console.log("[PlantDetailPage] Successfully processed", fetchedItems.length, "inventory items."); }
        } catch (error: any) {
          console.error("[PlantDetailPage] Error fetching all inventory. Code:", error.code, "Message:", error.message, "Full Error:", error);
          setInventoryError(`Failed to load inventory. Error: ${error.code || 'Unknown'} - ${error.message || 'Please check console and Firestore rules/indexes.'}`);
        } finally { setIsInventoryLoading(false); }
      };
      fetchAllInventory();
    } else {
      setIsInventoryLoading(false); setAllInventoryItems([]);
      if (!user && !loadingAuth) { console.warn("[PlantDetailPage] All inventory not fetched: User not authenticated or user object not yet available."); }
      if (!firestore && !loadingAuth) { console.warn("[PlantDetailPage] All inventory not fetched: Firestore service not available."); }
    }
  }, [user, firestore, loadingAuth]); 

  // Determine Current Stage Requirements
  useEffect(() => {
      if (plantDetails?.datePlanted && plantLifecycleData?.stages && plantLifecycleData.stages.length > 0 && !isLifecycleLoading) {
          const today = new Date();
          const plantedDate = plantDetails.datePlanted instanceof Date ? plantDetails.datePlanted : new Date(plantDetails.datePlanted);
          if (isNaN(plantedDate.getTime())) { console.warn("Invalid datePlanted for current stage calculation."); setCurrentStageRequirements(null); return; }
          const timeDiff = today.getTime() - plantedDate.getTime();
          const daysSincePlanted = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));
          let activeStage: StageSpecificRequirements | null = null;
          for (let i = plantLifecycleData.stages.length - 1; i >= 0; i--) {
              if (daysSincePlanted >= plantLifecycleData.stages[i].startDay) { activeStage = plantLifecycleData.stages[i]; break; }
          }
          if (!activeStage && plantLifecycleData.stages.length > 0) activeStage = plantLifecycleData.stages[0];
          if (activeStage) {
              const combinedReqs: CurrentStageCombinedRequirements = {
                  ...activeStage,
                  minTempC: plantLifecycleData.minTemp, maxTempC: plantLifecycleData.maxTemp,
                  minHumidityPercent: plantLifecycleData.minHumidity, maxHumidityPercent: plantLifecycleData.maxHumidity,
                  minPH: plantLifecycleData.minPH, maxPH: plantLifecycleData.maxPH,
                  minEC_mS_cm: plantLifecycleData.minEC, maxEC_mS_cm: plantLifecycleData.maxEC,
              };
              setCurrentStageRequirements(combinedReqs);
          } else { console.warn("No active stage could be determined for plant:", plantDetails.name); setCurrentStageRequirements(null); }
      } else if (!isLifecycleLoading) { setCurrentStageRequirements(null); }
  }, [plantDetails, plantLifecycleData, isLifecycleLoading]);

  // --- useMemo Hooks for Derived Data ---
  const availableFertilizers = useMemo((): FertilizerForRecommendation[] => { 
    if (isInventoryLoading || inventoryError || !allInventoryItems || allInventoryItems.length === 0) return [];
    return allInventoryItems
        .filter(item => item.category === 'fertilizers' && item.stock > 0)
        .map(item => ({ id: item.id, name: item.name, stock: item.stock, unit: item.unit, n_percentage: item.n_percentage, p_percentage: item.p_percentage, k_percentage: item.k_percentage, }));
  }, [allInventoryItems, isInventoryLoading, inventoryError]);

  const latestReading = useMemo(() => sensorHistory.length > 0 ? sensorHistory[0] : null, [sensorHistory]);
  const { totalCost, totalRevenue } = useMemo(() => { 
    if (isCostLoading || costLogs.length === 0) return { totalCost: 0, totalRevenue: 0 };
    let cost = 0; let revenue = 0;
    const costItemTypes: InventoryLogEntry['type'][] = ['Seed Planted', 'Fertilizer Used', 'Material Used', 'Purchase', 'Initial Stock'];
    costLogs.forEach(log => {
        if (costItemTypes.includes(log.type)) { cost += log.totalCostOrValue; }
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
    if (isSensorHistoryLoading || !latestReading || !currentStageRequirements) { return { temp: null, humidity: null, ph: null, ec: null }; }
    return {
        temp: checkThreshold(latestReading.temperature, currentStageRequirements.minTempC, currentStageRequirements.maxTempC),
        humidity: checkThreshold(latestReading.humidity, currentStageRequirements.minHumidityPercent, currentStageRequirements.maxHumidityPercent),
        ph: checkThreshold(latestReading.ph, currentStageRequirements.minPH, currentStageRequirements.maxPH),
        ec: checkThreshold(latestReading.ec, currentStageRequirements.minEC_mS_cm, currentStageRequirements.maxEC_mS_cm)
    };
  }, [latestReading, currentStageRequirements, isSensorHistoryLoading]);

  const npkStatus = useMemo(() => {
    if (isSensorHistoryLoading || !latestReading || !currentStageRequirements) { return { n: { status: 'N/A', color: 'text-gray-500' } as StatusResult, p: { status: 'N/A', color: 'text-gray-500' } as StatusResult, k: { status: 'N/A', color: 'text-gray-500' } as StatusResult }; }
    return {
        n: getNpkStatus(latestReading.nitrogen, currentStageRequirements.minN, currentStageRequirements.maxN),
        p: getNpkStatus(latestReading.phosphorus, currentStageRequirements.minP, currentStageRequirements.maxP),
        k: getNpkStatus(latestReading.potassium, currentStageRequirements.minK, currentStageRequirements.maxK),
    };
  }, [latestReading, currentStageRequirements, isSensorHistoryLoading]);

  const fertilizerRecommendations = useMemo((): FormattedFertilizerRecommendation[] => {
    if (isInventoryLoading || inventoryError || !npkStatus || availableFertilizers.length === 0 || !currentStageRequirements || !plantDetails) { return []; }
    const recommendations: FormattedFertilizerRecommendation[] = [];
    const needsN = npkStatus.n.status === 'Low'; const needsP = npkStatus.p.status === 'Low'; const needsK = npkStatus.k.status === 'Low';
    const highN = npkStatus.n.status === 'High'; const highP = npkStatus.p.status === 'High'; const highK = npkStatus.k.status === 'High';
    const optimalN = npkStatus.n.status === 'Optimal' || npkStatus.n.status === 'OK (>= Min)' || npkStatus.n.status === 'OK (<= Max)';
    const optimalP = npkStatus.p.status === 'Optimal' || npkStatus.p.status === 'OK (>= Min)' || npkStatus.p.status === 'OK (<= Max)';
    const optimalK = npkStatus.k.status === 'Optimal' || npkStatus.k.status === 'OK (>= Min)' || npkStatus.k.status === 'OK (<= Max)';
    if (!needsN && !needsP && !needsK) return []; 
    availableFertilizers.forEach(fert => { 
        const n_perc = fert.n_percentage ?? 0; const p_perc = fert.p_percentage ?? 0; const k_perc = fert.k_percentage ?? 0;
        let suitabilityScore = 0.0; let reasons: string[] = []; let addressesAtLeastOneNeed = false; let deficienciesMetCount = 0;
        
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
            let prescribedAmountText = "Qty pending"; const TARGET_GRAMS_NUTRIENT_PER_PLANT_EVENT = 0.25; let primaryNutrientPercentageForCalc = 0.0;
            if (deficienciesMetCount === 1) { if (needsN && n_perc > 0) primaryNutrientPercentageForCalc = n_perc; else if (needsP && p_perc > 0) primaryNutrientPercentageForCalc = p_perc; else if (needsK && k_perc > 0) primaryNutrientPercentageForCalc = k_perc; } 
            else if (deficienciesMetCount > 1) { let tempMaxPerc = 0; if (needsN && n_perc > tempMaxPerc) tempMaxPerc = n_perc; if (needsP && p_perc > tempMaxPerc) tempMaxPerc = p_perc; if (needsK && k_perc > tempMaxPerc) tempMaxPerc = k_perc; primaryNutrientPercentageForCalc = tempMaxPerc; }
            if (primaryNutrientPercentageForCalc > 0) { const numPlants = plantDetails.initialSeedQuantity && plantDetails.initialSeedQuantity > 0 ? plantDetails.initialSeedQuantity : 1; const gramsOfProductPerPlantEvent = (TARGET_GRAMS_NUTRIENT_PER_PLANT_EVENT / (primaryNutrientPercentageForCalc / 100)); const totalGramsOfProduct = gramsOfProductPerPlantEvent * numPlants; prescribedAmountText = totalGramsOfProduct.toFixed(1); }
            recommendations.push({ name: fert.name, reason: reasons.join('. '), score: parseFloat(suitabilityScore.toFixed(2)), npk_display: `${n_perc.toFixed(0)}-${p_perc.toFixed(0)}-${k_perc.toFixed(0)}`, amount: prescribedAmountText, unit: fert.unit || 'units' });
        }
    });
    return recommendations.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [npkStatus, availableFertilizers, isInventoryLoading, inventoryError, currentStageRequirements, plantDetails]);

  // --- MODIFIED Email Notification Logic (Sends to ALL users) ---
  const sendConsolidatedEmailNotification = useCallback(async (alertTitle: string, consolidatedAlertDetails: string) => {
    setEmailError(null);
    if (!plantDetails || !firestore || !plantId ) {
        console.warn("[EmailJS] Missing plantDetails, plantId, or firestore for sending consolidated notification.");
        return;
    }

    const now = Date.now();
    const cooldownKeyForPlant = `${PLANT_ALERT_COOLDOWN_KEY_PREFIX}${plantId}`;
    // @ts-ignore 
    const lastSentTimestamp = plantAlertCooldowns.current[cooldownKeyForPlant];

    if (lastSentTimestamp && (now - lastSentTimestamp < PLANT_ALERT_COOLDOWN_PERIOD_MS)) {
        console.log(`[EmailJS] Consolidated alert cooldown active for plant ${plantDetails.name} (${plantId}). Last sent: ${new Date(lastSentTimestamp).toLocaleTimeString()}`);
        return;
    }

    const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
    const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID_CONSOLIDATED || process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
    const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

    if (!serviceId || !templateId || !publicKey) {
        console.error("[EmailJS] EmailJS credentials missing or incomplete in .env.local.");
        setEmailError("Email service not configured correctly for consolidated alerts.");
        return;
    }

    try {
        const usersCollectionRef = collection(firestore, 'users');
        const usersSnapshot = await getDocs(usersCollectionRef);

        if (usersSnapshot.empty) {
            console.warn("[EmailJS] No users found in 'users' collection to notify.");
            setEmailError("No users configured to receive notifications.");
            return;
        }
        
        console.log(`[EmailJS] Alert: ${alertTitle} for Plant: ${plantDetails.name}. Attempting to notify ${usersSnapshot.size} users.`);
        let emailsSentCount = 0;
        let anyEmailFailed = false;

        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            const recipientEmail = userData.email; 
            const recipientName = userData.displayName || 'User';

            if (recipientEmail && typeof recipientEmail === 'string' && recipientEmail.trim() !== '') {
                const templateParams = {
                    plant_name: plantDetails.name,
                    alert_title: alertTitle, 
                    alert_details: consolidatedAlertDetails,
                    email: recipientEmail, 
                    user_name: recipientName,
                    plant_link: `${window.location.origin}/plants/${plantId}`
                };
                
                try {
                    await emailjs.send(serviceId, templateId, templateParams, publicKey);
                    emailsSentCount++;
                } catch (emailSendError: any) {
                    console.error(`[EmailJS] Failed to send consolidated alert to ${recipientEmail}:`, emailSendError.status, emailSendError.text);
                    anyEmailFailed = true;
                }
            } else {
                console.warn(`[EmailJS] User document ${userDoc.id} missing valid email. Notification not sent to this user.`);
            }
        }

        if (emailsSentCount > 0) {
            // @ts-ignore 
            plantAlertCooldowns.current[cooldownKeyForPlant] = now; 
            console.log(`[EmailJS] Attempted to send ${emailsSentCount} consolidated alert emails for plant ${plantDetails.name}.`);
            if(anyEmailFailed) {
                 setEmailError(prev => `${prev ? prev + '; ' : ''}Some email notifications failed. Check console.`);
            }
        } else {
            console.warn(`[EmailJS] No emails were successfully sent for the consolidated alert on plant ${plantDetails.name}.`);
            if (!emailError && !anyEmailFailed) { 
                setEmailError("No valid recipients found or all email attempts failed.");
            } else if (anyEmailFailed && !emailError) { 
                 setEmailError("Some email notifications failed. Check console for details.");
            }
        }

    } catch (fetchUsersError: any) {
        console.error("[EmailJS] Error fetching users for notification:", fetchUsersError);
        setEmailError("Failed to fetch user list for notifications.");
    }
  }, [plantDetails, plantId, firestore]);

  // useEffect for collecting discrepancies and sending ONE consolidated email
  useEffect(() => {
    if (!isSensorHistoryLoading && !isLifecycleLoading && latestReading && currentStageRequirements && plantDetails && !isLoading && user) {
        const discrepancyMessages: string[] = [];
        const plantName = plantDetails.name;

        const formatDiscrepancy = (param: string, status: string, current?: number | string, targetMin?: number | string, targetMax?: number | string) => {
            let message = `${param} is ${status}. Current: ${current ?? 'N/A'}.`;
            if (targetMin !== undefined && targetMax !== undefined) { message += ` Target: ${targetMin}-${targetMax}.`; }
            else if (targetMin !== undefined) { message += ` Target: >= ${targetMin}.`; }
            else if (targetMax !== undefined) { message += ` Target: <= ${targetMax}.`; }
            return message;
        };

        if (environmentStatus.temp?.status === 'Low') discrepancyMessages.push(formatDiscrepancy('Temperature', 'Low', latestReading.temperature?.toFixed(1), currentStageRequirements.minTempC?.toFixed(1), currentStageRequirements.maxTempC?.toFixed(1)));
        if (environmentStatus.temp?.status === 'High') discrepancyMessages.push(formatDiscrepancy('Temperature', 'High', latestReading.temperature?.toFixed(1), currentStageRequirements.minTempC?.toFixed(1), currentStageRequirements.maxTempC?.toFixed(1)));
        if (environmentStatus.humidity?.status === 'Low') discrepancyMessages.push(formatDiscrepancy('Humidity', 'Low', latestReading.humidity?.toFixed(0), currentStageRequirements.minHumidityPercent?.toFixed(0), currentStageRequirements.maxHumidityPercent?.toFixed(0)));
        if (environmentStatus.humidity?.status === 'High') discrepancyMessages.push(formatDiscrepancy('Humidity', 'High', latestReading.humidity?.toFixed(0), currentStageRequirements.minHumidityPercent?.toFixed(0), currentStageRequirements.maxHumidityPercent?.toFixed(0)));
        if (environmentStatus.ph?.status === 'Low') discrepancyMessages.push(formatDiscrepancy('pH', 'Low', latestReading.ph?.toFixed(1), currentStageRequirements.minPH?.toFixed(1), currentStageRequirements.maxPH?.toFixed(1)));
        if (environmentStatus.ph?.status === 'High') discrepancyMessages.push(formatDiscrepancy('pH', 'High', latestReading.ph?.toFixed(1), currentStageRequirements.minPH?.toFixed(1), currentStageRequirements.maxPH?.toFixed(1)));
        if (environmentStatus.ec?.status === 'Low') discrepancyMessages.push(formatDiscrepancy('EC', 'Low', latestReading.ec?.toFixed(1), currentStageRequirements.minEC_mS_cm?.toFixed(1), currentStageRequirements.maxEC_mS_cm?.toFixed(1)));
        if (environmentStatus.ec?.status === 'High') discrepancyMessages.push(formatDiscrepancy('EC', 'High', latestReading.ec?.toFixed(1), currentStageRequirements.minEC_mS_cm?.toFixed(1), currentStageRequirements.maxEC_mS_cm?.toFixed(1)));
        if (npkStatus.n.status === 'Low') discrepancyMessages.push(formatDiscrepancy('Nitrogen (N)', 'Low', latestReading.nitrogen?.toFixed(0), currentStageRequirements.minN?.toFixed(0), currentStageRequirements.maxN?.toFixed(0)));
        if (npkStatus.n.status === 'High') discrepancyMessages.push(formatDiscrepancy('Nitrogen (N)', 'High', latestReading.nitrogen?.toFixed(0), currentStageRequirements.minN?.toFixed(0), currentStageRequirements.maxN?.toFixed(0)));
        if (npkStatus.p.status === 'Low') discrepancyMessages.push(formatDiscrepancy('Phosphorus (P)', 'Low', latestReading.phosphorus?.toFixed(0), currentStageRequirements.minP?.toFixed(0), currentStageRequirements.maxP?.toFixed(0)));
        if (npkStatus.p.status === 'High') discrepancyMessages.push(formatDiscrepancy('Phosphorus (P)', 'High', latestReading.phosphorus?.toFixed(0), currentStageRequirements.minP?.toFixed(0), currentStageRequirements.maxP?.toFixed(0)));
        if (npkStatus.k.status === 'Low') discrepancyMessages.push(formatDiscrepancy('Potassium (K)', 'Low', latestReading.potassium?.toFixed(0), currentStageRequirements.minK?.toFixed(0), currentStageRequirements.maxK?.toFixed(0)));
        if (npkStatus.k.status === 'High') discrepancyMessages.push(formatDiscrepancy('Potassium (K)', 'High', latestReading.potassium?.toFixed(0), currentStageRequirements.minK?.toFixed(0), currentStageRequirements.maxK?.toFixed(0)));

        if (discrepancyMessages.length > 0) {
            const consolidatedMessage = `The following issues were detected for plant "${plantName}":\n- ${discrepancyMessages.join('\n- ')}`;
            sendConsolidatedEmailNotification("Plant Health Alert", consolidatedMessage);
        }
    }
  }, [latestReading, currentStageRequirements, environmentStatus, npkStatus, isSensorHistoryLoading, isLifecycleLoading, plantDetails, isLoading, user, sendConsolidatedEmailNotification]);

  // --- Callback Handlers ---
  const handleAddSensorReadingSubmit = async (data: SensorReadingData) => {
    if (!user || !firestore || !plantId) { throw new Error("Cannot save sensor reading: critical information missing."); }
    const readingDataToSave: any = { plantId: plantId, userId: user.uid, timestamp: serverTimestamp() };
    (Object.keys(data) as Array<keyof SensorReadingData>).forEach(key => {
        const value = data[key];
        if (key === 'notes' && typeof value === 'string' && value.trim() !== '') { readingDataToSave[key] = value.trim(); }
        else if (typeof value === 'string' && value.trim() !== '' && key !== 'notes') {
            const numValue = parseFloat(value); if (!isNaN(numValue)) { readingDataToSave[key] = numValue; }
        } else if (typeof value === 'number' && !isNaN(value)) { readingDataToSave[key] = value; }
    });
    const numericKeys: (keyof SensorReadingData)[] = ['temperature', 'humidity', 'ph', 'ec', 'nitrogen', 'phosphorus', 'potassium'];
    const numericValuesPresent = numericKeys.some(key => typeof readingDataToSave[key] === 'number');
    if (!numericValuesPresent && !readingDataToSave.notes) { throw new Error("At least one sensor value or a note must be provided."); }
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
    } catch (error) { console.error("Error adding sensor reading:", error); if (error instanceof Error) { throw new Error(`Failed to save sensor reading: ${error.message}`); } throw new Error("Unknown error saving sensor reading."); }
  };

  // This function is called when an item is selected in SelectItemForUsageModal
  // It should then open the UseItemModal (if that's a separate modal for quantity/notes)
  const handleItemSelectedForUsage = (item: SelectableInventoryItem) => {
    // If SelectItemForUsageModal is now the one that takes quantity and notes,
    // this function might not be needed, or its role changes.
    // For the original two-modal flow:
    // setItemToUseForCost(item as InventoryItem); 
    // setIsUseItemForCostModalOpen(true); 
    setIsSelectItemModalOpen(false); // Close the item selection modal
  };

  // This function would be called by UseItemModal or the integrated SelectItemForUsageModal
  const handleUseItemForCostSubmit = async (item: InventoryItem, quantityUsed: number, notes?: string) => {
    if (!user || !firestore || !plantId || !plantDetails) { throw new Error("Cannot record item usage: critical information missing.");}
    if (quantityUsed <= 0) throw new Error("Quantity used must be positive.");

    const itemDocRef = doc(firestore, 'inventory', item.id);
    let logType: InventoryLogEntry['type'] = 'Material Used';
    if (item.category === 'fertilizers') logType = 'Fertilizer Used';
    else if (item.category === 'seeds') logType = 'Seed Planted'; // This case is less likely if seeds are filtered out

    try {
      await runTransaction(firestore, async (transaction) => {
        const itemDocSnap = await transaction.get(itemDocRef);
        if (!itemDocSnap.exists()) { throw new Error("Inventory item not found in database."); }
        const currentData = itemDocSnap.data();
        const currentStock = Number(currentData.stock) || 0;
        if (quantityUsed > currentStock) {
          throw new Error(`Not enough stock. Only ${currentStock} ${item.unit || 'units'} of ${item.name} available. Requested ${quantityUsed}.`);
        }
        transaction.update(itemDocRef, { stock: increment(-quantityUsed), lastUpdated: serverTimestamp() });
        
        const logCollectionRef = collection(firestore, 'inventory_log');
        const logEntryRef = doc(logCollectionRef);
        const logDataForWrite: Omit<InventoryLogEntry, 'id' | 'timestamp'> & {timestamp: any} = {
          itemId: item.id, itemName: item.name, timestamp: serverTimestamp(), type: logType,
          quantityChange: -quantityUsed, costOrValuePerUnit: item.pricePerUnit,
          totalCostOrValue: Math.abs(-quantityUsed) * item.pricePerUnit,
          notes: notes || `${logType} for plant: ${plantDetails.name}`,
          userId: user.uid, plantId: plantId, unit: item.unit,
        };
        transaction.set(logEntryRef, logDataForWrite);
      });

      // Optimistic UI update for Cost Logs
      const newLogForUI: InventoryLogEntry = {
          id: 'temp-' + Date.now(), 
          itemId: item.id, itemName: item.name, timestamp: new Date(), type: logType,
          quantityChange: -quantityUsed, costOrValuePerUnit: item.pricePerUnit,
          totalCostOrValue: Math.abs(-quantityUsed) * item.pricePerUnit,
          notes: notes || `${logType} for plant: ${plantDetails.name}`,
          userId: user.uid, plantId: plantId, unit: item.unit,
      };
      setCostLogs(prev => [newLogForUI, ...prev].sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime()));
      
      // Optimistic UI update for the main inventory list (allInventoryItems)
      setAllInventoryItems(prevItems =>
        prevItems.map(invItem =>
          invItem.id === item.id 
            ? { ...invItem, stock: invItem.stock - quantityUsed, lastUpdated: new Date() } 
            : invItem
        ).filter(invItem => invItem.stock > 0) 
      );
      
      // If UseItemModal was a separate modal, close it here
      // setIsUseItemForCostModalOpen(false);
      // setItemToUseForCost(null);
    } catch (error: any) { 
      console.error("Error processing item usage:", error); 
      throw new Error(error.message || "Failed to record item usage. Please try again."); 
    }
  };

  // --- Render Logic ---
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
  
  if (isLoading && !plantDetails) { 
      return <LoadingSpinner message={"Loading Plant Details..."} />;
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
      return (
        <div className="flex h-screen bg-gray-100">
            <Sidebar />
            <main className="flex-1 p-8 flex flex-col items-center justify-center text-center">
                <AlertTriangle className="h-16 w-16 text-yellow-500 mb-4" />
                <h2 className="text-2xl font-semibold text-yellow-700 mb-2">Plant Not Found</h2>
                <p className="text-gray-600 mb-6">The requested plant data could not be found or you may not have permission to view it.</p>
                <Link href="/dashboard" className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors">Go to Dashboard</Link>
            </main>
        </div>
      );
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
          {(lifecycleError || settingsError || sensorHistoryError || plantEventsError || costError || inventoryError || emailError) && (
              <div className="mb-4 text-sm text-red-700 bg-red-100 p-3 rounded-md border border-red-200" role="alert">
                  <div className="flex items-center">
                    <AlertTriangle size={18} className="mr-2 flex-shrink-0"/>
                    <strong className="font-semibold">Data Loading or Notification Issues:</strong>
                  </div>
                  <ul className="mt-1 list-disc list-inside text-xs">
                    {lifecycleError && <li>Plant Config: {lifecycleError}</li>}
                    {settingsError && <li>User Settings: {settingsError}</li>}
                    {sensorHistoryError && <li>Sensor Data: {sensorHistoryError}</li>}
                    {plantEventsError && <li>Events: {plantEventsError}</li>}
                    {costError && <li>Costs: {costError}</li>}
                    {inventoryError && <li>Inventory Data: {inventoryError}</li>}
                    {emailError && <li>Email Service: {emailError}</li>}
                  </ul>
              </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 xl:gap-8">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold text-gray-700 mb-3">Image</h2>
                <div className="w-full h-48 sm:h-56 md:h-64 relative bg-gray-200 rounded flex items-center justify-center text-gray-400 overflow-hidden">
                    {isImageLoading ? ( <Loader2 size={32} className="animate-spin text-gray-500" /> )
                    : imageData ? ( <img src={imageData} alt={plantDetails?.name} className="absolute inset-0 w-full h-full object-cover" /> )
                    : plantDetails?.imageUrl && plantDetails.imageUrl.startsWith('http') ? ( <img src={plantDetails.imageUrl} alt={plantDetails?.name} className="absolute inset-0 w-full h-full object-cover" /> )
                    : ( <div className="flex flex-col items-center"><ImageOff size={40} /><span className="text-xs mt-1">No image</span></div> )}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold text-gray-700 mb-3">Plant Information</h2>
                <dl className="space-y-2 text-sm">
                    <div className="flex justify-between"><dt className="text-gray-500">Name:</dt><dd className="text-gray-800 font-medium">{plantDetails?.name}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Type:</dt><dd className="text-gray-800">{plantDetails?.type}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Status:</dt><dd className="text-gray-800">{plantDetails?.status}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Date Planted:</dt><dd className="text-gray-800">{plantDetails?.datePlanted?.toLocaleDateString('en-CA') ?? 'N/A'}</dd></div>
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
                      <div className="flex justify-between"> <dt className="text-gray-500">Total Production Cost:</dt> <dd className="text-gray-800 font-medium">{formatCurrency(totalCost, true)}</dd> </div>
                      {totalRevenue > 0 && ( <> <div className="flex justify-between"> <dt className="text-gray-500">Total Revenue (Sales):</dt> <dd className="text-green-600 font-medium">{formatCurrency(totalRevenue)}</dd> </div> <div className="flex justify-between border-t pt-2 mt-2"> <dt className="text-gray-500 font-semibold">Net Profit/Loss:</dt> <dd className={`font-bold ${totalRevenue - totalCost >= 0 ? 'text-green-700' : 'text-red-600'}`}> {formatCurrency(totalRevenue - totalCost)} </dd> </div> </> )}
                      <div className="flex justify-between border-t pt-2 mt-2"> <dt className="text-gray-500">Suggested Sell Price:</dt> <dd className="text-blue-600 font-semibold">{suggestedPrice !== null ? formatCurrency(suggestedPrice) : (totalCost > 0 ? 'Margin not set' : 'N/A')}</dd> </div>
                      {totalCost > 0 && <p className="text-xs text-gray-400 text-right">(Based on {((userSettings.defaultProfitMargin ?? 0.2) * 100).toFixed(0)}% margin)</p>}
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
                  {activeDetailTab === 'Status' && ( <div className="space-y-6">
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
                            {isSensorHistoryLoading || isLifecycleLoading || isInventoryLoading || !plantDetails ? ( <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin inline-block text-gray-400"/> Loading status...</div> )
                            : sensorHistoryError || lifecycleError || inventoryError ? ( <p className="text-red-600 text-sm">{sensorHistoryError || lifecycleError || inventoryError}</p> )
                            : !latestReading ? ( <p className="text-sm text-gray-500">No sensor data for status.</p> )
                            : !currentStageRequirements ? ( <p className="text-sm text-gray-500">Plant stage or configuration missing for status.</p> )
                            : (
                                <div className="space-y-4">
                                    <p className="text-sm text-gray-600">Current Stage: <span className='font-medium text-gray-800'>{currentStageRequirements.name}</span> (Day {plantDetails?.datePlanted ? Math.max(0, Math.floor((new Date().getTime() - new Date(plantDetails.datePlanted).getTime()) / (1000 * 60 * 60 * 24))) : 'N/A'}) </p>
                                    <div>
                                        <p className="text-sm font-medium text-gray-700 mb-1">Environment:</p>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs">
                                          {environmentStatus.temp && <div className={`p-1.5 rounded ${environmentStatus.temp.color.replace('text-', 'bg-').replace('-600', '-100').replace('-700', '-100').replace('-500', '-50')}`}> <p className="font-semibold text-gray-900">Temp</p> <p className={environmentStatus.temp.color}>{environmentStatus.temp.status}</p> </div>}
                                          {environmentStatus.humidity && <div className={`p-1.5 rounded ${environmentStatus.humidity.color.replace('text-', 'bg-').replace('-600', '-100').replace('-700', '-100').replace('-500', '-50')}`}> <p className="font-semibold text-gray-900">Humidity</p> <p className={environmentStatus.humidity.color}>{environmentStatus.humidity.status}</p> </div>}
                                          {environmentStatus.ph && <div className={`p-1.5 rounded ${environmentStatus.ph.color.replace('text-', 'bg-').replace('-600', '-100').replace('-700', '-100').replace('-500', '-50')}`}> <p className="font-semibold text-gray-900">pH</p> <p className={environmentStatus.ph.color}>{environmentStatus.ph.status}</p> </div>}
                                          {environmentStatus.ec && <div className={`p-1.5 rounded ${environmentStatus.ec.color.replace('text-', 'bg-').replace('-600', '-100').replace('-700', '-100').replace('-500', '-50')}`}> <p className="font-semibold text-gray-900">EC</p> <p className={environmentStatus.ec.color}>{environmentStatus.ec.status}</p> </div>}
                                        </div>
                                        {/* Environment advice messages */}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-700 mb-1 mt-3">Nutrients (NPK):</p>
                                         <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                          <div className={`p-1.5 rounded ${npkStatus.n.color.replace('text-', 'bg-').replace('-600', '-100').replace('-700', '-100').replace('-500', '-50')}`}> <p className="font-semibold text-gray-900">N</p> <p className={npkStatus.n.color}>{npkStatus.n.status}</p> </div>
                                          <div className={`p-1.5 rounded ${npkStatus.p.color.replace('text-', 'bg-').replace('-600', '-100').replace('-700', '-100').replace('-500', '-50')}`}> <p className="font-semibold text-gray-900">P</p> <p className={npkStatus.p.color}>{npkStatus.p.status}</p> </div>
                                          <div className={`p-1.5 rounded ${npkStatus.k.color.replace('text-', 'bg-').replace('-600', '-100').replace('-700', '-100').replace('-500', '-50')}`}> <p className="font-semibold text-gray-900">K</p> <p className={npkStatus.k.color}>{npkStatus.k.status}</p> </div>
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
                                            ) : (<p className="text-sm text-orange-600 mt-1 flex items-center"><AlertCircle size={16} className="mr-1"/>Nutrient deficiency detected, but no suitable fertilizer found or recommendations could not be generated.</p>)
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
                        : plantEvents.length > 0 ? ( <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"> <ul className="divide-y divide-gray-200">{plantEvents.map(event => ( <li key={event.id} className="p-3 hover:bg-gray-50"> <p className="font-medium text-gray-800 text-sm mb-1">{event.message}</p> <div className="flex items-center text-xs text-gray-500 space-x-2"> <Clock size={12} /> <span>{formatDate(event.timestamp)}</span> <span className="font-semibold">({event.type})</span> {event.status && <span className={`px-1.5 py-0.5 rounded-full text-xs ${event.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>{event.status}</span>} </div> </li> ))}</ul> </div> )
                        : ( <p className="text-sm text-gray-500 text-center py-6">No event history found for this plant.</p> )}
                    </div>
                  )}
                  {activeDetailTab === 'Costs' && ( 
                    <div>
                        <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center"> <DollarSign size={18} className="mr-2" /> Cost & Usage Log </h2>
                        {isCostLoading ? ( <div className="text-center py-6"><Loader2 className="h-6 w-6 animate-spin inline-block text-gray-500"/></div> )
                        : costError ? ( <p className="text-red-600 text-sm">{costError}</p> )
                        : costLogs.length > 0 ? (
                            <div className="overflow-x-auto max-h-96 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50 sticky top-0 z-10"><tr>
                                        <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Item</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Cost/Value</th>
                                    </tr></thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                    {costLogs.map(log => {
                                        const { Icon, color } = getLogTypeStyle(log.type);
                                        const isCostType = ['Seed Planted', 'Fertilizer Used', 'Material Used', 'Purchase', 'Initial Stock'].includes(log.type);
                                        const displayQuantity = Math.abs(log.quantityChange);
                                        const quantityPrefix = log.quantityChange > 0 && log.type !== 'Sale' ? '+' : log.quantityChange < 0 ? '-' : '';
                                        const quantityColor = (log.quantityChange < 0 || log.type === 'Sale') ? 'text-red-600' : 'text-green-600';
                                        return (
                                        <tr key={log.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDate(log.timestamp)}</td>
                                            <td className="px-3 py-2 whitespace-nowrap"><span className={`inline-flex items-center text-xs font-medium ${color}`}><Icon size={14} className="mr-1.5" />{log.type}</span></td>
                                            <td className="px-3 py-2 whitespace-nowrap text-gray-800">{log.itemName}</td>
                                            <td className={`px-3 py-2 whitespace-nowrap text-right ${quantityColor}`}>{quantityPrefix}{displayQuantity}{log.unit ? ` ${log.unit}` : ''}</td>
                                            <td className={`px-3 py-2 whitespace-nowrap text-right font-medium ${isCostType && log.type !== 'Sale' ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(log.totalCostOrValue)}</td>
                                        </tr>);
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
                            <div className="overflow-x-auto max-h-96 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50 sticky top-0 z-10"><tr>
                                        <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Temp (°C)</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Humid (%)</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">pH</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">EC (mS/cm)</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">N (ppm)</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">P (ppm)</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">K (ppm)</th>
                                    </tr></thead>
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
                className="fixed bottom-8 right-8 z-30 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition ease-in-out duration-150 hover:scale-110 active:scale-100"
                aria-label="Add Sensor Reading" title="Add New Sensor Reading"
            > <Activity size={24} /> </button>
          )}
          {plantDetails && activeDetailTab === 'Costs' && (
            <button
                onClick={() => setIsSelectItemModalOpen(true)} // This opens the SelectItemForUsageModal
                className="fixed bottom-24 right-8 z-30 bg-orange-500 text-white p-4 rounded-full shadow-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 transition ease-in-out duration-150 hover:scale-110 active:scale-100"
                aria-label="Log Item Usage for this Plant" title="Log Item Usage for this Plant"
            > <UseIcon size={24} /> </button>
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
      {/* SelectItemForUsageModal is now the primary modal for logging usage */}
      {isSelectItemModalOpen && plantDetails && (
        <SelectItemForUsageModal 
            isOpen={isSelectItemModalOpen}
            onClose={() => {
                setIsSelectItemModalOpen(false);
                // Optionally re-fetch data after usage is logged
                // This ensures the costLogs and inventory stock are updated on the PlantDetailPage
                if (user && firestore && plantId) {
                  const fetchCostLogs = async () => {
                    setIsCostLoading(true); setCostError(null);
                    try {
                      const logCollectionRef = collection(firestore, 'inventory_log');
                      const q = query( logCollectionRef, where("plantId", "==", plantId), where("userId", "==", user.uid), orderBy("timestamp", "desc") );
                      const querySnapshot = await getDocs(q); const fetchedLogs: InventoryLogEntry[] = [];
                      querySnapshot.forEach((docSnap) => { 
                        const data = docSnap.data();
                        fetchedLogs.push({ 
                            id: docSnap.id, 
                            itemId: data.itemId || 'N/A', 
                            itemName: data.itemName || 'N/A', 
                            timestamp: (data.timestamp as Timestamp).toDate(), 
                            type: data.type as InventoryLogEntry['type'], 
                            quantityChange: data.quantityChange, 
                            costOrValuePerUnit: data.costOrValuePerUnit, 
                            totalCostOrValue: data.totalCostOrValue, 
                            unit: data.unit, 
                            userId: data.userId, 
                            plantId: data.plantId, 
                            notes: data.notes 
                        }); 
                      });
                      setCostLogs(fetchedLogs);
                    } catch (err:any) { setCostError(err.message); } finally { setIsCostLoading(false); }
                  };
                  fetchCostLogs();

                  const fetchAllInventory = async () => {
                    setIsInventoryLoading(true); setInventoryError(null);
                    try {
                      const inventoryRef = collection(firestore, 'inventory');
                      const qInv = query(inventoryRef, where("stock", ">", 0));
                      const invSnapshot = await getDocs(qInv); const fetchedInv: InventoryItem[] = [];
                      invSnapshot.forEach((docSnap) => { fetchedInv.push({ id: docSnap.id, ...docSnap.data() } as InventoryItem); });
                      setAllInventoryItems(fetchedInv.sort((a, b) => a.name.localeCompare(b.name)));
                    } catch (err:any) { setInventoryError(err.message); } finally { setIsInventoryLoading(false); }
                  };
                  fetchAllInventory();
                }
            }}
            currentPlantId={plantDetails.id}
            currentPlantName={plantDetails.name}
        />
      )}
      {/* UseItemModal might be deprecated if SelectItemForUsageModal handles the full flow.
        If it's still used for a different purpose, its invocation would be here.
      */}
      {/* {isUseItemForCostModalOpen && itemToUseForCost && plantDetails && (
        <UseItemModal
            isOpen={isUseItemForCostModalOpen}
            onClose={() => { setIsUseItemForCostModalOpen(false); setItemToUseForCost(null); }}
            item={itemToUseForCost}
            onSubmit={(selectedItem, quantity, notes) => handleUseItemForCostSubmit(selectedItem as InventoryItem, quantity, notes)}
        />
      )} */}
    </div>
  );
}
