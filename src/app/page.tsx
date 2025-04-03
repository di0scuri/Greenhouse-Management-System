// src/app/page.tsx
import Link from 'next/link'; // Import the Link component for navigation

export default function HomePage() {
  return (
    // Main container for the homepage content
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50 font-sans">
      <div className="text-center">
        {/* Welcome Heading */}
        <h1 className="text-4xl font-bold mb-6 text-gray-800">
          Welcome to the Greenhouse Management System
        </h1>

        {/* Description or Subtitle (Optional) */}
        <p className="text-lg text-gray-600 mb-8">
          Manage your greenhouse environment efficiently.
        </p>

        {/* Link to the Login Page */}
        <Link
          href="/login" // The path to your login page
          className="inline-block px-6 py-3 bg-green-600 text-white font-medium text-lg rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition duration-200"
        >
          Go to Login
        </Link>

        {/* You can add more content or links here as needed */}

      </div>

      {/* Remove or comment out the default Next.js starter content below if it exists */}
      {/* Example of default content you might remove:
        <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
          ... etc ...
        </div>
        <div className="relative z-[-1] flex place-items-center before:absolute ...">
          <Image ... />
        </div>
        <div className="mb-32 grid text-center lg:mb-0 lg:w-full lg:max-w-5xl lg:grid-cols-4 lg:text-left">
          ... etc ...
        </div> 
      */}
    </main>
  );
}
