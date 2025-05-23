'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, query, where, getDocs, Timestamp,
  addDoc, doc, updateDoc, getDoc, serverTimestamp, orderBy,
  runTransaction,
  increment
} from 'firebase/firestore';
import { firestore, auth } from '@/app/lib/firebase/config';
import { useAuthState } from 'react-firebase-hooks/auth';

import Sidebar from '@/components/Sidebar';
import InventoryItemModal from '@/components/InventoryItemModal';
import UseItemModal, { InventoryItem as ModalInventoryItemProps } from '@/components/UseItemModal';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
  Search, Bell, SlidersHorizontal, CheckCircle2, AlertTriangle, Loader2,
  Leaf, FlaskConical, Package,
  X, Menu, Calendar as CalendarIcon,
  Plus, Edit2, Inbox, History,
  Filter, ListRestart, ShoppingCart, Settings,
  PlusCircle, Droplet, DollarSign, FileText, MinusCircle
} from 'lucide-react';

// Interfaces
export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  pricePerUnit: number;
  lowStockThreshold: number;
  lastUpdated?: Date;
  ownerUid?: string; 
  n_percentage?: number;
  p_percentage?: number;
  k_percentage?: number;
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
    plantId?: string;
    unit?: string;
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

interface PlantForDropdown {
    id: string;
    name: string;
}

