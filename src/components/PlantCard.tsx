// src/components/PlantCard.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link'; 
import { ImageOff, Leaf, Loader2 } from 'lucide-react'; 


import { ref, get } from "firebase/database";
import { database } from '@/app/lib/firebase/config'; 

interface Plant {
  id: number | string;
  name: string;
  imageUrl?: string | null; 
  type?: string; 
  status?: string; 
}

interface PlantCardProps {
  plant: Plant;
}

const PlantCard: React.FC<PlantCardProps> = ({ plant }) => {
 
  const [imageData, setImageData] = useState<string | null>(null);
  
  const [isImageLoading, setIsImageLoading] = useState<boolean>(false);
 
  const [imageFetchError, setImageFetchError] = useState<string | null>(null);

 
  useEffect(() => {
   
    setImageData(null);
    setIsImageLoading(false);
    setImageFetchError(null);

    const rtdbPath = plant.imageUrl;


    if (rtdbPath && rtdbPath.startsWith('plantImages/')) {
      setIsImageLoading(true);
      const imageRefRTDB = ref(database, rtdbPath);

      console.log(`PlantCard: Fetching image from RTDB path: ${rtdbPath}`);

      get(imageRefRTDB).then((snapshot) => {
        if (snapshot.exists()) {
          const base64Data = snapshot.val();

          if (typeof base64Data === 'string' && base64Data.startsWith('data:image/')) {
            console.log(`PlantCard: Image data fetched successfully for ${rtdbPath}`); 
            setImageData(base64Data); 
          } else {
            console.warn(`PlantCard: Invalid data format found at RTDB path: ${rtdbPath}`);
            setImageFetchError("Invalid image data.");
          }
        } else {
          console.warn(`PlantCard: No image data found at RTDB path: ${rtdbPath}`);

        }
      }).catch((error) => {
        console.error(`PlantCard: Error fetching image from RTDB (${rtdbPath}):`, error);

        if (error.code === 'PERMISSION_DENIED') {
             setImageFetchError("Permission denied fetching image.");
        } else {
             setImageFetchError("Failed to load image.");
        }
      }).finally(() => {
        setIsImageLoading(false);
      });
    } else if (rtdbPath) {

        console.warn(`PlantCard: Invalid RTDB path format for image: ${rtdbPath}`);
        setImageFetchError("Invalid image path.");
        setIsImageLoading(false);
    }

  }, [plant.imageUrl]);

  return (

    <Link href={`/plants/${plant.id}`} className="block group h-full"> 
      <div className="bg-white rounded-lg shadow overflow-hidden transition hover:shadow-lg h-full flex flex-col"> 
        <div className="w-full h-32 relative bg-gray-200 flex items-center justify-center text-gray-400 overflow-hidden flex-shrink-0"> {/* Base placeholder style */}
          {isImageLoading ? (

            <Loader2 size={32} className="animate-spin text-gray-500" />
          ) : imageFetchError || !imageData ? (

            <div className="flex flex-col items-center text-center p-1">
               <Leaf size={32} />
               {imageFetchError && <span className="mt-1 text-xs text-red-500">{imageFetchError}</span>}
               {!imageFetchError && !plant.imageUrl && <span className="mt-1 text-xs text-gray-400">No Image</span>}
            </div>
          ) : (

            <img
              src={imageData}
              alt={plant.name}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" // Example hover effect
            />
          )}
        </div>

        <div className="p-3 flex-grow"> 
          <h3 className="font-semibold text-gray-800 truncate text-base group-hover:text-green-700">{plant.name}</h3>
 
          {plant.type && <p className="text-sm text-gray-500">{plant.type}</p>}
          {plant.status && <p className="text-xs text-gray-400 mt-1">Status: {plant.status}</p>}
        </div>
      </div>
    </Link>
  );
};

export default PlantCard;
