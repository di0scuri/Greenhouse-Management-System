'use client';

 import React, { useState } from 'react';
 import { useRouter } from 'next/navigation';
 import Link from 'next/link';
 import { Eye, EyeOff } from 'lucide-react';
 import { auth, firestore } from '@/app/lib/firebase/config';
 import { doc, getDoc } from 'firebase/firestore';

 import {
   AuthError,
   signInWithEmailAndPassword,
   signInWithPopup,
   GoogleAuthProvider,
   // FacebookAuthProvider 
 } from 'firebase/auth';

 const LeafLogo = () => (
     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-white">
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
 const FacebookLogo = () => (
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
   const [isFacebookLoading, setIsFacebookLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const router = useRouter();

   const fetchUserRole = async (userId: string): Promise<string> => {
       if (!firestore) {
           console.error("Firestore not initialized");
           return 'Farmer';
       }
       const userDocRef = doc(firestore, 'users', userId);
       try {
           const docSnap = await getDoc(userDocRef);
           if (docSnap.exists()) {
               return docSnap.data()?.role || 'Farmer';
           } else {
               console.warn(`User document ${userId} not found. Assigning default role.`);
               return 'Farmer';
           }
       } catch (error) {
           console.error("Error fetching user role:", error);
           return 'Farmer';
       }
   };

   const handleEmailPasswordLogin = async (event: React.FormEvent<HTMLFormElement>) => {
     event.preventDefault();
     setIsLoading(true); setError(null);
     try {
       const userCredential = await signInWithEmailAndPassword(auth, email, password);
       const user = userCredential.user;
       console.log('Login successful:', user.uid);
       const role = await fetchUserRole(user.uid);
       console.log('User Role:', role);
       // TODO: Store role in global state
       router.push('/dashboard');
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
             errorMessage = 'Too many login attempts. Please try again later.';
             break;
           default:
             errorMessage = 'Login failed. Please try again.';
         }
       } else {
         console.error('Login Error:', err);
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
       const user = result.user;
       console.log('Google Sign-in successful:', user.uid);
       const role = await fetchUserRole(user.uid);
       console.log('User Role:', role);
        // TODO: Store role in global state
       router.push('/dashboard');
     } catch (err) {
       let errorMessage = 'An unknown error occurred during Google Sign-in.';
       if (err instanceof Error && 'code' in err) {
         const authError = err as AuthError;
         switch (authError.code) {
           case 'auth/popup-closed-by-user':
             errorMessage = 'Sign-in cancelled.';
             break;
           case 'auth/account-exists-with-different-credential':
             errorMessage = 'An account already exists with this email using a different sign-in method.';
             break;
           default:
             errorMessage = 'Google Sign-in failed. Please try again.';
         }
       } else {
         console.error('Google Login Error:', err);
       }
       setError(errorMessage);
     } finally {
       setIsGoogleLoading(false);
     }
   };


   //TODO: Facebook Login
   const handleFacebookLogin = async () => {
     setIsFacebookLoading(true); setError(null);
     try {
       console.warn("Facebook Login not implemented yet.");
       setError("Facebook Login is not available at this time.");
       await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate async operation
     } catch (err) {
       let errorMessage = 'An unknown error occurred during Facebook Sign-in.';
        if (err instanceof Error && 'code' in err) {
         const authError = err as AuthError;
         // console.error('Facebook Auth Error Code:', authError.code); // Already logged
         switch (authError.code) {
           case 'auth/popup-closed-by-user':
             errorMessage = 'Sign-in cancelled.';
             break;
           case 'auth/account-exists-with-different-credential':
             errorMessage = 'An account already exists with this email using a different sign-in method.';
             break;
           default:
             errorMessage = 'Facebook Sign-in failed. Please try again.';
         }
       } else {
         console.error('Facebook Login Error:', err);
       }
       setError(errorMessage);
     } finally {
       setIsFacebookLoading(false);
     }
   };

   return (
     <div className="min-h-screen flex font-sans">
       <div className="w-full md:w-1/2 flex items-center justify-center bg-gray-100 p-4 md:p-8">
         <div className="relative w-full max-w-sm">
           <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 z-20">
             <div className="bg-green-600 rounded-full p-3 border-4 border-white shadow-lg">
               <LeafLogo />
             </div>
           </div>
           <div className="relative bg-white rounded-xl shadow-lg px-8 pt-16 pb-8 mt-8">
             <h1 className="text-2xl font-bold text-center mb-6 text-gray-800"> LOGIN </h1>
             <form onSubmit={handleEmailPasswordLogin} className="space-y-4">
               <div>
                 <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                 <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition duration-200" disabled={isLoading || isGoogleLoading || isFacebookLoading} />
               </div>
               <div className="relative">
                 <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                 <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border text-gray-700 border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition duration-200 pr-10" disabled={isLoading || isGoogleLoading || isFacebookLoading} />
                 <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 top-6 flex items-center px-3 text-gray-400 hover:text-green-600" aria-label={showPassword ? 'Hide password' : 'Show password'} disabled={isLoading || isGoogleLoading || isFacebookLoading}>
                   {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                 </button>
               </div>
               <div className="text-right">
                 <Link href="/forgot-password" className="text-xs text-gray-500 hover:text-green-700 hover:underline">
                   Forgot Password?
                 </Link>
               </div>
               {error && (
                 <div className="text-red-600 text-sm text-center p-2 bg-red-50 rounded-md border border-red-200">
                   {error}
                 </div>
               )}
               <div>
                 <button type="submit" disabled={isLoading || isGoogleLoading || isFacebookLoading} className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-200 ${(isLoading || isGoogleLoading || isFacebookLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                   {isLoading ? 'Logging in...' : 'Login'}
                 </button>
               </div>
               <p className="text-center text-sm text-gray-600">
                 Don&apos;t have an account?{' '}
                 <Link href="/signup" className="font-medium text-green-700 hover:text-green-800 hover:underline">
                   Sign up
                 </Link>
               </p>
               <div className="space-y-3 pt-4">
                 <button type="button" onClick={handleGoogleLogin} disabled={isLoading || isGoogleLoading || isFacebookLoading} className={`w-full inline-flex justify-center items-center py-2.5 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-200 ${(isLoading || isGoogleLoading || isFacebookLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                   {isGoogleLoading ? (
                     <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                     </svg>
                   ) : <GoogleLogo /> }
                   {isGoogleLoading ? 'Processing...' : 'Login with Google'}
                 </button>
                 <button type="button" onClick={handleFacebookLogin} disabled={isLoading || isGoogleLoading || isFacebookLoading} className={`w-full inline-flex justify-center items-center py-2.5 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-200 ${(isLoading || isGoogleLoading || isFacebookLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                   {isFacebookLoading ? (
                     <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                     </svg>
                   ) : <FacebookLogo /> }
                   {isFacebookLoading ? 'Processing...' : 'Login with Facebook'}
                 </button>
               </div>
             </form>
           </div>
         </div>
       </div>
       <div className="hidden md:block md:w-1/2 bg-gray-200">
       </div>
     </div>
   );
 }