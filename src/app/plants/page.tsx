'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; // Keep Link if PlantCard uses it
import {
  collection, getDocs, query, where, orderBy, Timestamp,
  doc, runTransaction, serverTimestamp, limit, increment, addDoc, getDoc, updateDoc
} from 'firebase/firestore';
// database import is needed for RTDB interactions if you were to write image data,
// but for this setup, we're only storing the path.
// It's good to keep if PlantCard fetches from RTDB.
import { firestore, auth, database } from '@/app/lib/firebase/config';
import { useAuthState } from 'react-firebase-hooks/auth';

import Sidebar from '@/components/Sidebar'; // Adjust path
import PlantCard from '@/components/PlantCard'; // Adjust path, ensure it handles RTDB paths
import LoadingSpinner from '@/components/LoadingSpinner'; // Adjust path
import AddPlantModal, { NewPlantData } from '@/components/AddPlantModal'; // Adjust path
import { Loader2, AlertTriangle, Leaf, Inbox, Menu, X, Search, PlusCircle, Plus } from 'lucide-react';

// --- Interfaces ---
interface Plant {
  id: string;
  name: string;
  type: string; // e.g., "Cabbage"
  imageUrl?: string | null; // Will store "plantImages/Cabbage" or a full https URL
  datePlanted: Date;
  status: string;
  locationZone?: string;
  ownerUid: string;
  seedId?: string;
  initialSeedQuantity?: number;
  areaOccupiedSqM?: number; // Area this specific batch of plants takes up
}

interface PlantLifecycle {
  name: string; // This should match the plant type, e.g., "Cabbage"
  fertilizeDays: number[];
  maturityDays: number;
  harvestDays: number;
  spacingCm: number; // Spacing between plants in centimeters
  stages: Array<{ name: string; startDay: number; description?: string; }>;
}

