'use client';

import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { firestore, auth } from '@/app/lib/firebase/config';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Loader2, AlertTriangle, CheckCircle, DollarSign } from 'lucide-react';

interface ExpenseData {
    description: string;
    amount: number;
    category: string;
    date: any;
    userId: string;

}

interface ExpenseLoggerProps {
    onExpenseAdded?: () => void;
}

const ExpenseLogger: React.FC<ExpenseLoggerProps> = ({ onExpenseAdded }) => {
    const [user] = useAuthState(auth);
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState<number | string>('');
    const [category, setCategory] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

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
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            console.error("Error adding expense:", err);
            setError(err.message || "Failed to save expense.");
        } finally {
            setIsSaving(false); // Reset loading state
        }
    };

    const expenseCategories = ["Labor", "Utilities", "Maintenance", "Supplies", "Rent", "Transport", "Other"];

    return (
        <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">Log New Expense</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
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

                {/* Description Input */}
                <div>
                    <label htmlFor="expenseDescription" className="block text-sm font-medium text-gray-700 mb-1">
                        Description <span className="text-red-500">*</span>
                    </label>
                    <input
                        id="expenseDescription"
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        required
                        disabled={isSaving}
                        className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                        placeholder="e.g., Hired help for weeding, Electricity bill"
                    />
                </div>

                 {/* Amount Input */}
                 <div>
                    <label htmlFor="expenseAmount" className="block text-sm font-medium text-gray-700 mb-1">
                        Amount (PHP) <span className="text-red-500">*</span>
                    </label>
                     <div className="relative">
                         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <DollarSign className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            id="expenseAmount"
                            type="number"
                            min="0.01" // Minimum amount
                            step="0.01" // Allow decimals
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            required
                            disabled={isSaving}
                            className="w-full pl-10 pr-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                            placeholder="e.g., 500.00"
                        />
                     </div>
                </div>

                 {/* Category Select */}
                 <div>
                    <label htmlFor="expenseCategory" className="block text-sm font-medium text-gray-700 mb-1">
                        Category <span className="text-red-500">*</span>
                    </label>
                    <select
                        id="expenseCategory"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        required
                        disabled={isSaving}
                        className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                    >
                        <option value="" disabled>-- Select a category --</option>
                        {expenseCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>

                {/* Submit Button */}
                <div className="flex justify-end pt-2">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Add Expense'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ExpenseLogger;
