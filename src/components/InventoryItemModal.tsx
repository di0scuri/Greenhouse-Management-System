'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { InventoryItem } from '@/app/inventory/page'; 
interface InventoryItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (itemData: Partial<InventoryItem>, id?: string) => Promise<void>;
  initialData?: InventoryItem | null; 
  activeCategory: 'Seeds' | 'Fertilizers';
}

const InventoryItemModal: React.FC<InventoryItemModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  activeCategory,
}) => {
  // Form state
  const [name, setName] = useState('');
  const [stock, setStock] = useState<number | string>('');
  const [unit, setUnit] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState<number | string>('');
  const [category, setCategory] = useState<'Seeds' | 'Fertilizers'>(activeCategory);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!initialData; 

  useEffect(() => {
    if (isOpen) {
      if (isEditing && initialData) {
        setName(initialData.name);
        setCategory(initialData.category as 'Seeds' | 'Fertilizers'); 
        setStock(initialData.stock);
        setUnit(initialData.unit);
        setLowStockThreshold(initialData.lowStockThreshold);
      } else {

        setName('');
        setCategory(activeCategory);
        setStock('');
        setUnit(activeCategory === 'Seeds' ? 'Packs' : 'kg');
        setLowStockThreshold('');
      }
      setIsSubmitting(false);
      setError(null);
    }
  }, [isOpen, initialData, isEditing, activeCategory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic validation
    const stockNum = Number(stock);
    const thresholdNum = Number(lowStockThreshold);
    if (!name || !unit || stock === '' || lowStockThreshold === '') {
      setError('Please fill in all required fields.');
      return;
    }
     if (isNaN(stockNum) || isNaN(thresholdNum) || stockNum < 0 || thresholdNum < 0) {
      setError('Stock and Low Stock Threshold must be valid numbers (0 or greater).');
      return;
    }

    setIsSubmitting(true);

    const itemData: Partial<InventoryItem> = {
      name,
      category,
      stock: stockNum,
      unit,
      lowStockThreshold: thresholdNum,
    };

    try {
      await onSubmit(itemData, initialData?.id);
    } catch (err) {
      console.error("Error submitting inventory item:", err);
      setError(err instanceof Error ? err.message : `Failed to ${isEditing ? 'update' : 'add'} item. Please try again.`);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 transition-opacity duration-300 ease-in-out">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg transform transition-all duration-300 ease-in-out scale-100">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">
            {isEditing ? 'Edit Inventory Item' : 'Add New Inventory Item'}
          </h2>
          <button onClick={onClose} disabled={isSubmitting} className="text-gray-400 hover:text-gray-600 disabled:opacity-50" aria-label="Close modal">
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-100 p-2 rounded border border-red-200">{error}</p>}

          {/* Name */}
          <div>
            <label htmlFor="itemName" className="block text-sm font-medium text-gray-700 mb-1">Item Name <span className="text-red-500">*</span></label>
            <input id="itemName" type="text" value={name} onChange={(e) => setName(e.target.value)} required disabled={isSubmitting}
                   className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100" />
          </div>


          <div>
            <label htmlFor="itemCategory" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input id="itemCategory" type="text" value={category} readOnly disabled
                   className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 text-gray-500 sm:text-sm" />
          </div>

          {/* Stock & Unit (inline) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="itemStock" className="block text-sm font-medium text-gray-700 mb-1">Stock <span className="text-red-500">*</span></label>
              <input id="itemStock" type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} required disabled={isSubmitting}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100" />
            </div>
            <div>
              <label htmlFor="itemUnit" className="block text-sm font-medium text-gray-700 mb-1">Unit <span className="text-red-500">*</span></label>
              <input id="itemUnit" type="text" value={unit} onChange={(e) => setUnit(e.target.value)} required disabled={isSubmitting}
                     className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100" placeholder="e.g., Packs, kg, L" />
            </div>
          </div>

          {/* Low Stock Threshold */}
          <div>
            <label htmlFor="itemThreshold" className="block text-sm font-medium text-gray-700 mb-1">Low Stock Threshold <span className="text-red-500">*</span></label>
            <input id="itemThreshold" type="number" min="0" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} required disabled={isSubmitting}
                   className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100" />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} disabled={isSubmitting}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:opacity-50 flex items-center min-w-[110px] justify-center">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEditing ? 'Update Item' : 'Add Item')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InventoryItemModal;

