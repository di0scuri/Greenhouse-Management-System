'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, CalendarDays, LineChart, Settings, User, Bell, Search,
  Menu, X, Loader2, AlertTriangle, Plus, Leaf, ImageOff,
  Clock, ListChecks, DollarSign, TrendingUp, TrendingDown, Filter, Inbox, BarChart3, ChevronDown
} from 'lucide-react';

import {
    collection, getDocs, query, where, orderBy,
    Timestamp,
    limit,
} from 'firebase/firestore';
import { firestore, auth } from '@/app/lib/firebase/config';
import { useAuthState } from 'react-firebase-hooks/auth';

import Sidebar from '@/components/Sidebar';
import NpkChart, { NpkDataPoint } from '@/components/NpkChart';
import LoadingSpinner from '@/components/LoadingSpinner';

// --- Interfaces ---
interface EventDisplayData {
  id: string;
  timestamp: Date;
  type: string;
  message: string;
  plantId?: string;
  status?: string;
}

interface FinancialLogEntry {
  id: string;
  timestamp: Date;
  type: 'Purchase' | 'Seed Planted' | 'Fertilizer Used' | 'Material Used' | 'Sale' | 'Adjustment' | 'Initial Stock' | string;
  quantityChange: number;
  costOrValuePerUnit: number;
  totalCostOrValue?: number;
  itemName?: string;
  unit?: string;
  userId?: string;
}

interface SummaryData {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    roi: number;
}

type FinancialPeriod = 'all_time' | 'this_year' | 'this_month' | 'this_week' | 'today';

// Helper function to format currency
const formatCurrency = (value: number, withSign = false): string => {
  const sign = value < 0 ? '-' : (withSign && value > 0 ? '+' : '');
  if (value === 0 && value !== null && value !== undefined && !withSign) return '₱0.00';
  if (isNaN(value) || value === null || value === undefined) return 'N/A';
  return sign + new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
};


