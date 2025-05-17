'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, X } from 'lucide-react'; 

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (eventData: NewEventData) => Promise<void>;
  initialDate?: Date | null;
}


export interface NewEventData {
  message: string;
  type: string;
  dateTime: string;
  plantId?: string;
}

const AddEventModal: React.FC<AddEventModalProps> = ({ isOpen, onClose, onSubmit, initialDate }) => {
  const [message, setMessage] = useState('');
  const [type, setType] = useState('SCHEDULED_TASK'); 
  const formatDateTimeLocal = (date: Date | null | undefined): string => {
    if (!date) return '';
    const adjustedDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return adjustedDate.toISOString().slice(0, 16);

  };
  const [dateTime, setDateTime] = useState<string>(formatDateTimeLocal(initialDate) || '');
  const [plantId, setPlantId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setType('SCHEDULED_TASK');
      setDateTime(formatDateTimeLocal(initialDate) || formatDateTimeLocal(new Date())); 
      setPlantId('');
      setIsSubmitting(false);
      setError(null);
    }
  }, [isOpen, initialDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message || !dateTime || !type) {
      setError('Please fill in all required fields (Message, Date/Time, Type).');
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        message,
        type,
        dateTime,
        plantId: plantId || undefined, 
      });
    } catch (err) {
      console.error("Error submitting event:", err);
      setError(err instanceof Error ? err.message : "Failed to add event. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 transition-opacity duration-300 ease-in-out">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md transform transition-all duration-300 ease-in-out scale-100">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Add New Event/Task</h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
             <div className="text-sm text-red-700 bg-red-100 p-3 rounded-md border border-red-200">
                {error}
             </div>
           )}

          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
              Message / Task Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100"
              placeholder="e.g., Apply fertilizer (10-10-10)"
            />
          </div>

          <div>
            <label htmlFor="dateTime" className="block text-sm font-medium text-gray-700 mb-1">
              Date & Time <span className="text-red-500">*</span>
            </label>
            <input
              id="dateTime"
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100"
            />
          </div>

           <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
              Type <span className="text-red-500">*</span>
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-gray-700 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm bg-white disabled:bg-gray-100"
            >
              <option value="SCHEDULED_TASK">Scheduled Task</option>
              <option value="OBSERVATION">Observation</option>
              <option value="LOG">Log</option>
              <option value="ALERT">Alert</option>
            </select>
          </div>

          <div>
            <label htmlFor="plantId" className="block text-sm font-medium text-gray-700 mb-1">
              Associated Plant ID (Optional)
            </label>
            <input
              id="plantId"
              type="text"
              value={plantId}
              onChange={(e) => setPlantId(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent sm:text-sm disabled:bg-gray-100"
              placeholder="Enter Plant ID if applicable"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:opacity-50 flex items-center min-w-[100px] justify-center" // Added min-width and justify-center
            >
              {isSubmitting ? (
                 <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Add Event'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddEventModal;
