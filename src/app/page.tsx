// src/app/page.tsx
import Link from 'next/link'; 

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50 font-sans">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-6 text-gray-800">
          Welcome to the Greenhouse Management System
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Manage your greenhouse environment efficiently.
        </p>
        <Link
          href="/login"
          className="inline-block px-6 py-3 bg-green-600 text-white font-medium text-lg rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition duration-200"
        >
          Go to Login
        </Link>

      </div>

    </main>
  );
}
