'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '@/app/lib/firebase/config';
import { X, Loader2, Save, Ruler, Maximize, ScanArea, AlertTriangle, CheckCircle } from 'lucide-react';

interface LandSizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLength?: number;
  currentWidth?: number;
  currentPlantableArea?: number;
  onSaveSuccess?: () => void;
}

const LandSizeModal: React.FC<LandSizeModalProps> = ({
  isOpen,
  onClose,
  currentLength,
  currentWidth,
  currentPlantableArea,
  onSaveSuccess, // Use callback
}) => {

  const [lengthM, setLengthM] = useState<number | string>(currentLength ?? '');
  const [widthM, setWidthM] = useState<number | string>(currentWidth ?? '');
  const [plantableAreaSqM, setPlantableAreaSqM] = useState<number | string>(currentPlantableArea ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSavingInternal, setIsSavingInternal] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLengthM(currentLength ?? '');
      setWidthM(currentWidth ?? '');
      setPlantableAreaSqM(currentPlantableArea ?? '');
      setError(null);
      setSuccessMessage(null);
      setIsSavingInternal(false);
    }
  }, [isOpen, currentLength, currentWidth, currentPlantableArea]);

  // --- Derived state ---
  const { calculatedTotalArea, aspectRatio, numLength, numWidth, isValidDimensions } = useMemo(() => {
      const length = Number(lengthM);
      const width = Number(widthM);
      const valid = !isNaN(length) && !isNaN(width) && length > 0 && width > 0;
      if (valid) {
          return { calculatedTotalArea: (length * width).toFixed(2), aspectRatio: width / length, numLength: length, numWidth: width, isValidDimensions: true };
      }
      return { calculatedTotalArea: '0.00', aspectRatio: 1, numLength: 0, numWidth: 0, isValidDimensions: false };
  }, [lengthM, widthM]);

  // --- Form Submission Handler ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const numPlantableArea = Number(plantableAreaSqM);

    if (!isValidDimensions) { setError('Please enter valid positive numbers for length and width.'); return; }
    if (isNaN(numPlantableArea) || numPlantableArea <= 0) { setError('Please enter a valid positive number for Plantable Area.'); return; }
    if (numPlantableArea > parseFloat(calculatedTotalArea)) { setError('Plantable area cannot be greater than the total calculated area.'); return; }

    setIsSavingInternal(true);

    const settingsDocRef = doc(firestore, 'greenhouseSettings', 'main');

    const settingsData = {
        greenhouseLengthM: numLength,
        greenhouseWidthM: numWidth,
        usablePlantingAreaSqM: numPlantableArea,
        lastUpdated: serverTimestamp()
    };

    try {
        await setDoc(settingsDocRef, settingsData, { merge: true });

        setSuccessMessage("Settings saved successfully!");
        console.log("Greenhouse settings saved:", settingsData);

        if (onSaveSuccess) {
            onSaveSuccess();
        }

        setTimeout(() => {
           onClose();
        }, 1500);

    } catch (err: any) {
        console.error("Error saving settings:", err);
        setError(err.message || "Failed to save settings.");
    } finally {
        setIsSavingInternal(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 transition-opacity duration-300 ease-in-out animate-fade-in">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg transform transition-all duration-300 ease-in-out scale-100 animate-slide-up">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center"> <Ruler size={20} className="mr-2 text-blue-600" /> Set Greenhouse Dimensions & Area </h2>
          <button onClick={onClose} disabled={isSavingInternal} className="text-gray-400 hover:text-gray-600 disabled:opacity-50 rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-gray-400" aria-label="Close modal"> <X size={24} /> </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && ( <div role="alert" className="text-sm text-red-700 bg-red-100 p-3 rounded border border-red-300 flex items-center"> <AlertTriangle size={16} className="mr-2 flex-shrink-0"/> {error}</div> )}
          {successMessage && ( <div role="status" className="text-sm text-green-700 bg-green-100 p-3 rounded border border-green-300 flex items-center"> <CheckCircle size={16} className="mr-2 flex-shrink-0"/> {successMessage}</div> )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Input Fields Column */}
            <div className="space-y-4">
              <div> <label htmlFor="modalLength" className="block text-sm font-medium text-gray-700 mb-1"> Total Length (m) <span className="text-red-500">*</span> </label> <input id="modalLength" type="number" min="0" step="0.1" value={lengthM} onChange={(e) => setLengthM(e.target.value)} required disabled={isSavingInternal} className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm disabled:bg-gray-100" placeholder="e.g., 8" /> </div>
              <div> <label htmlFor="modalWidth" className="block text-sm font-medium text-gray-700 mb-1"> Total Width (m) <span className="text-red-500">*</span> </label> <input id="modalWidth" type="number" min="0" step="0.1" value={widthM} onChange={(e) => setWidthM(e.target.value)} required disabled={isSavingInternal} className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm disabled:bg-gray-100" placeholder="e.g., 6" /> </div>
              <div> <label className="block text-sm font-medium text-gray-700"> Calculated Total Area </label> <p className="mt-1 text-lg font-medium text-gray-900 bg-gray-50 px-3 py-2 rounded-md border border-gray-200"> {calculatedTotalArea} sq m </p> </div>
              <div>
                  <label htmlFor="plantableArea" className="block text-sm font-medium text-gray-700 mb-1"> Plantable Area (sq m) <span className="text-red-500">*</span> </label>
                   <input
                      id="plantableArea" type="number" min="0" step="0.1"
                      value={plantableAreaSqM} onChange={(e) => setPlantableAreaSqM(e.target.value)}
                      required disabled={isSavingInternal}
                      className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm disabled:bg-gray-100"
                      placeholder="e.g., 40"
                  />
                   <p className="mt-1 text-xs text-gray-500"> Actual area usable for planting. </p>
              </div>
            </div>

            {/* Visualizer Column */}
            <div className="flex flex-col items-center justify-start space-y-2 pt-2">
               <p className="text-sm font-medium text-gray-700 self-start mb-2">Visual Representation (Total)</p>
               <div className="relative w-full max-w-[220px] aspect-square p-4">
                  <div className="absolute inset-0 border border-gray-300 bg-gray-50 rounded-md"></div>
                  {isValidDimensions ? ( <div className="absolute bg-blue-300 border border-blue-600 rounded-sm" style={{ width: aspectRatio >= 1 ? '80%' : `${(1 / aspectRatio) * 80}%`, height: aspectRatio <= 1 ? '80%' : `${aspectRatio * 80}%`, maxWidth: '80%', maxHeight: '80%', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', }}></div> )
                  : ( <div className="absolute inset-0 flex items-center justify-center"> <Maximize size={32} className="text-gray-400" /> </div> )}
                   {isValidDimensions && ( <> {/* Width Line & Label */} <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex flex-col items-center w-[80%]" style={{ width: aspectRatio >= 1 ? '80%' : `${(1 / aspectRatio) * 80}%`, maxWidth: '80%' }}> <span className="text-xs text-gray-600 mb-0.5">{numWidth}m</span> <div className="flex items-center w-full"> <div className="border-t border-black w-1 h-0 transform -translate-y-1/2"></div> <div className="flex-grow border-t border-black h-0"></div> <div className="border-t border-black w-1 h-0 transform -translate-y-1/2"></div> </div> </div> {/* Length Line & Label */} <div className="absolute right-1 top-1/2 transform -translate-y-1/2 flex items-center h-[80%]" style={{ height: aspectRatio <= 1 ? '80%' : `${aspectRatio * 80}%`, maxHeight: '80%' }}> <div className="flex flex-col items-center h-full"> <div className="border-l border-black h-1 w-0 transform -translate-x-1/2"></div> <div className="flex-grow border-l border-black w-0"></div> <div className="border-l border-black h-1 w-0 transform -translate-x-1/2"></div> </div> <span className="text-xs text-gray-600 ml-0.5" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{numLength}m</span> </div> </> )}
               </div>
               <p className="text-xs text-gray-500 mt-1">{isValidDimensions ? '(Total dimensions shown)' : '(Enter valid dimensions)'}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} disabled={isSavingInternal} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"> Cancel </button>
            <button type="submit" disabled={isSavingInternal || !isValidDimensions || Number(plantableAreaSqM) <= 0} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center min-w-[100px] justify-center">
              {isSavingInternal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} className="mr-1.5" />}
              {isSavingInternal ? 'Saving...' : 'Save Size'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LandSizeModal;
