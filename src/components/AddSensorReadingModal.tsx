'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2, Thermometer, Droplets, TestTube2, Zap, Atom, Activity } from 'lucide-react'; // Added Activity here

export interface SensorReadingData {
  temperature?: number | string;
  humidity?: number | string;
  ph?: number | string;
  ec?: number | string;
  nitrogen?: number | string;
  phosphorus?: number | string;
  potassium?: number | string;
  notes?: string;
}

interface AddSensorReadingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: SensorReadingData) => Promise<void>;
  plantName: string;
}

const AddSensorReadingModal: React.FC<AddSensorReadingModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  plantName,
}) => {
  const [formData, setFormData] = useState<SensorReadingData>({
    temperature: '', humidity: '', ph: '', ec: '',
    nitrogen: '', phosphorus: '', potassium: '', notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        temperature: '', humidity: '', ph: '', ec: '',
        nitrogen: '', phosphorus: '', potassium: '', notes: ''
      });
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const hasAtLeastOneValue = Object.values(formData).some(val =>
        typeof val === 'string' ? val.trim() !== '' : typeof val === 'number'
    );
    if (!hasAtLeastOneValue && !formData.notes?.trim()) {
        setError("Please enter at least one sensor reading or a note.");
        return;
    }

    const processedData: SensorReadingData = {};
    for (const key in formData) {
        const value = formData[key as keyof SensorReadingData];
        if (typeof value === 'string' && value.trim() === '') {
            processedData[key as keyof SensorReadingData] = undefined;
        } else if (key !== 'notes' && typeof value === 'string') {
            const numValue = parseFloat(value);
            if (isNaN(numValue)) {
                setError(`Invalid number for ${key}.`);
                return;
            }
            processedData[key as keyof SensorReadingData] = numValue;
        } else if (key === 'notes') {
            processedData.notes = typeof value === 'string' ? value.trim() : undefined;
        } else {
            processedData[key as keyof SensorReadingData] = value as number | undefined;
        }
    }
    if (processedData.notes === '') {
        delete processedData.notes;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(processedData);
      // onClose(); // Parent handles closing
    } catch (err: any) {
      console.error("Error submitting sensor reading:", err);
      setError(err.message || "Failed to add sensor reading.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const inputFields: Array<{ name: keyof SensorReadingData, label: string, icon: React.ElementType, unit?: string, type?: string, step?: string }> = [
    { name: 'temperature', label: 'Temperature', icon: Thermometer, unit: '°C', type: 'number', step: '0.1' },
    { name: 'humidity', label: 'Humidity', icon: Droplets, unit: '%', type: 'number', step: '0.1' },
    { name: 'ph', label: 'pH', icon: TestTube2, type: 'number', step: '0.01' },
    { name: 'ec', label: 'EC (Electrical Conductivity)', icon: Zap, unit: 'µS/cm', type: 'number', step: '0.1' },
    { name: 'nitrogen', label: 'Nitrogen (N)', icon: Atom, unit: 'ppm', type: 'number', step: '0.1' },
    { name: 'phosphorus', label: 'Phosphorus (P)', icon: Atom, unit: 'ppm', type: 'number', step: '0.1' },
    { name: 'potassium', label: 'Potassium (K)', icon: Atom, unit: 'ppm', type: 'number', step: '0.1' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 transition-opacity duration-300 ease-in-out animate-fade-in">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg transform transition-all duration-300 ease-in-out scale-100 animate-slide-up">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center">
            <Activity size={20} className="mr-2 text-blue-600" /> {/* Activity icon is used here */}
            Add Sensor Reading for {plantName}
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-gray-400"
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div role="alert" className="text-sm text-red-700 bg-red-100 p-3 rounded border border-red-300">
              <p><span className="font-semibold">Error:</span> {error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {inputFields.map(field => (
              <div key={field.name}>
                <label htmlFor={field.name} className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                  <field.icon size={14} className="mr-1.5 text-gray-500" /> {field.label}
                </label>
                <div className="flex items-center">
                  <input
                    id={field.name}
                    name={field.name}
                    type={field.type || "text"}
                    step={field.step || "any"}
                    value={formData[field.name] || ''}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100"
                    placeholder={field.unit ? `e.g., 25 (${field.unit})` : "Enter value"}
                  />
                  {field.unit && <span className="ml-2 text-sm text-gray-500 whitespace-nowrap">{field.unit}</span>}
                </div>
              </div>
            ))}
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              value={formData.notes || ''}
              onChange={handleChange}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100"
              placeholder="e.g., Readings taken after watering, observed slight wilting..."
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center min-w-[120px] justify-center"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Readings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddSensorReadingModal;