export default function DashboardPage() {
  const [user, loadingAuth, errorAuth] = useAuthState(auth);
  const router = useRouter();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [npkData, setNpkData] = useState<NpkDataPoint[]>([]);
  const [isNpkLoading, setIsNpkLoading] = useState<boolean>(true);
  const [npkError, setNpkError] = useState<string | null>(null);

  const [upcomingEvents, setUpcomingEvents] = useState<EventDisplayData[]>([]);
  const [isEventsLoading, setIsEventsLoading] = useState<boolean>(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const [summaryData, setSummaryData] = useState<SummaryData>({ totalRevenue: 0, totalExpenses: 0, netProfit: 0, roi: 0 });
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [selectedFinancialPeriod, setSelectedFinancialPeriod] = useState<FinancialPeriod>('this_month');


  useEffect(() => {
    if (!loadingAuth && !user && !errorAuth) { router.push('/login'); }
    if (!loadingAuth && errorAuth) {
      console.error("Authentication Error on Dashboard:", errorAuth);
      router.push('/login');
    }
  }, [user, loadingAuth, errorAuth, router]);

  // fetch NPK data
  useEffect(() => {
    if (user && firestore) {
        const fetchNpkData = async () => {
            setIsNpkLoading(true); setNpkError(null);
            try {
                const npkCollectionRef = collection(firestore, 'npkData');
                const q = query(npkCollectionRef, orderBy("name", "asc"), limit(50));
                const querySnapshot = await getDocs(q);
                const data: NpkDataPoint[] = [];
                querySnapshot.forEach((docSnap) => {
                    const docData = docSnap.data();
                    data.push({
                        name: typeof docData.name === 'string' ? docData.name : `Data ${docSnap.id.substring(0, 4)}`,
                        n: typeof docData.n === 'number' ? docData.n : 0,
                        p: typeof docData.p === 'number' ? docData.p : 0,
                        k: typeof docData.k === 'number' ? docData.k : 0
                    });
                });
                setNpkData(data);
            } catch (error: any) {
                console.error("Error fetching NPK data:", error);
                setNpkError(`Failed to load NPK data. ${error.message}`);
            } finally {
                setIsNpkLoading(false);
            }
        };
        fetchNpkData();
    } else {
        setIsNpkLoading(false);
        if (!firestore && !loadingAuth) setNpkError("Firestore service not available.");
    }
  }, [user, firestore, loadingAuth]);

  // fetch upcoming events
  useEffect(() => {
    const fetchUpcomingEvents = async () => {
        if (!user || !firestore) {
            setUpcomingEvents([]);
            setIsEventsLoading(false);
            return;
        }
        setIsEventsLoading(true); setEventsError(null);
        try {
            const now = Timestamp.now();
            const eventsRef = collection(firestore, 'events');
            const q = query(
                eventsRef,
                where("userId", "==", user.uid),
                where("timestamp", ">=", now),
                orderBy("timestamp", "asc"),
                limit(5)
            );
            const querySnapshot = await getDocs(q);
            const fetchedEvents: EventDisplayData[] = [];
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                fetchedEvents.push({
                    id: docSnap.id,
                    timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp),
                    type: data.type || 'Unknown',
                    message: data.message || 'No description',
                    plantId: data.plantId,
                    status: data.status,
                });
            });
            setUpcomingEvents(fetchedEvents);
        } catch (err: any) {
            console.error("Error fetching upcoming events:", err);
            if (err.code === 'permission-denied') { setEventsError(`Permission denied for 'events'.`); }
            else if (err.code === 'unimplemented' || err.code === 'failed-precondition' || err.message.toLowerCase().includes('index')) {
                 setEventsError(`Index needed for events query. Check console.`);
                 console.error("Firestore Indexing Error: Create a composite index for 'events' (userId ASC, timestamp ASC).");
            } else { setEventsError(`Failed to load upcoming events. ${err.message}`); }
        } finally { setIsEventsLoading(false); }
    };
    if (!loadingAuth && user && firestore) { fetchUpcomingEvents(); }
  }, [user, loadingAuth, firestore]);

  // fetch and calculate financial summary data
  useEffect(() => {
    if (user && firestore) {
        const fetchSummaryData = async () => {
            console.log(`[Dashboard] Fetching financial summary for period: ${selectedFinancialPeriod}`);
            setIsSummaryLoading(true);
            setSummaryError(null);
            setSummaryData({ totalRevenue: 0, totalExpenses: 0, netProfit: 0, roi: 0 });

            let startDateTimestamp: Timestamp | null = null;
            const now = new Date();

            switch (selectedFinancialPeriod) {
                case 'today':
                    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                    startDateTimestamp = Timestamp.fromDate(todayStart);
                    break;
                case 'this_week':
                    const dayOfWeek = now.getDay();
                    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                    const weekStart = new Date(now);
                    weekStart.setDate(now.getDate() + diffToMonday);
                    weekStart.setHours(0, 0, 0, 0);
                    startDateTimestamp = Timestamp.fromDate(weekStart);
                    break;
                case 'this_month':
                    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                    startDateTimestamp = Timestamp.fromDate(monthStart);
                    break;
                case 'this_year':
                    const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
                    startDateTimestamp = Timestamp.fromDate(yearStart);
                    break;
                case 'all_time':
                    startDateTimestamp = null;
                    break;
            }
            console.log(`[Dashboard] Calculated start date for query: ${startDateTimestamp?.toDate()}`);

            try {
                const logCollectionRef = collection(firestore, 'inventory_log');
                let q;

                if (startDateTimestamp) {
                    q = query(
                        logCollectionRef,
                        where("userId", "==", user.uid),
                        where("timestamp", ">=", startDateTimestamp)
                        // No orderBy needed here for pure aggregation, but good for debugging if you list logs
                        // orderBy("timestamp", "desc")
                    );
                } else {
                    q = query(
                        logCollectionRef,
                        where("userId", "==", user.uid)
                        // orderBy("timestamp", "desc")
                    );
                }

                const querySnapshot = await getDocs(q);
                console.log(`[Dashboard] Fetched ${querySnapshot.size} financial log entries for period ${selectedFinancialPeriod}.`);

                let expenses = 0;
                let revenue = 0;
                let processedLogsCount = 0;

                querySnapshot.forEach((docSnap) => {
                    processedLogsCount++;
                    const data = docSnap.data() as FinancialLogEntry; // Cast to ensure type safety

                    const quantityChange = Number(data.quantityChange) || 0;
                    const costOrValuePerUnit = Number(data.costOrValuePerUnit) || 0;
                    const currentLogTotalValue = Math.abs(quantityChange) * costOrValuePerUnit;

                    console.log(`[Dashboard] Processing log ID: ${docSnap.id}, Type: ${data.type}, QtyChg: ${quantityChange}, Cost/Unit: ${costOrValuePerUnit}, Calculated Value: ${currentLogTotalValue}, Timestamp: ${data.timestamp.toDate()}`);

                    if (data.type === 'Sale') {
                        revenue += currentLogTotalValue;
                    } else if (['Purchase', 'Seed Planted', 'Fertilizer Used', 'Material Used', 'Initial Stock'].includes(data.type)) {
                        expenses += currentLogTotalValue;
                    } else if (data.type === 'Adjustment') {
                        if (quantityChange < 0 && costOrValuePerUnit > 0) {
                             expenses += currentLogTotalValue;
                        }
                    }
                });
                console.log(`[Dashboard] Processed ${processedLogsCount} logs. Calculated Revenue: ${revenue}, Expenses: ${expenses}`);

                const net = revenue - expenses;
                let roiCalc = 0;
                if (expenses > 0) {
                    roiCalc = (net / expenses) * 100;
                } else if (revenue > 0) {
                    roiCalc = 100.0;
                }

                setSummaryData({
                    totalRevenue: revenue,
                    totalExpenses: expenses,
                    netProfit: net,
                    roi: isFinite(roiCalc) ? roiCalc : (revenue > 0 ? 100 : 0),
                });

            } catch (err: any) {
                console.error("[Dashboard] Error fetching financial summary data:", err);
                if (err.code === 'permission-denied') { setSummaryError(`Permission denied for 'inventory_log'. Check Firestore rules.`); }
                else if (err.code === 'unimplemented' || err.code === 'failed-precondition' || err.message.toLowerCase().includes('index')) {
                     setSummaryError(`Index needed for financial summary (userId, timestamp). Check console.`);
                     console.error("Firestore Indexing Error: Create a composite index for 'inventory_log' collection: (userId ASC, timestamp DESC). The error message in console usually provides a direct link to create it.");
                }
                else { setSummaryError(`Failed to load financial summary. ${err.message}`); }
            } finally {
                setIsSummaryLoading(false);
            }
        };
        fetchSummaryData();
    } else {
        setIsSummaryLoading(false);
        if (!user && !loadingAuth) {
            console.log("[Dashboard] No user or still loading auth, resetting summary.");
            setSummaryData({ totalRevenue: 0, totalExpenses: 0, netProfit: 0, roi: 0 });
        } else if(!firestore && !loadingAuth) {
            setSummaryError("Firestore service not available.");
            console.log("[Dashboard] Firestore not available.");
        }
    }
  }, [user, firestore, loadingAuth, selectedFinancialPeriod]);

  const financialPeriodLabel = useMemo(() => {
    switch(selectedFinancialPeriod) {
        case 'today': return 'Today';
        case 'this_week': return 'This Week';
        case 'this_month': return 'This Month';
        case 'this_year': return 'This Year';
        case 'all_time': return 'All Time';
        default: return 'Selected Period';
    }
  }, [selectedFinancialPeriod]);


  if (loadingAuth) {
      return <LoadingSpinner message="Authenticating..." />;
  }

  if (!user && !errorAuth) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 text-center">
            <div className="bg-white p-8 md:p-12 rounded-xl shadow-2xl max-w-md w-full">
                <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-6" />
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-3">Access Denied</h2>
                <p className="text-gray-600 mb-8 text-sm md:text-base">
                    You need to be logged in to view the dashboard.
                </p>
                <Link
                    href="/login"
                    className="w-full inline-flex justify-center items-center px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                    Go to Login Page
                </Link>
            </div>
        </div>
    );
  }

  if(errorAuth){
     return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 text-center">
            <div className="bg-white p-8 md:p-12 rounded-xl shadow-2xl max-w-md w-full">
                <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-6" />
                <h2 className="text-2xl md:text-3xl font-bold text-red-700 mb-3">Authentication Error</h2>
                <p className="text-gray-600 mb-8 text-sm md:text-base">
                  {errorAuth.message}
                </p>
                <p className="text-gray-500 text-xs mb-6">
                    Please try logging out and logging in again. If the issue persists, contact support.
                </p>
                <Link
                    href="/login"
                    className="w-full inline-flex justify-center items-center px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                    Go to Login Page
                </Link>
            </div>
        </div>
     );
  }

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-green-50 relative z-10 border-b border-green-200">
          <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                  <div>
                      <h1 className="text-xl font-semibold text-gray-800">Hello, {user?.displayName?.split(' ')[0] || 'Farmer'}!</h1>
                      <p className="text-xs text-gray-500">{currentDate}</p>
                  </div>
                  <div className="flex items-center">
                      <button
                          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                          className="lg:hidden p-2 text-gray-600 hover:text-gray-800 focus:outline-none mr-2"
                          aria-label="Toggle menu"
                      >
                          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                      </button>
                      <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3"><Search className="h-5 w-5 text-gray-400" aria-hidden="true" /></span>
                          <input type="text" placeholder="Search dashboard..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-300 text-gray-600 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm" />
                      </div>
                  </div>
              </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="mb-6 flex flex-col sm:flex-row justify-between items-center gap-4">
            <h2 className="text-2xl font-semibold text-gray-700">Dashboard Overview</h2>
            <div className="relative inline-block text-left">
                <div>
                    <span className="rounded-md shadow-sm">
                        <select
                            id="financialPeriod"
                            name="financialPeriod"
                            value={selectedFinancialPeriod}
                            onChange={(e) => setSelectedFinancialPeriod(e.target.value as FinancialPeriod)}
                            className="block w-full sm:w-56 pl-3 pr-10 py-2 text-base border-gray-300 text-gray-600 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm rounded-md shadow-sm appearance-none bg-white"
                        >
                            <option value="today">Today</option>
                            <option value="this_week">This Week</option>
                            <option value="this_month">This Month</option>
                            <option value="this_year">This Year</option>
                            <option value="all_time">All Time</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                            <ChevronDown size={20} />
                        </div>
                    </span>
                </div>
            </div>
          </div>

          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
            {isSummaryLoading ? (
                [...Array(4)].map((_, i) => (
                    <div key={i} className="bg-white rounded-lg shadow p-5 h-28 animate-pulse">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
                        <div className="h-8 bg-gray-300 rounded w-1/2"></div>
                    </div>
                ))
            ) : summaryError ? (
                <div className="col-span-full text-red-600 bg-red-100 border border-red-200 p-4 rounded-md text-center flex flex-col items-center">
                   <AlertTriangle className="h-6 w-6 mb-2"/>
                   <span>{summaryError}</span>
                </div>
            ) : (
              <>
                <div className="bg-white rounded-lg shadow p-5 flex items-center space-x-4 hover:shadow-lg transition-shadow">
                  <div className="p-3.5 rounded-full bg-green-100 text-green-600"> <TrendingUp size={22} /> </div>
                  <div> <p className="text-sm font-medium text-gray-500">Revenue ({financialPeriodLabel})</p> <p className="text-2xl font-semibold text-gray-800">{formatCurrency(summaryData.totalRevenue)}</p> </div>
                </div>
                <div className="bg-white rounded-lg shadow p-5 flex items-center space-x-4 hover:shadow-lg transition-shadow">
                  <div className="p-3.5 rounded-full bg-red-100 text-red-600"> <TrendingDown size={22} /> </div>
                  <div> <p className="text-sm font-medium text-gray-500">Expenses ({financialPeriodLabel})</p> <p className="text-2xl font-semibold text-gray-800">{formatCurrency(summaryData.totalExpenses)}</p> </div>
                </div>
                <div className="bg-white rounded-lg shadow p-5 flex items-center space-x-4 hover:shadow-lg transition-shadow">
                  <div className={`p-3.5 rounded-full ${summaryData.netProfit >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}> <DollarSign size={22} /> </div>
                  <div> <p className="text-sm font-medium text-gray-500">Net Profit ({financialPeriodLabel})</p> <p className={`text-2xl font-semibold ${summaryData.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{formatCurrency(summaryData.netProfit, true)}</p> </div>
                </div>
                <div className="bg-white rounded-lg shadow p-5 flex items-center space-x-4 hover:shadow-lg transition-shadow">
                  <div className={`p-3.5 rounded-full ${summaryData.roi >= 0 ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}> <LineChart size={22} /> </div>
                  <div> <p className="text-sm font-medium text-gray-500">ROI ({financialPeriodLabel})</p> <p className={`text-2xl font-semibold ${summaryData.roi >= 0 ? 'text-blue-700' : 'text-orange-600'}`}>{isFinite(summaryData.roi) ? `${summaryData.roi.toFixed(1)}%` : (summaryData.totalRevenue > 0 && summaryData.totalExpenses === 0 ? 'Profit (No Cost)' : 'N/A')}</p> </div>
                </div>
              </>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <section>
              <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"> <ListChecks className="h-5 w-5 mr-2 text-indigo-600" /> Upcoming Events / Tasks </h2>
              <div className="bg-white rounded-lg shadow p-6 h-80 overflow-y-auto">
                {isEventsLoading ? ( <div className="flex justify-center items-center h-full text-gray-500"> <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading Events...</div> )
                : eventsError ? (<div className="flex flex-col justify-center items-center h-full text-red-500 text-center"> <AlertTriangle className="h-8 w-8 mb-2" /> <span className="font-semibold">Failed to Load Events</span> <span className="text-sm">{eventsError}</span> </div>)
                : upcomingEvents.length > 0 ? (<ul className="space-y-3">
                    {upcomingEvents.map((event) => (
                        <li key={event.id} className="p-3 border rounded-md bg-gray-50 hover:bg-gray-100 transition">
                            <p className="font-medium text-gray-800 text-sm mb-1">{event.message}</p>
                            <div className="flex items-center text-xs text-gray-500 space-x-2"> <Clock size={12} /> <span>{event.timestamp.toLocaleDateString()} {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> <span className="font-semibold">({event.type})</span> {event.status && <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs">{event.status}</span>} </div>
                        </li>
                    ))}
                    </ul>)
                : (<div className="flex flex-col items-center justify-center h-full text-gray-500"><Inbox size={32} className="mb-2 text-gray-400" /><p>No upcoming events or tasks.</p></div>)}
              </div>
            </section>

            <section>
                <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"> <Leaf className="h-5 w-5 mr-2 text-green-600"/> NPK Levels Overview</h2>
                <div className="bg-white rounded-lg shadow p-6 h-80 flex items-center justify-center">
                    {isNpkLoading ? (<div className="flex flex-col items-center text-gray-500"> <Loader2 className="h-8 w-8 animate-spin mb-2" /> <span>Loading NPK Data...</span> </div>)
                    : npkError ? (<div className="flex flex-col items-center text-red-600 text-center"> <AlertTriangle className="h-8 w-8 mb-2" /> <span>{npkError}</span> </div>)
                    : npkData.length > 0 ? (<NpkChart data={npkData} />)
                    : (<div className="flex flex-col items-center justify-center h-full text-gray-500"><Inbox size={32} className="mb-2 text-gray-400" /><p>No NPK data available.</p></div>)}
                </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
