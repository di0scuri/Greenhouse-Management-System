'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Loader2, Info, AlertTriangle, Leaf, ThumbsUp, CalendarDays } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { firestore, auth } from '@/app/lib/firebase/config'; // Adjust path if needed
import { useAuthState } from 'react-firebase-hooks/auth';

interface PlantLifecycle {
    name: string;
    spacingCm: number;
    fertilizeDays: number[];
    maturityDays: number;
    harvestDays: number;
    stages: Array<{ name: string; startDay: number; description?: string; }>;
}

export interface NewPlantData {
    plantName: string;
    plantType: string;
    selectedSeedId: string | null;
    quantity: number;
    imageUrl: string | null;
    areaUsedSqM?: number;
}

interface AddPlantModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: NewPlantData) => Promise<void>;
    usableAreaSqM: number;
    lifecycleData: Record<string, PlantLifecycle>;
}

interface AvailableSeed {
    id: string;
    name: string;
    stock: number;
    unit: string;
}

interface PlantSuggestion extends PlantLifecycle {
    maxFit: number;
}

const formatDateForName = (date: Date): string => {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return 'INVALID_DATE';
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
};
const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const derivePlantTypeFromName = (seedName: string): string | null => {
    if (!seedName) return null;
    const derived = seedName.replace(/\sseeds?$/i, '').trim();
    const capitalized = derived.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    return capitalized.length > 0 ? capitalized : null;
}

