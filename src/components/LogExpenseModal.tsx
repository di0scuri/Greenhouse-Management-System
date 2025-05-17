'use client';

import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { firestore, auth } from '@/app/lib/firebase/config';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Loader2, AlertTriangle, CheckCircle, DollarSign, X, FilePlus } from 'lucide-react'; // Added X, FilePlus

interface ExpenseData {
    description: string;
    amount: number;
    category: string;
    date: any;
    userId: string;
}

interface LogExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExpenseAdded?: () => void;
}

const LogExpenseModal: React.FC<LogExpenseModalProps> = ({ isOpen, onClose, onExpenseAdded }) => {
    const [user] = useAuthState(auth);
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState<number | string>('');
    const [category, setCategory] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setDescription('');
            setAmount('');
            setCategory('');
            setError(null);
            setSuccess(null);
            setIsSaving(false);
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (!user) {
            setError("You must be logged in to add expenses.");
            return;
        }

        const numAmount = Number(amount);
        if (!description.trim()) {
            setError("Description is required.");
            return;
        }
        if (isNaN(numAmount) || numAmount <= 0) {
            setError("Please enter a valid positive amount.");
            return;
        }
        if (!category) {
            setError("Please select or enter a category.");
            return;
        }

        setIsSaving(true);
        const expenseData: ExpenseData = {
            description: description.trim(),
            amount: numAmount,
            category: category.trim(),
            date: serverTimestamp(),
            userId: user.uid,
        };

        try {
            const expensesCollectionRef = collection(firestore, 'expenses');
            await addDoc(expensesCollectionRef, expenseData);
            setSuccess("Expense added successfully!");
            setDescription('');
            setAmount('');
            setCategory('');
            if (onExpenseAdded) {
                onExpenseAdded();
            }
            setTimeout(() => {
               onClose();
            }, 1500);

        } catch (err: any) {
            console.error("Error adding expense:", err);
            setError(err.message || "Failed to save expense.");
        } finally {
            setIsSaving(false);
        }
    };


    const expenseCategories = ["Labor", "Utilities", "Maintenance", "Supplies", "Rent", "Transport", "Other"];

    if (!isOpen) return null; 

    return (
        // Modal Backdrop
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 transition-opacity duration-300 ease-in-out animate-fade-in">
            {/* Modal Container */}
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md transform transition-all duration-300 ease-in-out scale-100 animate-slide-up">
                {/* Modal Header */}
                <div className="flex justify-between items-center p-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                        <FilePlus size={20} className="mr-2 text-blue-600" />
                        Log New Expense
                    </h2>
                    <button onClick={onClose} disabled={isSaving} className="text-gray-400 hover:text-gray-600 disabled:opacity-50 rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-gray-400" aria-label="Close modal">
                        <X size={24} />
                    </button>
                </div>

                {/* Modal Body (Form) */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Error Message Display */}
                    {error && (
                        <div role="alert" className="text-sm text-red-700 bg-red-100 p-3 rounded border border-red-300 flex items-center">
                            <AlertTriangle size={16} className="mr-2 flex-shrink-0"/> {error}
                        </div>
                    )}
                    {/* Success Message Display */}
                    {success && (
                        <div role="status" className="text-sm text-green-700 bg-green-100 p-3 rounded border border-green-300 flex items-center">
                            <CheckCircle size={16} className="mr-2 flex-shrink-0"/> {success}
                        </div>
                    )}

                    {/* Description */}
                    <div>
                        <label htmlFor="expenseDescriptionModal" className="block text-sm font-medium text-gray-700 mb-1"> Description <span className="text-red-500">*</span> </label>
                        <input id="expenseDescriptionModal" type="text" value={description} onChange={(e) => setDescription(e.target.value)} required disabled={isSaving} className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100" placeholder="e.g., Hired help for weeding" />
                    </div>

                     {/* Amount */}
                     <div>
                        <label htmlFor="expenseAmountModal" className="block text-sm font-medium text-gray-700 mb-1"> Amount (PHP) <span className="text-red-500">*</span> </label>
                         <div className="relative">
                             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"> <DollarSign className="h-4 w-4 text-gray-400" /> </div>
                            <input id="expenseAmountModal" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required disabled={isSaving} className="w-full pl-10 pr-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100" placeholder="e.g., 500.00" />
                         </div>
                    </div>

                     {/* Category */}
                     <div>
                        <label htmlFor="expenseCategoryModal" className="block text-sm font-medium text-gray-700 mb-1"> Category <span className="text-red-500">*</span> </label>
                        <select id="expenseCategoryModal" value={category} onChange={(e) => setCategory(e.target.value)} required disabled={isSaving} className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100" >
                            <option value="" disabled>-- Select a category --</option>
                            {expenseCategories.map(cat => ( <option key={cat} value={cat}>{cat}</option> ))}
                        </select>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end space-x-3 pt-2">
                        <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 disabled:opacity-50"> Cancel </button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 flex items-center min-w-[120px] justify-center">
                            {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Add Expense'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LogExpenseModal; 
