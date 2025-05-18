'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Leaf, ImageOff, CalendarDays, MapPin, Tag, Loader2, AlertTriangle } from 'lucide-react';
import { ref as rtdbRef, get as getRTDB } from "firebase/database"; // Correct import for RTDB get
import { database } from '@/app/lib/firebase/config'; // Your Firebase config that exports RTDB instance
import { Timestamp } from 'firebase/firestore'; // Import Timestamp if needed for datePlanted, though Date is used here

// Interface for Plant data passed to the card
// Ensure this matches the structure of the plant objects you pass from PlantsPage
interface Plant {
  id: string; // Firestore document ID
  name: string;
  type: string; // e.g., "Cabbage", "Tomato"
  imageUrl?: string | null; // Expected to be an RTDB path like "plantImages/Cabbage" or a full HTTPS URL
  datePlanted: Date; // Should be a JavaScript Date object
  status: string;
  locationZone?: string;
  ownerUid: string; // Not directly displayed but good for interface consistency
  // Add other fields if your PlantCard displays them
  lastSensorReading?: { // From your previous PlantCard version
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

// Placeholder URLs for different image states
const DEFAULT_PLANT_IMAGE_PLACEHOLDER = 'https://placehold.co/400x400/e9e9e9/a9a9a9?text=No+Image';
const ERROR_PLANT_IMAGE_PLACEHOLDER = 'https://placehold.co/400x400/f87171/7f1d1d?text=Load+Error';

const PlantCard: React.FC<PlantCardProps> = ({ plant }) => {
  const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState<boolean>(true);
  const [imageError, setImageError] = useState<string | null>(null); // To store specific error messages

  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates on unmounted component
    setIsImageLoading(true);
    setImageError(null);
    setDisplayImageUrl(null); // Reset image URL on plant prop change

    // console.log(`[PlantCard: ${plant.name}] Received imageUrl from prop: ${plant.imageUrl}`);

    if (plant.imageUrl) {
      if (plant.imageUrl.startsWith('plantImages/')) { // Indicates an RTDB path
        if (!database) {
          console.error(`[PlantCard: ${plant.name}] Firebase Realtime Database is not initialized.`);
          if (isMounted) {
            setDisplayImageUrl(ERROR_PLANT_IMAGE_PLACEHOLDER);
            setImageError("RTDB service not available.");
            setIsImageLoading(false);
          }
          return;
        }
        const imagePath = plant.imageUrl;
        // console.log(`[PlantCard: ${plant.name}] Attempting to fetch from RTDB path: ${imagePath}`);
        const imageRefRTDB = rtdbRef(database, imagePath);

        getRTDB(imageRefRTDB)
          .then((snapshot) => {
            if (!isMounted) return; // Don't update state if component unmounted
            if (snapshot.exists()) {
              const base64Data = snapshot.val();
              if (typeof base64Data === 'string' && base64Data.startsWith('data:image/')) {
                // console.log(`[PlantCard: ${plant.name}] Successfully fetched base64 data from RTDB.`);
                setDisplayImageUrl(base64Data);
              } else {
                console.warn(`[PlantCard: ${plant.name}] Invalid or non-base64 data at RTDB path: ${imagePath}. Data type: ${typeof base64Data}`);
                setDisplayImageUrl(DEFAULT_PLANT_IMAGE_PLACEHOLDER); // Fallback if data is not a valid base64 string
                setImageError("Invalid image format in RTDB.");
              }
            } else {
              console.warn(`[PlantCard: ${plant.name}] No image data found at RTDB path: ${imagePath}. The path exists in Firestore but not in RTDB.`);
              setDisplayImageUrl(DEFAULT_PLANT_IMAGE_PLACEHOLDER); // Path exists in Firestore, but no data in RTDB
              setImageError("Image data not found in RTDB.");
            }
          })
          .catch((error) => {
            if (!isMounted) return;
            console.error(`[PlantCard: ${plant.name}] Error fetching image from RTDB for path ${imagePath}:`, error);
            setDisplayImageUrl(ERROR_PLANT_IMAGE_PLACEHOLDER);
            setImageError(error.code === 'PERMISSION_DENIED' ? "RTDB Permission Denied." : `RTDB Fetch Error.`);
          })
          .finally(() => {
            if (isMounted) setIsImageLoading(false);
          });
      } else if (plant.imageUrl.startsWith('http://') || plant.imageUrl.startsWith('https://')) {
        // console.log(`[PlantCard: ${plant.name}] Using direct HTTPS URL: ${plant.imageUrl}`);
        setDisplayImageUrl(plant.imageUrl);
        setIsImageLoading(false); // Browser handles loading/errors for direct URLs
      } else { // Invalid or unexpected imageUrl format stored in Firestore
        console.warn(`[PlantCard: ${plant.name}] Invalid imageUrl format stored in Firestore: ${plant.imageUrl}`);
        setDisplayImageUrl(DEFAULT_PLANT_IMAGE_PLACEHOLDER);
        setImageError("Invalid image URL format.");
        setIsImageLoading(false);
      }
    } else { // No imageUrl provided in Firestore document for this plant
      // console.log(`[PlantCard: ${plant.name}] No imageUrl provided in Firestore document.`);
      setDisplayImageUrl(DEFAULT_PLANT_IMAGE_PLACEHOLDER);
      setIsImageLoading(false);
    }

    // Cleanup function to set isMounted to false when the component unmounts
    return () => {
      isMounted = false;
    };
  }, [plant.imageUrl, plant.name]); // Re-run effect if plant.imageUrl or plant.name changes

