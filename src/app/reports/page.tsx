'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import { firestore, auth } from '@/app/lib/firebase/config';
import { useAuthState } from 'react-firebase-hooks/auth';

import Sidebar from '@/components/Sidebar';
import LoadingSpinner from '@/components/LoadingSpinner'; 
import { DollarSign, TrendingUp, TrendingDown, Leaf, FlaskConical, Package, Settings, PlusCircle, FileText, Calendar as CalendarIcon, Filter, ListRestart, AlertTriangle, BarChart3, Inbox } from 'lucide-react';

interface InventoryLogEntry {
  id: string;
  itemId: string;
  itemName: string;
  timestamp: Date;
  type: 'Purchase' | 'Seed Planted' | 'Fertilizer Used' | 'Material Used' | 'Sale' | 'Adjustment' | 'Initial Stock';
  quantityChange: number;
  costOrValuePerUnit: number;
  totalCostOrValue: number;
  notes?: string;
  userId?: string;
  plantId?: string;
  unit?: string;
}

interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  breakdown: {
    revenueByItem: Record<string, number>;
    expensesByType: Record<InventoryLogEntry['type'] | 'Other Expenses', number>;
    expensesByItem: Record<string, number>;
  };
}

const formatCurrency = (value: number, withSign = false): string => {
  const sign = value < 0 ? '-' : (withSign && value > 0 ? '+' : '');
  if (value === 0 && !withSign && value !== null && value !== undefined) return '₱0.00';
  if (isNaN(value) || value === null || value === undefined) return 'N/A';
  return sign + new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
};

const formatDate = (date: Date | null | undefined): string => {
  if (!date) return 'N/A';
  return date.toLocaleDateString('en-CA');
};

const formatDisplayDate = (date: Date | null | undefined): string => {
    if (!date) return 'N/A';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };


const getLogTypeStyle = (type: InventoryLogEntry['type']) => {
    switch (type) {
      case 'Purchase': return { Icon: DollarSign, color: 'text-blue-600', bgColor: 'bg-blue-100' };
      case 'Seed Planted': return { Icon: Leaf, color: 'text-green-700', bgColor: 'bg-green-100' };
      case 'Fertilizer Used': return { Icon: FlaskConical, color: 'text-sky-600', bgColor: 'bg-sky-100' };
      case 'Material Used': return { Icon: Package, color: 'text-orange-600', bgColor: 'bg-orange-100' };
      case 'Sale': return { Icon: TrendingUp, color: 'text-emerald-600', bgColor: 'bg-emerald-100' };
      case 'Adjustment': return { Icon: Settings, color: 'text-purple-600', bgColor: 'bg-purple-100' };
      case 'Initial Stock': return { Icon: PlusCircle, color: 'text-teal-600', bgColor: 'bg-teal-100' };
      default: return { Icon: FileText, color: 'text-gray-600', bgColor: 'bg-gray-100' };
    }
};


