// src/components/AddPlantModal.tsx
'use client';

import React, { useState, useEffect, ChangeEvent } from 'react';
import { X, Loader2, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { firestore } from '@/app/lib/firebase/config'; // Adjust path

// Simplified Inventory Item structure for seed selection
interface SeedInventoryItem {
  id: string;
  name: string;
  stock: number;
}

// Data structure for the new plant form
// PlantType is still included, but will be set automatically
export interface NewPlantData {
  plantName: string;
  plantType: string;
  selectedSeedId: string;
  quantity: number;
  imageData?: string | null;
}

interface AddPlantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (plantData: NewPlantData) => Promise<void>;
}

const MAX_IMAGE_SIZE_MB = 2;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

// Helper function to attempt extracting plant type from seed name
const derivePlantTypeFromSeed = (seedName: string): string => {
    if (!seedName) return '';
    // Remove common suffixes like " Seeds", " Seed" (case-insensitive)
    let derivedType = seedName.replace(/ seeds$/i, '').replace(/ seed$/i, '');
    // Capitalize first letter (optional, for consistency)
    derivedType = derivedType.charAt(0).toUpperCase() + derivedType.slice(1);
    return derivedType;
};

const AddPlantModal: React.FC<AddPlantModalProps> = ({ isOpen, onClose, onSubmit }) => {
  // Form state
  const [plantName, setPlantName] = useState('');
  const [plantType, setPlantType] = useState(''); // Will be set based on seed selection
  const [selectedSeedId, setSelectedSeedId] = useState('');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // State for fetching seeds
  const [availableSeeds, setAvailableSeeds] = useState<SeedInventoryItem[]>([]);
  const [isLoadingSeeds, setIsLoadingSeeds] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // State for submission process
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch available seeds when the modal opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchSeeds = async () => {
      setIsLoadingSeeds(true);
      setFetchError(null);
      setAvailableSeeds([]);

      try {
        const inventoryCollectionRef = collection(firestore, 'inventory');
        const q = query(
          inventoryCollectionRef,
          where("category", "==", "seeds"),
          where("stock", ">", 0)
        );
        const querySnapshot = await getDocs(q);
        const seeds: SeedInventoryItem[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          seeds.push({
            id: doc.id,
            name: data.name || 'Unnamed Seed',
            stock: typeof data.stock === 'number' ? data.stock : Number(data.stock) || 0,
          });
        });
        seeds.sort((a, b) => a.name.localeCompare(b.name));
        setAvailableSeeds(seeds);
      } catch (err: any) {
        console.error("Error fetching seeds:", err);
         if (err.code === 'permission-denied') { setFetchError(`Permission denied reading 'inventory'. Check Firestore rules.`); }
         else if (err.code === 'unimplemented' || err.code === 'failed-precondition') { setFetchError(`Firestore query error. Ensure index exists for 'category' and 'stock' fields.`); }
         else { setFetchError("Failed to load available seeds."); }
      } finally {
        setIsLoadingSeeds(false);
      }
    };

    fetchSeeds();
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPlantName('');
      setPlantType(''); // Reset derived plant type
      setSelectedSeedId('');
      setQuantity(1);
      setImageFile(null);
      setImageBase64(null);
      setImagePreview(null);
      setIsSubmitting(false);
      setSubmitError(null);
    }
  }, [isOpen]);

  // Handle Seed Selection Change - **UPDATED**
  const handleSeedChange = (event: ChangeEvent<HTMLSelectElement>) => {
      const seedId = event.target.value;
      setSelectedSeedId(seedId);

      // Find the selected seed object to get its name
      const selectedSeed = availableSeeds.find(seed => seed.id === seedId);
      if (selectedSeed) {
          // Derive plant type from the seed name and update state
          const derivedType = derivePlantTypeFromSeed(selectedSeed.name);
          setPlantType(derivedType);
          console.log(`Selected seed: ${selectedSeed.name}, Derived type: ${derivedType}`); // For debugging
      } else {
          setPlantType(''); // Reset if selection is cleared or invalid
      }
  };

  // Handle image file selection (no change needed here)
  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSubmitError(null); setImageFile(null); setImageBase64(null); setImagePreview(null);
    if (file) {
      if (file.size > MAX_IMAGE_SIZE_BYTES) { setSubmitError(`Image size exceeds ${MAX_IMAGE_SIZE_MB}MB limit.`); return; }
      if (!file.type.startsWith('image/')) { setSubmitError('Please select a valid image file.'); return; }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => { const result = reader.result as string; setImageBase64(result); setImagePreview(result); };
      reader.onerror = () => { console.error("Error reading file"); setSubmitError("Could not read image file."); };
      reader.readAsDataURL(file);
    }
     event.target.value = '';
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const quantityNum = Number(quantity);

    // Validation (Plant Type is now derived, so check if it was set)
    if (!plantName || !plantType || !selectedSeedId) {
      setSubmitError('Please fill in Plant Name and select a Seed type.');
      return;
    }
    if (isNaN(quantityNum) || quantityNum <= 0 || !Number.isInteger(quantityNum)) {
      setSubmitError('Quantity must be a whole number greater than 0.');
      return;
    }
    const selectedSeed = availableSeeds.find(seed => seed.id === selectedSeedId);
    if (selectedSeed && selectedSeed.stock < quantityNum) {
        setSubmitError(`Insufficient stock for ${selectedSeed.name}. Available: ${selectedSeed.stock}`);
        return;
    }

    setIsSubmitting(true);
    try {
      // Pass the automatically set plantType
      await onSubmit({
        plantName,
        plantType, // Pass the derived plant type
        selectedSeedId,
        quantity: quantityNum,
        imageData: imageBase64,
      });
      // Parent handles closing on success
    } catch (err) {
      console.error("Error submitting plant:", err);
      setSubmitError(err instanceof Error ? err.message : "Failed to add plant. Please try again.");
      setIsSubmitting(false); // Allow retry on error
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 transition-opacity duration-300 ease-in-out overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg transform transition-all duration-300 ease-in-out scale-100 my-8">
        <div className="flex justify-between items-center p-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-lg z-10">
          <h2 className="text-xl font-semibold text-gray-800">Add New Plant</h2>
          <button onClick={onClose} disabled={isSubmitting} className="text-gray-400 hover:text-gray-600 disabled:opacity-50" aria-label="Close modal">
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {submitError && <p className="text-sm text-red-600 bg-red-100 p-2 rounded border border-red-200">{submitError}</p>}

          {/* Plant Name */}
          <div>
            <label htmlFor="plantName" className="block text-sm font-medium text-gray-700 mb-1">Plant Name <span className="text-red-500">*</span></label>
            <input id="plantName" type="text" value={plantName} onChange={(e) => setPlantName(e.target.value)} required disabled={isSubmitting}
                   className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100" placeholder="e.g., Lettuce Row 1, Balcony Tomato" />
          </div>

          {/* --- Plant Type Input Removed --- */}
          {/* The plantType state is now set automatically when a seed is selected */}
          {/* Optionally display the derived type */}
          {plantType && (
             <div className="text-sm text-gray-600">
                 <span className="font-medium">Derived Plant Type:</span> {plantType}
             </div>
           )}


          {/* Seed Selection */}
          <div>
            <label htmlFor="seedSelect" className="block text-sm font-medium text-gray-700 mb-1">Seed Type (from Inventory) <span className="text-red-500">*</span></label>
            {isLoadingSeeds ? (
                <div className="flex items-center text-gray-500"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading seeds...</div>
            ) : fetchError ? (
                 <div className="text-sm text-red-600 bg-red-100 p-2 rounded border border-red-200">{fetchError}</div>
            ) : availableSeeds.length === 0 ? (
                 <p className="text-sm text-gray-500">No seeds currently in stock in inventory.</p>
            ) : (
                // Use the updated onChange handler
                <select id="seedSelect" value={selectedSeedId} onChange={handleSeedChange} required disabled={isSubmitting}
                        className="w-full px-3 py-2 border border-gray-300 text-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm bg-white disabled:bg-gray-100">
                  <option value="" disabled>-- Select Seed --</option>
                  {availableSeeds.map(seed => (
                    <option key={seed.id} value={seed.id}>
                      {seed.name} (Stock: {seed.stock})
                    </option>
                  ))}
                </select>
            )}
          </div>

          {/* Quantity Input */}
          <div>
            <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">Quantity to Plant <span className="text-red-500">*</span></label>
            <input id="quantity" type="number" min="1" step="1" value={quantity}
                   onChange={(e) => setQuantity(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                   required disabled={isSubmitting || !selectedSeedId}
                   className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100" />
          </div>

          {/* Image Upload */}
          <div>
              <label htmlFor="plantImage" className="block text-sm font-medium text-gray-700 mb-1">Plant Image (Optional, Max {MAX_IMAGE_SIZE_MB}MB)</label>
              <input id="plantImage" type="file" accept="image/*" onChange={handleImageChange} disabled={isSubmitting}
                     className="block w-full text-sm text-gray-500 border border-gray-300 rounded-md cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed" />
          </div>

          {/* Image Preview */}
          {imagePreview && (
            <div className="mt-2">
                <p className="text-sm font-medium text-gray-700 mb-1">Image Preview:</p>
                <img src={imagePreview} alt="Selected plant preview" className="max-h-40 rounded-md border border-gray-300 object-contain" />
            </div>
           )}


          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4 sticky bottom-0 bg-white py-4 px-6 -mx-6 rounded-b-lg border-t">
            <button type="button" onClick={onClose} disabled={isSubmitting}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting || isLoadingSeeds || fetchError || availableSeeds.length === 0}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:opacity-50 flex items-center min-w-[110px] justify-center">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Plant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddPlantModal;
