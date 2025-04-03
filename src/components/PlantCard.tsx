// src/components/PlantCard.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link'; // Import Link for navigation
import { ImageOff, Leaf, Loader2 } from 'lucide-react'; // Icons for placeholder & loading

// Firebase Imports for RTDB
import { ref, get } from "firebase/database";
import { database } from '@/app/lib/firebase/config'; // Adjust path if needed

// Define the expected structure for a plant object prop
// Ensure this matches the data structure fetched in your page components
interface Plant {
  id: number | string; // Must have ID for linking
  name: string;
  imageUrl?: string | null; // This holds the RTDB path (e.g., "plantImages/plantId") or null
  type?: string; // Optional: Add other fields if needed by the card
  status?: string; // Optional
}

interface PlantCardProps {
  plant: Plant;
}

const PlantCard: React.FC<PlantCardProps> = ({ plant }) => {
  // State to store the fetched Base64 image data
  const [imageData, setImageData] = useState<string | null>(null);
  // State to track image loading from RTDB
  const [isImageLoading, setIsImageLoading] = useState<boolean>(false);
  // State to track image fetching errors from RTDB
  const [imageFetchError, setImageFetchError] = useState<string | null>(null);

  // Effect to fetch image data from RTDB when imageUrl path changes
  useEffect(() => {
    // Reset state when plant or imageUrl changes
    setImageData(null);
    setIsImageLoading(false);
    setImageFetchError(null);

    const rtdbPath = plant.imageUrl;

    // Check if the path exists and looks like our expected path format
    // Adjust the check if your path format is different
    if (rtdbPath && rtdbPath.startsWith('plantImages/')) {
      setIsImageLoading(true);
      const imageRefRTDB = ref(database, rtdbPath); // Create RTDB reference

      console.log(`PlantCard: Fetching image from RTDB path: ${rtdbPath}`); // Debug log

      get(imageRefRTDB).then((snapshot) => {
        if (snapshot.exists()) {
          const base64Data = snapshot.val();
          // Basic validation for Base64 data URL format
          if (typeof base64Data === 'string' && base64Data.startsWith('data:image/')) {
            console.log(`PlantCard: Image data fetched successfully for ${rtdbPath}`); // Debug log
            setImageData(base64Data); // Store the fetched Base64 string
          } else {
            console.warn(`PlantCard: Invalid data format found at RTDB path: ${rtdbPath}`);
            setImageFetchError("Invalid image data."); // Set specific error
          }
        } else {
          console.warn(`PlantCard: No image data found at RTDB path: ${rtdbPath}`);
          // Don't set an error, just let the placeholder show naturally
          // setImageFetchError("Image data not found.");
        }
      }).catch((error) => {
        console.error(`PlantCard: Error fetching image from RTDB (${rtdbPath}):`, error);
        // Check for permission errors specifically if possible
        if (error.code === 'PERMISSION_DENIED') {
             setImageFetchError("Permission denied fetching image.");
        } else {
             setImageFetchError("Failed to load image.");
        }
      }).finally(() => {
        setIsImageLoading(false);
      });
    } else if (rtdbPath) {
        // Handle cases where imageUrl is present but not a valid path format
        console.warn(`PlantCard: Invalid RTDB path format for image: ${rtdbPath}`);
        setImageFetchError("Invalid image path.");
        setIsImageLoading(false); // Ensure loading stops
    }
    // If rtdbPath is null/undefined, do nothing, loading remains false, placeholder will be shown

  }, [plant.imageUrl]); // Rerun effect ONLY if the image URL path changes

  return (
    // Wrap the entire card content with a Link component
    // Use plant.id to construct the dynamic route path
    <Link href={`/plants/${plant.id}`} className="block group h-full"> {/* Added h-full for consistent height */}
      <div className="bg-white rounded-lg shadow overflow-hidden transition hover:shadow-lg h-full flex flex-col"> {/* Ensure card takes height */}
        {/* Image container */}
        <div className="w-full h-32 relative bg-gray-200 flex items-center justify-center text-gray-400 overflow-hidden flex-shrink-0"> {/* Base placeholder style */}
          {isImageLoading ? (
            // Loading State
            <Loader2 size={32} className="animate-spin text-gray-500" />
          ) : imageFetchError || !imageData ? (
            // Error or No Image State (Placeholder)
            <div className="flex flex-col items-center text-center p-1">
               <Leaf size={32} />
               {imageFetchError && <span className="mt-1 text-xs text-red-500">{imageFetchError}</span>}
               {!imageFetchError && !plant.imageUrl && <span className="mt-1 text-xs text-gray-400">No Image</span>}
            </div>
          ) : (
            // Success State: Display the image using standard <img> tag with Base64 src
            <img
              src={imageData}
              alt={plant.name}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" // Example hover effect
            />
          )}
        </div>
        {/* Plant name & details */}
        <div className="p-3 flex-grow"> {/* Use flex-grow to push content down if card height is fixed */}
          <h3 className="font-semibold text-gray-800 truncate text-base group-hover:text-green-700">{plant.name}</h3>
          {/* Optionally display other info like type or status */}
          {plant.type && <p className="text-sm text-gray-500">{plant.type}</p>}
          {plant.status && <p className="text-xs text-gray-400 mt-1">Status: {plant.status}</p>}
        </div>
      </div>
    </Link>
  );
};

export default PlantCard;
