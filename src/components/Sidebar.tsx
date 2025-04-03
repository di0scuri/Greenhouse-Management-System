// src/components/Sidebar.tsx
'use client'; // Good practice for components with potential client-side interactions (like onClick)

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  CalendarDays, // Keep this icon for the Calendar link
  LineChart,
  Settings,
  Bean, // Assuming this represents Plants/Crops
  LogOut,
  Warehouse,
} from 'lucide-react';
// Removed useRouter as logout logic is just a placeholder here

interface SidebarProps {
  // Add any props the sidebar might need in the future (e.g., user info)
}

import { signOut } from "firebase/auth";
import { auth } from '@/app/lib/firebase/config';


const Sidebar: React.FC<SidebarProps> = (props) => {
  const router = useRouter();

  // Define menu items - Updated "Events" to "Calendar" and href to "/calendar"
  const menuItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Plants', href: '/plants', icon: Bean },
    // --- Updated Item Below ---
    { name: 'Calendar', href: '/calendar', icon: CalendarDays }, // Renamed and updated href
    {name: 'Inventory', href: '/inventory', icon: Warehouse},
    // --- End of Update ---
    { name: 'Reports', href: '/reports', icon: LineChart },
    { name: 'Settings', href: '/settings', icon: Settings },
    
  ];

  const handleLogout = async () => {
    console.log('Logout initiated...');
    if (!auth) {
        console.error("Firebase auth instance is not available.");
        // Handle error appropriately, maybe show a message to the user
        return;
    }
    try {
      await signOut(auth);
      console.log('User signed out successfully.');
      // Redirect to login page after successful sign out
      router.push('/login'); // Adjust if your login route is different
    } catch (error) {
      console.error("Error signing out: ", error);
      // Handle potential errors during sign out (e.g., display a message)
      alert(`Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    // The parent component will now control visibility (e.g., via lg:block, hidden, etc.)
    // Removed fixed positioning and z-index, assuming parent handles layout
    <div className="w-64 bg-gray-800 text-white flex flex-col h-full"> {/* Ensure it takes full height */}
      {/* Logo/Brand Area */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-center h-16"> {/* Fixed height */}
        <span className="text-xl font-bold">Greenhouse Management</span>
      </div>

      {/* Navigation Area */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto"> {/* Allow scrolling if needed */}
        {menuItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-300 hover:bg-gray-700 hover:text-white group"
            // You might want to add logic here to highlight the active link based on the current pathname
          >
            <item.icon className="mr-3 h-6 w-6 text-gray-400 group-hover:text-gray-300" aria-hidden="true" />
            {item.name}
          </Link>
        ))}
      </nav>

      {/* Footer Area (Logout) */}
      <div className="p-2 border-t border-gray-700">
         <button
            onClick={handleLogout}
            className="w-full flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-300 hover:bg-gray-700 hover:text-white group"
          >
            <LogOut className="mr-3 h-6 w-6 text-gray-400 group-hover:text-gray-300" aria-hidden="true" />
            Logout
          </button>
      </div>
    </div>
  );
};

export default Sidebar;
