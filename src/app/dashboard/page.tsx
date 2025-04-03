// src/app/dashboard/page.tsx

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, CalendarDays, LineChart, Settings, User, Bell, Search,
  PlusCircle, LogOut, Menu, X, Loader2, AlertTriangle, Plus, Leaf, ImageOff,
  Clock,
  ListChecks
} from 'lucide-react';

import {
    collection, getDocs, query, where, orderBy, 
    doc, runTransaction, Timestamp, serverTimestamp,
    limit, 
    increment
} from 'firebase/firestore';
import { ref, set as setRTDB } from "firebase/database";
import { firestore, auth, database } from '@/app/lib/firebase/config';
import { useAuthState } from 'react-firebase-hooks/auth';

import Sidebar from '@/components/Sidebar';
import NpkChart, { NpkDataPoint } from '@/components/NpkChart';
import PlantCard from '@/components/PlantCard';
import AddPlantModal, { NewPlantData } from '@/components/AddPlantModal';
import LoadingSpinner from '@/components/LoadingSpinner';


interface Plant { id: string; name: string; type: string; imageUrl?: string | null; datePlanted: Date; status: string; locationZone?: string; ownerUid: string; }


interface EventDisplayData {
  id: string;
  timestamp: Date;
  type: string;
  message: string;
  plantId?: string;
  status?: string;
}


