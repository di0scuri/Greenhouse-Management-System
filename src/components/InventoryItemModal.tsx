'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';

import { InventoryItem as BaseInventoryItem } from '@/app/inventory/page'; // Adjust path if needed

interface InventoryItem extends BaseInventoryItem {
  n_percentage?: number;
  p_percentage?: number;
  k_percentage?: number;
  category: 'seeds' | 'fertilizers' | 'other' | string;
}


interface InventoryItemModalProps {
  isOpen: boolean;
  onClose: () => void; 
  onSubmit: (itemData: Partial<InventoryItem>, id?: string) => Promise<void>;
  initialData?: InventoryItem | null;
  activeCategory: 'Seeds' | 'Fertilizers' | 'Other';
}

const InventoryItemModal: React.FC<InventoryItemModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  activeCategory,
}) => {
  // --- State Variables ---
  const [name, setName] = useState('');
  const [stock, setStock] = useState<number | string>('');
  const [unit, setUnit] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState<number | string>('');
  const [lowStockThreshold, setLowStockThreshold] = useState<number | string>('');
  const [category, setCategory] = useState<'Seeds' | 'Fertilizers' | 'Other'>(activeCategory);

  const [nPercentage, setNPercentage] = useState<number | string>('');
  const [pPercentage, setPPercentage] = useState<number | string>('');
  const [kPercentage, setKPercentage] = useState<number | string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!initialData;

  useEffect(() => {
    if (isOpen) {
      if (isEditing && initialData) {
        setName(initialData.name);

        const initialItemCategory = initialData.category?.toLowerCase();
        let currentCategoryState: 'Seeds' | 'Fertilizers' | 'Other' = activeCategory;
        if (initialItemCategory === 'seeds') currentCategoryState = 'Seeds';
        else if (initialItemCategory === 'fertilizers') currentCategoryState = 'Fertilizers';
        else if (initialItemCategory === 'other') currentCategoryState = 'Other';
        else if (initialData.category === 'Seeds' || initialData.category === 'Fertilizers' || initialData.category === 'Other') {
            currentCategoryState = initialData.category;
        }
        setCategory(currentCategoryState);

        setStock(initialData.stock);
        setUnit(initialData.unit);
        setPricePerUnit(initialData.pricePerUnit ?? '');
        setLowStockThreshold(initialData.lowStockThreshold ?? '');

        if (currentCategoryState === 'Fertilizers') {
          setNPercentage(initialData.n_percentage ?? '');
          setPPercentage(initialData.p_percentage ?? '');
          setKPercentage(initialData.k_percentage ?? '');

        } else {
          setNPercentage('');
          setPPercentage('');
          setKPercentage('');
        }
      } else {
        setName('');
        setCategory(activeCategory);
        setStock('');
        setUnit(activeCategory === 'Seeds' ? 'packs' : activeCategory === 'Fertilizers' ? 'kg' : 'units');
        setPricePerUnit('');
        setLowStockThreshold('');
        setNPercentage('');
        setPPercentage('');
        setKPercentage('');
      }
      setIsSubmitting(false);
      setError(null);
    }
  }, [isOpen, initialData, isEditing, activeCategory]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const stockNum = Number(stock);
    const thresholdNum = Number(lowStockThreshold);
    const priceNum = Number(pricePerUnit);
    const nNum = Number(nPercentage);
    const pNum = Number(pPercentage);
    const kNum = Number(kPercentage);

    if (!name.trim() || !unit.trim() || stock === '' || pricePerUnit === '' || lowStockThreshold === '') {
      setError('Please fill in all required fields (*).');
      return;
    }
    if (isNaN(stockNum) || isNaN(thresholdNum) || isNaN(priceNum)) {
      setError('Stock, Price/Unit, and Low Stock Threshold must be valid numbers.');
      return;
    }
    if (stockNum < 0 || thresholdNum < 0 || priceNum < 0) {
      setError('Stock, Price/Unit, and Low Stock Threshold cannot be negative.');
      return;
    }
    if (category === 'Fertilizers') {
      if (nPercentage === '' || pPercentage === '' || kPercentage === '') {
        setError('N, P, K percentages are required for fertilizers.'); return;
      }
      if (isNaN(nNum) || isNaN(pNum) || isNaN(kNum)) {
        setError('N, P, K percentages must be valid numbers.');
        return;
      }
      if (nNum < 0 || pNum < 0 || kNum < 0) {
        setError('N, P, K percentages cannot be negative.');
        return;
      }
    }

    setIsSubmitting(true);
    const itemData: Partial<InventoryItem> = {
      name: name.trim(),
      category: category.toLowerCase(),
      stock: stockNum,
      unit: unit.trim(),
      pricePerUnit: priceNum,
      lowStockThreshold: thresholdNum,
    };

    if (category === 'Fertilizers') {
      itemData.n_percentage = nNum;
      itemData.p_percentage = pNum;
      itemData.k_percentage = kNum;
    }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 transition-opacity duration-300 ease-in-out animate-fade-in">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg transform transition-all duration-300 ease-in-out scale-100 animate-slide-up">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">
            {isEditing ? 'Edit Inventory Item' : `Add New ${category}`}
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

        {/* Modal Body (Form) */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div role="alert" className="text-sm text-red-700 bg-red-100 p-3 rounded border border-red-300">
              <p><span className="font-semibold">Error:</span> {error}</p>
            </div>
          )}

          {/* Item Name Input */}
          <div>
            <label htmlFor="itemNameModal" className="block text-sm font-medium text-gray-700 mb-1">
              Item Name <span className="text-red-500">*</span>
            </label>
            <input
              id="itemNameModal"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder={`e.g., ${category === 'Seeds' ? 'Tomato Seeds' : category === 'Fertilizers' ? 'Urea Fertilizer' : 'Shovel'}`}
            />
          </div>

          {/* Category Display (Read-only) */}
          <div>
            <label htmlFor="itemCategoryModal" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input
              id="itemCategoryModal"
              type="text"
              value={category}
              readOnly
              disabled 
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 text-gray-500 sm:text-sm cursor-not-allowed"
            />
          </div>

          {/* NPK Inputs (Conditional for Fertilizers) */}
          {category === 'Fertilizers' && (
            <div className="p-4 border border-blue-200 rounded-md bg-blue-50">
              <h4 className="text-md font-semibold text-blue-800 mb-3">NPK Content (%)</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="nPercentage" className="block text-xs font-medium text-gray-700 mb-1">
                    N (%) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="nPercentage" type="number" min="0" max="100" step="0.1"
                    value={nPercentage} onChange={(e) => setNPercentage(e.target.value)}
                    required={category === 'Fertilizers'} disabled={isSubmitting}
                    className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="e.g., 10"
                  />
                </div>
                <div>
                  <label htmlFor="pPercentage" className="block text-xs font-medium text-gray-700 mb-1">
                    P (%) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="pPercentage" type="number" min="0" max="100" step="0.1"
                    value={pPercentage} onChange={(e) => setPPercentage(e.target.value)}
                    required={category === 'Fertilizers'} disabled={isSubmitting}
                    className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="e.g., 10"
                  />
                </div>
                <div>
                  <label htmlFor="kPercentage" className="block text-xs font-medium text-gray-700 mb-1">
                    K (%) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="kPercentage" type="number" min="0" max="100" step="0.1"
                    value={kPercentage} onChange={(e) => setKPercentage(e.target.value)}
                    required={category === 'Fertilizers'} disabled={isSubmitting}
                    className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="e.g., 10"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Stock & Unit Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="itemStockModal" className="block text-sm font-medium text-gray-700 mb-1">
                Stock <span className="text-red-500">*</span>
              </label>
              <input
                id="itemStockModal" type="number" min="0"
                value={stock} onChange={(e) => setStock(e.target.value)}
                required disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="e.g., 100"
              />
            </div>
            <div>
              <label htmlFor="itemUnitModal" className="block text-sm font-medium text-gray-700 mb-1">
                Unit <span className="text-red-500">*</span>
              </label>
              <input
                id="itemUnitModal" type="text"
                value={unit} onChange={(e) => setUnit(e.target.value)}
                required disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="e.g., packs, kg, units"
              />
            </div>
          </div>

          {/* Price Per Unit Input */}
          <div>
            <label htmlFor="itemPriceModal" className="block text-sm font-medium text-gray-700 mb-1">
              Price / Unit (PHP) <span className="text-red-500">*</span>
            </label>
            <input
              id="itemPriceModal" type="number" min="0" step="0.01"
              value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)}
              required disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="e.g., 50.75"
            />
          </div>

          {/* Low Stock Threshold Input */}
          <div>
            <label htmlFor="itemThresholdModal" className="block text-sm font-medium text-gray-700 mb-1">
              Low Stock Threshold <span className="text-red-500">*</span>
            </label>
            <input
              id="itemThresholdModal" type="number" min="0"
              value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)}
              required disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="e.g., 10"
            />
            <p className="text-xs text-gray-500 mt-1">Notify when stock falls below this number.</p>
          </div>

          {/* Action Buttons */}
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
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center min-w-[110px] justify-center"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEditing ? 'Update Item' : 'Add Item')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InventoryItemModal;