  // This handler is for the <img> tag's onError event
  const handleImageElementError = () => {
    // This triggers if the src (even if it's a valid-looking base64 or https URL) fails to render as an image
    if (displayImageUrl !== ERROR_PLANT_IMAGE_PLACEHOLDER) { // Avoid infinite loop if error placeholder itself fails
        console.warn(`[PlantCard: ${plant.name}] HTML <img> tag failed to load src. Current displayImageUrl (first 60 chars): ${displayImageUrl?.substring(0, 60)}...`);
        setDisplayImageUrl(ERROR_PLANT_IMAGE_PLACEHOLDER);
        setImageError("Browser couldn't render image."); // More specific error
    }
    setIsImageLoading(false); // Ensure loading stops
  };

  const formatDate = (date: Date): string => {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Sensor data display (from your previous PlantCard version)
  const lastReading = plant.lastSensorReading;
  const formatSensorValue = (value: number | undefined | null, fixedDigits: number = 1): string => {
    return (typeof value === 'number') ? value.toFixed(fixedDigits) : '-'; // Use '-' for N/A for brevity
  }

  return (
    <Link href={`/plants/${plant.id}`} legacyBehavior>
      <a className="block bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden group aspect-[4/5] sm:aspect-square flex flex-col">
        <div className="w-full h-32 sm:h-40 bg-gray-200 flex items-center justify-center overflow-hidden relative flex-shrink-0">
          {isImageLoading ? (
            <div className="flex flex-col items-center justify-center text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-xs mt-1">Loading Image...</span>
            </div>
          ) : imageError && displayImageUrl === ERROR_PLANT_IMAGE_PLACEHOLDER ? (
            <div className="flex flex-col items-center justify-center text-red-500 p-2 text-center">
              <AlertTriangle className="w-8 h-8 mb-1" />
              <span className="text-xs">{imageError}</span>
            </div>
          ) : displayImageUrl === DEFAULT_PLANT_IMAGE_PLACEHOLDER && !imageError ? (
             <div className="flex flex-col items-center justify-center text-gray-400 p-2 text-center">
                <ImageOff className="w-10 h-10 mb-1" />
                <span className="text-xs">No Image Provided</span>
            </div>
          ) : displayImageUrl ? (
            <img
              src={displayImageUrl}
              alt={plant.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={handleImageElementError} // Catch errors from the img tag itself
              loading="lazy"
            />
          ) : (
            // Final fallback if displayImageUrl is null after all checks (should ideally not be reached often)
            <div className="flex flex-col items-center justify-center text-gray-400 p-2 text-center">
                <ImageOff className="w-10 h-10 mb-1" />
                <span className="text-xs">Image Unavailable</span>
            </div>
          )}
        </div>
        <div className="p-3 sm:p-4 flex-grow flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-gray-800 truncate text-base group-hover:text-green-700" title={plant.name}>
              {plant.name}
            </h3>
            {plant.type && (
              <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider flex items-center">
                <Leaf size={12} className="mr-1.5 text-green-500 flex-shrink-0" /> {plant.type}
              </p>
            )}
            <div className="text-xs text-gray-600 space-y-0.5 mt-1">
                <p className="flex items-center">
                    <CalendarDays size={12} className="mr-1.5 text-gray-400 flex-shrink-0"/>
                    Planted: {formatDate(plant.datePlanted)}
                </p>
                {plant.status && (
                    <p className="flex items-center">
                        <Tag size={12} className="mr-1.5 text-gray-400 flex-shrink-0"/>
                        Status: <span className="font-medium ml-1">{plant.status}</span>
                    </p>
                )}
                {plant.locationZone && (
                    <p className="flex items-center">
                        <MapPin size={12} className="mr-1.5 text-gray-400 flex-shrink-0"/>
                        Zone: {plant.locationZone}
                    </p>
                )}
            </div>
          </div>

          {/* Sensor Data Display */}
          {lastReading ? (
            <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600 space-y-0.5">
                <div className="flex items-center justify-between">
                    <span className="flex items-center"><Thermometer size={12} className="mr-1 text-orange-400"/>Temp:</span>
                    <span className="font-medium">{formatSensorValue(lastReading.temp, 1)}°C</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="flex items-center"><Droplets size={12} className="mr-1 text-blue-400"/>Humidity:</span>
                    <span className="font-medium">{formatSensorValue(lastReading.humidity, 0)}%</span>
                </div>
                {/* Add other sensor readings similarly if they exist */}
            </div>
          ) : (
            <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
              No recent sensor data.
            </div>
          )}
        </div>
      </a>
    </Link>
  );
};

export default PlantCard;
