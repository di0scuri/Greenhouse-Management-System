'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; 
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { auth, firestore } from '@/app/lib/firebase/config';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

import {
  AuthError,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile
  // FacebookAuthProvider, // Import if you plan to implement Facebook sign-in
} from 'firebase/auth';

// SVG Logo Components (as provided by user)
const LeafLogo = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-white">
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
const FacebookLogo = () => ( // Placeholder, Facebook SDK setup needed for actual functionality
   <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1877F2">
     <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"/>
   </svg>
);


export default function SignupPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isFacebookLoading, setIsFacebookLoading] = useState(false); // For future Facebook login
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  const createUserDocument = async (userId: string, email: string | null, name: string | null) => {
      if (!firestore) {
          console.error("Firestore not initialized");
          throw new Error("Database service unavailable.");
      }
      const userDocRef = doc(firestore, 'users', userId);
      try {
          const docSnap = await getDoc(userDocRef);
          if (!docSnap.exists()) {
              await setDoc(userDocRef, {
                  displayName: name || 'New User', // Use provided name or default
                  email: email || '',
                  role: 'Admin', // Default role, can be changed later
                  createdAt: serverTimestamp(),
                  // Add any other default fields you want for new users
                  // e.g., usablePlantingAreaSqM: 20, (default value)
              });
              console.log(`User document created for ${userId}`);
          } else {
              console.log(`User document already exists for ${userId}`);
              // Optionally update existing fields like displayName if it was null before
              if (!docSnap.data()?.displayName && name) {
                await updateDoc(userDocRef, { displayName: name });
              }
          }
      } catch (error) {
          console.error("Error creating/checking user document:", error);
          // Don't throw here to allow login/signup to proceed even if doc creation fails,
          // but log it for debugging. User can update profile later.
          setError("Failed to set up user profile, please update it later.");
      }
  };

  const handleEmailPasswordSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (password.length < 6) { setError("Password should be at least 6 characters."); return; }
    if (!displayName.trim()) { setError("Display name is required."); return; }

    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log('Auth signup successful:', user.uid);

      await updateProfile(user, { displayName: displayName.trim() });
      console.log('Auth profile updated with display name');

      await createUserDocument(user.uid, user.email, displayName.trim());

      router.push('/dashboard'); // Redirect to dashboard after successful signup

    } catch (err) {
      let errorMessage = 'An unknown error occurred.';
      if (err instanceof Error && 'code' in err) {
        const authError = err as AuthError;
        console.error('Firebase Signup Error Code:', authError.code);
        switch (authError.code) {
          case 'auth/email-already-in-use': errorMessage = 'This email address is already registered.'; break;
          case 'auth/invalid-email': errorMessage = 'Please enter a valid email address.'; break;
          case 'auth/weak-password': errorMessage = 'Password is too weak. Please use a stronger password.'; break;
          default: errorMessage = authError.message || 'Signup failed. Please try again.';
        }
      } else { console.error('Signup Error:', err); }
      setError(errorMessage);
    } finally { setIsLoading(false); }
  };

  const handleGoogleSignup = async () => {
    setIsGoogleLoading(true); setError(null);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      console.log('Google Sign-in/Signup successful:', user.uid);
      
      await createUserDocument(user.uid, user.email, user.displayName);
      
      router.push('/dashboard');

    } catch (err) {
      let errorMessage = 'An unknown error occurred during Google Sign-in.';
      if (err instanceof Error && 'code' in err) {
        const authError = err as AuthError;
        console.error('Google Auth Error Code:', authError.code);
        switch (authError.code) {
            case 'auth/popup-closed-by-user': errorMessage = 'Sign-in cancelled.'; break;
            case 'auth/account-exists-with-different-credential': errorMessage = 'An account already exists with this email using a different sign-in method.'; break;
            default: errorMessage = 'Google Sign-in failed. Please try again.';
        }
      } else { console.error('Google Login Error:', err); }
      setError(errorMessage);
    } finally { setIsGoogleLoading(false); }
  };

  const handleFacebookSignup = async () => {
    // Placeholder for Facebook Sign up - Requires Facebook App setup and SDK
    setIsFacebookLoading(true);
    setError("Facebook sign-up is not yet implemented.");
    console.warn("Facebook signup attempt - not implemented.");
    // const provider = new FacebookAuthProvider();
    // try {
    //   const result = await signInWithPopup(auth, provider);
    //   // ... handle result ...
    // } catch (error) {
    //   // ... handle error ...
    // }
    setIsFacebookLoading(false);
  };


  return (
    // Single column layout, centered
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 p-4 font-sans">
        <div className="relative w-full max-w-md">
          {/* Logo positioned above the card */}
          <div className="flex justify-center mb-6">
            <div className="bg-green-700 rounded-full p-4 border-4 border-white shadow-xl">
              <LeafLogo />
            </div>
          </div>

          {/* Signup Card */}
          <div className="relative bg-white rounded-xl shadow-2xl px-8 py-10">
            <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">Create Your Account</h1>
            
            <form onSubmit={handleEmailPasswordSignup} className="space-y-5">
              {/* Display Name */}
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1.5">Display Name</label>
                <input 
                  id="displayName" name="displayName" type="text" 
                  required 
                  value={displayName} onChange={(e) => setDisplayName(e.target.value)} 
                  className="w-full px-4 py-3 border border-gray-300 text-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition duration-200 shadow-sm" 
                  disabled={isLoading || isGoogleLoading || isFacebookLoading} />
              </div>
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                <input 
                  id="email" name="email" type="email" autoComplete="email" 
                  required 
                  value={email} onChange={(e) => setEmail(e.target.value)} 
                  className="w-full px-4 py-3 border border-gray-300 text-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition duration-200 shadow-sm" 
                  disabled={isLoading || isGoogleLoading || isFacebookLoading} />
              </div>
              {/* Password */}
              <div className="relative">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <input 
                  id="password" name="password" type={showPassword ? 'text' : 'password'} 
                  required 
                  value={password} onChange={(e) => setPassword(e.target.value)} 
                  className="w-full px-4 py-3 border text-gray-800 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition duration-200 pr-12 shadow-sm" 
                  disabled={isLoading || isGoogleLoading || isFacebookLoading} />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)} 
                  className="absolute inset-y-0 right-0 top-7 flex items-center px-4 text-gray-500 hover:text-green-600 focus:outline-none" 
                  aria-label={showPassword ? 'Hide password' : 'Show password'} 
                  disabled={isLoading || isGoogleLoading || isFacebookLoading}> 
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />} 
                </button>
              </div>
              {/* Confirm Password */}
              <div className="relative">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
                <input 
                  id="confirmPassword" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} 
                  required 
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} 
                  className="w-full px-4 py-3 border text-gray-800 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition duration-200 pr-12 shadow-sm" 
                  disabled={isLoading || isGoogleLoading || isFacebookLoading} />
                <button 
                  type="button" 
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)} 
                  className="absolute inset-y-0 right-0 top-7 flex items-center px-4 text-gray-500 hover:text-green-600 focus:outline-none" 
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'} 
                  disabled={isLoading || isGoogleLoading || isFacebookLoading}> 
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />} 
                </button>
              </div>

              {error && ( 
                <div className="text-red-600 text-sm text-center p-3 bg-red-50 rounded-lg border border-red-200"> 
                  {error} 
                </div> 
              )}

              {/* Signup Button */}
              <div>
                <button 
                  type="submit" 
                  disabled={isLoading || isGoogleLoading || isFacebookLoading} 
                  className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-semibold text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-200 ease-in-out ${(isLoading || isGoogleLoading || isFacebookLoading) ? 'opacity-60 cursor-not-allowed' : ''}`}> 
                  {isLoading ? <Loader2 className="animate-spin h-5 w-5 mr-2"/> : null}
                  {isLoading ? 'Creating Account...' : 'Create Account'} 
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center my-6">
                  <div className="flex-grow border-t border-gray-300"></div>
                  <span className="mx-4 text-sm text-gray-500">Or continue with</span>
                  <div className="flex-grow border-t border-gray-300"></div>
              </div>
              
              {/* Social Signups */}
              <div className="space-y-3">
                <button 
                  type="button" 
                  onClick={handleGoogleSignup} 
                  disabled={isLoading || isGoogleLoading || isFacebookLoading} 
                  className={`w-full inline-flex justify-center items-center py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-200 ${(isLoading || isGoogleLoading || isFacebookLoading) ? 'opacity-60 cursor-not-allowed' : ''}`}> 
                  {isGoogleLoading ? <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5 text-green-600"/> : <GoogleLogo /> } 
                  {isGoogleLoading ? 'Processing...' : 'Sign up with Google'} 
                </button>
                <button 
                  type="button" 
                  onClick={handleFacebookSignup} 
                  disabled={true || isLoading || isGoogleLoading || isFacebookLoading} // Facebook login often needs more setup
                  className={`w-full inline-flex justify-center items-center py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-200 opacity-50 cursor-not-allowed`}> 
                  {isFacebookLoading ? <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600"/> : <FacebookLogo /> } 
                  {isFacebookLoading ? 'Processing...' : 'Sign up with Facebook (Soon)'} 
                </button>
              </div>
              
              {/* Login Link */}
              <p className="text-center text-sm text-gray-600 pt-4"> 
                Already have an account?{' '} 
                <Link href="/login" className="font-semibold text-green-600 hover:text-green-700 hover:underline"> 
                  Login here
                </Link> 
              </p>
            </form>
          </div>
        </div>
    </div>
  );
}