// Log entry data structure when writing to Firestore
interface LogEntryData {
    itemId: string; // ID of the seed used
    itemName: string; // Name of the seed used
    timestamp: any; // serverTimestamp()
    type: 'Purchase' | 'Seed Planted' | 'Fertilizer Used' | 'Material Used' | 'Sale' | 'Adjustment' | 'Initial Stock';
    quantityChange: number; // e.g., -10 for 10 seeds used
    costOrValuePerUnit: number; // Cost of one seed unit
    notes?: string;
    userId?: string; // User who performed action
    plantId?: string; // Link log to the newly created plant
    unit?: string; // Unit of the seed (e.g., 'seeds', 'g')
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
  // usableAreaSqM will be fetched from user's settings
  const [usableAreaSqM, setUsableAreaSqM] = useState<number>(0); // Initialize to 0
  const [isAreaLoading, setIsAreaLoading] = useState<boolean>(true);
  // allLifecycleData will store configurations for all plant types, keyed by plant type name
  const [allLifecycleData, setAllLifecycleData] = useState<Record<string, PlantLifecycle>>({});
  const [isLifecycleLoading, setIsLifecycleLoading] = useState<boolean>(true);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadingAuth && !user && !errorAuth) { router.push('/login'); }
    if (!loadingAuth && errorAuth) {
        console.error("PlantsPage: Authentication Error", errorAuth);
        router.push('/login'); // Redirect on auth error
    }
  }, [user, loadingAuth, errorAuth, router]);

  // Fetch User Settings (for usablePlantingAreaSqM)
  useEffect(() => {
      if (user && firestore) {
          const fetchUserData = async () => {
              setIsAreaLoading(true);
              const userDocRef = doc(firestore, 'users', user.uid);
              try {
                  const docSnap = await getDoc(userDocRef);
                  if (docSnap.exists()) {
                      const userData = docSnap.data();
                      // Ensure the field name matches exactly what's in your 'users' document
                      const area = userData.usablePlantingAreaSqM;
                      if (typeof area === 'number' && area >= 0) {
                        setUsableAreaSqM(area);
                        console.log("Fetched usable area:", area);
                      } else {
                        console.warn("Usable area (usablePlantingAreaSqM) not found or invalid in user profile, using default 20sqm.");
                        setUsableAreaSqM(20); // Default if not set or invalid
                      }
                  } else {
                    console.warn("User profile document not found, using default area (20sqm). Consider creating user profile with 'usablePlantingAreaSqM' field.");
                    setUsableAreaSqM(20); // Default if no profile
                  }
              } catch (error) {
                console.error("Error fetching user area:", error);
                setUsableAreaSqM(20); // Fallback on error
              }
              finally { setIsAreaLoading(false); }
          };
          fetchUserData();
      } else {
        setIsAreaLoading(false);
        if(!user && !loadingAuth) setUsableAreaSqM(0); // Reset if no user and auth check is done
      }
  }, [user, loadingAuth]); // Rerun if user changes

  // Fetch All Plant Lifecycle Data from 'plantTypes' collection
  useEffect(() => {
      if (user && firestore) { // Ensure user is available for potential future user-specific lifecycle data
          const fetchAllLifecycleData = async () => {
              setIsLifecycleLoading(true); setLifecycleError(null);
              const typesCollectionRef = collection(firestore, 'plantTypes');
              const fetchedData: Record<string, PlantLifecycle> = {};
              try {
                  const querySnapshot = await getDocs(typesCollectionRef);
                  querySnapshot.forEach((docSnap) => {
                      const data = docSnap.data();
                      // The document ID in 'plantTypes' should be the plant type name (e.g., "Cabbage")
                      const plantTypeName = docSnap.id;
                      if (plantTypeName && typeof data.spacingCm === 'number' && Array.isArray(data.fertilizeDays) && typeof data.maturityDays === 'number' && typeof data.harvestDays === 'number' && Array.isArray(data.stages)) {
                          fetchedData[plantTypeName] = { ...data, name: plantTypeName } as PlantLifecycle;
                      } else {
                          console.warn(`Document ${docSnap.id} in plantTypes is missing required fields or has incorrect types.`);
                      }
                  });
                  setAllLifecycleData(fetchedData);
                  console.log("Fetched all lifecycle data:", fetchedData);
              } catch (error: any) {
                  console.error("Error fetching plantTypes:", error);
                  setLifecycleError("Failed to load plant configurations. Adding new plants might be affected.");
              }
              finally { setIsLifecycleLoading(false); }
          };
          fetchAllLifecycleData();
      } else {
        setIsLifecycleLoading(false);
        if(!user && !loadingAuth) setAllLifecycleData({}); // Reset if no user
      }
  }, [user, loadingAuth]); // Rerun if user changes

  // Fetch Plants Data for the current user
  useEffect(() => {
    if (!loadingAuth && user && firestore) {
      const fetchPlants = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const plantsCollectionRef = collection(firestore, 'plants');
          // Query plants owned by the current user, ordered by datePlanted descending
          const q = query(plantsCollectionRef, where("ownerUid", "==", user.uid), orderBy("datePlanted", "desc"));
          const querySnapshot = await getDocs(q);
          const fetchedPlants: Plant[] = [];
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            fetchedPlants.push({
              id: docSnap.id,
              name: data.name || 'Unnamed Plant',
              type: data.type || 'Unknown',
              imageUrl: data.imageUrl || null, // This will be the RTDB path (e.g., "plantImages/Cabbage")
              datePlanted: data.datePlanted instanceof Timestamp ? data.datePlanted.toDate() : new Date(),
              status: data.status || 'Unknown',
              locationZone: data.locationZone,
              ownerUid: data.ownerUid,
              seedId: data.seedId,
              initialSeedQuantity: data.initialSeedQuantity,
              areaOccupiedSqM: data.areaOccupiedSqM, // Fetch this if stored
            });
          });
          setPlantsData(fetchedPlants);
        } catch (err: any) {
          console.error("Error fetching plants:", err);
          if (err.code === 'permission-denied') { setError(`Permission denied. Check Firestore rules for 'plants'.`); }
          else if (err.code === 'unimplemented' || err.code === 'failed-precondition' || err.message.toLowerCase().includes('index')) {
            setError(`Firestore query error. Ensure index exists for (ownerUid ASC, datePlanted DESC) in 'plants'.`);
            console.error("Firestore Indexing Error: Create a composite index for 'plants' collection: (ownerUid ASC, datePlanted DESC).");
          }
          else { setError("Failed to load plants data."); }
        } finally {
          setIsLoading(false);
        }
      };
      fetchPlants();
    } else if (!loadingAuth && !user) { // If auth is resolved and no user
        setIsLoading(false); setPlantsData([]);
    } else if (!firestore && !loadingAuth) { // If firestore is not available
        setIsLoading(false); setError("Firestore service not available.");
    }
  }, [user, loadingAuth]); // Re-fetch if user changes

  // Calculate total occupied area by existing plants
  const occupiedAreaSqM = useMemo(() => {
      if (plantsData.length === 0) return 0;
      return plantsData.reduce((totalArea, plant) => {
          // Prioritize areaOccupiedSqM stored on the plant document itself
          if (typeof plant.areaOccupiedSqM === 'number' && plant.areaOccupiedSqM > 0) {
              return totalArea + plant.areaOccupiedSqM;
          }
          // Fallback to calculating from lifecycle data if not stored (less ideal for accuracy)
          const lifeCycle = allLifecycleData[plant.type];
          if (lifeCycle && typeof lifeCycle.spacingCm === 'number' && lifeCycle.spacingCm > 0) {
              const spacingM = lifeCycle.spacingCm / 100;
              const plantCount = plant.initialSeedQuantity || 1; // Assume 1 if not specified
              return totalArea + (spacingM * spacingM * plantCount);
          }
          // console.warn(`Could not determine area for plant: ${plant.name} (type: ${plant.type})`);
          return totalArea;
      }, 0);
  }, [plantsData, allLifecycleData]);

  const remainingAreaSqM = useMemo(() => {
    if (isAreaLoading) return 0; // Or a loading state like 'Calculating...'
    const result = usableAreaSqM - occupiedAreaSqM;
    return parseFloat(Math.max(0, result).toFixed(2)); // Ensure it's not negative
  }, [usableAreaSqM, occupiedAreaSqM, isAreaLoading]);


  const filteredPlants = useMemo(() => {
    if (!searchTerm.trim()) return plantsData;
    const lowerCaseSearch = searchTerm.toLowerCase();
    return plantsData.filter(plant =>
        plant.name.toLowerCase().includes(lowerCaseSearch) ||
        plant.type.toLowerCase().includes(lowerCaseSearch) ||
        plant.locationZone?.toLowerCase().includes(lowerCaseSearch)
    );
  }, [plantsData, searchTerm]);

  // Helper function to write to inventory_log (can be moved to a service file)
  const writeInventoryLog = async (logData: Omit<LogEntryData, 'userId' | 'timestamp'> & { timestamp?: any }) => {
    if (!user || !firestore) {
        console.error("Cannot write log: user or firestore not available.");
        throw new Error("User or database service not available for logging.");
    }
    try {
        const logCollectionRef = collection(firestore, 'inventory_log');
        await addDoc(logCollectionRef, {
            ...logData,
            userId: user.uid,
            timestamp: logData.timestamp || serverTimestamp()
        });
        console.log("Inventory log entry written for:", logData.itemName);
    } catch (logError) {
        console.error("Error writing inventory log:", logError);
        // Optionally re-throw or handle more gracefully
        throw new Error("Failed to write inventory log.");
    }
  };

  const handleAddPlantSubmit = async (newPlantData: NewPlantData) => {
    if (!user || !firestore) { // Removed 'database' check as we only store RTDB path
      throw new Error("Authentication or Database service is not ready.");
    }
    if (!newPlantData.selectedSeedId) { throw new Error("Seed selection is missing."); }
    if (newPlantData.quantity <= 0) { throw new Error("Quantity must be a positive number."); }
    if (isLifecycleLoading || Object.keys(allLifecycleData).length === 0) {
      throw new Error("Plant configuration data is not loaded yet. Please wait.");
    }

    const { plantName, plantType, selectedSeedId, quantity, imageUrl: rtdbImagePath, areaUsedSqM } = newPlantData;

    // imageUrl from modal is now the direct RTDB path like "plantImages/Cabbage"
    if (!rtdbImagePath || !rtdbImagePath.startsWith('plantImages/')) {
        console.error("Invalid RTDB image path received from modal:", rtdbImagePath);
        throw new Error("Invalid image path format for RTDB.");
    }

    const plantsCollectionRef = collection(firestore, "plants");
    const newPlantFirestoreRef = doc(plantsCollectionRef); // Generate ID for Firestore document
    const seedRef = doc(firestore, "inventory", selectedSeedId);
    const plantingDate = new Date();

    try {
      await runTransaction(firestore, async (transaction) => {
        const seedDoc = await transaction.get(seedRef);
        if (!seedDoc.exists()) { throw new Error("Selected seed not found in inventory."); }

        const seedData = seedDoc.data();
        const currentStock = Number(seedData.stock) || 0;
        if (currentStock < quantity) {
          throw new Error(`Insufficient stock for "${seedData.name}". Available: ${currentStock}, Required: ${quantity}`);
        }

        transaction.update(seedRef, { stock: increment(-quantity), lastUpdated: serverTimestamp() });

        const plantDataToSave = {
          name: plantName,
          type: plantType,
          imageUrl: rtdbImagePath, // Save the RTDB path (e.g., "plantImages/Cabbage")
          datePlanted: Timestamp.fromDate(plantingDate),
          status: "Seeding", // Default status
          locationZone: "Default Zone", // Or get from modal if you add this field
          ownerUid: user.uid,
          seedId: selectedSeedId,
          initialSeedQuantity: quantity,
          areaOccupiedSqM: areaUsedSqM || 0, // Store the calculated area
        };
        transaction.set(newPlantFirestoreRef, plantDataToSave);

        await writeInventoryLog({ // Await this to ensure log is written before UI update if critical
          itemId: selectedSeedId,
          itemName: seedData.name || 'Unknown Seed',
          type: 'Seed Planted',
          quantityChange: -quantity,
          costOrValuePerUnit: Number(seedData.pricePerUnit) || 0,
          notes: `Planted ${quantity} of ${plantName} (Batch ID: ${newPlantFirestoreRef.id}).`,
          plantId: newPlantFirestoreRef.id,
          unit: seedData.unit || 'units'
        });
      });

      console.log(`Plant batch added. Image URL in Firestore refers to RTDB path: ${rtdbImagePath}`);

      const lifeCycle = allLifecycleData[plantType];
      if (lifeCycle) {
        const eventsCollectionRef = collection(firestore, 'events');
        const baseEventData = { plantId: newPlantFirestoreRef.id, userId: user.uid, createdAt: serverTimestamp() };
        for (const dayOffset of lifeCycle.fertilizeDays) {
          const eventDate = addDays(plantingDate, dayOffset);
          await addDoc(eventsCollectionRef, { ...baseEventData, timestamp: Timestamp.fromDate(eventDate), type: 'SCHEDULED_TASK', message: `Apply fertilizer to ${plantName}`, status: 'pending' });
        }
        if (lifeCycle.stages && Array.isArray(lifeCycle.stages)) {
          for (const stage of lifeCycle.stages) {
            if (stage.startDay >= 0) { // Allow stage at day 0
              const stageDate = addDays(plantingDate, stage.startDay);
              await addDoc(eventsCollectionRef, { ...baseEventData, timestamp: Timestamp.fromDate(stageDate), type: 'LIFECYCLE_STAGE', message: `Stage start: ${stage.name} for ${plantName}`, status: 'info' });
            }
          }
        }
      }

      const addedPlant: Plant = {
        id: newPlantFirestoreRef.id, name: plantName, type: plantType, imageUrl: rtdbImagePath,
        datePlanted: plantingDate, status: "Seeding", locationZone: "Default Zone",
        ownerUid: user.uid, seedId: selectedSeedId, initialSeedQuantity: quantity,
        areaOccupiedSqM: areaUsedSqM || 0,
      };
      setPlantsData(prev => [addedPlant, ...prev].sort((a, b) => new Date(b.datePlanted).getTime() - new Date(a.datePlanted).getTime()));

      if (areaUsedSqM !== undefined && areaUsedSqM > 0) {
        const userSettingsRef = doc(firestore, 'users', user.uid);
        try {
            await updateDoc(userSettingsRef, {
                usablePlantingAreaSqM: increment(-areaUsedSqM)
            });
            setUsableAreaSqM(prev => Math.max(0, prev - areaUsedSqM));
            console.log(`Updated usable area in Firestore by -${areaUsedSqM.toFixed(2)} sqm.`);
        } catch (settingsError) {
            console.error("Failed to update usable area in Firestore:", settingsError);
            // Consider how to handle this error - maybe alert the user
            // The plant is added, but area update failed.
        }
      }
      setIsAddPlantModalOpen(false);
    } catch (error) {
      console.error("Add plant failed overall: ", error);
      if (error instanceof Error) { throw error; } // Re-throw to be caught by modal's submitError
      else { throw new Error("An unknown error occurred while adding the plant batch."); }
    }
  };


  if (loadingAuth || (isAreaLoading && usableAreaSqM === 0 && !user?.uid) || (isLifecycleLoading && Object.keys(allLifecycleData).length === 0 && user?.uid) ) {
     return <LoadingSpinner message={loadingAuth ? "Authenticating..." : isAreaLoading ? "Loading area settings..." : "Loading configurations..."} />;
  }
  if (!user && !errorAuth) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 text-center">
            <div className="bg-white p-8 md:p-12 rounded-xl shadow-2xl max-w-md w-full">
                <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-6" />
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-3">Access Denied</h2>
                <p className="text-gray-600 mb-8 text-sm md:text-base">
                    You need to be logged in to manage your plants.
                </p>
                <Link
                    href="/login"
                    className="w-full inline-flex justify-center items-center px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                    Go to Login Page
                </Link>
            </div>
        </div>
    );
  }
   if(errorAuth){
     return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 text-center">
            <div className="bg-white p-8 md:p-12 rounded-xl shadow-2xl max-w-md w-full">
                <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-6" />
                <h2 className="text-2xl md:text-3xl font-bold text-red-700 mb-3">Authentication Error</h2>
                <p className="text-gray-600 mb-8 text-sm md:text-base">
                  {errorAuth.message}
                </p>
                <p className="text-gray-500 text-xs mb-6">
                    Please try logging out and logging in again. If the issue persists, contact support.
                </p>
                <Link
                    href="/login"
                    className="w-full inline-flex justify-center items-center px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                    Go to Login Page
                </Link>
            </div>
        </div>
     );
  }

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-green-50 relative z-10 border-b border-green-200">
           <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8"> <div className="flex justify-between items-center h-16"> <div className="flex items-center"> <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden mr-4 p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100" aria-label="Open sidebar"> {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />} </button> <h1 className="text-xl font-semibold text-gray-800">Hello, {user.displayName?.split(' ')[0] || 'Farmer'}!</h1> </div> <div className="relative"> <span className="absolute inset-y-0 left-0 flex items-center pl-3"> <Search className="h-5 w-5 text-gray-400" aria-hidden="true" /> </span> <input type="text" placeholder="Search plants by name, type, zone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 text-gray-400 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm" /> </div> </div> </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-2xl font-semibold text-gray-700">Your Plant Batches</h1>
                <div className="text-sm text-gray-600 bg-white p-3 rounded-md shadow">
                    Available Planting Area: <span className={`font-semibold ${remainingAreaSqM <= 0 ? 'text-red-500' : 'text-green-600'}`}>{isAreaLoading ? <Loader2 className="h-4 w-4 animate-spin inline-block"/> : `${remainingAreaSqM.toFixed(2)} sq m`}</span> / {usableAreaSqM.toFixed(2)} sq m
                </div>
            </div>

            {isLoading ? ( <div className="flex justify-center items-center h-64 text-gray-500"> <Loader2 className="h-8 w-8 animate-spin mr-3" /> Loading plants... </div> )
            : error ? ( <div className="flex flex-col justify-center items-center h-64 text-red-600 bg-red-100 p-6 rounded-md"> <AlertTriangle className="h-8 w-8 mb-2" /> <span className="font-semibold">Failed to Load Plants</span> <span className="text-sm">{error}</span> </div> )
            : lifecycleError ? ( <div className="flex flex-col justify-center items-center h-64 text-red-600 bg-red-100 p-6 rounded-md"> <AlertTriangle className="h-8 w-8 mb-2" /> <span className="font-semibold">Configuration Error</span> <span className="text-sm">{lifecycleError}</span> <p className="text-xs mt-1">Plant lifecycle data could not be loaded. Adding new plants is disabled.</p> </div> )
            : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                <button
                    onClick={() => setIsAddPlantModalOpen(true)}
                    disabled={isAreaLoading || isLifecycleLoading || !!lifecycleError || remainingAreaSqM <= 0}
                    className="flex flex-col items-center justify-center bg-white border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50 hover:border-green-400 hover:text-green-600 transition aspect-[4/5] sm:aspect-square disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 shadow hover:shadow-md p-4"
                    title={lifecycleError ? 'Cannot add plant: Config error' : remainingAreaSqM <= 0 ? 'No usable area available' : 'Add a new plant batch'}
                >
                    <Plus size={36} className="mb-2" />
                    <span className="font-medium text-sm text-center">Add New Plant Batch</span>
                    {remainingAreaSqM <= 0 && !isAreaLoading && <span className="text-xs text-red-500 mt-1">(No area left)</span>}
                </button>
                {filteredPlants.length > 0 ? ( filteredPlants.map((plant) => ( <PlantCard key={plant.id} plant={plant} /> )) )
                : ( searchTerm && plantsData.length > 0 && ( <div className="sm:col-span-full text-center py-10 text-gray-500"> <Inbox className="h-10 w-10 mx-auto mb-2 text-gray-400" /> No plants match your search for "{searchTerm}". </div> ) )}
                {!isLoading && !error && plantsData.length === 0 && ( <div className="sm:col-span-full text-center py-10 text-gray-500"> <Leaf className="h-10 w-10 mx-auto mb-2 text-gray-400" /> You haven't added any plant batches yet. Click the '+' card to get started! </div> )}
              </div>
            )}
        </main>
      </div>

      {isAddPlantModalOpen && (
       <AddPlantModal
           isOpen={isAddPlantModalOpen}
           onClose={() => setIsAddPlantModalOpen(false)}
           onSubmit={handleAddPlantSubmit}
           usableAreaSqM={remainingAreaSqM > 0 ? remainingAreaSqM : 0} // Pass current remaining area
           lifecycleData={allLifecycleData}
       />
      )}
    </div>
  );
}
