'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { doc, getDoc, collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { ref, get} from "firebase/database";
import { firestore, auth, database } from '@/app/lib/firebase/config';
import { useAuthState } from 'react-firebase-hooks/auth';

import Sidebar from '@/components/Sidebar';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Loader2, AlertTriangle, Leaf, ImageOff, Thermometer, Droplets, Sun, ListChecks } from 'lucide-react';
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

interface NpkReading {
  id: string;
  timestamp: Date;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
}

export default function PlantDetailPage() {
  const [user, loadingAuth, errorAuth] = useAuthState(auth);
  const router = useRouter();
  const params = useParams();
  const plantId = typeof params?.plantId === 'string' ? params.plantId : null;

  const [plantDetails, setPlantDetails] = useState<PlantDetails | null>(null);
  const [npkHistory, setNpkHistory] = useState<NpkReading[]>([]);
  const [imageData, setImageData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!loadingAuth) {
      if (!user) { router.push('/login'); }
      if (errorAuth) { console.error("Auth Error:", errorAuth); router.push('/login'); }
    }
  }, [user, loadingAuth, errorAuth, router]);

  useEffect(() => {
    if (!loadingAuth && user && firestore && database && plantId) {
      const fetchAllData = async () => {
        setIsLoading(true);
        setError(null);
        setImageData(null);
        setNpkHistory([]);

        try {
          const plantDocRef = doc(firestore, 'plants', plantId);
          const plantDocSnap = await getDoc(plantDocRef);

          if (!plantDocSnap.exists()) {
            throw new Error("Plant not found.");
          }

          const data = plantDocSnap.data();
          if (data.ownerUid !== user.uid) {
             throw new Error("You do not have permission to view this plant.");
          }

          const fetchedPlantDetails: PlantDetails = {
            id: plantDocSnap.id,
            name: data.name || 'Unnamed Plant',
            type: data.type || 'Unknown',
            imageUrl: data.imageUrl || null,
            datePlanted: data.datePlanted instanceof Timestamp ? data.datePlanted.toDate() : new Date(),
            status: data.status || 'Unknown',
            locationZone: data.locationZone,
            ownerUid: data.ownerUid,
            seedId: data.seedId,
            initialSeedQuantity: data.initialSeedQuantity,
          };
          setPlantDetails(fetchedPlantDetails);

          const npkCollectionRef = collection(firestore, 'npkReadings');
          const qNpk = query(npkCollectionRef, where("plantId", "==", plantId), orderBy("timestamp", "desc"));
          const npkSnapshot = await getDocs(qNpk);
          const fetchedNpkHistory: NpkReading[] = [];
          npkSnapshot.forEach((doc) => {
            const npkData = doc.data();
            fetchedNpkHistory.push({
              id: doc.id,
              timestamp: npkData.timestamp instanceof Timestamp ? npkData.timestamp.toDate() : new Date(),
              nitrogen: typeof npkData.nitrogen === 'number' ? npkData.nitrogen : 0,
              phosphorus: typeof npkData.phosphorus === 'number' ? npkData.phosphorus : 0,
              potassium: typeof npkData.potassium === 'number' ? npkData.potassium : 0,
            });
          });
          setNpkHistory(fetchedNpkHistory);

          if (fetchedPlantDetails.imageUrl && fetchedPlantDetails.imageUrl.startsWith('plantImages/')) {
            setIsImageLoading(true);
            const imageRefRTDB = ref(database, fetchedPlantDetails.imageUrl);
            try {
                const imageSnapshot = await get(imageRefRTDB);
                if (imageSnapshot.exists()) {
                    const base64Data = imageSnapshot.val();
                    if (typeof base64Data === 'string' && base64Data.startsWith('data:image/')) {
                        setImageData(base64Data);
                    } else { console.warn("Invalid image data format in RTDB"); }
                } else { console.warn("Image data not found in RTDB"); }
            } catch (rtdbError) { console.error("Error fetching image from RTDB:", rtdbError); }
            finally { setIsImageLoading(false); }
          }

        } catch (err: any) {
          console.error("Error fetching plant data:", err);
          setError(err.message || "Failed to load plant details.");
        } finally {
          setIsLoading(false);
        }
      };
      fetchAllData();
    } else if (!loadingAuth && !user) {
    } else if (!plantId) {
        setError("Plant ID not found in URL.");
        setIsLoading(false);
    } else if (!firestore || !database) {
        setError("Database services not available.");
        setIsLoading(false);
    }

  }, [plantId, user, loadingAuth]);

  if (loadingAuth || (isLoading && !error)) {
    return <LoadingSpinner message={loadingAuth ? "Authenticating..." : "Loading Plant Data..."} />;
  }
  if (!user) { return null; }
  if (error) {
    return (
        <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center text-center">
                <div className="text-red-600">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold mb-2">Error Loading Plant</h2>
                    <p>{error}</p>
                    <Link href="/dashboard" className="mt-4 inline-block text-blue-600 hover:underline">Go to Dashboard</Link>
                </div>
            </main>
        </div>
    );
  }
   if (!plantDetails) {
     return <LoadingSpinner message="Fetching plant details..." />;
   }

  const latestNpk = npkHistory.length > 0 ? npkHistory[0] : null;

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm relative z-10 border-b">
          <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <h1 className="text-xl font-semibold text-gray-800 flex items-center">
                <Leaf className="h-6 w-6 mr-2 text-green-600" />
                Plant Details: {plantDetails.name}
              </h1>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold text-gray-700 mb-3">Image</h2>
                <div className="w-full aspect-square relative bg-gray-200 rounded flex items-center justify-center text-gray-400">
                  {isImageLoading ? (
                    <Loader2 size={40} className="animate-spin text-gray-500" />
                  ) : !imageData ? (
                    <ImageOff size={48} />
                  ) : (
                    <img src={imageData} alt={plantDetails.name} className="absolute inset-0 w-full h-full object-cover rounded" />
                  )}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                 <h2 className="text-lg font-semibold text-gray-700 mb-3">Details</h2>
                 <dl className="space-y-2 text-sm">
                    <div className="flex justify-between"><dt className="text-gray-500">Name:</dt><dd className="text-gray-800 font-medium">{plantDetails.name}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Type:</dt><dd className="text-gray-800">{plantDetails.type}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Status:</dt><dd className="text-gray-800">{plantDetails.status}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Date Planted:</dt><dd className="text-gray-800">{plantDetails.datePlanted.toLocaleDateString()}</dd></div>
                    {plantDetails.locationZone && <div className="flex justify-between"><dt className="text-gray-500">Zone:</dt><dd className="text-gray-800">{plantDetails.locationZone}</dd></div>}
                    {plantDetails.seedId && <div className="flex justify-between"><dt className="text-gray-500">Seed ID:</dt><dd className="text-gray-800 text-xs truncate">{plantDetails.seedId}</dd></div>}
                    {plantDetails.initialSeedQuantity && <div className="flex justify-between"><dt className="text-gray-500">Seeds Planted:</dt><dd className="text-gray-800">{plantDetails.initialSeedQuantity}</dd></div>}
                 </dl>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
               <div className="bg-white rounded-lg shadow p-4">
                  <h2 className="text-lg font-semibold text-gray-700 mb-3">Latest NPK Reading</h2>
                  {latestNpk ? (
                      <div className="grid grid-cols-3 gap-4 text-center">
                          <div><p className="text-xs text-gray-500">Nitrogen (N)</p><p className="text-2xl font-bold text-green-600">{latestNpk.nitrogen}%</p></div>
                          <div><p className="text-xs text-gray-500">Phosphorus (P)</p><p className="text-2xl font-bold text-blue-600">{latestNpk.phosphorus}%</p></div>
                          <div><p className="text-xs text-gray-500">Potassium (K)</p><p className="text-2xl font-bold text-orange-500">{latestNpk.potassium}%</p></div>
                          <p className="col-span-3 text-xs text-gray-400 text-right mt-1">
                              Reading taken: {latestNpk.timestamp.toLocaleString()}
                          </p>
                      </div>
                  ) : (
                      <p className="text-sm text-gray-500">No NPK readings available yet.</p>
                  )}
               </div>

               <div className="bg-white rounded-lg shadow">
                   <h2 className="text-lg font-semibold text-gray-700 p-4 border-b">NPK History</h2>
                   {npkHistory.length > 0 ? (
                       <div className="overflow-x-auto max-h-96 overflow-y-auto">
                           <table className="min-w-full divide-y divide-gray-200">
                               <thead className="bg-gray-50 sticky top-0">
                                   <tr>
                                       <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                                       <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">N (%)</th>
                                       <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">P (%)</th>
                                       <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">K (%)</th>
                                   </tr>
                               </thead>
                               <tbody className="bg-white divide-y divide-gray-200">
                                   {npkHistory.map(reading => (
                                       <tr key={reading.id}>
                                           <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">{reading.timestamp.toLocaleString()}</td>
                                           <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 text-right">{reading.nitrogen}</td>
                                           <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 text-right">{reading.phosphorus}</td>
                                           <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 text-right">{reading.potassium}</td>
                                       </tr>
                                   ))}
                               </tbody>
                           </table>
                       </div>
                   ) : (
                       <p className="text-sm text-gray-500 p-4">No historical NPK readings found.</p>
                   )}
               </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

