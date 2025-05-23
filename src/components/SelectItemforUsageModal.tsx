'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Search, Package, Leaf, FlaskConical, ChevronDown, Info } from 'lucide-react';
import { collection, query, where, getDocs, doc, runTransaction, serverTimestamp, increment } from 'firebase/firestore';
import { firestore, auth } from '@/app/lib/firebase/config'; // Adjust path if needed
import { useAuthState } from 'react-firebase-hooks/auth';

// Interface for inventory items, consistent with PlantDetailPage
export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  pricePerUnit: number;
  n_percentage?: number;
  p_percentage?: number;
  k_percentage?: number;
  ownerUid?: string; 
}

// Props for the modal - Name reverted
interface SelectItemForUsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlantId: string; 
  currentPlantName?: string; // Optional: Pass plant name for context
}

// Allowed categories for filtering (excluding seeds)
type AllowedCategory = 'all' | 'fertilizers' | 'other';

// Component name reverted
const SelectItemForUsageModal: React.FC<SelectItemForUsageModalProps> = ({
  isOpen,
  onClose,
  currentPlantId,
  currentPlantName, 
}) => {
  const [user] = useAuthState(auth);

  // State for inventory item selection
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<AllowedCategory>('all');
  const [selectedItemId, setSelectedItemId] = useState<string>('');

  // State for usage details
  const [quantityUsed, setQuantityUsed] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);


  // Fetch inventory items when modal opens
  useEffect(() => {
    if (isOpen && user && firestore) {
      const fetchInventoryItems = async () => {
        setIsLoadingInventory(true);
        setInventoryError(null);
        setSubmissionError(null);
        setInventoryItems([]);
        setSelectedItemId(''); 
        setQuantityUsed('');
        setNotes('');

        // Console log uses reverted name
        console.log("[SelectItemForUsageModal] Fetching in-stock items (excluding seeds)...");
        try {
          const inventoryRef = collection(firestore, 'inventory');
          const q = query(
            inventoryRef, 
            where("stock", ">", 0), 
            where("category", "!=", "seeds") 
          );
          
          const querySnapshot = await getDocs(q);
          const items: InventoryItem[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.category !== 'seeds') { 
              items.push({
                id: doc.id,
                name: data.name || 'Unnamed Item',
                category: data.category || 'other',
                stock: Number(data.stock) || 0,
                unit: data.unit || 'unit',
                pricePerUnit: Number(data.pricePerUnit) || 0,
                n_percentage: data.n_percentage,
                p_percentage: data.p_percentage,
                k_percentage: data.k_percentage,
                ownerUid: data.ownerUid,
              });
            }
          });
          
          const sortedItems = items.sort((a,b) => a.name.localeCompare(b.name));
          setInventoryItems(sortedItems);

          if (sortedItems.length === 0) {
            setInventoryError("No usable items (excluding seeds) with stock currently available.");
          }
        } catch (err: any) {
          // Console log uses reverted name
          console.error("[SelectItemForUsageModal] Error fetching inventory:", err);
          if (err.code === 'permission-denied') {
            setInventoryError("Permission denied. Check Firestore rules.");
          } else if (err.code === 'failed-precondition' || (err.message && err.message.toLowerCase().includes('index'))) {
            setInventoryError("Database index required. Check console (likely on 'stock' and 'category').");
          } else {
            setInventoryError(`Failed to load items: ${err.message}`);
          }
        } finally {
          setIsLoadingInventory(false);
        }
      };
      fetchInventoryItems();
    }
  }, [isOpen, user, firestore]);

  const itemsForDropdown = useMemo(() => {
    let itemsToFilter = inventoryItems;
    if (selectedFilterCategory !== 'all') {
      itemsToFilter = itemsToFilter.filter(item => item.category === selectedFilterCategory);
    }
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      itemsToFilter = itemsToFilter.filter(item => item.name.toLowerCase().includes(lowerSearch));
    }
    return itemsToFilter.filter(item => item.category !== 'seeds');
  }, [inventoryItems, searchTerm, selectedFilterCategory]);

  useEffect(() => {
    setQuantityUsed('');
    setNotes('');
    setSubmissionError(null);
  }, [selectedItemId]);

  const handleRecordUsage = async () => {
    if (!user || !firestore) {
      setSubmissionError("User or database not available.");
      return;
    }
    if (!selectedItemId) {
      setSubmissionError("Please select an item to use.");
      return;
    }
    const itemToUse = inventoryItems.find(item => item.id === selectedItemId);
    if (!itemToUse) {
      setSubmissionError("Selected item details not found.");
      return;
    }

    const qty = parseFloat(quantityUsed);
    if (isNaN(qty) || qty <= 0) {
      setSubmissionError("Quantity used must be a positive number.");
      return;
    }
    if (qty > itemToUse.stock) {
      setSubmissionError(`Quantity exceeds available stock (${itemToUse.stock} ${itemToUse.unit}).`);
      return;
    }

    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const itemDocRef = doc(firestore, 'inventory', itemToUse.id);
      const logCollectionRef = collection(firestore, 'inventory_log');
      
      await runTransaction(firestore, async (transaction) => {
        const itemDocSnap = await transaction.get(itemDocRef);
        if (!itemDocSnap.exists()) {
          throw new Error("Inventory item not found in database. It might have been deleted.");
        }
        const currentData = itemDocSnap.data();
        const currentStock = Number(currentData.stock) || 0;
        if (qty > currentStock) {
          throw new Error(`Stock updated since selection. Only ${currentStock} ${itemToUse.unit} available.`);
        }

        transaction.update(itemDocRef, { 
          stock: increment(-qty),
          lastUpdated: serverTimestamp() 
        });

        let logType: 'Fertilizer Used' | 'Material Used' = 'Material Used';
        if (itemToUse.category === 'fertilizers') {
            logType = 'Fertilizer Used';
        }

        const logEntryData = {
          itemId: itemToUse.id,
          itemName: itemToUse.name,
          plantId: currentPlantId, 
          userId: user.uid,
          timestamp: serverTimestamp(),
          type: logType,
          quantityChange: -qty,
          unit: itemToUse.unit,
          costOrValuePerUnit: itemToUse.pricePerUnit,
          totalCostOrValue: qty * itemToUse.pricePerUnit,
          notes: notes.trim() || `Used for plant: ${currentPlantName || currentPlantId}`, 
        };
        transaction.set(doc(logCollectionRef), logEntryData);
      });
      // Console log uses reverted name
      console.log("[SelectItemForUsageModal] Item usage recorded successfully for item:", itemToUse.name, "Plant ID:", currentPlantId);
      onClose();

    } catch (err: any) {
      // Console log uses reverted name
      console.error("[SelectItemForUsageModal] Error recording item usage:", err);
      setSubmissionError(err.message || "Failed to record usage. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };


  if (!isOpen) return null;

  const getCategoryIcon = (category?: string) => {
    if (category === 'fertilizers') return <FlaskConical className="mr-2 h-5 w-5 text-blue-600 flex-shrink-0" />;
    if (category === 'other') return <Package className="mr-2 h-5 w-5 text-orange-600 flex-shrink-0" />;
    return <Package className="mr-2 h-5 w-5 text-gray-400 flex-shrink-0" />; 
  };
  
  const selectedItemDetails = inventoryItems.find(item => item.id === selectedItemId);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-opacity duration-300 ease-in-out animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg transform transition-all duration-300 ease-in-out scale-100 flex flex-col" style={{maxHeight: '95vh'}}>
        <div className="flex justify-between items-center p-5 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">
            Log Item Usage for {currentPlantName || 'Selected Plant'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1"
            aria-label="Close modal"
          >
            <X size={22} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-grow">
          {inventoryError && !isLoadingInventory && (
            <div role="alert" className="text-sm text-red-700 bg-red-100 p-3.5 rounded-lg border border-red-300">
              <p><span className="font-semibold">Inventory Error:</span> {inventoryError}</p>
            </div>
          )}

          <div className="space-y-3 p-4 border border-gray-200 text-gray-900 rounded-lg bg-gray-50/50">
            <p className="text-sm font-medium text-gray-700 mb-2">1. Select Item from Inventory</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-grow">
                <div className="absolute inset-y-0 left-0 pl-3.5 text-gray-900 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 border border-gray-300 text-gray-900 rounded-md text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors shadow-sm"
                  disabled={isLoadingInventory}
                />
              </div>
              <select
                value={selectedFilterCategory}
                onChange={(e) => setSelectedFilterCategory(e.target.value as AllowedCategory)}
                className="px-4 text-gray-900 py-2.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white w-full sm:w-auto transition-colors shadow-sm"
                disabled={isLoadingInventory}
              >
                <option value="all">All Usable</option>
                <option value="fertilizers">Fertilizers</option>
                <option value="other">Other Materials</option>
              </select>
            </div>
            {isLoadingInventory ? (
              <div className="flex justify-center items-center h-20">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              </div>
            ) : itemsForDropdown.length === 0 && !inventoryError ? ( 
              <div className="text-center text-gray-500 py-4">
                <Package size={36} className="mx-auto mb-2 text-gray-400" />
                <p className="font-medium">No Items Found</p>
                <p className="text-xs">No usable items match your current filters.</p>
              </div>
            ) : itemsForDropdown.length > 0 ? ( 
              <div className="relative">
                  <select
                      id="item-select-dropdown"
                      value={selectedItemId}
                      onChange={(e) => setSelectedItemId(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white shadow-sm appearance-none"
                  >
                      <option value="" disabled>-- Select an item --</option>
                      {itemsForDropdown.map(item => (
                      <option key={item.id} value={item.id}>
                          {item.name} (Stock: {item.stock} {item.unit})
                      </option>
                      ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-gray-500">
                      <ChevronDown size={20} />
                  </div>
              </div>
            ) : null }
          </div>
          
          {selectedItemDetails && (
            <div className="space-y-5 pt-4 border-t border-gray-200 mt-5">
                <div className="p-4 border border-gray-200 rounded-lg bg-white space-y-1.5 shadow-sm">
                    <div className="flex items-center text-gray-800">
                        {getCategoryIcon(selectedItemDetails.category)}
                        <span className="font-semibold text-lg">{selectedItemDetails.name}</span>
                    </div>
                    <p className="text-sm text-gray-600">Category: <span className="font-medium text-gray-700">{selectedItemDetails.category}</span></p>
                    <p className="text-sm text-gray-600">Current Stock: <span className="font-medium text-gray-700">{selectedItemDetails.stock} {selectedItemDetails.unit}</span></p>
                    <p className="text-sm text-gray-600">Price/Unit: <span className="font-medium text-gray-700">{selectedItemDetails.pricePerUnit.toFixed(2)}</span></p>
                    {(selectedItemDetails.n_percentage !== undefined || selectedItemDetails.p_percentage !== undefined || selectedItemDetails.k_percentage !== undefined) && (
                        <p className="text-sm text-gray-600">
                            NPK: <span className="font-medium text-gray-700">{selectedItemDetails.n_percentage ?? 'N/A'}-{selectedItemDetails.p_percentage ?? 'N/A'}-{selectedItemDetails.k_percentage ?? 'N/A'}</span>
                        </p>
                    )}
                </div>

              <div>
                <label htmlFor="quantity-used" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Quantity Used <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center">
                  <input
                    id="quantity-used"
                    type="number"
                    value={quantityUsed}
                    onChange={(e) => setQuantityUsed(e.target.value)}
                    className="w-full px-3.5 py-2.5 border text-gray-900 border-gray-300 rounded-l-md text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 shadow-sm"
                    placeholder="e.g., 10"
                    min="0"
                    step="any" 
                  />
                  <span className="inline-flex items-center text-gray-900 px-3 py-2.5 border border-l-0 border-gray-300 bg-gray-50 text-gray-600 text-sm rounded-r-md">
                    {selectedItemDetails.unit || 'units'}
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="usage-notes" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Notes <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  id="usage-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2.5 border text-gray-900 border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 shadow-sm"
                  placeholder="e.g., Applied to Zone 1, Routine application..."
                />
              </div>
              {submissionError && (
                <div role="alert" className="text-sm text-red-600 bg-red-100 p-3 rounded-md border border-red-300">
                  <p><span className="font-semibold">Submission Error:</span> {submissionError}</p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="p-5 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-white text-gray-700 text-sm font-semibold rounded-lg border border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors shadow-sm"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRecordUsage}
              disabled={isLoadingInventory || isSubmitting || !selectedItemId || !quantityUsed}
              className="px-6 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isSubmitting ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : null}
              Record Usage
            </button>
        </div>
      </div>
    </div>
  );
};

// Export with the original name
export default SelectItemForUsageModal;
