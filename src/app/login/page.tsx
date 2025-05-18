'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2 } from 'lucide-react'; // Added Loader2 for loading states
import { auth, firestore } from '@/app/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';

import {
   AuthError,
   signInWithEmailAndPassword,
   signInWithPopup,
   GoogleAuthProvider,
   // FacebookAuthProvider // Assuming you might add it back later
} from 'firebase/auth';

// SVG Components
const LeafLogo = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-white"> {/* Increased size */}
      <path fillRule="evenodd" d="M15.75 2.25a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0V6.31L8.024 12.857a5.25 5.25 0 0 0-7.11 6.99C1.5 20.25 2.5 21 3.75 21h12.497c1.25 0 2.25-.75 2.841-1.853a5.25 5.25 0 0 0-7.11-6.99L8.405 5.69V7.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 .75-.75h8.096Z" clipRule="evenodd" />
    </svg>
);
const GoogleLogo = () => (
  <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C39.714 36.238 44 30.668 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
);
const FacebookLogo = () => ( // Assuming you might re-enable Facebook login
  <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"/>
  </svg>
);


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isFacebookLoading, setIsFacebookLoading] = useState(false); // Keep if FB login might return
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchUserRole = async (userId: string): Promise<string> => {
      if (!firestore) {
          console.error("Firestore not initialized");
          return 'Farmer'; // Default role on error
      }
      const userDocRef = doc(firestore, 'users', userId);
      try {
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
              return docSnap.data()?.role || 'Farmer'; // Default to 'Farmer' if role field is missing
          } else {
              // This case means the user document doesn't exist in 'users' collection yet.
              // This might happen for new sign-ups via Google/Facebook if you don't create the user doc immediately.
              console.warn(`User document ${userId} not found in 'users' collection. Assigning default role 'Farmer'. You might want to create this document upon first social login.`);
              return 'Farmer';
          }
      } catch (error) {
          console.error("Error fetching user role:", error);
          return 'Farmer'; // Default role on error
      }
  };

  const handleLoginSuccess = async (userId: string) => {
    const role = await fetchUserRole(userId);
    console.log('User Role:', role);
    // TODO: Store the 'role' in a global state (Context, Zustand, Redux, etc.)
    // Example: authContext.setRole(role);
    router.push('/dashboard');
  };

  const handleEmailPasswordLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true); setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('Email/Password Login successful:', userCredential.user.uid);
      await handleLoginSuccess(userCredential.user.uid);
    } catch (err) {
      let errorMessage = 'An unknown error occurred.';
      if (err instanceof Error && 'code' in err) {
        const authError = err as AuthError;
        switch (authError.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            errorMessage = 'Invalid email or password.';
            break;
          case 'auth/invalid-email':
            errorMessage = 'Please enter a valid email address.';
            break;
          case 'auth/too-many-requests':
            errorMessage = 'Too many login attempts. Please try again later or reset your password.';
            break;
          default:
            errorMessage = `Login failed: ${authError.message}`;
        }
      } else {
        console.error('Login Error (Unknown Structure):', err);
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true); setError(null);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      console.log('Google Sign-in successful:', result.user.uid);
      await handleLoginSuccess(result.user.uid);
    } catch (err) {
      let errorMessage = 'An unknown error occurred during Google Sign-in.';
      if (err instanceof Error && 'code' in err) {
        const authError = err as AuthError;
        switch (authError.code) {
          case 'auth/popup-closed-by-user':
            errorMessage = 'Google Sign-in cancelled by user.';
            break;
          case 'auth/account-exists-with-different-credential':
            errorMessage = 'An account already exists with this email using a different sign-in method.';
            break;
          case 'auth/popup-blocked':
            errorMessage = 'Popup blocked by browser. Please allow popups for this site.';
            break;
          default:
            errorMessage = `Google Sign-in failed: ${authError.message}`;
        }
      } else {
        console.error('Google Login Error (Unknown Structure):', err);
      }
      setError(errorMessage);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleFacebookLogin = async () => { // Keep if you plan to implement
    setIsFacebookLoading(true); setError(null);
    try {
      // const provider = new FacebookAuthProvider();
      // const result = await signInWithPopup(auth, provider);
      // console.log('Facebook Sign-in successful:', result.user.uid);
      // await handleLoginSuccess(result.user.uid);
      console.warn("Facebook Login not implemented yet.");
      setError("Facebook Login is not available at this time.");
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate
    } catch (err) {
      let errorMessage = 'An unknown error occurred during Facebook Sign-in.';
       if (err instanceof Error && 'code' in err) {
        const authError = err as AuthError;
        switch (authError.code) {
          case 'auth/popup-closed-by-user':
            errorMessage = 'Facebook Sign-in cancelled by user.';
            break;
          case 'auth/account-exists-with-different-credential':
            errorMessage = 'An account already exists with this email using a different sign-in method (e.g., Google or Email/Password).';
            break;
          default:
            errorMessage = `Facebook Sign-in failed: ${authError.message}`;
        }
      } else {
        console.error('Facebook Login Error (Unknown Structure):', err);
      }
      setError(errorMessage);
    } finally {
      setIsFacebookLoading(false);
    }
  };

  return (
    // Main container: Full screen height, flexbox, centers content
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-400 to-emerald-600 p-4 font-sans">
      {/* Login Card Wrapper: Max width 'sm', handles relative positioning for logo */}
      <div className="relative w-full max-w-sm">
        {/* Logo positioned above the card */}
        <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 z-20">
          <div className="bg-green-700 rounded-full p-4 border-4 border-white shadow-xl"> {/* Enhanced logo styling */}
            <LeafLogo />
          </div>
        </div>

        {/* The actual card with content */}
        <div className="relative bg-white rounded-xl shadow-2xl px-8 pt-20 pb-10 mt-10"> {/* Increased top padding */}
          <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
            Welcome Back!
          </h1>
          <form onSubmit={handleEmailPasswordLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 text-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition duration-200"
                disabled={isLoading || isGoogleLoading || isFacebookLoading}
                placeholder="Enter your Email Address"
              />
            </div>
            <div className="relative">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border text-gray-800 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition duration-200 pr-10"
                disabled={isLoading || isGoogleLoading || isFacebookLoading}
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 top-7 flex items-center px-3 text-gray-500 hover:text-green-600 focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={isLoading || isGoogleLoading || isFacebookLoading}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <div className="text-right">
              <Link href="/forgot-password" // Ensure this route exists
                className="text-xs text-gray-500 hover:text-green-700 hover:underline transition-colors">
                Forgot Password?
              </Link>
            </div>

            {error && (
              <div className="text-red-600 text-sm text-center p-3 bg-red-50 rounded-lg border border-red-200">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading || isGoogleLoading || isFacebookLoading}
                className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-semibold text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-200 ease-in-out transform hover:scale-105 active:scale-95 ${(isLoading || isGoogleLoading || isFacebookLoading) ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Login'}
              </button>
            </div>

            <div className="relative my-6">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">Or continue with</span>
                </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading || isGoogleLoading || isFacebookLoading}
                className={`w-full inline-flex justify-center items-center py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-green-500 transition duration-200 ease-in-out transform hover:scale-105 active:scale-95 ${(isLoading || isGoogleLoading || isFacebookLoading) ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {isGoogleLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2 text-green-600" /> : <GoogleLogo />}
                {isGoogleLoading ? 'Processing...' : 'Login with Google'}
              </button>
              {/* Keep Facebook button if you might implement it */}
              <button
                type="button"
                onClick={handleFacebookLogin}
                disabled={true || isLoading || isGoogleLoading || isFacebookLoading}
                className={`w-full inline-flex justify-center items-center py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-green-500 transition duration-200 ease-in-out transform hover:scale-105 active:scale-95 opacity-50 cursor-not-allowed`} // Added opacity-50 and cursor-not-allowed
              >
                {isFacebookLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2 text-blue-600" /> : <FacebookLogo /> }
                {isFacebookLoading ? 'Processing...' : 'Login with Facebook'}
              </button>
            </div>
            <p className="mt-8 text-center text-sm text-gray-600">
              Don&apos;t have an account?{' '}
              <Link href="/signup"
                className="font-semibold text-green-700 hover:text-green-800 hover:underline transition-colors">
                Sign up now
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