export default function ReportsPage() {
  const [user, loadingAuth, authError] = useAuthState(auth);
  const router = useRouter();

  const [allLogs, setAllLogs] = useState<InventoryLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<InventoryLogEntry[]>([]);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary>({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    breakdown: { revenueByItem: {}, expensesByType: {}, expensesByItem: {} },
  });

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadingAuth && !user && !authError) {
      router.push('/login');
    }
  }, [user, loadingAuth, authError, router]);

  useEffect(() => {
    if (user && firestore) {
      const fetchAllLogs = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const logCollectionRef = collection(firestore, 'inventory_log');
          const q = query(logCollectionRef, where("userId", "==", user.uid), orderBy('timestamp', 'desc'));
          const querySnapshot = await getDocs(q);
          const fetchedLogs: InventoryLogEntry[] = [];
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const quantityChange = Number(data.quantityChange) || 0;
            const costOrValuePerUnit = Number(data.costOrValuePerUnit) || 0;
            const validTypes: LogEntryData['type'][] = ['Purchase', 'Seed Planted', 'Fertilizer Used', 'Material Used', 'Sale', 'Adjustment', 'Initial Stock'];
            const type = validTypes.includes(data.type) ? data.type : 'Adjustment';

            fetchedLogs.push({
              id: docSnap.id,
              itemId: data.itemId || 'N/A',
              itemName: data.itemName || 'N/A',
              timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp),
              type: type as InventoryLogEntry['type'],
              quantityChange: quantityChange,
              costOrValuePerUnit: costOrValuePerUnit,
              totalCostOrValue: Math.abs(quantityChange) * costOrValuePerUnit,
              notes: data.notes || '',
              userId: data.userId,
              plantId: data.plantId,
              unit: data.unit
            });
          });
          setAllLogs(fetchedLogs);
        } catch (err: any) {
          console.error("Error fetching inventory logs for reports:", err);
          if (err.code === 'permission-denied') {
            setError("Permission denied. Check Firestore security rules for 'inventory_log'.");
          } else if (err.code === 'failed-precondition' || err.message.toLowerCase().includes('index')) {
            setError("Firestore index needed for log query (userId, timestamp). Check console for link.");
            console.error("Firestore Indexing Error: Create a composite index for 'inventory_log' on (userId ASC, timestamp DESC).");
          } else {
            setError(`Failed to load log data: ${err.message}`);
          }
        } finally {
          setIsLoading(false);
        }
      };
      fetchAllLogs();
    }
  }, [user, firestore]);

  // Calculate financials when logs or date filters change
  useEffect(() => {
    let currentLogs = allLogs;
    if (startDate) {
      const sDate = new Date(startDate + 'T00:00:00');
      if (!isNaN(sDate.getTime())) {
        currentLogs = currentLogs.filter(log => log.timestamp >= sDate);
      }
    }
    if (endDate) {
      const eDate = new Date(endDate + 'T23:59:59');
      if (!isNaN(eDate.getTime())) {
        currentLogs = currentLogs.filter(log => log.timestamp <= eDate);
      }
    }
    setFilteredLogs(currentLogs);

    let revenue = 0;
    let expenses = 0;
    const revenueByItem: Record<string, number> = {};
    const expensesByType: Record<string, number> = {};
    const expensesByItem: Record<string, number> = {};

    currentLogs.forEach(log => {
      if (log.type === 'Sale') {
        revenue += log.totalCostOrValue;
        revenueByItem[log.itemName] = (revenueByItem[log.itemName] || 0) + log.totalCostOrValue;
      } else if (['Purchase', 'Seed Planted', 'Fertilizer Used', 'Material Used', 'Initial Stock'].includes(log.type)) {
        expenses += log.totalCostOrValue;
        expensesByType[log.type] = (expensesByType[log.type] || 0) + log.totalCostOrValue;
        expensesByItem[log.itemName] = (expensesByItem[log.itemName] || 0) + log.totalCostOrValue;
      } else if (log.type === 'Adjustment') {
        if (log.quantityChange < 0 && log.costOrValuePerUnit > 0) {
             expenses += log.totalCostOrValue
             expensesByType['Adjustment Loss'] = (expensesByType['Adjustment Loss'] || 0) + log.totalCostOrValue;
        }
      }
    });

    setFinancialSummary({
      totalRevenue: revenue,
      totalExpenses: expenses,
      netProfit: revenue - expenses,
      breakdown: { revenueByItem, expensesByType, expensesByItem },
    });
  }, [allLogs, startDate, endDate]);

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
  };

  if (loadingAuth || (isLoading && allLogs.length === 0)) { // Show loading spinner if auth is loading OR initial data fetch is happening
    return <LoadingSpinner message={loadingAuth ? "Authenticating..." : "Loading financial data..."} />;
  }
  if (!user && !loadingAuth) {
    return <div className="flex h-screen items-center justify-center p-4 text-center">Please log in to view reports.</div>;
  }

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <h1 className="text-xl font-semibold text-gray-800 flex items-center">
                <BarChart3 size={20} className="mr-2 text-green-600" />
                Financial Reports
              </h1>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <section className="mb-6 p-4 bg-white rounded-lg shadow">
            <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center">
              <Filter size={18} className="mr-2" />
              Filter Report Period
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-green-500 sm:text-sm"
                  max={endDate || undefined}
                />
              </div>
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-green-500 sm:text-sm"
                  min={startDate || undefined}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={resetFilters}
                  className="w-full py-2.5 px-3 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center justify-center text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                >
                  <ListRestart size={16} className="mr-1.5" /> Reset Dates
                </button>
              </div>
            </div>
          </section>

          {error && (
            <div className="mb-6 p-3 bg-red-100 text-red-700 border border-red-200 rounded-md text-sm">
              <AlertTriangle size={16} className="inline mr-2" />
              {error}
            </div>
          )}

          {!isLoading && !error && (
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-5 rounded-lg shadow">
                <div className="flex items-center space-x-3">
                  <div className="p-3 rounded-full bg-emerald-100 text-emerald-600">
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                    <p className="text-2xl font-semibold text-gray-800">{formatCurrency(financialSummary.totalRevenue)}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white p-5 rounded-lg shadow">
                <div className="flex items-center space-x-3">
                  <div className="p-3 rounded-full bg-red-100 text-red-600">
                    <TrendingDown size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Total Expenses</p>
                    <p className="text-2xl font-semibold text-gray-800">{formatCurrency(financialSummary.totalExpenses)}</p>
                  </div>
                </div>
              </div>
              <div className={`bg-white p-5 rounded-lg shadow ${financialSummary.netProfit >= 0 ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500'}`}>
                <div className="flex items-center space-x-3">
                  <div className={`p-3 rounded-full ${financialSummary.netProfit >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    <DollarSign size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Net Profit / Loss</p>
                    <p className={`text-2xl font-semibold ${financialSummary.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(financialSummary.netProfit, true)}</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Detailed Log Table for the selected period */}
          {!isLoading && !error && (
            <section className="bg-white rounded-lg shadow overflow-hidden">
              <h2 className="text-lg font-semibold text-gray-700 p-4 border-b">Transaction Log Details ({startDate && endDate ? `${formatDate(new Date(startDate))} - ${formatDate(new Date(endDate))}` : 'All Time'})</h2>
              {filteredLogs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Qty Chg.</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Cost/Value</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Impact</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredLogs.map((log) => {
                        const { Icon, color } = getLogTypeStyle(log.type);
                        const isSale = log.type === 'Sale';
                        const isExpenseType = ['Purchase', 'Seed Planted', 'Fertilizer Used', 'Material Used', 'Initial Stock'].includes(log.type) || (log.type === 'Adjustment' && log.quantityChange < 0);
                        const displayQuantity = isSale ? -log.quantityChange : log.quantityChange;
                        const impactColor = isSale ? 'text-emerald-600' : isExpenseType ? 'text-red-600' : 'text-gray-700';
                        const impactSign = isSale ? '+' : (displayQuantity > 0 && !isExpenseType && log.type !== 'Adjustment') ? '+' : (log.quantityChange < 0 && isExpenseType) ? '-' : '';


                        return (
                          <tr key={log.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{formatDisplayDate(log.timestamp)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{log.itemName}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getLogTypeStyle(log.type).bgColor} ${getLogTypeStyle(log.type).color}`}><Icon size={14} className="mr-1"/>{log.type}</span></td>
                            <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-medium ${displayQuantity > 0 && !isSale ? 'text-green-600' : 'text-red-600'}`}>{displayQuantity > 0 && !isSale ? '+' : ''}{displayQuantity.toLocaleString()} {log.unit}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">{formatCurrency(log.costOrValuePerUnit)}</td>
                            <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-semibold ${impactColor}`}>{impactSign}{formatCurrency(log.totalCostOrValue)}</td>
                            <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" title={log.notes}>{log.notes || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-10 text-center text-gray-500">
                    <Inbox size={40} className="mx-auto mb-2 text-gray-400" />
                    No transactions found for the selected period.
                </div>
              )}
            </section>
          )}
           {isLoading && allLogs.length > 0 && ( /* Show mini loader if recalculating based on date filters */
                <div className="text-center py-4 text-sm text-gray-500 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Filtering data...
                </div>
            )}
        </main>
      </div>
    </div>
  );
}