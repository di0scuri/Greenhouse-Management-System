// src/app/inventory/page.tsx

'use client'; // Needed for state and effects

import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from '@/components/Sidebar'; // Adjust path if needed
import InventoryItemModal from '@/components/InventoryItemModal'; // Import the modal
import {
  Search, Bell, SlidersHorizontal, CheckCircle2, AlertTriangle, Loader2,
  Leaf, FlaskConical, X, Menu, Calendar as CalendarIcon,
  Plus, // Icon for FAB
  Edit2, // Icon for Edit button
  Inbox, // Icon for empty state
} from 'lucide-react';

// Firebase Imports
import {
  collection, query, where, getDocs, Timestamp,
  addDoc, // For creating items
  doc, // For referencing documents to update
  updateDoc, // For updating items
  serverTimestamp // For setting lastUpdated timestamp
} from 'firebase/firestore';
import { firestore } from '@/app/lib/firebase/config'; // Adjust path if needed

// Define the structure for an inventory item (can be moved to a types file)
// Ensure this interface is exported if the Modal component imports it directly from here
export interface InventoryItem {
  id: string; // Firestore document ID
  name: string;
  category: string; // 'Seeds', 'Fertilizers', etc.
  stock: number;
  unit: string;
  lowStockThreshold: number;
  lastUpdated?: Date; // Converted from Firestore Timestamp
}

