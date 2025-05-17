'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ImageOff, Leaf, Loader2, Thermometer, Droplets, TestTube2, Zap, Atom } from 'lucide-react';

import { ref, get } from "firebase/database";
import { database } from '@/app/lib/firebase/config';
import { Timestamp } from 'firebase/firestore';

interface Plant {
  id: number | string;
  name: string;
  imageUrl?: string | null;
  type?: string;
  status?: string;
  lastSensorReading?: {
      timestamp?: Date;
      temp?: number;
      humidity?: number;
      ph?: number;
      ec?: number;
      nitrogen?: number;
      phosphorus?: number;
      potassium?: number;
  } | null;
}

interface PlantCardProps {
  plant: Plant;
}

const PlantCard: React.FC<PlantCardProps> = ({ plant }) => {
  const [imageData, setImageData] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState<boolean>(false);
  const [imageFetchError, setImageFetchError] = useState<string | null>(null);

  useEffect(() => {
    setImageData(null); setIsImageLoading(false); setImageFetchError(null);
    const rtdbPath = plant.imageUrl;
    if (rtdbPath && rtdbPath.startsWith('plantImages/')) {
      setIsImageLoading(true);
      const imageRefRTDB = ref(database, rtdbPath);
      get(imageRefRTDB).then((snapshot) => {
        if (snapshot.exists()) {
          const base64Data = snapshot.val();
          if (typeof base64Data === 'string' && base64Data.startsWith('data:image/')) {
            setImageData(base64Data);
          } else { setImageFetchError("Invalid image data."); }
        }
      }).catch((error) => {
        console.error(`RTDB Error (${rtdbPath}):`, error);
        if (error.code === 'PERMISSION_DENIED') { setImageFetchError("Permission denied."); }
        else { setImageFetchError("Failed to load image."); }
      }).finally(() => { setIsImageLoading(false); });
    } else if (rtdbPath) { setImageFetchError("Invalid image path."); setIsImageLoading(false); }
  }, [plant.imageUrl]);

  const lastReading = plant.lastSensorReading;

  const formatValue = (value: number | undefined | null, fixedDigits: number = 1): string => {
      return (typeof value === 'number') ? value.toFixed(fixedDigits) : 'N/A';
  }

  return (
    <Link href={`/plants/${plant.id}`} className="block group h-full">
      <div className="bg-white rounded-lg shadow overflow-hidden transition hover:shadow-lg h-full flex flex-col">
        <div className="w-full h-32 relative bg-gray-200 flex items-center justify-center text-gray-400 overflow-hidden flex-shrink-0">
          {isImageLoading ? ( <Loader2 size={32} className="animate-spin text-gray-500" /> )
          : imageFetchError || !imageData ? ( <div className="flex flex-col items-center text-center p-1"> <Leaf size={32} /> {imageFetchError && <span className="mt-1 text-xs text-red-500">{imageFetchError}</span>} {!imageFetchError && !plant.imageUrl && <span className="mt-1 text-xs text-gray-400">No Image</span>} </div> )
          : ( <img src={imageData} alt={plant.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" /> )}
        </div>
        <div className="p-3 flex-grow flex flex-col justify-between">
            <div>
                <h3 className="font-semibold text-gray-800 truncate text-base group-hover:text-green-700">{plant.name}</h3>
                {plant.type && <p className="text-sm text-gray-500">{plant.type}</p>}
                {plant.status && <p className="text-xs text-gray-400 mt-1">Status: {plant.status}</p>}
            </div>
            {lastReading ? (
                <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600 space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="flex items-center"><Thermometer size={12} className="mr-1 text-orange-500"/> Temp:</span>
                        <span>{formatValue(lastReading.temp, 1)}°C</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="flex items-center"><Droplets size={12} className="mr-1 text-blue-500"/> Humidity:</span>
                        <span>{formatValue(lastReading.humidity, 0)}%</span>
                    </div>
                     <div className="flex items-center justify-between">
                        <span className="flex items-center"><TestTube2 size={12} className="mr-1 text-purple-500"/> pH:</span>
                        <span>{formatValue(lastReading.ph, 1)}</span>
                    </div>
                     <div className="flex items-center justify-between">
                        <span className="flex items-center"><Zap size={12} className="mr-1 text-yellow-500"/> EC:</span>
                        <span>{formatValue(lastReading.ec, 1)} µS/cm</span>
                    </div>
                     <div className="flex items-center justify-between pt-1 mt-1 border-t border-dashed">
                        <span className="flex items-center font-medium"><Atom size={12} className="mr-1 text-gray-500"/> NPK:</span>
                        <span className="space-x-2">
                            <span className="text-green-700">N: {formatValue(lastReading.nitrogen, 0)}</span>
                            <span className="text-blue-700">P: {formatValue(lastReading.phosphorus, 0)}</span>
                            <span className="text-orange-700">K: {formatValue(lastReading.potassium, 0)}</span>
                        </span>
                    </div>
                     {lastReading.timestamp && <p className="text-right text-gray-400 text-[10px] mt-1">As of: {lastReading.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
            ) : (
                <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                    No recent sensor data.
                </div>
            )}
        </div>
      </div>
    </Link>
  );
};

export default PlantCard;
