'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2, MinusCircle } from 'lucide-react';

export interface InventoryItem {
  id: string;
  name: string;
  stock: number;
  unit: string;
  category: string;

}

interface UseItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem;
  onSubmit: (item: InventoryItem, quantityUsed: number, notes?: string, plantId?: string) => Promise<void>;
  plants?: Array<{id: string, name: string}>;
}


const UseItemModal: React.FC<UseItemModalProps> = ({
  isOpen,
  onClose,
  item,
  onSubmit,
  plants = [],
}) => {
  const [quantityUsed, setQuantityUsed] = useState<number | string>(1);
  const [notes, setNotes] = useState('');
  const [linkedPlantId, setLinkedPlantId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuantityUsed(1);
      setNotes('');
      setLinkedPlantId('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, item]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const numQuantity = Number(quantityUsed);

    if (isNaN(numQuantity) || numQuantity <= 0) {
      setError('Please enter a valid positive quantity.');
      return;
    }
    if (numQuantity > item.stock) {
      setError(`Quantity cannot exceed available stock (${item.stock} ${item.unit}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(item, numQuantity, notes.trim(), linkedPlantId || undefined);
    } catch (err: any) {
      console.error("Error submitting usage:", err);
      setError(err.message || "Failed to record usage.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 transition-opacity duration-300 ease-in-out animate-fade-in">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md transform transition-all duration-300 ease-in-out scale-100 animate-slide-up">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center">
            <MinusCircle size={20} className="mr-2 text-yellow-600" />
            Use Inventory Item
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div role="alert" className="text-sm text-red-700 bg-red-100 p-3 rounded border border-red-300">
              <p><span className="font-semibold">Error:</span> {error}</p>
            </div>
          )}

          <div className="p-3 bg-gray-50 border rounded-md space-y-1">
            <p className="text-lg font-medium text-gray-800">{item.name}</p>
            <p className="text-sm text-gray-600">
              Current Stock: <span className="font-semibold">{item.stock.toLocaleString()}</span> {item.unit}
            </p>
            <p className="text-xs text-gray-500">Category: {item.category}</p>
          </div>

          <div>
            <label htmlFor="quantityUsed" className="block text-sm font-medium text-gray-700 mb-1">
              Quantity Used <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center">
              <input
                id="quantityUsed"
                type="number"
                min="1"
                max={item.stock}
                step="any"
                value={quantityUsed}
                onChange={(e) => setQuantityUsed(e.target.value)}
                required
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="e.g., 5"
              />
              <span className="ml-2 text-sm text-gray-600 flex-shrink-0">{item.unit}</span>
            </div>
          </div>

          <div>
            <label htmlFor="linkPlant" className="block text-sm font-medium text-gray-700 mb-1">Link to Plant (Optional)</label>
            <select
              id="linkPlant"
              value={linkedPlantId}
              onChange={(e) => setLinkedPlantId(e.target.value)}
              disabled={isSubmitting || plants.length === 0}
              className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">-- Select Plant --</option>
              {plants.map(plant => (
                <option key={plant.id} value={plant.id}>{plant.name}</option>
              ))}
            </select>
            {plants.length === 0 && <p className="text-xs text-gray-500 mt-1">No plants available to link.</p>}
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100"
              placeholder="e.g., Applied to Zone 1, Used for pest control..."
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
              className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center min-w-[120px] justify-center"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Record Usage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UseItemModal;