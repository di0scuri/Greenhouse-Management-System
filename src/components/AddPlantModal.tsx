'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Loader2, Info, AlertTriangle, Leaf, ThumbsUp, CalendarDays } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { firestore, auth } from '@/app/lib/firebase/config';
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

const plantImageMap: Record<string, string> = {
    lettuce: 'https://placehold.co/400x400/a3e6b7/4d7c0f?text=Lettuce',
    cabbage: 'https://placehold.co/400x400/d1fae5/065f46?text=Cabbage',
    cauliflower: 'https://placehold.co/400x400/f0fdf4/166534?text=Cauliflower',
    broccoli: 'https://placehold.co/400x400/dcfce7/15803d?text=Broccoli',
    tomato: 'https://placehold.co/400x400/fee2e2/b91c1c?text=Tomato',
    pepper: 'https://placehold.co/400x400/fef3c7/b45309?text=Pepper',
    default: 'https://placehold.co/400x400/e5e7eb/4b5563?text=Plant'
};

const formatDateForName = (date: Date): string => {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        console.error("Invalid date passed to formatDateForName");
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
    const derived = seedName.replace(/ seeds$/i, '').trim();
    return derived.length > 0 ? derived : null;
}

const AddPlantModal: React.FC<AddPlantModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    usableAreaSqM,
    lifecycleData,
}) => {
    const [user] = useAuthState(auth);

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
        if (isOpen && user && firestore) {
            const fetchSeeds = async () => {
                setIsFetchingSeeds(true); setFetchError(null); setAvailableSeeds([]);
                try {
                    const inventoryRef = collection(firestore, 'inventory');
                    const q = query(inventoryRef, where("category", "==", "seeds"));
                    const querySnapshot = await getDocs(q);
                    const seeds: AvailableSeed[] = [];
                    querySnapshot.forEach((doc) => {
                        const data = doc.data();
                        const stock = typeof data.stock === 'number' ? data.stock : Number(data.stock) || 0;
                        if (stock > 0) {
                            seeds.push({
                                id: doc.id,
                                name: data.name || 'Unnamed Seed',
                                stock: stock,
                                unit: data.unit || 'units',
                            });
                        }
                    });
                    seeds.sort((a, b) => a.name.localeCompare(b.name));
                    setAvailableSeeds(seeds);
                } catch (error: any) { console.error("Error fetching seeds:", error); setFetchError("Failed to load available seeds.");
                } finally { setIsFetchingSeeds(false); }
            };
            fetchSeeds();
        } else { setAvailableSeeds([]); }
    }, [isOpen, user]);

    useEffect(() => {
        if (isOpen) {
            setPlantName(''); setPlantType(''); setSelectedSeedId(null); setQuantity(1);
            setSubmitError(null); setIsSubmitting(false);
            setMaxPlantsForSelectedType(null); setCurrentSpacingCm(null); setEstimatedHarvestDate(null);
            setPlantSuggestions([]);
        }
    }, [isOpen]);

    useEffect(() => {
        if (selectedSeedId && availableSeeds.length > 0 && lifecycleData && Object.keys(lifecycleData).length > 0) {
            const selectedSeed = availableSeeds.find(seed => seed.id === selectedSeedId);

            if (selectedSeed && selectedSeed.name) {
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
                        } else { setMaxPlantsForSelectedType(null); }
                    } else {
                        setCurrentSpacingCm(null); setMaxPlantsForSelectedType(null);
                        console.warn(`Lifecycle/spacing data missing for derived type: ${derivedPlantType}`);
                    }

                    if (lifeCycle && typeof lifeCycle.harvestDays === 'number') {
                        setEstimatedHarvestDate(addDays(new Date(), lifeCycle.harvestDays));
                    } else {
                        setEstimatedHarvestDate(null);
                    }

                } else {
                    setPlantType(''); setPlantName('');
                    setCurrentSpacingCm(null); setMaxPlantsForSelectedType(null); setEstimatedHarvestDate(null);
                    console.warn(`Could not derive plant type from seed name: ${selectedSeed.name}`);
                }
            } else {
                setPlantType(''); setPlantName('');
                setCurrentSpacingCm(null); setMaxPlantsForSelectedType(null); setEstimatedHarvestDate(null);
            }
        } else {
            setPlantType(''); setPlantName('');
            setCurrentSpacingCm(null); setMaxPlantsForSelectedType(null); setEstimatedHarvestDate(null);
        }
    }, [selectedSeedId, availableSeeds, lifecycleData, usableAreaSqM]);


    useEffect(() => {
        if (lifecycleData && Object.keys(lifecycleData).length > 0 && usableAreaSqM > 0) {
            const suggestions: PlantSuggestion[] = [];
            const usableAreaSqCm = usableAreaSqM * 10000;
            for (const typeKey in lifecycleData) {
                const lifeCycle = lifecycleData[typeKey];
                if (lifeCycle && typeof lifeCycle.spacingCm === 'number' && lifeCycle.spacingCm > 0) {
                    const spacingM = lifeCycle.spacingCm / 100;
                    const areaPerPlantSqM = spacingM * spacingM;
                    if (areaPerPlantSqM > 0) {
                        const maxFit = Math.floor(usableAreaSqM / areaPerPlantSqM);
                        if (maxFit > 0) { suggestions.push({ ...lifeCycle, maxFit }); }
                    }
                }
            }
            suggestions.sort((a, b) => b.maxFit - a.maxFit);
            setPlantSuggestions(suggestions.slice(0, 3));
        } else { setPlantSuggestions([]); }
    }, [lifecycleData, usableAreaSqM]);


    // Form submission handler
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        const trimmedPlantType = plantType.trim();
        const trimmedPlantName = plantName.trim();
        if (!selectedSeedId) { setSubmitError("Please select a seed type first."); return; }
        if (!trimmedPlantType) { setSubmitError("Plant type could not be determined from selected seed."); return; }
        if (!trimmedPlantName) { setSubmitError("Plant name is required."); return; }
        const numQuantity = Number(quantity);
        if (isNaN(numQuantity) || numQuantity <= 0) { setSubmitError("Quantity must be a positive number."); return; }

        if (!lifecycleData[trimmedPlantType]) {
             setSubmitError(`Configuration for plant type "${trimmedPlantType}" not found.`);
             return;
        }

        const imageUrl = plantImageMap[trimmedPlantType.toLowerCase()] || plantImageMap['default'] || null;

        setIsSubmitting(true);
        try {
            await onSubmit({ plantName: trimmedPlantName, plantType: trimmedPlantType, selectedSeedId, quantity: numQuantity, imageUrl: imageUrl });
        } catch (error: any) { console.error("Submission error:", error); setSubmitError(error.message || "Failed to add plant."); }
        finally { setIsSubmitting(false); }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 transition-opacity duration-300 ease-in-out animate-fade-in">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg transform transition-all duration-300 ease-in-out scale-100 animate-slide-up">
                <div className="flex justify-between items-center p-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-800">Add New Plant</h2>
                    <button onClick={onClose} disabled={isSubmitting} className="text-gray-400 hover:text-gray-600 disabled:opacity-50 rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-gray-400" aria-label="Close modal"> <X size={24} /> </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                    {submitError && (<div role="alert" className="text-sm text-red-700 bg-red-100 p-3 rounded border border-red-300"> <p><span className="font-semibold">Error:</span> {submitError}</p> </div>)}

                    {/* 1. Seed Selection */}
                    <div>
                        <label htmlFor="seedSelect" className="block text-sm font-medium text-gray-700 mb-1">Select Seed <span className="text-red-500">*</span></label>
                        {isFetchingSeeds ? (<div className="flex items-center text-gray-500"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading seeds...</div>)
                        : fetchError ? (<p className="text-sm text-red-600">{fetchError}</p>)
                        : ( <select id="seedSelect" value={selectedSeedId ?? ''} onChange={(e) => setSelectedSeedId(e.target.value || null)} required disabled={isSubmitting || availableSeeds.length === 0} className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"> <option value="" disabled>{availableSeeds.length === 0 ? 'No seeds in inventory' : '-- Select a seed --'}</option> {availableSeeds.map(seed => ( <option key={seed.id} value={seed.id}> {seed.name} (Stock: {seed.stock} {seed.unit}) </option> ))} </select> )}
                        {selectedSeedId && !plantType && !isFetchingSeeds && (
                            <p className="text-xs text-red-600 mt-1">Warning: Could not determine plant type from seed name.</p>
                        )}
                    </div>

                    {/* 2. Plant Type (Display Only) */}
                    {plantType && (
                        <div>
                            <label htmlFor="plantTypeDisplay" className="block text-sm font-medium text-gray-700 mb-1">Plant Type (from Seed)</label>
                            <input id="plantTypeDisplay" type="text" value={plantType} readOnly disabled className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 text-gray-500 sm:text-sm cursor-not-allowed" />
                        </div>
                    )}

                    {/* 3. Plant Name (Auto-filled, editable) */}
                    <div>
                        <label htmlFor="plantName" className="block text-sm font-medium text-gray-700 mb-1">Plant Name <span className="text-red-500">*</span></label>
                        <input id="plantName" type="text" value={plantName} onChange={(e) => setPlantName(e.target.value)} required disabled={isSubmitting || !plantType} className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100" placeholder={plantType ? "Auto-generated, editable" : "Select seed first"} />
                    </div>

                    {/* 4. Available Area & Suggestion */}
                    {plantType && currentSpacingCm !== null && maxPlantsForSelectedType !== null && (
                         <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-700 space-y-1">
                             <p>Total Usable Area: <span className='font-medium'>{usableAreaSqM.toFixed(2)} sq m</span>.</p>
                             <p className='flex items-center'>
                                <Info size={14} className="mr-1 flex-shrink-0" />
                                With <span className='font-medium mx-1'>{currentSpacingCm}cm</span> spacing, suggested max for this area: <span className='font-medium ml-1'>{maxPlantsForSelectedType} plants</span>.
                             </p>
                             {maxPlantsForSelectedType === 0 && (
                                 <p className="text-orange-600 font-medium flex items-center"><AlertTriangle size={14} className="mr-1 flex-shrink-0" />Area may be too small for this plant type.</p>
                             )}
                         </div>
                    )}
                    {plantType && currentSpacingCm === null && !isFetchingSeeds && (
                        <p className="text-xs text-gray-500 mt-1">Spacing info not found for "{plantType}". Cannot calculate suggestion.</p>
                    )}

                     {/* Ideal Plant Suggestions (Optional Section) */}
                     {plantSuggestions.length > 0 && !plantType && (
                         <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-md space-y-2">
                             <p className="text-sm font-medium text-indigo-800 flex items-center">
                                 <ThumbsUp size={16} className="mr-2 flex-shrink-0" />
                                 Suggestions for total area ({usableAreaSqM.toFixed(2)} sq m):
                             </p>
                             <ul className="list-disc list-inside text-xs text-indigo-700 space-y-1">
                                 {plantSuggestions.map(suggestion => (
                                     <li key={suggestion.name}>
                                         <button type="button" onClick={() => { /* Maybe select a seed of this type? More complex */ alert(`Consider planting ${suggestion.name}`); }} className="font-semibold hover:underline focus:outline-none" title={`Consider ${suggestion.name}`}> {suggestion.name} </button>
                                          : ~{suggestion.maxFit} plants (needs ~{suggestion.spacingCm}cm spacing)
                                     </li>
                                 ))}
                             </ul>
                         </div>
                     )}


                    {/* 5. Quantity Input */}
                    <div>
                        <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">Quantity to Plant <span className="text-red-500">*</span></label>
                        <input id="quantity" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required disabled={isSubmitting || !plantType} className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100" />
                        {/* Warning if quantity > max plants */}
                        {maxPlantsForSelectedType !== null && Number(quantity) > maxPlantsForSelectedType && (
                             <p className="text-xs text-orange-600 mt-1">Warning: Quantity exceeds suggested maximum for total area.</p>
                        )}
                    </div>

                    {/* 6. Estimated Harvest Date */}
                    {estimatedHarvestDate && (
                        <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Harvest Date</label>
                             <p className="mt-1 text-base font-medium text-gray-900 bg-gray-50 px-3 py-2 rounded-md border border-gray-200 flex items-center">
                                <CalendarDays size={16} className="mr-2 text-green-600" />
                                {estimatedHarvestDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"> Cancel </button>
                        <button type="submit" disabled={isSubmitting || isFetchingSeeds || !plantType} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center min-w-[100px] justify-center">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Plant'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddPlantModal;