export default function DashboardPage() {
  // --- Auth State Check ---
  const [user, loadingAuth, errorAuth] = useAuthState(auth);
  const router = useRouter();

  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [plantsData, setPlantsData] = useState<Plant[]>([]);
  const [isPlantsLoading, setIsPlantsLoading] = useState<boolean>(true);
  const [plantsError, setPlantsError] = useState<string | null>(null);
  const [npkData, setNpkData] = useState<NpkDataPoint[]>([]);
  const [isNpkLoading, setIsNpkLoading] = useState<boolean>(true);
  const [npkError, setNpkError] = useState<string | null>(null);
  const [isAddPlantModalOpen, setIsAddPlantModalOpen] = useState(false);

  
  const [upcomingEvents, setUpcomingEvents] = useState<EventDisplayData[]>([]);
  const [isEventsLoading, setIsEventsLoading] = useState<boolean>(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  

  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  
  useEffect(() => {
    if (!loadingAuth && !user) { router.push('/login'); }
    if (!loadingAuth && errorAuth) { console.error("Auth Error:", errorAuth); router.push('/login'); }
  }, [user, loadingAuth, errorAuth, router]);


  
  // Fetch Plants Data
  useEffect(() => {
    if (!loadingAuth && user && firestore) {
        
        const fetchPlants = async () => {
            setIsPlantsLoading(true); setPlantsError(null);
            try {
                const plantsCollectionRef = collection(firestore, 'plants');
                const q = query(plantsCollectionRef, where("ownerUid", "==", user.uid));
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
                fetchedPlants.sort((a, b) => a.name.localeCompare(b.name));
                setPlantsData(fetchedPlants);
            } catch (err: any) {
                console.error("Error fetching plants:", err);
                if (err.code === 'permission-denied') {
                    setPlantsError(`Permission denied for 'plants'. Check Firestore rules.`);
                } else if (err.code === 'unimplemented' || err.code === 'failed-precondition') {
                    setPlantsError(`Index needed for 'ownerUid' in 'plants'. Check Firestore console.`);
                } else {
                    setPlantsError("Failed to load plants data.");
                }
            } finally {
                setIsPlantsLoading(false);
            }
        };
        fetchPlants();
    } else if (!loadingAuth && !user) {
        
        setIsPlantsLoading(false);
        setPlantsData([]);
    } else if (!firestore) {
        setIsPlantsLoading(false);
        setPlantsError("Firestore service not available.");
    }
  }, [user, loadingAuth]); 

  useEffect(() => {
    if (firestore) {
        
        const fetchNpkData = async () => {
            setIsNpkLoading(true); setNpkError(null);
            try {
                const npkCollectionRef = collection(firestore, 'npkData');
                
                const querySnapshot = await getDocs(npkCollectionRef);
                const data: NpkDataPoint[] = [];
                querySnapshot.forEach((doc) => {
                    const docData = doc.data();
                    data.push({
                        name: typeof docData.name === 'string' ? docData.name : `Plant ${doc.id.substring(0, 4)}`,
                        n: typeof docData.n === 'number' ? docData.n : 0,
                        p: typeof docData.p === 'number' ? docData.p : 0,
                        k: typeof docData.k === 'number' ? docData.k : 0
                    });
                });
                setNpkData(data);
            } catch (error) {
                console.error("Error fetching NPK data:", error);
                setNpkError("Failed to load NPK data.");
            } finally {
                setIsNpkLoading(false);
            }
        };
        fetchNpkData();
    } else {
        // Firestore not available
        setIsNpkLoading(false);
        setNpkError("Firestore service not available.");
    }
  }, []);

  useEffect(() => {
    if (!loadingAuth && user && firestore) {
        const fetchUpcomingEvents = async () => {
            setIsEventsLoading(true);
            setEventsError(null);
            try {
                const now = Timestamp.now();
                const eventsRef = collection(firestore, 'events');

                
                const q = query(
                    eventsRef,
                    where("timestamp", ">=", now),
                    orderBy("timestamp", "asc"),       
                    limit(5)                           
                );

                const querySnapshot = await getDocs(q);
                const fetchedEvents: EventDisplayData[] = [];
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    fetchedEvents.push({
                        id: doc.id,
                        timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(),
                        type: data.type || 'Unknown',
                        message: data.message || 'No description',
                        plantId: data.plantId,
                        status: data.status,
                    });
                });
                setUpcomingEvents(fetchedEvents);


            } catch (err: any) {
                console.error("Error fetching upcoming events:", err);
                if (err.code === 'permission-denied') {
                    setEventsError(`Permission denied. Check Firestore rules for 'events'.`);
                } else if (err.code === 'unimplemented' || err.code === 'failed-precondition') {
                    setEventsError(`Firestore query error. Ensure required index exists for events query (check console for link).`);
                } else {
                    setEventsError("Failed to load upcoming events.");
                }
            } finally {
                setIsEventsLoading(false);
            }
        };
        fetchUpcomingEvents();
    } else if (!loadingAuth && !user) {
        setIsEventsLoading(false);
        setUpcomingEvents([]);
    } else if (!firestore) {
        setIsEventsLoading(false);
        setEventsError("Firestore service not available.");
    }
  }, [user, loadingAuth]);

  const handleAddPlantSubmit = async (newPlantData: NewPlantData) => {
      if (!user || !firestore || !database) {
          throw new Error("Authentication or Database service not ready.");
      }
      if (!newPlantData.selectedSeedId) {
          throw new Error("Seed selection is missing.");
      }
      if (newPlantData.quantity <= 0) {
          throw new Error("Quantity must be a positive number.");
      }

      const { plantName, plantType, selectedSeedId, quantity, imageData } = newPlantData;
      const newPlantRef = doc(collection(firestore, "plants")); 
      const seedRef = doc(firestore, "inventory", selectedSeedId); 
      let imageUrlToSave: string | null = null;
      let imageSavedToRTDB = false;

      
      if (imageData) {
          const imagePath = `plantImages/${newPlantRef.id}`; 
          const imageRefRTDB = ref(database, imagePath);
          try {
              await setRTDB(imageRefRTDB, imageData);
              imageUrlToSave = imagePath;
              imageSavedToRTDB = true;
              console.log("Image saved to RTDB:", imagePath);
          } catch (rtdbError) {
              console.error("RTDB Error saving image:", rtdbError);
              alert("Warning: Could not save the plant image. Proceeding without image.");
              imageUrlToSave = null;
          }
      }

      
      try {
          await runTransaction(firestore, async (transaction) => {
             
              const seedDoc = await transaction.get(seedRef);
              if (!seedDoc.exists()) {
                  throw new Error(`Seed with ID ${selectedSeedId} not found.`);
              }
              const seedData = seedDoc.data();
              
              const currentStock = typeof seedData.stock === 'number' ? seedData.stock : Number(seedData.stock) || 0;

              
              if (currentStock < quantity) {
                  throw new Error(`Insufficient stock for "${seedData.name}". Available: ${currentStock}, Required: ${quantity}`);
              }

              
              transaction.update(seedRef, {
                  stock: increment(-quantity), 
                  lastUpdated: serverTimestamp() 
              });

              
              const plantDataToSave = {
                  name: plantName,
                  type: plantType,
                  imageUrl: imageUrlToSave, 
                  datePlanted: serverTimestamp(),
                  status: "Seeding", 
                  locationZone: "Default Zone",
                  ownerUid: user.uid, 
                  seedId: selectedSeedId,
                  initialSeedQuantity: quantity, 
              };
              transaction.set(newPlantRef, plantDataToSave);
          });

          
          console.log("Plant added successfully with ID:", newPlantRef.id);
          const addedPlant: Plant = {
              id: newPlantRef.id,
              name: plantName,
              type: plantType,
              imageUrl: imageUrlToSave, 
              datePlanted: new Date(), 
              status: "Seeding",
              locationZone: "Default Zone",
              ownerUid: user.uid,
          };
          setPlantsData(prev => [...prev, addedPlant].sort((a, b) => a.name.localeCompare(b.name)));
          setIsAddPlantModalOpen(false);

      } catch (error) {
          console.error("Add plant process failed: ", error);
          
          if (imageSavedToRTDB && imageUrlToSave && database) {
              console.warn("Firestore transaction failed after RTDB image save. Attempting to remove orphaned image...");
              try {
                  const imageRefRTDB = ref(database, imageUrlToSave);
                  await setRTDB(imageRefRTDB, null); 
                  console.log("Orphaned image removed from RTDB:", imageUrlToSave);
              } catch (cleanupError) {
                  console.error("Failed to remove orphaned RTDB image:", cleanupError);
              }
          }
          if (error instanceof Error) {
              throw error;
          } else {
              throw new Error("An unknown error occurred while adding the plant.");
          }
      }
  };

  if (loadingAuth) {
    return <LoadingSpinner message="Authenticating user..." />;
  }
  if (!user) {

    return null;

  }

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      <div className="hidden lg:block lg:flex-shrink-0"> <Sidebar /> </div>

      {isMobileMenuOpen && (
        <>
          <div className="fixed inset-y-0 left-0 z-40 lg:hidden"> <Sidebar /> </div>
          <div className="fixed inset-0 z-30 bg-black opacity-50 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
        </>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm relative z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="lg:hidden mr-4 p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-500"
                  aria-label={isMobileMenuOpen ? "Close sidebar" : "Open sidebar"}
                >
                  {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
              </div>
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search plants..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm"
                  />
                </div>
                <button className="p-2 rounded-full text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                  <span className="sr-only">View notifications</span>
                  <Bell className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
          <div className="px-4 sm:px-6 lg:px-8 py-2 border-t border-gray-200">
            <h1 className="text-lg lg:text-2xl font-semibold text-gray-800">
              Hello, {user.displayName || 'Farmer'}!
            </h1>
            <p className="text-xs lg:text-sm text-gray-500">{currentDate}</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8 bg-gray-50">
          <section className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-700">Your Plants</h2>

            </div>
            {isPlantsLoading ? (
                <div className="flex justify-center items-center h-40 text-gray-500">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading plants...
                </div>
             ) : plantsError ? (
                <div className="flex flex-col justify-center items-center h-40 text-red-600 bg-red-50 p-4 rounded-md border border-red-200">
                    <AlertTriangle className="h-8 w-8 mb-2" />
                    <span className="font-semibold">Error Loading Plants</span>
                    <span className="text-sm text-center">{plantsError}</span>
                </div>
             ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {plantsData.filter(plant => plant.name.toLowerCase().includes(searchTerm.toLowerCase())).map((plant) => (
                    <PlantCard key={plant.id} plant={plant} />
                  ))}
                  <button
                    onClick={() => setIsAddPlantModalOpen(true)}
                    disabled={loadingAuth || !user}
                    className="flex flex-col items-center justify-center bg-white border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50 hover:border-green-400 hover:text-green-600 transition aspect-square shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    aria-label="Add a new plant"
                  >
                    <PlusCircle size={48} className="mb-2" />
                    <span className="font-medium">Add Plant</span>
                  </button>
                </div>
             )}
             {!isPlantsLoading && !plantsError && plantsData.filter(plant => plant.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && plantsData.length > 0 && (
                 <p className="text-center text-gray-500 mt-6">No plants match your search term "{searchTerm}".</p>
             )}
             {!isPlantsLoading && !plantsError && plantsData.length === 0 && (
                 <p className="text-center text-gray-500 mt-6">You haven't added any plants yet. Click the "Add Plant" button to get started!</p>
             )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <section>
              <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center">
                  <ListChecks className="h-5 w-5 mr-2 text-blue-600" />
                  Upcoming Events / Tasks
              </h2>
              <div className="bg-white rounded-lg shadow p-6 h-80 overflow-y-auto">
                {isEventsLoading ? (
                    <div className="flex justify-center items-center h-full text-gray-500">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading Events...
                    </div>
                ) : eventsError ? (
                    <div className="flex flex-col justify-center items-center h-full text-red-500 text-center p-4">
                        <AlertTriangle className="h-8 w-8 mb-2" />
                        <span className="font-semibold">Failed to Load Events</span>
                        <span className="text-sm">{eventsError}</span>
                    </div>
                ) : upcomingEvents.length > 0 ? (
                    <ul className="space-y-3">
                        {upcomingEvents.map((event) => (
                            <li key={event.id} className="p-3 border border-gray-200 rounded-md bg-gray-50 hover:bg-gray-100 transition">
                                <p className="font-medium text-gray-800 text-sm mb-1">{event.message}</p>
                                <div className="flex items-center text-xs text-gray-600 space-x-2">
                                    <Clock size={12} />
                                    <span>
                                        {event.timestamp.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        {' '}
                                        {event.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                                    </span>
                                    <span className="font-semibold text-blue-700">({event.type})</span>
                                    {event.status && (
                                        <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                            event.status.toLowerCase() === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                            event.status.toLowerCase() === 'completed' ? 'bg-green-100 text-green-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {event.status}
                                        </span>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-center text-gray-500 pt-10">No upcoming events or tasks found.</p>
                )}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center">
                  <LineChart className="h-5 w-5 mr-2 text-green-600" />
                  NPK Overview
              </h2>
              <div className="bg-white rounded-lg shadow p-6 h-80 flex items-center justify-center">
                 {isNpkLoading ? (
                    <div className="flex flex-col items-center text-gray-500">
                        <Loader2 className="h-8 w-8 animate-spin mb-2" />
                        <span>Loading NPK data...</span>
                    </div>
                 ) : npkError ? (
                    <div className="flex flex-col items-center text-red-600 text-center p-4">
                        <AlertTriangle className="h-8 w-8 mb-2" />
                         <span className="font-semibold">Error Loading NPK Data</span>
                         <span className="text-sm">{npkError}</span>
                    </div>
                 ) : npkData.length > 0 ? (
                    <NpkChart data={npkData} />
                 ) : (
                    <p className="text-center text-gray-500">No NPK data available to display.</p>
                 )}
              </div>
            </section>
          </div>
        </main>
      </div>

        {isAddPlantModalOpen && (
            <AddPlantModal
                isOpen={isAddPlantModalOpen}
                onClose={() => setIsAddPlantModalOpen(false)}
                onSubmit={handleAddPlantSubmit}
            />
        )}
    </div>
  );
}