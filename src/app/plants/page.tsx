'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; // Keep Link if PlantCard uses it
import {
  collection, getDocs, query, where, orderBy, Timestamp,
  doc, runTransaction, serverTimestamp, limit, increment, addDoc, getDoc
} from 'firebase/firestore';
// Keep database import if you might re-add image upload later
import { firestore, auth, database } from '@/app/lib/firebase/config';
import { useAuthState } from 'react-firebase-hooks/auth';

import Sidebar from '@/components/Sidebar';
import PlantCard from '@/components/PlantCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import AddPlantModal, { NewPlantData } from '@/components/AddPlantModal'; // Import modal
// Import necessary icons
import { Loader2, AlertTriangle, Leaf, Inbox, Menu, X, Search, PlusCircle, Plus } from 'lucide-react';

// --- Interfaces ---
interface Plant {
  id: string;
  name: string;
  type: string;
  imageUrl?: string | null;
  datePlanted: Date;
  status: string;
  locationZone?: string;
  ownerUid: string;
}

interface PlantLifecycle {
  name: string;
  fertilizeDays: number[];
  maturityDays: number;
  harvestDays: number;
  spacingCm: number; // Expecting spacing in Centimeters
  stages: Array<{ name: string; startDay: number; description?: string; }>;
}

interface LogEntryData {
    itemId: string;
    itemName: string;
    timestamp: any;
    type: 'Purchase' | 'Seed Planted' | 'Fertilizer Used' | 'Material Used' | 'Sale' | 'Adjustment' | 'Initial Stock';
    quantityChange: number;
    costOrValuePerUnit: number;
    notes?: string;
    userId?: string;
}

const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

