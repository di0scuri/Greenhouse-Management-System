'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { firestore, auth } from '@/app/lib/firebase/config';
import { useAuthState } from 'react-firebase-hooks/auth';


import Sidebar from '@/components/Sidebar'; 
import PlantCard from '@/components/PlantCard'; 
import LoadingSpinner from '@/components/LoadingSpinner'; 
import { Loader2, AlertTriangle, Leaf, Inbox, Menu, X, Search } from 'lucide-react'; 

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

export default function PlantsPage() {
  const [user, loadingAuth, errorAuth] = useAuthState(auth);
  const router = useRouter();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [plantsData, setPlantsData] = useState<Plant[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

   useEffect(() => {
    if (!loadingAuth) {
      if (!user) {
        console.log("PlantsPage: No user found, redirecting to login.");
        router.push('/login');
      }
      if (errorAuth) {
        console.error("PlantsPage: Auth Error, redirecting to login.", errorAuth);
        router.push('/login');
      }
    }
  }, [user, loadingAuth, errorAuth, router]);

  useEffect(() => {
    if (!loadingAuth && user && firestore) {
      const fetchPlants = async () => {
        setIsLoading(true);
        setError(null);
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
          if (err.code === 'permission-denied') { setError(`Permission denied. Check Firestore rules for 'plants'.`); }
          else if (err.code === 'unimplemented' || err.code === 'failed-precondition') { setError(`Firestore query error. Ensure index exists for 'ownerUid' in 'plants'.`); }
          else { setError("Failed to load plants data."); }
        } finally {
          setIsLoading(false);
        }
      };
      fetchPlants();
    } else if (!loadingAuth && !user) {
        setIsLoading(false);
        setPlantsData([]);
    } else if (!firestore) {
        setIsLoading(false); setError("Firestore service not available.");
    }
  }, [user, loadingAuth]);
  const filteredPlants = useMemo(() => {
    if (!searchTerm) return plantsData;
    const lowerCaseSearch = searchTerm.toLowerCase();
    return plantsData.filter(plant =>
        plant.name.toLowerCase().includes(lowerCaseSearch) ||
        plant.type.toLowerCase().includes(lowerCaseSearch) ||
        plant.locationZone?.toLowerCase().includes(lowerCaseSearch)
    );
  }, [plantsData, searchTerm]);

  if (loadingAuth) {
    return <LoadingSpinner message="Authenticating..." />;
  }
  if (!user) {
    return null;
  }
  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      <div className="hidden lg:block lg:flex-shrink-0"> <Sidebar /> </div>
      {isMobileMenuOpen && (<div className="fixed inset-y-0 left-0 z-40 lg:hidden"> <Sidebar /> </div>)}
      {isMobileMenuOpen && (<div className="fixed inset-0 z-30 bg-black opacity-50 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>)}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm relative z-10 border-b">
          <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="lg:hidden mr-4 p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  aria-label="Open sidebar"
                >
                  {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
                <h1 className="text-xl font-semibold text-gray-800 flex items-center">
                  <Leaf className="h-6 w-6 mr-2 text-green-600" />
                  My Plants Overview
                </h1>
              </div>
               <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                      <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </span>
                  <input type="text" placeholder="Search plants..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm"
                  />
               </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {isLoading ? (
            <div className="flex justify-center items-center h-64 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin mr-3" /> Loading plants...
            </div>
          ) : error ? (
            <div className="flex flex-col justify-center items-center h-64 text-red-600 bg-red-100 p-6 rounded-md">
              <AlertTriangle className="h-8 w-8 mb-2" />
              <span className="font-semibold">Failed to Load Plants</span>
              <span className="text-sm">{error}</span>
            </div>
          ) : filteredPlants.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {filteredPlants.map((plant) => (
                <PlantCard key={plant.id} plant={plant} />
              ))}
            </div>
          ) : (
             <div className="flex flex-col justify-center items-center text-gray-500 py-16 px-6 text-center">
                <Inbox className="h-12 w-12 mb-4 text-gray-400" />
                <span className="font-semibold text-lg">No Plants Found</span>
                <span className="text-sm">
                    {searchTerm
                        ? `No plants match your search for "${searchTerm}".`
                        : `You haven't added any plants yet. Add one from the Dashboard.`}
                </span>
             </div>
          )}
        </main>
      </div>
    </div>
  );
}