// Ensure this is the default export and it's a valid React component
export default function InventoryPage() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'Seeds' | 'Fertilizers'>('Seeds');
  const [searchTerm, setSearchTerm] = useState('');
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start loading initially
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Fetch data from the single 'inventory' collection based on activeTab
  useEffect(() => {
    const fetchInventoryData = async () => {
      setIsLoading(true);
      setError(null);
      setInventoryData([]); // Clear previous data on tab change/reload

      try {
        const inventoryCollectionRef = collection(firestore, 'inventory');
        // Query using lowercase category to work around potential data inconsistency
        const q = query(inventoryCollectionRef, where("category", "==", activeTab.toLowerCase()));
        const querySnapshot = await getDocs(q);
        const fetchedItems: InventoryItem[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // Handle potential typo ('lowStokThreshold') when reading from Firestore
          const lowStockValue = data.lowStockThreshold ?? data.lowStokThreshold;
          fetchedItems.push({
            id: doc.id,
            name: data.name || 'Unnamed Item',
            // Use the actual category from Firestore, might be lower/upper case
            category: data.category || 'Unknown',
            // Convert string from DB to number for interface, default 0
            stock: typeof data.stock === 'number' ? data.stock : Number(data.stock) || 0,
            unit: data.unit || '',
             // Convert string from DB (potentially with typo) to number for interface, default 0
            lowStockThreshold: typeof lowStockValue === 'number' ? lowStockValue : Number(lowStockValue) || 0,
            lastUpdated: data.lastUpdated instanceof Timestamp ? data.lastUpdated.toDate() : undefined,
          });
        });
        // Sort data alphabetically by name after fetching
        fetchedItems.sort((a, b) => a.name.localeCompare(b.name));
        setInventoryData(fetchedItems);
      } catch (err: any) {
        console.error("Error fetching inventory data:", err);
        // Provide more specific error feedback if possible
        if (err.code === 'permission-denied') {
             setError(`Permission denied. Check Firestore rules for the 'inventory' collection.`);
        } else if (err.code === 'unimplemented') {
             setError(`Firestore query error. Ensure an index exists for querying the 'category' field.`);
        }
        else {
            setError(`Failed to load ${activeTab.toLowerCase()} data. Please try again.`);
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchInventoryData();
  }, [activeTab]); // Refetch when activeTab changes

  // --- CRUD Handlers ---
  // Open modal in 'create' mode
  const handleOpenCreateModal = () => {
    setModalMode('create');
    setEditingItem(null);
    setIsModalOpen(true);
  };

  // Open modal in 'edit' mode
  const handleOpenEditModal = (item: InventoryItem) => {
    setModalMode('edit');
    setEditingItem(item); // Pass the whole item being edited
    setIsModalOpen(true);
  };

  // Handle modal submission (Create or Update)
  const handleModalSubmit = async (itemData: Partial<InventoryItem>, id?: string) => {
     // Ensure required fields are present and stock/threshold are numbers
     const stockNum = Number(itemData.stock);
     const thresholdNum = Number(itemData.lowStockThreshold);
     if (isNaN(stockNum) || isNaN(thresholdNum) || !itemData.name || !itemData.unit) {
         throw new Error("Invalid data provided to submit."); // Or handle more gracefully
     }

     const dataToSave = {
      name: itemData.name,
      // category: itemData.category!, // Category is set below based on mode/tab or not updated
      stock: stockNum, // Save as number
      unit: itemData.unit,
      lowStockThreshold: thresholdNum, // Save as number with correct name
      lastUpdated: serverTimestamp(),
    };

    if (modalMode === 'create') {
      // Add new item to Firestore
      try {
        const inventoryCollectionRef = collection(firestore, 'inventory');
        // Save category as lowercase, matching the active tab logic
        const docRef = await addDoc(inventoryCollectionRef, { ...dataToSave, category: activeTab.toLowerCase() });
        console.log("Document written with ID: ", docRef.id);

        // Optimistically add to local state
        const newItem: InventoryItem = {
          ...dataToSave, // contains name, stock, unit, lowStockThreshold
          id: docRef.id,
          lastUpdated: new Date(), // Approximate timestamp for UI
          category: activeTab, // Assign based on the tab it was created under
        };
         // Add and resort
        setInventoryData(prev => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));
        setIsModalOpen(false); // Close modal on success

      } catch (error) {
        console.error("Error adding document: ", error);
        throw new Error("Failed to add item."); // Re-throw to show error in modal
      }
    } else if (modalMode === 'edit' && id) {
      // Update existing item in Firestore
      try {
        const itemDocRef = doc(firestore, 'inventory', id);
        // Note: category is typically not updated here
        await updateDoc(itemDocRef, dataToSave);
        console.log("Document updated with ID: ", id);

        // Optimistically update local state and resort
        setInventoryData(prev => prev.map(item =>
          item.id === id ? { ...item, ...dataToSave, lastUpdated: new Date() } : item
        ).sort((a, b) => a.name.localeCompare(b.name)));
        setIsModalOpen(false); // Close modal on success

      } catch (error) {
        console.error("Error updating document: ", error);
        throw new Error("Failed to update item."); // Re-throw to show error in modal
      }
    }
  };
  // --- End CRUD Handlers ---


  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm) return inventoryData;
    const lowerCaseSearch = searchTerm.toLowerCase();
    return inventoryData.filter(item => item.name.toLowerCase().includes(lowerCaseSearch));
  }, [inventoryData, searchTerm]);

  // Calculate summary data
  const lowStockItems = useMemo(() => inventoryData.filter(item => item.stock < item.lowStockThreshold).length, [inventoryData]);
  const lastUpdatedDate = "March 5, 2025"; // TODO: Replace with dynamic logic

  const totalStock = useMemo(() => inventoryData.reduce((sum, item) => sum + item.stock, 0), [inventoryData]);
  const totalItemCount = useMemo(() => inventoryData.length, [inventoryData]);

  // --- UI Rendering ---
  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* Sidebar */}
      <div className="hidden lg:block lg:flex-shrink-0"> <Sidebar /> </div>
      {isMobileMenuOpen && (<div className="fixed inset-y-0 left-0 z-40 lg:hidden"> <Sidebar /> </div>)}
      {isMobileMenuOpen && (<div className="fixed inset-0 z-30 bg-black opacity-50 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>)}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">

        {/* Header Section */}
        <header className="bg-green-700 text-white pt-4 pb-3 px-4 sm:px-6 lg:px-8 relative z-10">
           {/* Top row */}
           <div className="flex justify-between items-center mb-4">
              <div className="flex items-center">
                  <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden mr-3 p-1 rounded text-green-100 hover:bg-green-600" aria-label="Open sidebar">
                      {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                  </button>
                  <h1 className="text-2xl font-bold">Inventory</h1>
              </div>
              <button className="p-2 rounded-full hover:bg-green-600"> <Bell className="h-6 w-6" /> </button>
           </div>
           {/* Search and Filter Row */}
           <div className="flex items-center space-x-2 bg-white rounded-lg px-3 py-1 shadow">
              <Search className="h-5 w-5 text-gray-400" />
              <input type="text" placeholder="Search items..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="flex-grow py-1 focus:outline-none text-gray-800 placeholder-gray-500" />
              <button className="p-1 text-gray-500 hover:text-gray-700"> <SlidersHorizontal className="h-5 w-5" /> </button>
           </div>
           {/* Tabs */}
           <div className="mt-6 flex border-b border-green-600">
              <button onClick={() => { setActiveTab('Seeds'); setSearchTerm(''); }} className={`py-2 px-4 text-sm font-medium ${activeTab === 'Seeds' ? 'border-b-2 border-white text-white' : 'text-green-100 hover:text-white'}`}> Seeds </button>
              <button onClick={() => { setActiveTab('Fertilizers'); setSearchTerm(''); }} className={`py-2 px-4 text-sm font-medium ${activeTab === 'Fertilizers' ? 'border-b-2 border-white text-white' : 'text-green-100 hover:text-white'}`}> Fertilizers </button>
           </div>
        </header>

        {/* Main Content Body */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-16 -mt-20"> {/* Adjusted margin */}

          {/* Summary Cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 mt-8"> {/* Added margin */}
            {/* Card 1: Total Items */}
            <div className="bg-white p-4 rounded-lg shadow flex items-center space-x-3">
              {activeTab === 'Seeds' ? <Leaf className="h-8 w-8 text-green-500" /> : <FlaskConical className="h-8 w-8 text-blue-500" />}
              <div>
                <p className="text-sm text-gray-500">Total {activeTab} Items</p>
                <p className="text-xl font-semibold text-gray-800"> {isLoading ? '-' : error ? 'N/A' : `${totalItemCount} Items`} </p>
              </div>
            </div>
             {/* Card 2: Low Stock Count */}
            <div className={`bg-white p-4 rounded-lg shadow flex items-center space-x-3 ${!isLoading && !error && lowStockItems > 0 ? 'border-l-4 border-red-500' : ''}`}>
               <AlertTriangle className={`h-8 w-8 ${!isLoading && !error && lowStockItems > 0 ? 'text-red-500' : 'text-yellow-500'}`} />
               <div>
                 <p className="text-sm text-gray-500">Low Stock</p>
                 <p className={`text-xl font-semibold ${!isLoading && !error && lowStockItems > 0 ? 'text-red-600' : 'text-gray-800'}`}> {isLoading ? '-' : error ? 'N/A' : `${lowStockItems} Items ${lowStockItems > 0 ? '!' : ''}`} </p>
               </div>
            </div>
             {/* Card 3: Last Updated */}
            <div className="bg-white p-4 rounded-lg shadow flex items-center space-x-3">
               <CalendarIcon className="h-8 w-8 text-gray-500" />
               <div>
                 <p className="text-sm text-gray-500">Last Updated</p>
                 <p className="text-xl font-semibold text-gray-800">{lastUpdatedDate}</p>
               </div>
            </div>
          </section>

          {/* Inventory Table with Improved States */}
          <section className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                {/* Table Body */}
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoading ? (
                    <tr><td colSpan={4}><div className="flex justify-center items-center text-gray-500 py-10 px-6"><Loader2 className="h-6 w-6 animate-spin mr-3" /><span>Loading {activeTab.toLowerCase()}...</span></div></td></tr>
                  ) : error ? (
                     <tr><td colSpan={4}><div className="flex flex-col justify-center items-center text-red-600 py-10 px-6 text-center"><AlertTriangle className="h-8 w-8 mb-2" /><span className="font-semibold">Loading Failed</span><span className="text-sm">{error}</span></div></td></tr>
                  ) : filteredData.length > 0 ? (
                    filteredData.map((item) => {
                      const isLowStock = item.stock < item.lowStockThreshold;
                      return (
                        <tr key={item.id} className={`${isLowStock ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.stock} {item.unit}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {isLowStock ? (
                              <span className="flex items-center text-red-600"> <AlertTriangle size={16} className="mr-1.5 flex-shrink-0" /> Low stock! Restock soon. </span>
                            ) : (
                              <span className="flex items-center text-green-600"> <CheckCircle2 size={16} className="mr-1.5 flex-shrink-0" /> Sufficient stock. </span>
                            )}
                          </td>
                           <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                             <button onClick={() => handleOpenEditModal(item)} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100" aria-label={`Edit ${item.name}`}> <Edit2 size={18} /> </button>
                           </td>
                        </tr>
                      );
                    })
                  ) : (
                     <tr><td colSpan={4}><div className="flex flex-col justify-center items-center text-gray-500 py-10 px-6 text-center"><Inbox className="h-10 w-10 mb-2 text-gray-400" /><span className="font-semibold">No {activeTab.toLowerCase()} Found</span><span className="text-sm">{searchTerm ? `No items match "${searchTerm}".` : `Add a new item using the '+' button.`}</span></div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

        </main>

         {/* Floating Action Button (FAB) */}
         <button onClick={handleOpenCreateModal} className="fixed bottom-8 right-8 z-20 bg-green-600 text-white p-4 rounded-full shadow-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition" aria-label="Add new inventory item">
           <Plus size={24} />
         </button>

      </div>

      {/* Render the Inventory Item Modal */}
      {isModalOpen && (
         <InventoryItemModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSubmit={handleModalSubmit}
            initialData={editingItem}
            activeCategory={activeTab}
         />
      )}

    </div>
  );
}
