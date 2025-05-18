'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ImageOff, Leaf, Loader2, Thermometer, Droplets, TestTube2, Zap, Atom, CalendarDays, MapPin, Tag, AlertTriangle } from 'lucide-react';

import { ref as rtdbRef, get as getRTDB } from "firebase/database";
import { database, firestore } from '@/app/lib/firebase/config'; // Assuming firestore is also exported
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';

// Interface for the individual sensor reading fetched by the card
interface LatestSensorReading {
  timestamp?: Date;
  temp?: number;
  humidity?: number;
  ph?: number;
  ec?: number;
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
}

// Plant prop structure
interface Plant {
  id: string; // Firestore document ID of the plant
  name: string;
  imageUrl?: string | null;
  type?: string;
  status?: string;
  datePlanted: Date; // Ensure this is a Date object when passed
  locationZone?: string;
  ownerUid: string;
}

interface PlantCardProps {
  plant: Plant;
}

const DEFAULT_PLANT_IMAGE_PLACEHOLDER = 'https://placehold.co/400x400/e9e9e9/a9a9a9?text=No+Image';
const ERROR_PLANT_IMAGE_PLACEHOLDER = 'https://placehold.co/400x400/f87171/7f1d1d?text=Load+Error';

const PlantCard: React.FC<PlantCardProps> = ({ plant }) => {
  const [imageData, setImageData] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState<boolean>(false);
  const [imageFetchError, setImageFetchError] = useState<string | null>(null);

  const [latestSensorData, setLatestSensorData] = useState<LatestSensorReading | null>(null);
  const [isSensorDataLoading, setIsSensorDataLoading] = useState<boolean>(true);
  const [sensorDataError, setSensorDataError] = useState<string | null>(null);

  // Effect to fetch image from RTDB or use direct URL
  useEffect(() => {
    let isMounted = true;
    if (plant.imageUrl) {
        setIsImageLoading(true);
    } else {
        setIsImageLoading(false);
        setImageData(DEFAULT_PLANT_IMAGE_PLACEHOLDER);
        return;
    }
    setImageFetchError(null);

    if (plant.imageUrl.startsWith('plantImages/')) {
        if (!database) {
          console.error(`[PlantCard: ${plant.name}] Firebase Realtime Database is not initialized.`);
          if (isMounted) {
            setImageData(ERROR_PLANT_IMAGE_PLACEHOLDER);
            setImageFetchError("RTDB service unavailable.");
            setIsImageLoading(false);
          }
          return;
        }
        const imagePath = plant.imageUrl;
        const imageRefRTDB = rtdbRef(database, imagePath);
        getRTDB(imageRefRTDB)
          .then((snapshot) => {
            if (!isMounted) return;
            if (snapshot.exists()) {
              const base64Data = snapshot.val();
              if (typeof base64Data === 'string' && base64Data.startsWith('data:image/')) {
                setImageData(base64Data);
              } else {
                setImageData(DEFAULT_PLANT_IMAGE_PLACEHOLDER);
                setImageFetchError("Invalid image format in RTDB.");
              }
            } else {
              setImageData(DEFAULT_PLANT_IMAGE_PLACEHOLDER);
              setImageFetchError("Image not found in RTDB.");
            }
          })
          .catch((error) => {
            if (!isMounted) return;
            console.error(`[PlantCard: ${plant.name}] Error fetching image from RTDB:`, error);
            setImageData(ERROR_PLANT_IMAGE_PLACEHOLDER);
            setImageFetchError(error.code === 'PERMISSION_DENIED' ? "RTDB Permission Denied." : "RTDB Fetch Error.");
          })
          .finally(() => {
            if (isMounted) setIsImageLoading(false);
          });
      } else if (plant.imageUrl.startsWith('http')) {
        setImageData(plant.imageUrl);
        setIsImageLoading(false);
      } else {
        setImageData(DEFAULT_PLANT_IMAGE_PLACEHOLDER);
        setImageFetchError("Invalid image URL format.");
        setIsImageLoading(false);
      }
    return () => { isMounted = false; };
  }, [plant.imageUrl, plant.name]);

  // Effect to fetch the latest sensor reading for this specific plant
  useEffect(() => {
    let isMounted = true;
    if (plant.id && firestore) {
      setIsSensorDataLoading(true);
      setSensorDataError(null);
      setLatestSensorData(null);

      const fetchLatestReading = async () => {
        try {
          const readingsRef = collection(firestore, 'sensorReadings');
          const q = query(
            readingsRef,
            where("plantId", "==", plant.id),
            orderBy("timestamp", "desc"),
            limit(1)
          );
          const snapshot = await getDocs(q);
          if (!isMounted) return;

          if (!snapshot.empty) {
            const docData = snapshot.docs[0].data();
            setLatestSensorData({
              timestamp: docData.timestamp instanceof Timestamp ? docData.timestamp.toDate() : new Date(docData.timestamp),
              temp: docData.temperature,
              humidity: docData.humidity,
              ph: docData.ph,
              ec: docData.ec,
              nitrogen: docData.nitrogen,
              phosphorus: docData.phosphorus,
              potassium: docData.potassium,
            });
          } else {
            setLatestSensorData(null);
          }
        } catch (error: any) {
          if (!isMounted) return;
          console.error(`[PlantCard: ${plant.name}] Error fetching latest sensor reading:`, error);
          setSensorDataError("Sensor data unavailable.");
        } finally {
          if (isMounted) setIsSensorDataLoading(false);
        }
      };
      fetchLatestReading();
    } else {
        setIsSensorDataLoading(false);
    }
    return () => { isMounted = false; };
  }, [plant.id, plant.name]);

  const handleImageElementError = () => {
    if (imageData !== ERROR_PLANT_IMAGE_PLACEHOLDER) {
        setImageData(ERROR_PLANT_IMAGE_PLACEHOLDER);
        setImageFetchError("Browser couldn't render image.");
    }
    setIsImageLoading(false);
  };

  const formatDate = (date: Date | undefined): string => {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatSensorValue = (value: number | undefined | null, fixedDigits: number = 1): string => {
    return (typeof value === 'number') ? value.toFixed(fixedDigits) : '-';
  }

  return (
    <Link href={`/plants/${plant.id}`} legacyBehavior>
      <a className="block bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden group aspect-[4/5] sm:aspect-square flex flex-col">
        {/* Image Section - Remains fixed height */}
        <div className="w-full h-32 sm:h-40 bg-gray-200 flex items-center justify-center overflow-hidden relative flex-shrink-0">
          {isImageLoading ? (
            <div className="flex flex-col items-center justify-center text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-xs mt-1">Loading Image...</span>
            </div>
          ) : imageFetchError ? (
            <div className="flex flex-col items-center justify-center text-red-500 p-2 text-center">
              <AlertTriangle className="w-8 h-8 mb-1" />
              <span className="text-xs">{imageFetchError}</span>
            </div>
          ) : imageData ? (
            <img
              src={imageData}
              alt={plant.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={handleImageElementError}
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400 p-2 text-center">
                <ImageOff className="w-10 h-10 mb-1" />
                <span className="text-xs">No Image</span>
            </div>
          )}
        </div>

        {/* Content Section - This is the main content area below the image */}
        <div className="p-3 sm:p-4 flex flex-col flex-grow overflow-hidden"> {/* Added overflow-hidden */}
          {/* Plant Name - Fixed at the top of this content section */}
          <h3 className="font-semibold text-gray-800 truncate text-base group-hover:text-green-700 mb-1 flex-shrink-0" title={plant.name}>
            {plant.name}
          </h3>

          {/* Scrollable container for ALL other details below the name */}
          <div className="flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 pr-1 pb-1"> {/* Added pb-1 for bottom scrollbar spacing */}
            {/* Plant Type */}
            {plant.type && (
              <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider flex items-center">
                <Leaf size={12} className="mr-1.5 text-green-500 flex-shrink-0" /> {plant.type}
              </p>
            )}

            {/* Other Plant Details (date, status, zone) */}
            <div className="text-xs text-gray-600 space-y-0.5 mt-1 mb-2">
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

            {/* Sensor Data Display - Removed max-h from here */}
            <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600 space-y-0.5">
              {isSensorDataLoading ? (
                  <div className="flex items-center text-gray-400 py-2">
                      <Loader2 size={12} className="animate-spin mr-1.5"/> Loading sensor data...
                  </div>
              ) : sensorDataError ? (
                  <div className="flex items-center text-red-500 py-2">
                      <AlertTriangle size={12} className="mr-1.5"/> {sensorDataError}
                  </div>
              ) : latestSensorData ? (
                <>
                  <div className="flex items-center justify-between">
                      <span className="flex items-center"><Thermometer size={12} className="mr-1 text-orange-400"/>Temp:</span>
                      <span className="font-medium">{formatSensorValue(latestSensorData.temp, 1)}°C</span>
                  </div>
                  <div className="flex items-center justify-between">
                      <span className="flex items-center"><Droplets size={12} className="mr-1 text-blue-400"/>Humidity:</span>
                      <span className="font-medium">{formatSensorValue(latestSensorData.humidity, 0)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                      <span className="flex items-center"><TestTube2 size={12} className="mr-1 text-purple-500"/>pH:</span>
                      <span className="font-medium">{formatSensorValue(latestSensorData.ph, 1)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                      <span className="flex items-center"><Zap size={12} className="mr-1 text-yellow-500"/>EC:</span>
                      <span className="font-medium">{formatSensorValue(latestSensorData.ec, 1)} µS/cm</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 mt-1 border-t border-dashed">
                      <span className="flex items-center font-medium"><Atom size={12} className="mr-1 text-gray-500"/>NPK:</span>
                      <span className="space-x-1.5">
                          <span className="text-green-700">N:{formatSensorValue(latestSensorData.nitrogen, 0)}</span>
                          <span className="text-blue-700">P:{formatSensorValue(latestSensorData.phosphorus, 0)}</span>
                          <span className="text-orange-700">K:{formatSensorValue(latestSensorData.potassium, 0)}</span>
                      </span>
                  </div>
                  {latestSensorData.timestamp && <p className="text-right text-gray-400 text-[10px] mt-0.5">As of: {latestSensorData.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
                </>
              ) : (
                <p className="text-gray-400 py-2">No recent sensor data.</p>
              )}
            </div>
          </div>
        </div>
      </a>
    </Link>
  );
};

export default PlantCard;
