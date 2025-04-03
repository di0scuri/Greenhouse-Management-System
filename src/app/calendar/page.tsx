// src/app/calendar/page.tsx

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import { EventClickArg, EventContentArg } from '@fullcalendar/core';
import { collection, getDocs, query, orderBy, Timestamp, addDoc, serverTimestamp } from 'firebase/firestore';
import { firestore, auth } from '@/app/lib/firebase/config';
import { useAuthState } from 'react-firebase-hooks/auth';
import Sidebar from '@/components/Sidebar';
import AddEventModal, { NewEventData } from '@/components/AddEventModal';
import {
  Loader2,
  AlertTriangle,
  Calendar as CalendarIcon,
  Menu,
  X,
  Plus,
  Search as SearchIcon,
} from 'lucide-react';

interface EventData {
  id: string;
  timestamp: Date;
  type: string;
  severity?: string;
  message: string;
  plantId?: string;
  userId?: string;
  status?: string;
  acknowledged?: boolean;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  allDay?: boolean;
  extendedProps?: {
    type: string;
    severity?: string;
    plantId?: string;
    userId?: string;
    status?: string;
    acknowledged?: boolean;
  };
  color?: string;
}

export default function CalendarPage() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDateForModal, setSelectedDateForModal] = useState<Date | null>(null);
  const [user, loadingAuth, errorAuth] = useAuthState(auth); 


  useEffect(() => {
   
    if (errorAuth) {
      console.error("Authentication error:", errorAuth);
      setError("Authentication failed. Please try logging in again.");
    }
  }, [user, loadingAuth, errorAuth]);

  
  useEffect(() => {
    
    if (!firestore || loadingAuth) return;

    const fetchAndFormatEvents = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const eventsCollectionRef = collection(firestore, 'events');

        const q = query(eventsCollectionRef, orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);

        const formattedEvents: CalendarEvent[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const timestamp = data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date();
          let eventColor = '#3B82F6';
          if (data.type === 'SCHEDULED_TASK') { eventColor = data.status === 'completed' ? '#84cc16' : '#facc15'; }
          else if (data.type?.startsWith('ALERT')) { eventColor = '#ef4444'; }
          else if (data.type?.startsWith('LOG')) { eventColor = '#6b7280'; }

          formattedEvents.push({
            id: doc.id,
            title: data.message || 'No description',
            start: timestamp,
            allDay: data.allDay ?? false, 
            extendedProps: {
              type: data.type || 'Unknown',
              severity: data.severity,
              plantId: data.plantId,
              userId: data.userId,
              status: data.status,
              acknowledged: data.acknowledged,
            },
            color: eventColor,
          });
        });
        setAllEvents(formattedEvents);
      } catch (err: any) {
          console.error("Error fetching events:", err);
          if (err.code === 'permission-denied') { setError("Permission denied fetching events."); }
          else if (err.code === 'unimplemented' || err.code === 'failed-precondition') { setError("Database query error (index missing?)."); }
          else { setError("Failed to load events."); }
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndFormatEvents();

  }, [firestore, user, loadingAuth]); // Add user and loadingAuth to dependencies

  // Filter events based on search term
  const filteredEvents = useMemo(() => {
    if (!searchTerm) { return allEvents; }
    const lowerCaseSearch = searchTerm.toLowerCase();
    return allEvents.filter(event =>
      event.title.toLowerCase().includes(lowerCaseSearch) ||
      event.extendedProps?.type?.toLowerCase().includes(lowerCaseSearch) ||
      event.extendedProps?.plantId?.toLowerCase().includes(lowerCaseSearch) ||
      event.extendedProps?.status?.toLowerCase().includes(lowerCaseSearch)
    );
  }, [allEvents, searchTerm]);

  // --- Handlers ---
  const handleDateClick = (arg: DateClickArg) => {
    setSelectedDateForModal(arg.date);
    setIsModalOpen(true);
  };

  const handleEventClick = (arg: EventClickArg) => {
    console.log('Event clicked:', arg.event);
    // Replace alert with a detail modal later
    alert(`Event Details:\n
           Title: ${arg.event.title}\n
           Time: ${arg.event.start?.toLocaleString() ?? 'N/A'}\n
           Type: ${arg.event.extendedProps?.type}\n
           Status: ${arg.event.extendedProps?.status ?? 'N/A'}\n
           Plant ID: ${arg.event.extendedProps?.plantId ?? 'N/A'}`);
  };

  // Function to handle creating a new event in Firestore
  const handleCreateEvent = async (newEventData: NewEventData) => {
    if (!user) { throw new Error("You must be logged in to add an event."); }
    if (!firestore) { throw new Error("Database service unavailable."); }

    try {
      const eventsCollectionRef = collection(firestore, 'events');
      const eventTimestamp = Timestamp.fromDate(new Date(newEventData.dateTime));

      // Add the new document to Firestore
      const docRef = await addDoc(eventsCollectionRef, {
        message: newEventData.message,
        type: newEventData.type,
        timestamp: eventTimestamp,
        plantId: newEventData.plantId || null,
        userId: user.uid, // Associate event with the logged-in user
        status: newEventData.type === 'SCHEDULED_TASK' ? 'pending' : null, // Default 'pending' for tasks
        createdAt: serverTimestamp(),
        acknowledged: false,
        severity: newEventData.type.startsWith('ALERT') ? 'warning' : null, // Example default severity for alerts
        allDay: newEventData.allDay ?? false, // Store allDay boolean
      });

      // Optimistic UI update: Create the event object for the calendar
      const newCalendarEvent: CalendarEvent = {
        id: docRef.id,
        title: newEventData.message,
        start: eventTimestamp.toDate(),
        allDay: newEventData.allDay ?? false,
        extendedProps: {
          type: newEventData.type,
          plantId: newEventData.plantId || undefined,
          userId: user.uid,
          status: newEventData.type === 'SCHEDULED_TASK' ? 'pending' : undefined,
          acknowledged: false,
          severity: newEventData.type.startsWith('ALERT') ? 'warning' : undefined,
        },
        color: newEventData.type === 'SCHEDULED_TASK' ? '#facc15' : (newEventData.type?.startsWith('ALERT') ? '#ef4444' : (newEventData.type?.startsWith('LOG') ? '#6b7280' : '#3B82F6')),
      };

      // Update local state, maintaining sort order (descending by start time)
      setAllEvents(prevEvents => [...prevEvents, newCalendarEvent].sort((a, b) => b.start.getTime() - a.start.getTime()));
      setIsModalOpen(false); // Close modal on success

    } catch (error) {
      console.error("Error adding document: ", error);
      throw new Error("Failed to save event to the database."); // Propagate error to the modal
    }
  };
  // --- End of Handlers ---

  // --- Custom Event Rendering Function (for event text color) ---
  const renderEventContent = (eventInfo: EventContentArg) => {
    return (
      // Apply desired text color (e.g., text-gray-700 or text-gray-900 for better contrast on light backgrounds)
      <div className="text-gray-900 px-1 overflow-hidden whitespace-nowrap text-xs">
        {/* Display time only if not an all-day event and timeText exists */}
        {!eventInfo.event.allDay && eventInfo.timeText && (
           <b className="mr-1">{eventInfo.timeText}</b>
        )}
        {/* Display event title */}
        <span className="fc-event-title-wrap">{eventInfo.event.title}</span>
      </div>
    );
  };
  // --- End Custom Rendering ---

  // --- Loading / Auth States ---
  if (loadingAuth) {
      return <div className="flex h-screen items-center justify-center"> <Loader2 className="h-8 w-8 animate-spin mr-3" /> Authenticating...</div>;
  }
  // Don't render calendar if user is definitely not logged in (and not loading)
  // if (!user && !loadingAuth) {
  //    return <div className="flex h-screen items-center justify-center text-red-600">Please log in to view the calendar.</div>;
  // }


  // --- Render Page ---
  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* Sidebar */}
      <div className="hidden lg:block lg:flex-shrink-0"> <Sidebar /> </div>
      {/* Mobile Sidebar & Overlay */}
      {isMobileMenuOpen && (
        <>
          <div className="fixed inset-y-0 left-0 z-40 lg:hidden"> <Sidebar /> </div>
          <div className="fixed inset-0 z-30 bg-black opacity-50 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
        </>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm relative z-10 border-b">
          <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Left Side */}
              <div className="flex items-center">
                <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden mr-4 p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100" aria-label={isMobileMenuOpen ? "Close sidebar" : "Open sidebar"}>
                  {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
                <h1 className="text-xl font-semibold text-gray-800 flex items-center">
                  <CalendarIcon className="h-6 w-6 mr-2 text-green-600" />
                  Calendar & Events
                </h1>
              </div>
              {/* Right Side */}
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="h-5 w-5 text-gray-400" aria-hidden="true" /></span>
                  <input type="text" placeholder="Search events..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-300 text-gray-700 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm" />
                </div>
                {/* Only show Add Event button if logged in */}
                {user && (
                    <button onClick={() => { setSelectedDateForModal(null); setIsModalOpen(true); }} className="flex items-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 text-sm font-medium">
                      <Plus size={18} className="mr-1" /> Add Event
                    </button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* FullCalendar View */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-gray-50">
          <div className="bg-white rounded-lg shadow p-4 h-full flex flex-col">
            {/* Show main loading indicator only for initial event fetch */}
            {isLoading && !allEvents.length ? ( // Check if loading AND no events yet
              <div className="flex justify-center items-center flex-1 text-gray-500">
                <Loader2 className="h-8 w-8 animate-spin mr-3" /> <span>Loading Calendar & Events...</span>
              </div>
            ) : error ? ( // Show error if exists
              <div className="flex flex-col justify-center items-center flex-1 text-red-600 text-center p-4">
                <AlertTriangle className="h-8 w-8 mb-2" /> <span className="font-semibold">Error Loading Calendar</span> <span className="text-sm">{error}</span>
              </div>
            ) : ( // Render calendar once loading is done or if events are already populated
              <div className="flex-1 min-h-0">
                <FullCalendar
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                  initialView="timeGridWeek"
                  headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
                  events={filteredEvents} // Use memoized/filtered events
                  height="100%" // Fill container height
                  locale="en" // Set language
                  firstDay={1} // Start week on Monday
                  dateClick={handleDateClick}
                  eventClick={handleEventClick}
                  selectable={true} // Allow date/time selection
                  eventContent={renderEventContent} // Use custom function for event content styling
                  // Consider adding loading state indicator for background fetches
                  // loading={(bool) => { console.log("FC loading:", bool); /* Update a subtle loading state maybe? */ }}
                  nowIndicator={true} // Show the current time indicator
                />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Render the Add Event Modal (conditionally if needed based on auth) */}
      {user && (
        <AddEventModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleCreateEvent}
          initialDate={selectedDateForModal}
        />
      )}
    </div>
  );
}