const formatCurrency = (value: number): string => {
    if (value === 0) return '-';
    return new Intl.NumberFormat('en-PH', {
        style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value);
};
const formatDate = (date: Date | null | undefined): string => {
  if (!date) return 'N/A';
  return date.toLocaleDateString('en-CA') + ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};
const getLogTypeStyle = (type: InventoryLogEntry['type']) => {
    switch (type) {
      case 'Purchase': return { Icon: ShoppingCart, color: 'text-blue-600', bgColor: 'bg-blue-100' };
      case 'Seed Planted': return { Icon: Leaf, color: 'text-green-700', bgColor: 'bg-green-100' };
      case 'Fertilizer Used': return { Icon: Droplet, color: 'text-sky-600', bgColor: 'bg-sky-100' };
      case 'Material Used': return { Icon: Package, color: 'text-orange-600', bgColor: 'bg-orange-100' };
      case 'Sale': return { Icon: DollarSign, color: 'text-emerald-600', bgColor: 'bg-emerald-100' };
      case 'Adjustment': return { Icon: Settings, color: 'text-purple-600', bgColor: 'bg-purple-100' };
      case 'Initial Stock': return { Icon: PlusCircle, color: 'text-teal-600', bgColor: 'bg-teal-100' };
      default: return { Icon: FileText, color: 'text-gray-600', bgColor: 'bg-gray-100' };
    }
};

export default function InventoryPage() {
  const [user, loadingAuth, authError] = useAuthState(auth);
  const router = useRouter();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'Seeds' | 'Fertilizers' | 'Other' | 'Logs'>('Seeds');
  const [searchTerm, setSearchTerm] = useState('');

  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([]);
  const [isInventoryLoading, setIsInventoryLoading] = useState<boolean>(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  const [logData, setLogData] = useState<InventoryLogEntry[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState<boolean>(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const [filterItemName, setFilterItemName] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const [isUseModalOpen, setIsUseModalOpen] = useState(false);
  const [itemToUse, setItemToUse] = useState<InventoryItem | null>(null);

  const [availablePlants, setAvailablePlants] = useState<PlantForDropdown[]>([]);
  const [isLoadingPlants, setIsLoadingPlants] = useState<boolean>(false);
  const [plantsError, setPlantsError] = useState<string | null>(null);


  useEffect(() => {
      if (!loadingAuth && !user && !authError) {
          router.push('/login');
      }
  }, [user, loadingAuth, authError, router]);

  // Fetch Inventory Data Effect
  useEffect(() => {
    const inventoryTabs: Array<typeof activeTab> = ['Seeds', 'Fertilizers', 'Other'];
    if (!user || !firestore) {
        setIsInventoryLoading(false);
        if (activeTab !== 'Logs') setInventoryData([]);
        return;
    }
    if (!inventoryTabs.includes(activeTab)) {
        setIsInventoryLoading(false);
        if (activeTab !== 'Logs') setInventoryData([]);
        return;
    }

    const fetchInventoryData = async () => {
      setIsInventoryLoading(true);
      setInventoryError(null);
      setInventoryData([]);
      try {
        const inventoryCollectionRef = collection(firestore, 'inventory');
        const q = query(
            inventoryCollectionRef,
            where("category", "==", activeTab.toLowerCase()),
            orderBy("name", "asc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedItems: InventoryItem[] = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const lowStockValue = data.lowStockThreshold ?? data.lowStokThreshold;
            fetchedItems.push({
              id: docSnap.id,
              name: data.name || 'Unnamed Item',
              category: data.category || 'Unknown',
              stock: typeof data.stock === 'number' ? data.stock : Number(data.stock) || 0,
              unit: data.unit || '',
              pricePerUnit: typeof data.pricePerUnit === 'number' ? data.pricePerUnit : Number(data.pricePerUnit) || 0,
              lowStockThreshold: typeof lowStockValue === 'number' ? lowStockValue : Number(lowStockValue) || 0,
              lastUpdated: data.lastUpdated instanceof Timestamp ? data.lastUpdated.toDate() : undefined,
              ownerUid: data.ownerUid,
              n_percentage: data.n_percentage,
              p_percentage: data.p_percentage,
              k_percentage: data.k_percentage,
            });
        });
        setInventoryData(fetchedItems);
        console.log(`Workspaceed ${activeTab} (global):`, fetchedItems);
      } catch (err: any) {
        console.error("Error fetching global inventory:", err);
        if (err.code === 'permission-denied') {
            setInventoryError(`Permission denied. Check Firestore security rules for 'inventory' collection (needs to allow general read access).`);
        } else if (err.code === 'failed-precondition' || err.message.toLowerCase().includes('index')) {
            setInventoryError(`Firestore index needed for global inventory query. Check console for link.`);
            console.error("Firestore Indexing Error: Create a composite index for 'inventory' collection on (category ASC, name ASC).");
        } else {
            setInventoryError(`Failed to load ${activeTab}. ${err.message}`);
        }
      } finally {
        setIsInventoryLoading(false);
      }
    };
    fetchInventoryData();
  }, [activeTab, user, firestore]);

  useEffect(() => {
      if (activeTab !== 'Logs' || !user || !firestore) {
          setLogData([]);
          setIsLogsLoading(false);
          return;
      }
      const fetchLogData = async () => {
          setIsLogsLoading(true); setLogsError(null); setLogData([]);
          try {
              const logCollectionRef = collection(firestore, 'inventory_log');
              const q = query(logCollectionRef, where("userId", "==", user.uid), orderBy('timestamp', 'desc'));
              const querySnapshot = await getDocs(q);
              const fetchedLogs: InventoryLogEntry[] = [];
              querySnapshot.forEach((docSnap) => {
                  const data = docSnap.data();
                  const quantityChange = Number(data.quantityChange) || 0;
                  const costOrValuePerUnit = Number(data.costOrValuePerUnit) || 0;
                  const type = ['Purchase', 'Seed Planted', 'Fertilizer Used', 'Material Used', 'Sale', 'Adjustment', 'Initial Stock'].includes(data.type) ? data.type : 'Adjustment';
                  fetchedLogs.push({
                      id: docSnap.id, itemId: data.itemId || 'N/A', itemName: data.itemName || 'N/A',
                      timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp),
                      type: type as InventoryLogEntry['type'], quantityChange: quantityChange, costOrValuePerUnit: costOrValuePerUnit,
                      totalCostOrValue: Math.abs(quantityChange) * costOrValuePerUnit,
                      notes: data.notes || '', userId: data.userId, plantId: data.plantId
                  });
              });
              setLogData(fetchedLogs);
          } catch (err: any) {
              console.error("Error fetching inventory log:", err);
              if (err.code === 'permission-denied') { setLogsError(`Permission denied for 'inventory_log'.`); }
              else if (err.code === 'failed-precondition' || err.message.toLowerCase().includes('index')) {
                  setLogsError(`Firestore index needed for logs. Check console for link.`);
                   console.error("Firestore Indexing Error: Create a composite index for 'inventory_log' on (userId ASC, timestamp DESC).");
              }
              else { setLogsError(`Failed to load inventory log. ${err.message}`); }
          } finally { setIsLogsLoading(false); }
      };
      fetchLogData();
  }, [activeTab, user, firestore]);

  useEffect(() => {
    const fetchPlantsForDropdown = async () => {
      if (user && firestore) {
        setIsLoadingPlants(true);
        setPlantsError(null);
        try {
          const plantsCollectionRef = collection(firestore, 'plants');
          const q = query(
            plantsCollectionRef,
            where("ownerUid", "==", user.uid),
            orderBy("name", "asc")
          );
          const plantsSnapshot = await getDocs(q);
          const fetchedPlantsData: PlantForDropdown[] = plantsSnapshot.docs.map(docSnap => ({
            id: docSnap.id,
            name: docSnap.data().name as string,
          }));
          setAvailablePlants(fetchedPlantsData);
        } catch (error: any) {
          console.error("Error fetching plants for modal dropdown:", error);
          setPlantsError(`Failed to load plants: ${error.message}`);
          setAvailablePlants([]);
           if (error.code === 'permission-denied') {
             setPlantsError(`Permission denied. Check Firestore rules for 'plants' collection.`);
           } else if (error.code === 'failed-precondition' || error.message.toLowerCase().includes('index')) {
             setPlantsError(`Firestore index needed for plants query. Check console for link.`);
             console.error("Firestore Indexing Error: Create a composite index for 'plants' collection on (ownerUid ASC, name ASC).");
           }
        } finally {
          setIsLoadingPlants(false);
        }
      } else {
        setAvailablePlants([]);
        setIsLoadingPlants(false);
      }
    };
    if (user) {
        fetchPlantsForDropdown();
    }
  }, [user, firestore]);
    const handleOpenCreateModal = () => { setModalMode('create'); setEditingItem(null); setIsModalOpen(true); };
    const handleOpenEditModal = (item: InventoryItem) => { setModalMode('edit'); setEditingItem(item); setIsModalOpen(true); };
    const handleOpenUseModal = (item: InventoryItem) => { setItemToUse(item); setIsUseModalOpen(true); };

    const writeInventoryLog = async (logData: Omit<LogEntryData, 'userId' | 'timestamp'> & { timestamp?: any }) => {
        if (!user || !firestore) { console.error("Cannot write log: user or firestore not available."); return; }
        try {
            const logCollectionRef = collection(firestore, 'inventory_log');
            await addDoc(logCollectionRef, {
                ...logData,
                userId: user.uid, 
                timestamp: logData.timestamp || serverTimestamp()
            });
            console.log("Inventory log entry written.");
        } catch (logError) { console.error("Error writing inventory log:", logError); }
   };

    const handleModalSubmit = async (itemData: Partial<InventoryItem>, id?: string) => {
        if (!user || !firestore) throw new Error("User not authenticated or Firestore not available.");
        const stockNum = Number(itemData.stock);
        const thresholdNum = Number(itemData.lowStockThreshold);
        const priceNum = Number(itemData.pricePerUnit);

        if (isNaN(stockNum) || isNaN(thresholdNum) || isNaN(priceNum) || !itemData.name?.trim() || !itemData.unit?.trim() || itemData.pricePerUnit === undefined) {
            throw new Error("Invalid data. Name, unit, stock, threshold, and price are required.");
        }
        if (priceNum < 0 || stockNum < 0 || thresholdNum < 0) {
            throw new Error("Stock, threshold, and price values cannot be negative.");
        }

        const currentCategory = (itemData.category || activeTab).toLowerCase() as 'seeds' | 'fertilizers' | 'other';

        const dataToSave: Omit<InventoryItem, 'id' | 'lastUpdated'> & {lastUpdated: any, ownerUid?: string} = {
          name: itemData.name.trim(),
          category: currentCategory,
          stock: stockNum,
          unit: itemData.unit.trim(),
          pricePerUnit: priceNum,
          lowStockThreshold: thresholdNum,
          lastUpdated: serverTimestamp(),
          ownerUid: user.uid,
          n_percentage: currentCategory === 'fertilizers' ? Number(itemData.n_percentage) || undefined : undefined,
          p_percentage: currentCategory === 'fertilizers' ? Number(itemData.p_percentage) || undefined : undefined,
          k_percentage: currentCategory === 'fertilizers' ? Number(itemData.k_percentage) || undefined : undefined,
        };
        if (dataToSave.n_percentage === undefined) delete dataToSave.n_percentage;
        if (dataToSave.p_percentage === undefined) delete dataToSave.p_percentage;
        if (dataToSave.k_percentage === undefined) delete dataToSave.k_percentage;


        if (modalMode === 'create') {
            try {
                const inventoryCollectionRef = collection(firestore, 'inventory');
                const docRef = await addDoc(inventoryCollectionRef, dataToSave);
                await writeInventoryLog({
                    itemId: docRef.id, itemName: dataToSave.name, type: 'Initial Stock',
                    quantityChange: dataToSave.stock, costOrValuePerUnit: dataToSave.pricePerUnit,
                    notes: 'Item added via modal.', unit: dataToSave.unit
                });
                const newItemUI: InventoryItem = { ...dataToSave, id: docRef.id, lastUpdated: new Date(), category: dataToSave.category as string};
                setInventoryData(prev => [...prev, newItemUI].sort((a, b) => a.name.localeCompare(b.name)));
                setIsModalOpen(false);
            } catch (error) { console.error("Error adding item:", error); throw new Error("Failed to add item."); }
        } else if (modalMode === 'edit' && id && editingItem) {
            const itemDocRef = doc(firestore, 'inventory', id);
            try {
                const docSnap = await getDoc(itemDocRef);
                if (!docSnap.exists()) { throw new Error("Item not found for editing."); }
                const oldData = docSnap.data();
                const oldStock = Number(oldData.stock) || 0;
                const quantityChange = dataToSave.stock - oldStock;

                await updateDoc(itemDocRef, dataToSave as any);

                if (quantityChange !== 0) {
                    await writeInventoryLog({
                        itemId: id, itemName: dataToSave.name, type: 'Adjustment',
                        quantityChange: quantityChange, costOrValuePerUnit: dataToSave.pricePerUnit,
                        notes: `Stock adjusted. Change: ${quantityChange > 0 ? '+' : ''}${quantityChange} ${dataToSave.unit}.`,
                        unit: dataToSave.unit
                    });
                }
                setInventoryData(prev => prev.map(item => item.id === id ? { ...item, ...dataToSave, lastUpdated: new Date(), category: dataToSave.category as string } : item ).sort((a,b) => a.name.localeCompare(b.name)));
                setIsModalOpen(false);
            } catch (error) { console.error("Error updating item:", error); throw new Error("Failed to update item."); }
        }
   };

   const handleUseSubmit = async (item: InventoryItem, quantityUsed: number, notes?: string, plantId?: string) => {
       if (!user || !firestore) throw new Error("User not authenticated or Firestore not available.");
       if (quantityUsed <= 0) throw new Error("Quantity used must be positive.");

       const itemDocRef = doc(firestore, 'inventory', item.id);
       const logType = item.category === 'fertilizers' ? 'Fertilizer Used'
                     : item.category === 'seeds' ? 'Seed Planted'
                     : 'Material Used';

       try {
           await runTransaction(firestore, async (transaction) => {
               const itemDocSnap = await transaction.get(itemDocRef);
               if (!itemDocSnap.exists()) { throw new Error("Inventory item not found during transaction."); }
               const currentData = itemDocSnap.data();
               const currentStock = Number(currentData.stock) || 0;
               if (quantityUsed > currentStock) {
                   throw new Error(`Stock changed. Only ${currentStock} ${item.unit} available.`);
               }
               transaction.update(itemDocRef, { stock: increment(-quantityUsed), lastUpdated: serverTimestamp() });
               const logCollectionRef = collection(firestore, 'inventory_log');
               const logEntryRef = doc(logCollectionRef);
               const logDataForWrite: LogEntryData = {
                   itemId: item.id, itemName: item.name, timestamp: serverTimestamp(), type: logType,
                   quantityChange: -quantityUsed, costOrValuePerUnit: item.pricePerUnit, // Assuming pricePerUnit is the cost basis
                   notes: notes || `${logType}${plantId ? ` for plant ${plantId}` : ''}.`, userId: user.uid,
                   plantId: plantId || undefined, unit: item.unit,
               };
               transaction.set(logEntryRef, logDataForWrite);
           });
           setInventoryData(prevData =>
               prevData.map(invItem =>
                   invItem.id === item.id ? { ...invItem, stock: invItem.stock - quantityUsed, lastUpdated: new Date() } : invItem
               )
           );
           setIsUseModalOpen(false); setItemToUse(null);
       } catch (error: any) { console.error("Error using item:", error); throw new Error(error.message || "Failed to record usage."); }
   };

   // Memoized calculations (keep as is)
   const filteredInventoryData = useMemo(() => {
     const inventoryTabsArray: Array<typeof activeTab> = ['Seeds', 'Fertilizers', 'Other'];
     if (!inventoryTabsArray.includes(activeTab)) return inventoryData;
     if (!searchTerm.trim()) return inventoryData;
     const lowerCaseSearch = searchTerm.toLowerCase();
     return inventoryData.filter(item => item.name.toLowerCase().includes(lowerCaseSearch));
   }, [inventoryData, searchTerm, activeTab]);

   const filteredLogData = useMemo(() => {
     if (activeTab !== 'Logs') return [];
     let data = logData;
     if (filterItemName.trim()) { const lower = filterItemName.toLowerCase(); data = data.filter(log => log.itemName.toLowerCase().includes(lower)); }
     try {
        const startDate = filterStartDate ? new Date(filterStartDate + 'T00:00:00') : null;
        const endDate = filterEndDate ? new Date(filterEndDate + 'T23:59:59') : null;
        if (startDate && !isNaN(startDate.getTime())) { data = data.filter(log => log.timestamp >= startDate); }
        if (endDate && !isNaN(endDate.getTime())) { data = data.filter(log => log.timestamp <= endDate); }
     } catch (e) {
        console.error("Error parsing date filters", e)
     }
     return data;
   }, [logData, filterItemName, filterStartDate, filterEndDate, activeTab]);

   const resetLogFilters = () => { setFilterItemName(''); setFilterStartDate(''); setFilterEndDate(''); };
   const lowStockItems = useMemo(() => inventoryData.filter(item => item.stock < item.lowStockThreshold).length, [inventoryData]);
   const lastUpdatedDate = useMemo(() => {
       if (isInventoryLoading || inventoryError || inventoryData.length === 0) return "N/A";
       const dates = inventoryData.map(item => item.lastUpdated).filter(date => date instanceof Date && !isNaN(date.getTime())) as Date[];
       if (dates.length === 0) return "N/A";
       const mostRecentDate = new Date(Math.max(...dates.map(date => date.getTime())));
       return mostRecentDate.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
   }, [inventoryData, isInventoryLoading, inventoryError]);
   const totalItemCount = useMemo(() => inventoryData.length, [inventoryData]);


   if (loadingAuth) { return <LoadingSpinner message="Authenticating..." />; }
   if (!user && !loadingAuth) {
     return <div className="flex h-screen items-center justify-center p-4 text-center">Please log in to view inventory. Redirecting...</div>;
   }

   const CurrentCategoryIcon = activeTab === 'Seeds' ? Leaf : activeTab === 'Fertilizers' ? FlaskConical : activeTab === 'Other' ? Package : Inbox;
   const iconColor = activeTab === 'Seeds' ? 'text-green-500' : activeTab === 'Fertilizers' ? 'text-blue-500' : activeTab === 'Other' ? 'text-orange-500' : 'text-gray-500';

   return (
     <div className="flex h-screen bg-gray-100 font-sans">
       {/* Sidebar */}
       <div className="hidden lg:block lg:flex-shrink-0"> <Sidebar /> </div>
       {isMobileMenuOpen && (<div className="fixed inset-y-0 left-0 z-40 lg:hidden"> <Sidebar /> </div>)}
       {isMobileMenuOpen && (<div className="fixed inset-0 z-30 bg-black opacity-50 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>)}

       <div className="flex-1 flex flex-col overflow-hidden">
         {/* Header (Keep your existing header JSX) */}
         <header className="bg-white shadow-sm relative z-10 border-b">
           <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
             <div className="flex justify-between items-center h-16">
               <div className="flex items-center">
                 <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden mr-4 p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100" aria-label="Open sidebar">
                   {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                 </button>
                 <h1 className="text-xl font-semibold text-gray-800">Inventory</h1>
               </div>
               <div className="flex items-center">
                {(activeTab !== 'Logs') && (
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3"> <Search className="h-5 w-5 text-gray-400" aria-hidden="true" /> </span>
                    <input type="text" placeholder={`Search ${activeTab}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm"
                    />
                  </div>
                )}
               </div>
             </div>
           </div>
           <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-4 sm:space-x-8 px-4 sm:px-6 lg:px-8 overflow-x-auto" aria-label="Tabs">
                <button onClick={() => { setActiveTab('Seeds'); setSearchTerm(''); }} className={`whitespace-nowrap flex items-center py-4 px-1 border-b-2 font-medium text-sm focus:outline-none ${activeTab === 'Seeds' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`} aria-current={activeTab === 'Seeds' ? 'page' : undefined}> <Leaf size={16} className="mr-1.5" /> Seeds </button>
                <button onClick={() => { setActiveTab('Fertilizers'); setSearchTerm(''); }} className={`whitespace-nowrap flex items-center py-4 px-1 border-b-2 font-medium text-sm focus:outline-none ${activeTab === 'Fertilizers' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`} aria-current={activeTab === 'Fertilizers' ? 'page' : undefined}> <FlaskConical size={16} className="mr-1.5" /> Fertilizers </button>
                <button onClick={() => { setActiveTab('Other'); setSearchTerm(''); }} className={`whitespace-nowrap flex items-center py-4 px-1 border-b-2 font-medium text-sm focus:outline-none ${activeTab === 'Other' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`} aria-current={activeTab === 'Other' ? 'page' : undefined}> <Package size={16} className="mr-1.5" /> Other </button>
                <button onClick={() => { setActiveTab('Logs'); setSearchTerm(''); resetLogFilters(); }} className={`whitespace-nowrap flex items-center py-4 px-1 border-b-2 font-medium text-sm focus:outline-none ${activeTab === 'Logs' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`} aria-current={activeTab === 'Logs' ? 'page' : undefined}> <History size={16} className="mr-1.5" /> Logs </button>
              </nav>
            </div>
         </header>

         {/* Main Content Area (Scrollable) */}
         <main className="flex-1 overflow-y-auto p-6 lg:p-8">
           {activeTab === 'Seeds' || activeTab === 'Fertilizers' || activeTab === 'Other' ? (
             <>
               {/* Summary Cards Section */}
               <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                 <div className="bg-white p-5 rounded-lg shadow flex items-center space-x-4">
                   <CurrentCategoryIcon className={`h-8 w-8 ${iconColor} flex-shrink-0`} />
                   <div> <p className="text-sm font-medium text-gray-500">Total {activeTab} Items</p> <p className="text-2xl font-semibold text-gray-800"> {isInventoryLoading ? <Loader2 className="h-5 w-5 animate-spin inline-block" /> : inventoryError ? 'Error' : `${totalItemCount}`} </p> </div>
                 </div>
                 <div className={`bg-white p-5 rounded-lg shadow flex items-center space-x-4 ${!isInventoryLoading && !inventoryError && lowStockItems > 0 ? 'border-l-4 border-red-500' : ''}`}>
                     <AlertTriangle className={`h-8 w-8 flex-shrink-0 ${!isInventoryLoading && !inventoryError && lowStockItems > 0 ? 'text-red-500' : 'text-yellow-500'}`} />
                     <div> <p className="text-sm font-medium text-gray-500">Low Stock Items</p> <p className={`text-2xl font-semibold ${!isInventoryLoading && !inventoryError && lowStockItems > 0 ? 'text-red-600' : 'text-gray-800'}`}> {isInventoryLoading ? <Loader2 className="h-5 w-5 animate-spin inline-block" /> : inventoryError ? 'Error' : `${lowStockItems}${lowStockItems > 0 ? '!' : ''}`} </p> </div>
                 </div>
                 <div className="bg-white p-5 rounded-lg shadow flex items-center space-x-4">
                     <CalendarIcon className="h-8 w-8 text-gray-500 flex-shrink-0" />
                     <div> <p className="text-sm font-medium text-gray-500">Last Update Recorded</p> <p className="text-xl font-semibold text-gray-800">{isInventoryLoading ? <Loader2 className="h-5 w-5 animate-spin inline-block" /> : inventoryError ? 'Error' : lastUpdatedDate}</p> </div>
                 </div>
               </section>

                {plantsError && (activeTab === 'Fertilizers' || activeTab === 'Other' || activeTab === 'Seeds') && (
                    <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-200 rounded-md text-sm">
                        <AlertTriangle size={16} className="inline mr-2" />
                        Could not load plants for linking: {plantsError}
                    </div>
                )}

               {/* Inventory Table Section */}
               <section className="bg-white rounded-lg shadow overflow-hidden">
                 <div className="overflow-x-auto">
                   <table className="min-w-full divide-y divide-gray-200">
                     {/* ... Table Head ... */}
                     <thead className="bg-gray-50">
                       <tr>
                         <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                         <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                         <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price / Unit</th>
                         <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                         <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                       </tr>
                     </thead>
                     {/* Table Body */}
                     <tbody className="bg-white divide-y divide-gray-200">
                       {isInventoryLoading ? ( <tr><td colSpan={5}><div className="flex justify-center items-center text-gray-500 py-10 px-6"><Loader2 className="h-6 w-6 animate-spin mr-3" /><span>Loading {activeTab.toLowerCase()}...</span></div></td></tr> )
                       : inventoryError ? ( <tr><td colSpan={5}><div className="flex flex-col justify-center items-center text-red-600 py-10 px-6 text-center"><AlertTriangle className="h-8 w-8 mb-2" /><span className="font-semibold">Loading Failed</span><span className="text-sm mt-1">{inventoryError}</span></div></td></tr> )
                       : filteredInventoryData.length > 0 ? (
                           filteredInventoryData.map((item) => {
                               const isLowStock = item.stock < item.lowStockThreshold;
                               const showUseButton = item.category === 'fertilizers' || item.category === 'other' || item.category === 'seeds';
                               return (
                                 <tr key={item.id} className={`${isLowStock ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'} transition-colors duration-150 ease-in-out`}>
                                   <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                                   <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.stock.toLocaleString()} {item.unit}</td>
                                   <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatCurrency(item.pricePerUnit)} / {item.unit}</td>
                                   <td className="px-6 py-4 whitespace-nowrap text-sm">
                                     {isLowStock ? ( <span className="flex items-center text-red-600 font-medium"> <AlertTriangle size={16} className="mr-1.5 flex-shrink-0" /> Low stock! </span> )
                                     : ( <span className="flex items-center text-green-600"> <CheckCircle2 size={16} className="mr-1.5 flex-shrink-0" /> Sufficient </span> )}
                                   </td>
                                   <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-center space-x-2">
                                     <button onClick={() => handleOpenEditModal(item)} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 inline-flex items-center" aria-label={`Edit ${item.name}`}> <Edit2 size={18} /> </button>
                                     {showUseButton && (
                                         <button onClick={() => handleOpenUseModal(item)} disabled={item.stock <=0} className="text-yellow-600 hover:text-yellow-800 p-1 rounded hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-1 inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed" aria-label={`Use ${item.name}`}> <MinusCircle size={18} /> </button>
                                     )}
                                   </td>
                                 </tr>
                               );
                           })
                       ) : ( <tr><td colSpan={5}><div className="flex flex-col justify-center items-center text-gray-500 py-16 px-6 text-center"><Inbox className="h-12 w-12 mb-4 text-gray-400" /><span className="font-semibold text-lg">No {activeTab.toLowerCase()} Found</span><span className="text-sm mt-1">{searchTerm ? `No items match "${searchTerm}".` : `Add the first ${activeTab.slice(0, -1)} using the '+' button below.`}</span></div></td></tr> )}
                     </tbody>
                   </table>
                 </div>
               </section>
             </>
           ) : ( // Render Logs Tab Content
             <>
              {/* Logs Filter and Table Sections (Keep your existing JSX for logs) */}
               <section className="mb-6 p-4 bg-white rounded-lg shadow">
                 <h2 className="text-lg font-semibold text-gray-700 mb-3">Filter Logs</h2>
                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
                   <div className="sm:col-span-2 md:col-span-1">
                       <label htmlFor="filterLogItem" className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                       <div className="relative"> <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"> <Search className="h-4 w-4 text-gray-400" /> </div> <input id="filterLogItem" type="text" placeholder="Search item..." value={filterItemName} onChange={(e) => setFilterItemName(e.target.value)} className="w-full pl-10 pr-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm" /> </div>
                   </div>
                   <div> <label htmlFor="filterLogStartDate" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label> <input id="filterLogStartDate" type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm" max={filterEndDate || undefined} /> </div>
                   <div> <label htmlFor="filterLogEndDate" className="block text-sm font-medium text-gray-700 mb-1">End Date</label> <input id="filterLogEndDate" type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm" min={filterStartDate || undefined} /> </div>
                   <div className="flex items-end">
                       <button onClick={resetLogFilters} className="w-full py-2 px-3 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center justify-center text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"><ListRestart size={16} className="mr-1.5" /> Reset</button>
                   </div>
                 </div>
               </section>
               <section className="bg-white rounded-lg shadow overflow-hidden">
                 <div className="overflow-x-auto">
                   <table className="min-w-full divide-y divide-gray-200">
                     <thead className="bg-gray-50">
                       <tr>
                         <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Date & Time</th>
                         <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
                         <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                         <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Qty Chg.</th>
                         <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Cost/Value</th>
                         <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Impact</th>
                         <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                       </tr>
                     </thead>
                     <tbody className="bg-white divide-y divide-gray-200">
                       {isLogsLoading ? ( <tr><td colSpan={7}><div className="flex justify-center items-center text-gray-500 py-10 px-6"><Loader2 className="h-6 w-6 animate-spin mr-3" /><span>Loading logs...</span></div></td></tr> )
                       : logsError ? ( <tr><td colSpan={7}><div className="flex flex-col justify-center items-center text-red-600 py-10 px-6 text-center"><AlertTriangle className="h-8 w-8 mb-2" /><span className="font-semibold">Loading Failed</span><span className="text-sm mt-1">{logsError}</span></div></td></tr> )
                       : filteredLogData.length > 0 ? (
                           filteredLogData.map((log) => {
                               const { Icon, color, bgColor } = getLogTypeStyle(log.type);
                               const isSale = log.type === 'Sale';
                               const isStockOut = isSale || log.quantityChange < 0;
                               const displayQuantity = isSale ? -log.quantityChange : log.quantityChange;
                               const showMonetaryValue = log.type === 'Purchase' || log.type === 'Sale' || log.type === 'Initial Stock';
                               return (
                                 <tr key={log.id} className="hover:bg-gray-50 transition-colors duration-150 ease-in-out">
                                   <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{formatDate(log.timestamp)}</td>
                                   <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{log.itemName}</td>
                                   <td className="px-4 py-4 whitespace-nowrap text-sm"> <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bgColor} ${color}`}> <Icon size={14} className="mr-1.5" /> {log.type} </span> </td>
                                   <td className={`px-4 py-4 whitespace-nowrap text-sm text-right font-medium ${isStockOut ? 'text-red-600' : 'text-green-600'}`}>
                                     {displayQuantity > 0 && !isStockOut ? '+' : ''}{displayQuantity.toLocaleString()}
                                   </td>
                                   <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-600"> {showMonetaryValue ? formatCurrency(log.costOrValuePerUnit) : '-'} </td>
                                   <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-800 font-medium"> {showMonetaryValue ? formatCurrency(log.totalCostOrValue) : '-'} </td>
                                   <td className="px-4 py-4 text-sm text-gray-500 max-w-xs truncate" title={log.notes}> {log.notes || '-'} </td>
                                 </tr>
                               );
                           })
                       ) : ( <tr><td colSpan={7}><div className="flex flex-col justify-center items-center text-gray-500 py-16 px-6 text-center"><Inbox className="h-12 w-12 mb-4 text-gray-400" /><span className="font-semibold text-lg">No Log Entries Found</span><span className="text-sm mt-1">{filterItemName || filterStartDate || filterEndDate ? "No entries match your current filters." : "There are no inventory log entries yet."}</span></div></td></tr> )}
                     </tbody>
                   </table>
                 </div>
               </section>
             </>
           )}
         </main>

         {/* Floating Action Button */}
         {(activeTab === 'Seeds' || activeTab === 'Fertilizers' || activeTab === 'Other') && (
             <button onClick={handleOpenCreateModal} className="fixed bottom-8 right-8 z-20 bg-green-600 text-white p-4 rounded-full shadow-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition ease-in-out duration-150 hover:scale-105" aria-label={`Add new ${activeTab.slice(0,-1).toLowerCase()}`}>
                 <Plus size={24} />
             </button>
         )}
       </div>

        {/* Add/Edit Item Modal */}
        {isModalOpen && (activeTab === 'Seeds' || activeTab === 'Fertilizers' || activeTab === 'Other') && (
            <InventoryItemModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleModalSubmit}
                initialData={editingItem}
                mode={modalMode}
                activeCategory={activeTab}
            />
        )}

        {/* Use Item Modal - THIS IS WHERE THE PLANTS PROP IS PASSED */}
        {isUseModalOpen && itemToUse && (
            <UseItemModal
                isOpen={isUseModalOpen}
                onClose={() => { setIsUseModalOpen(false); setItemToUse(null); }}
                item={itemToUse}
                onSubmit={handleUseSubmit}
                plants={availablePlants}
                isLoadingPlants={isLoadingPlants}
            />
        )}
     </div>
   );
}