const AddPlantModal: React.FC<AddPlantModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    usableAreaSqM,
    lifecycleData,
}) => {
    const [user] = useAuthState(auth); // User is still needed for other operations, like who is adding the plant

    const [selectedSeedId, setSelectedSeedId] = useState<string | null>(null);
    const [plantType, setPlantType] = useState<string>('');
    const [plantName, setPlantName] = useState('');
    const [quantity, setQuantity] = useState<number | string>(1);

    const [availableSeeds, setAvailableSeeds] = useState<AvailableSeed[]>([]);
    const [isFetchingSeeds, setIsFetchingSeeds] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [maxPlantsForSelectedType, setMaxPlantsForSelectedType] = useState<number | null>(null);
    const [currentSpacingCm, setCurrentSpacingCm] = useState<number | null>(null);
    const [estimatedHarvestDate, setEstimatedHarvestDate] = useState<Date | null>(null);
    const [plantSuggestions, setPlantSuggestions] = useState<PlantSuggestion[]>([]);

    useEffect(() => {
        // Fetch seeds when modal opens, user is available, and firestore is initialized.
        // The query no longer filters by user.uid for seeds.
        if (isOpen && firestore) { // User check removed for seed fetching, but kept for overall context
            const fetchSeeds = async () => {
                console.log("[AddPlantModal] Fetching all available seeds (category='seeds', stock > 0).");
                setIsFetchingSeeds(true);
                setFetchError(null);
                setAvailableSeeds([]);
                try {
                    const inventoryRef = collection(firestore, 'inventory');
                    // MODIFIED QUERY: Removed where("ownerUid", "==", user.uid)
                    const q = query(inventoryRef,
                        where("category", "==", "seeds"),
                        where("stock", ">", 0)
                        // Optional: orderBy("name", "asc") if desired, may require another index
                    );
                    const querySnapshot = await getDocs(q);
                    console.log("[AddPlantModal] Global seeds query snapshot size:", querySnapshot.size);

                    const seeds: AvailableSeed[] = [];
                    querySnapshot.forEach((doc) => {
                        const data = doc.data();
                        seeds.push({
                            id: doc.id,
                            name: data.name || 'Unnamed Seed',
                            stock: Number(data.stock) || 0,
                            unit: data.unit || 'units',
                        });
                    });
                    seeds.sort((a, b) => a.name.localeCompare(b.name));
                    setAvailableSeeds(seeds);
                    if (seeds.length === 0) {
                        console.warn("[AddPlantModal] No seeds found matching criteria (category='seeds', stock > 0).");
                        setFetchError("No seeds available in inventory with stock.");
                    }
                } catch (error: any) {
                    console.error("[AddPlantModal] Error fetching seeds:", error);
                    if (error.code === 'permission-denied') {
                        setFetchError("Permission denied to fetch seeds. Check Firestore rules for 'inventory' collection.");
                    } else if (error.code === 'failed-precondition' || error.message.toLowerCase().includes('index')) {
                        setFetchError("Database index required for fetching seeds. Check console for details.");
                        console.error("Firestore Indexing Error: A composite index is likely needed for the 'inventory' collection on fields (category ASC, stock ASC/DESC). The Firebase console error usually provides a direct link to create it.");
                    } else {
                        setFetchError(`Failed to load available seeds: ${error.message}`);
                    }
                } finally {
                    setIsFetchingSeeds(false);
                }
            };
            fetchSeeds();
        } else {
            setAvailableSeeds([]);
            if (isOpen && !firestore) console.log("[AddPlantModal] Cannot fetch seeds: Firestore not available.");
        }
    }, [isOpen, firestore]); // Removed user from dependencies for seed fetching part

    useEffect(() => {
        if (isOpen) {
            setPlantName(''); setPlantType(''); setSelectedSeedId(null); setQuantity(1);
            setSubmitError(null); setIsSubmitting(false);
            setMaxPlantsForSelectedType(null); setCurrentSpacingCm(null); setEstimatedHarvestDate(null);
        }
    }, [isOpen]);

    useEffect(() => {
        if (selectedSeedId && availableSeeds.length > 0 && lifecycleData && Object.keys(lifecycleData).length > 0) {
            const selectedSeed = availableSeeds.find(seed => seed.id === selectedSeedId);
            if (selectedSeed?.name) {
                const derivedPlantType = derivePlantTypeFromName(selectedSeed.name);
                if (derivedPlantType) {
                    setPlantType(derivedPlantType);
                    const todayStr = formatDateForName(new Date());
                    setPlantName(`${derivedPlantType} - ${todayStr}`);
                    const lifeCycle = lifecycleData[derivedPlantType];
                    if (lifeCycle && typeof lifeCycle.spacingCm === 'number' && lifeCycle.spacingCm > 0) {
                        setCurrentSpacingCm(lifeCycle.spacingCm);
                        const spacingM = lifeCycle.spacingCm / 100;
                        const areaPerPlantSqM = spacingM * spacingM;
                        if (areaPerPlantSqM > 0 && usableAreaSqM >= 0) {
                            const calculatedMax = Math.floor(usableAreaSqM / areaPerPlantSqM);
                            setMaxPlantsForSelectedType(calculatedMax);
                        } else { setMaxPlantsForSelectedType(0); }
                    } else {
                        setCurrentSpacingCm(null); setMaxPlantsForSelectedType(null);
                        console.warn(`Lifecycle or spacingCm data missing/invalid for derived type: ${derivedPlantType}`);
                    }
                    if (lifeCycle && typeof lifeCycle.harvestDays === 'number') {
                        setEstimatedHarvestDate(addDays(new Date(), lifeCycle.harvestDays));
                    } else { setEstimatedHarvestDate(null); }
                } else {
                    setPlantType(''); setPlantName(''); setCurrentSpacingCm(null); setMaxPlantsForSelectedType(null); setEstimatedHarvestDate(null);
                }
            } else { setPlantType(''); setPlantName(''); setCurrentSpacingCm(null); setMaxPlantsForSelectedType(null); setEstimatedHarvestDate(null); }
        } else { setPlantType(''); setPlantName(''); setCurrentSpacingCm(null); setMaxPlantsForSelectedType(null); setEstimatedHarvestDate(null); }
    }, [selectedSeedId, availableSeeds, lifecycleData, usableAreaSqM]);

    useEffect(() => {
        if (lifecycleData && Object.keys(lifecycleData).length > 0 && usableAreaSqM > 0) {
            const suggestions: PlantSuggestion[] = [];
            for (const typeKey in lifecycleData) {
                const lifeCycle = lifecycleData[typeKey];
                if (lifeCycle && typeof lifeCycle.spacingCm === 'number' && lifeCycle.spacingCm > 0) {
                    const spacingM = lifeCycle.spacingCm / 100;
                    const areaPerPlantSqM = spacingM * spacingM;
                    if (areaPerPlantSqM > 0) {
                        const maxFit = Math.floor(usableAreaSqM / areaPerPlantSqM);
                        if (maxFit > 0) { suggestions.push({ ...lifeCycle, name: typeKey, maxFit }); }
                    }
                }
            }
            suggestions.sort((a, b) => b.maxFit - a.maxFit);
            setPlantSuggestions(suggestions.slice(0, 3));
        } else { setPlantSuggestions([]); }
    }, [lifecycleData, usableAreaSqM]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        const trimmedPlantType = plantType.trim();
        const trimmedPlantName = plantName.trim();

        if (!selectedSeedId) { setSubmitError("Please select a seed type first."); return; }
        if (!trimmedPlantType) { setSubmitError("Plant type could not be determined. Ensure lifecycle data exists for the derived type."); return; }
        if (!trimmedPlantName) { setSubmitError("Plant name is required."); return; }
        const numQuantity = Number(quantity);
        if (isNaN(numQuantity) || numQuantity <= 0) { setSubmitError("Quantity must be a positive number."); return; }

        const selectedSeed = availableSeeds.find(s => s.id === selectedSeedId);
        if (selectedSeed && numQuantity > selectedSeed.stock) {
            setSubmitError(`Quantity (${numQuantity}) cannot exceed available seed stock (${selectedSeed.stock} ${selectedSeed.unit}).`);
            return;
        }

        const lifeCycleConfig = lifecycleData[trimmedPlantType];
        if (!lifeCycleConfig) {
            setSubmitError(`Configuration for plant type "${trimmedPlantType}" not found. Cannot add plant.`);
            return;
        }
        if (typeof lifeCycleConfig.spacingCm !== 'number' || lifeCycleConfig.spacingCm <= 0) {
            setSubmitError(`Invalid spacing configuration for plant type "${trimmedPlantType}".`);
            return;
        }

        const spacingM = lifeCycleConfig.spacingCm / 100;
        const areaPerSinglePlantSqM = spacingM * spacingM;
        const totalAreaUsedSqM = areaPerSinglePlantSqM * numQuantity;

        if (totalAreaUsedSqM > usableAreaSqM && usableAreaSqM >= 0) {
            setSubmitError(`Required area (${totalAreaUsedSqM.toFixed(2)} sqm) exceeds available area (${usableAreaSqM.toFixed(2)} sqm).`);
            return;
        }
        const rtdbImagePath = `plantImages/${trimmedPlantType}`;

        setIsSubmitting(true);
        try {
            await onSubmit({
                plantName: trimmedPlantName,
                plantType: trimmedPlantType,
                selectedSeedId,
                quantity: numQuantity,
                imageUrl: rtdbImagePath,
                areaUsedSqM: totalAreaUsedSqM
            });
        } catch (error: any) {
            console.error("Submission error in modal:", error);
            setSubmitError(error.message || "Failed to add plant. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 transition-opacity duration-300 ease-in-out animate-fade-in">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg transform transition-all duration-300 ease-in-out scale-100 animate-slide-up">
                <div className="flex justify-between items-center p-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                        <Leaf size={20} className="mr-2 text-green-600" />
                        Add New Plant Batch
                    </h2>
                    <button onClick={onClose} disabled={isSubmitting} className="text-gray-400 hover:text-gray-600 disabled:opacity-50 rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-gray-400" aria-label="Close modal"> <X size={24} /> </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                    {submitError && (<div role="alert" className="text-sm text-red-700 bg-red-100 p-3 rounded border border-red-300 flex items-start"> <AlertTriangle size={18} className="mr-2 flex-shrink-0" /> <p><span className="font-semibold">Error:</span> {submitError}</p> </div>)}

                    <div>
                        <label htmlFor="seedSelect" className="block text-sm font-medium text-gray-700 mb-1">Select Seed <span className="text-red-500">*</span></label>
                        {isFetchingSeeds ? (<div className="flex items-center text-gray-500"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading seeds...</div>)
                        : fetchError ? (<p className="text-sm text-red-600 flex items-center"><AlertTriangle size={14} className="mr-1"/>{fetchError}</p>)
                        : ( <select id="seedSelect" value={selectedSeedId ?? ''} onChange={(e) => setSelectedSeedId(e.target.value || null)} required disabled={isSubmitting || availableSeeds.length === 0} className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"> <option value="" disabled>{availableSeeds.length === 0 ? 'No seeds available in inventory' : '-- Select a seed --'}</option> {availableSeeds.map(seed => ( <option key={seed.id} value={seed.id}> {seed.name} (Stock: {seed.stock.toLocaleString()} {seed.unit}) </option> ))} </select> )}
                        {selectedSeedId && !plantType && !isFetchingSeeds && !fetchError && (
                            <p className="text-xs text-orange-500 mt-1 flex items-center"><AlertTriangle size={14} className="mr-1"/>Could not determine plant type. Ensure lifecycle data exists for the derived type (e.g., "{derivePlantTypeFromName(availableSeeds.find(s=>s.id===selectedSeedId)?.name || '')}").</p>
                        )}
                    </div>

                    {plantType && (
                        <div>
                            <label htmlFor="plantTypeDisplay" className="block text-sm font-medium text-gray-700 mb-1">Plant Type (from Seed)</label>
                            <input id="plantTypeDisplay" type="text" value={plantType} readOnly disabled className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 text-gray-500 sm:text-sm cursor-not-allowed" />
                        </div>
                    )}

                    <div>
                        <label htmlFor="plantName" className="block text-sm font-medium text-gray-700 mb-1">Plant Batch Name <span className="text-red-500">*</span></label>
                        <input id="plantName" type="text" value={plantName} onChange={(e) => setPlantName(e.target.value)} required disabled={isSubmitting || !plantType} className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100" placeholder={plantType ? "Auto-generated, editable" : "Select seed first"} />
                    </div>

                    {plantType && currentSpacingCm !== null && maxPlantsForSelectedType !== null && (
                         <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-700 space-y-1">
                             <p>Total Usable Area: <span className='font-medium'>{usableAreaSqM.toFixed(2)} sq m</span>.</p>
                             <p className='flex items-center'>
                                 <Info size={14} className="mr-1 flex-shrink-0" />
                                 With <span className='font-medium mx-1'>{currentSpacingCm}cm</span> spacing for <span className='font-medium mx-1'>{plantType}</span>,
                                 suggested max for this area: <span className='font-medium ml-1'>{maxPlantsForSelectedType} plants</span>.
                             </p>
                             {maxPlantsForSelectedType === 0 && (
                                 <p className="text-orange-600 font-medium flex items-center"><AlertTriangle size={14} className="mr-1 flex-shrink-0" />Available area might be too small for this plant type at the specified spacing.</p>
                             )}
                         </div>
                    )}
                    {plantType && currentSpacingCm === null && !isFetchingSeeds && (
                        <p className="text-xs text-orange-500 mt-1 flex items-center"><AlertTriangle size={14} className="mr-1"/>Spacing info not found for "{plantType}" in lifecycle data. Cannot calculate area suggestions.</p>
                    )}

                    {plantSuggestions.length > 0 && !selectedSeedId && (
                         <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-md space-y-2">
                             <p className="text-sm font-medium text-indigo-800 flex items-center">
                                 <ThumbsUp size={16} className="mr-2 flex-shrink-0" />
                                 Suggestions for your area ({usableAreaSqM.toFixed(2)} sq m):
                             </p>
                             <ul className="list-none pl-0 text-xs text-indigo-700 space-y-1">
                                 {plantSuggestions.map(suggestion => (
                                     <li key={suggestion.name} className="p-1.5 bg-indigo-100 rounded">
                                         <span className="font-semibold">{suggestion.name}</span>:
                                         ~{suggestion.maxFit} plants (needs ~{suggestion.spacingCm}cm spacing)
                                     </li>
                                 ))}
                             </ul>
                         </div>
                    )}

                    <div>
                        <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">Quantity to Plant <span className="text-red-500">*</span></label>
                        <input id="quantity" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required disabled={isSubmitting || !plantType} className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100" />
                        {maxPlantsForSelectedType !== null && Number(quantity) > maxPlantsForSelectedType && maxPlantsForSelectedType > 0 && (
                             <p className="text-xs text-orange-600 mt-1 flex items-center"><AlertTriangle size={14} className="mr-1"/>Quantity exceeds suggested maximum for the available area.</p>
                        )}
                        {selectedSeedId && availableSeeds.find(s => s.id === selectedSeedId) && Number(quantity) > (availableSeeds.find(s => s.id === selectedSeedId)?.stock || 0) && (
                             <p className="text-xs text-red-600 mt-1 flex items-center"><AlertTriangle size={14} className="mr-1"/>Quantity exceeds available seed stock ({availableSeeds.find(s => s.id === selectedSeedId)?.stock}).</p>
                        )}
                    </div>

                    {estimatedHarvestDate && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Harvest Date</label>
                            <p className="mt-1 text-base font-medium text-gray-900 bg-gray-50 px-3 py-2 rounded-md border border-gray-200 flex items-center">
                                <CalendarDays size={16} className="mr-2 text-green-600" />
                                {estimatedHarvestDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                    )}

                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"> Cancel </button>
                        <button type="submit" disabled={isSubmitting || isFetchingSeeds || !plantType || !selectedSeedId} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center min-w-[100px] justify-center">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Plant Batch'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddPlantModal;