export default function PlantsPage() {
  const [user, loadingAuth, errorAuth] = useAuthState(auth);
  const router = useRouter();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [plantsData, setPlantsData] = useState<Plant[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [isAddPlantModalOpen, setIsAddPlantModalOpen] = useState(false);
  const [usableAreaSqM, setUsableAreaSqM] = useState<number>(20);
  const [isAreaLoading, setIsAreaLoading] = useState<boolean>(true);
  const [allLifecycleData, setAllLifecycleData] = useState<Record<string, PlantLifecycle>>({});
  const [isLifecycleLoading, setIsLifecycleLoading] = useState<boolean>(true);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadingAuth && !user) { router.push('/login'); }
    if (!loadingAuth && errorAuth) { console.error("PlantsPage: Auth Error", errorAuth); router.push('/login'); }
  }, [user, loadingAuth, errorAuth, router]);

  // Fetch User Settings (Area)
  useEffect(() => {
      if (user && firestore) {
          const fetchUserData = async () => {
              setIsAreaLoading(true);
              const userDocRef = doc(firestore, 'users', user.uid);
              try {
                  const docSnap = await getDoc(userDocRef);
                  if (docSnap.exists()) {
                      const userData = docSnap.data();
                      const area = userData.usablePlantingAreaSqM;
                      if (typeof area === 'number' && area > 0) { setUsableAreaSqM(area); }
                      else { console.warn("Using default area (sq m)."); setUsableAreaSqM(20); }
                  } else { console.warn("User profile not found, using default area."); setUsableAreaSqM(20); } 
              } catch (error) { console.error("Error fetching user area:", error); setUsableAreaSqM(20); } 
              finally { setIsAreaLoading(false); }
          };
          fetchUserData();
      } else { setIsAreaLoading(false); }
  }, [user]);
  useEffect(() => {
      if (user && firestore) {
          const fetchAllLifecycleData = async () => {
              setIsLifecycleLoading(true); setLifecycleError(null);
              const typesCollectionRef = collection(firestore, 'plantTypes');
              const fetchedData: Record<string, PlantLifecycle> = {};
              try {
                  const querySnapshot = await getDocs(typesCollectionRef);
                  querySnapshot.forEach((doc) => {
                      const data = doc.data();
                      // Basic validation for required fields
                      if (data.name && Array.isArray(data.fertilizeDays) && typeof data.maturityDays === 'number' && typeof data.harvestDays === 'number' && typeof data.spacingCm === 'number' && Array.isArray(data.stages)) {
                         fetchedData[doc.id] = data as PlantLifecycle;
                      } else {
                         console.warn(`Document ${doc.id} in plantTypes is missing required fields or has incorrect types.`);
                      }
                  });
                  setAllLifecycleData(fetchedData);
              } catch (error: any) { console.error("Error fetching plantTypes:", error); setLifecycleError("Failed to load plant configurations."); }
              finally { setIsLifecycleLoading(false); }
          };
          fetchAllLifecycleData();
      } else { setIsLifecycleLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!loadingAuth && user && firestore) {
      const fetchPlants = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const plantsCollectionRef = collection(firestore, 'plants');
          const q = query(plantsCollectionRef, where("ownerUid", "==", user.uid), orderBy("name"));
          const querySnapshot = await getDocs(q);
          const fetchedPlants: Plant[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            fetchedPlants.push({
              id: doc.id,
              name: data.name || 'Unnamed Plant',
              type: data.type || 'Unknown',
              imageUrl: data.imageUrl || null,
              datePlanted: data.datePlanted instanceof Timestamp ? data.datePlanted.toDate() : new Date(),
              status: data.status || 'Unknown',
              locationZone: data.locationZone,
              ownerUid: data.ownerUid,
            });
          });
          setPlantsData(fetchedPlants);
        } catch (err: any) {
          console.error("Error fetching plants:", err);
          if (err.code === 'permission-denied') { setError(`Permission denied. Check Firestore rules for 'plants'.`); }
          else if (err.code === 'unimplemented' || err.code === 'failed-precondition') { setError(`Firestore query error. Ensure index exists for 'ownerUid'/'name' in 'plants'.`); }
          else { setError("Failed to load plants data."); }
        } finally {
          setIsLoading(false);
        }
      };
      fetchPlants();
    } else if (!loadingAuth && !user) {
        setIsLoading(false); setPlantsData([]);
    } else if (!firestore) {
        setIsLoading(false); setError("Firestore service not available.");
    }
  }, [user, loadingAuth]);

  const occupiedAreaSqM = useMemo(() => {
      if (isLoading || isLifecycleLoading || plantsData.length === 0 || Object.keys(allLifecycleData).length === 0) {
          return 0;
      }
      let currentOccupied = 0;
      plantsData.forEach(plant => {
          const lifeCycle = allLifecycleData[plant.type];
          if (lifeCycle && lifeCycle.spacingCm > 0) {
              const spacingM = lifeCycle.spacingCm / 100;
              currentOccupied += (spacingM * spacingM);
          } else {
               console.warn(`Cannot calculate occupied space for plant type: ${plant.type}. Spacing info missing.`);
          }
      });
      return parseFloat(currentOccupied.toFixed(2));
  }, [plantsData, isLoading, allLifecycleData, isLifecycleLoading]);

  const filteredPlants = useMemo(() => {
    if (!searchTerm) return plantsData;
    const lowerCaseSearch = searchTerm.toLowerCase();
    return plantsData.filter(plant =>
        plant.name.toLowerCase().includes(lowerCaseSearch) ||
        plant.type.toLowerCase().includes(lowerCaseSearch) ||
        plant.locationZone?.toLowerCase().includes(lowerCaseSearch)
    );
  }, [plantsData, searchTerm]);

  const handleAddPlantSubmit = async (newPlantData: NewPlantData) => {
    if (!user || !firestore || !database) { throw new Error("Authentication or Database service is not ready."); }
    if (!newPlantData.selectedSeedId) { throw new Error("Seed selection is missing."); }
    if (newPlantData.quantity <= 0) { throw new Error("Quantity must be a positive number."); }
    if (isLifecycleLoading || Object.keys(allLifecycleData).length === 0) { throw new Error("Lifecycle data is not loaded yet. Please wait."); }

    const selectedPlantType = newPlantData.plantType.trim();
    const lifeCycleForNewPlant = allLifecycleData[selectedPlantType];
    if (!lifeCycleForNewPlant || !lifeCycleForNewPlant.spacingCm || lifeCycleForNewPlant.spacingCm <= 0) {
        console.error(`Lifecycle or spacing data missing for type: ${selectedPlantType}. Cannot proceed.`);
        throw new Error(`Configuration missing for plant type "${selectedPlantType}". Cannot calculate space or schedule events.`);
    }

    const spacingNeeded = lifeCycleForNewPlant.spacingCm;
    const spacingM = spacingNeeded / 100;
    const areaPerPlant = spacingM * spacingM;
    const totalSpaceForNewPlants = newPlantData.quantity * areaPerPlant;

    if (totalSpaceForNewPlants > usableAreaSqM) {
        console.warn(`Planting requires ${totalSpaceForNewPlants.toFixed(2)} sq m, total usable is ${usableAreaSqM.toFixed(2)} sq m.`);
    }

    const { plantName, plantType, selectedSeedId, quantity, imageUrl } = newPlantData;
    const plantsCollectionRef = collection(firestore, "plants");
    const newPlantRef = doc(plantsCollectionRef);
    const seedRef = doc(firestore, "inventory", selectedSeedId);
    const logCollectionRef = collection(firestore, "inventory_log");
    const plantingDate = new Date();

    try {
        await runTransaction(firestore, async (transaction) => {
            const seedDoc = await transaction.get(seedRef);
            if (!seedDoc.exists()) { throw new Error("Selected seed not found."); }
            const seedData = seedDoc.data();
            const currentStock = typeof seedData.stock === 'number' ? seedData.stock : Number(seedData.stock) || 0;
            if (currentStock < quantity) { throw new Error(`Insufficient stock for "${seedData.name}". Have: ${currentStock}, Need: ${quantity}`); }

            transaction.update(seedRef, { stock: increment(-quantity), lastUpdated: serverTimestamp() });
            const plantDataToSave = { name: plantName, type: plantType, imageUrl: imageUrl, datePlanted: Timestamp.fromDate(plantingDate), status: "Seeding", locationZone: "Default Zone", ownerUid: user.uid, seedId: selectedSeedId, initialSeedQuantity: quantity, };
            transaction.set(newPlantRef, plantDataToSave);
            const logEntryRef = doc(logCollectionRef);
            const logEntryData: LogEntryData = { itemId: selectedSeedId, itemName: seedData.name || 'Unknown Seed', timestamp: serverTimestamp(), type: 'Seed Planted', quantityChange: -quantity, costOrValuePerUnit: typeof seedData.pricePerUnit === 'number' ? seedData.pricePerUnit : 0, notes: `Used ${quantity} seeds to plant ${plantName} (ID: ${newPlantRef.id}).`, userId: user.uid };
            transaction.set(logEntryRef, logEntryData);
        });

        const plantId = newPlantRef.id;
        const lifeCycle = lifeCycleForNewPlant;
        const eventsCollectionRef = collection(firestore, 'events');
        const baseEventData = { plantId: plantId, userId: user.uid, createdAt: serverTimestamp() };

        if (lifeCycle) {
            for (const dayOffset of lifeCycle.fertilizeDays) { const fertilizeDate = addDays(plantingDate, dayOffset); const eventData = { ...baseEventData, timestamp: Timestamp.fromDate(fertilizeDate), type: 'SCHEDULED_TASK', message: `Apply fertilizer to ${plantName}`, status: 'pending' }; try { await addDoc(eventsCollectionRef, eventData); } catch (e) { console.error("Error adding fertilizer event:", e); } }
            if (lifeCycle.stages && Array.isArray(lifeCycle.stages)) { for (const stage of lifeCycle.stages) { if (stage.startDay > 0) { const stageStartDate = addDays(plantingDate, stage.startDay); const stageEventData = { ...baseEventData, timestamp: Timestamp.fromDate(stageStartDate), type: 'LIFECYCLE_STAGE', message: `Stage start: ${stage.name} for ${plantName}`, status: 'info' }; try { await addDoc(eventsCollectionRef, stageEventData); } catch (e) { console.error(`Error adding stage event (${stage.name}):`, e); } } } }
            else { console.warn("Lifecycle stages missing/invalid for:", plantType); }
        } else { console.warn(`No lifecycle data for ${plantType}. Events not scheduled.`); }

        // Update UI State
        const addedPlant: Plant = { id: plantId, name: plantName, type: plantType, imageUrl: imageUrl, datePlanted: plantingDate, status: "Seeding", locationZone: "Default Zone", ownerUid: user.uid, };
        setPlantsData(prev => [...prev, addedPlant].sort((a, b) => a.name.localeCompare(b.name)));
        setIsAddPlantModalOpen(false);

    } catch (error) {
        console.error("Add plant failed: ", error);
        if (error instanceof Error) { throw error; } else { throw new Error("Unknown error adding plant."); }
    }
  };


  if (loadingAuth || isAreaLoading || isLifecycleLoading) {
     return <LoadingSpinner message={loadingAuth ? "Authenticating..." : isAreaLoading ? "Loading settings..." : "Loading configurations..."} />;
  }
  if (!user) { return null; }

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* Sidebar */}
      <div className="hidden lg:block lg:flex-shrink-0"> <Sidebar /> </div>
      {isMobileMenuOpen && (<div className="fixed inset-y-0 left-0 z-40 lg:hidden"> <Sidebar /> </div>)}
      {isMobileMenuOpen && (<div className="fixed inset-0 z-30 bg-black opacity-50 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>)}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-green-50 relative z-10 border-b border-green-200">
           <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8"> <div className="flex justify-between items-center h-16"> <div className="flex items-center"> <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden mr-4 p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100" aria-label="Open sidebar"> {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />} </button> <h1 className="text-xl font-semibold text-gray-800">Hello, {user.displayName || 'Farmer'}!</h1> </div> <div className="relative"> <span className="absolute inset-y-0 left-0 flex items-center pl-3"> <Search className="h-5 w-5 text-gray-400" aria-hidden="true" /> </span> <input type="text" placeholder="Search plants..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm" /> </div> </div> </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
           <h1 className="text-2xl font-semibold text-gray-700 mb-6">Your Plants</h1>

           {isLoading ? ( <div className="flex justify-center items-center h-64 text-gray-500"> <Loader2 className="h-8 w-8 animate-spin mr-3" /> Loading plants... </div> )
           : error ? ( <div className="flex flex-col justify-center items-center h-64 text-red-600 bg-red-100 p-6 rounded-md"> <AlertTriangle className="h-8 w-8 mb-2" /> <span className="font-semibold">Failed to Load Plants</span> <span className="text-sm">{error}</span> </div> )
           : lifecycleError ? ( <div className="flex flex-col justify-center items-center h-64 text-red-600 bg-red-100 p-6 rounded-md"> <AlertTriangle className="h-8 w-8 mb-2" /> <span className="font-semibold">Configuration Error</span> <span className="text-sm">{lifecycleError}</span> </div> )
           : (
             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                <button onClick={() => setIsAddPlantModalOpen(true)} disabled={isAreaLoading || isLifecycleLoading || !!lifecycleError} className="flex flex-col items-center justify-center bg-white border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50 hover:border-green-400 hover:text-green-600 transition aspect-square disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 shadow hover:shadow-md" title={lifecycleError ? 'Cannot add plant: Config error' : 'Add a new plant'}>
                    <Plus size={48} className="mb-2" />
                    <span className="font-medium">Add Plant</span>
                </button>
                {filteredPlants.length > 0 ? ( filteredPlants.map((plant) => ( <PlantCard key={plant.id} plant={plant} /> )) )
                : ( searchTerm && plantsData.length > 0 && ( <div className="sm:col-span-2 md:col-span-3 lg:col-span-4 xl:col-span-5 text-center py-10 text-gray-500"> <Inbox className="h-10 w-10 mx-auto mb-2 text-gray-400" /> No plants match your search for "{searchTerm}". </div> ) )}
                {!isLoading && !error && plantsData.length === 0 && ( <div className="sm:col-span-2 md:col-span-3 lg:col-span-4 xl:col-span-5 text-center py-10 text-gray-500"> <Leaf className="h-10 w-10 mx-auto mb-2 text-gray-400" /> You haven't added any plants yet. Click the '+' card to get started! </div> )}
             </div>
           )}
        </main>
      </div>

      {/* Add Plant Modal */}
      {isAddPlantModalOpen && (
         <AddPlantModal
             isOpen={isAddPlantModalOpen}
             onClose={() => setIsAddPlantModalOpen(false)}
             onSubmit={handleAddPlantSubmit}
             usableAreaSqM={usableAreaSqM}
             lifecycleData={allLifecycleData}
         />
      )}
    </div>
  );
}
