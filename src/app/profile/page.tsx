'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; // Keep Link import
import { auth, firestore } from '@/app/lib/firebase/config';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

import Sidebar from '@/components/Sidebar';
import LoadingSpinner from '@/components/LoadingSpinner';
import { User as UserIcon, Edit, Lock, Shield, FileText, Camera, LogOut, Menu, X, HardHat, Save, Loader2, CheckCircle, AlertTriangle, Settings as SettingsIcon, Ruler } from 'lucide-react';
import LandSizeModal from '@/components/LandSizeModal';

// Interface for user settings data stored in Firestore
interface UserSettings {
    role?: 'Admin' | 'Greenhouse Operator' | 'Farmer';
    greenhouseLengthM?: number;
    greenhouseWidthM?: number;
    usablePlantingAreaSqM?: number;
}

export default function ProfilePage() {
    const [user, loadingAuth, errorAuth] = useAuthState(auth);
    const router = useRouter();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const [displayName, setDisplayName] = useState('');
    const [userRole, setUserRole] = useState<UserSettings['role']>('Farmer');

    const [lengthM, setLengthM] = useState<number | string>('');
    const [widthM, setWidthM] = useState<number | string>('');
    const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(true);
    const [settingsError, setSettingsError] = useState<string | null>(null);

    const [isLandSizeModalOpen, setIsLandSizeModalOpen] = useState(false);

    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);


    useEffect(() => {
        if (!loadingAuth) {
            if (!user) {
                router.push('/login');
            } else {
                const fetchUserData = async () => {
                    setIsLoadingSettings(true);
                    setSettingsError(null);
                    const userDocRef = doc(firestore, 'users', user.uid);
                    try {
                        const docSnap = await getDoc(userDocRef);
                        if (docSnap.exists()) {
                            const data = docSnap.data() as UserSettings;
                            setDisplayName(user.displayName || data.displayName || 'User Name');
                            setUserRole(data.role ?? 'Farmer');
                            setLengthM(data.greenhouseLengthM ?? '');
                            setWidthM(data.greenhouseWidthM ?? '');
                        } else {
                            console.warn("User profile document not found.");
                            setDisplayName(user.displayName || 'User Name');
                            setUserRole('Farmer');
                        }
                    } catch (err) {
                        console.error("Error fetching user data:", err);
                        setSettingsError("Failed to load user data.");
                        setDisplayName(user.displayName || 'User Name');
                    } finally {
                        setIsLoadingSettings(false);
                    }
                };
                fetchUserData();
            }
        }
    }, [user, loadingAuth, router]);

    const handleEditProfilePicture = () => { alert("Edit Profile Picture functionality not implemented yet."); };
    const handleChangePassword = () => { alert("Change Password functionality not implemented yet."); };
    const handleOpenLandSizeModal = () => { setSaveError(null); setSaveSuccess(null); setIsLandSizeModalOpen(true); };

    // Handler to save land size
    const handleSaveLandSize = async (newLength: number, newWidth: number) => {
        if (!user) { setSaveError("Authentication error."); return; }
        if (isNaN(newLength) || isNaN(newWidth) || newLength <= 0 || newWidth <= 0) { setSaveError("Invalid dimensions provided."); return; }

        setIsSaving(true); setSaveError(null); setSaveSuccess(null);
        const userDocRef = doc(firestore, 'users', user.uid);
        const newArea = parseFloat((newLength * newWidth).toFixed(2));
        const settingsData: Partial<UserSettings> = { greenhouseLengthM: newLength, greenhouseWidthM: newWidth, usablePlantingAreaSqM: newArea };

        try {
            await setDoc(userDocRef, settingsData, { merge: true });
            setSaveSuccess("Greenhouse dimensions saved!");
            setLengthM(newLength); setWidthM(newWidth); setIsLandSizeModalOpen(false);
            setTimeout(() => setSaveSuccess(null), 4000);
        } catch (err: any) { console.error("Error saving land size:", err); setSaveError(err.message || "Failed to save dimensions.");
        } finally { setIsSaving(false); }
    };

    if (loadingAuth || isLoadingSettings) { return <LoadingSpinner message={loadingAuth ? "Authenticating..." : "Loading Profile..."} />; }
    if (!user) { return null; }

    const profilePicSrc = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || user.email || 'U')}&background=random&size=160`;

    return (
        <div className="flex h-screen bg-gray-100 font-sans">
            <Sidebar />
            {isMobileMenuOpen && (<div className="fixed inset-y-0 left-0 z-40 lg:hidden"> <Sidebar /> </div>)}
            {isMobileMenuOpen && (<div className="fixed inset-0 z-30 bg-black opacity-50 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>)}

            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white shadow-sm relative z-10 border-b">
                    <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex justify-between items-center h-16">
                            <div className="flex items-center">
                                <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden mr-4 p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100" aria-label="Open sidebar">
                                    {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                                </button>
                                <h1 className="text-xl font-semibold text-gray-800 flex items-center"> <UserIcon className="h-6 w-6 mr-2 text-gray-600" /> Profile </h1>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-6 lg:p-8">
                    <div className="max-w-4xl mx-auto space-y-8">
                        {/* Main Profile Card */}
                        <div className="bg-white p-6 md:p-8 rounded-lg shadow">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {/* Left Column: Picture */}
                                <div className="md:col-span-1 flex flex-col items-center">
                                    <div className="relative w-40 h-40 mb-4">
                                        <img src={profilePicSrc} alt="Profile Picture" width={160} height={160} className="rounded-lg object-cover shadow-md w-full h-full" referrerPolicy="no-referrer" />
                                        <button onClick={handleEditProfilePicture} className="absolute -bottom-2 -right-2 bg-white p-1.5 rounded-full border shadow-md text-gray-600 hover:text-blue-600 hover:bg-gray-50 transition" aria-label="Edit profile picture"> <Camera size={16} /> </button>
                                    </div>
                                </div>
                                {/* Right Column: Details & Actions */}
                                <div className="md:col-span-2 space-y-6">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h2 className="text-2xl font-semibold text-gray-800">{displayName}</h2>
                                            <p className="text-sm text-gray-500">{user.email}</p>
                                            <span className="mt-1 inline-block bg-gray-200 text-gray-700 text-xs font-medium px-2 py-0.5 rounded">{userRole}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-3 border-t pt-6">
                                        <button onClick={handleEditProfilePicture} className="w-full flex justify-between items-center p-3 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-md transition group"> <span className="flex items-center"> <Edit size={18} className="mr-3 text-gray-400 group-hover:text-blue-600" /> Edit Profile Picture </span> <span className="text-gray-400 group-hover:text-gray-600">&gt;</span> </button>
                                        <button onClick={handleChangePassword} className="w-full flex justify-between items-center p-3 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-md transition group"> <span className="flex items-center"> <Lock size={18} className="mr-3 text-gray-400 group-hover:text-blue-600" /> Change Password </span> <span className="text-gray-400 group-hover:text-gray-600">&gt;</span> </button>
                                        {/* --- UPDATED Link Structure --- */}
                                        <Link href="/privacy-policy" className="w-full flex justify-between items-center p-3 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-md transition group">
                                            <span className="flex items-center"> <Shield size={18} className="mr-3 text-gray-400 group-hover:text-blue-600" /> Privacy policy </span>
                                            <span className="text-gray-400 group-hover:text-gray-600">&gt;</span>
                                        </Link>
                                        <Link href="/terms-and-conditions" className="w-full flex justify-between items-center p-3 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-md transition group">
                                            <span className="flex items-center"> <FileText size={18} className="mr-3 text-gray-400 group-hover:text-blue-600" /> Terms and condition </span>
                                            <span className="text-gray-400 group-hover:text-gray-600">&gt;</span>
                                        </Link>
                                        {/* --- End of UPDATED Link Structure --- */}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Admin Settings Section (Conditional) */}
                        {userRole === 'Admin' && (
                            <div className="bg-white p-6 md:p-8 rounded-lg shadow">
                                <h2 className="text-lg font-medium text-gray-900 border-b pb-3 mb-6 flex items-center"> <HardHat size={18} className="mr-2 text-orange-600" /> Admin Settings </h2>
                                {settingsError && <div role="alert" className="mb-4 text-sm text-red-700 bg-red-100 p-3 rounded border border-red-200"><AlertTriangle size={16} className="inline mr-1"/> {settingsError}</div>}
                                <div className="mb-4 p-3 border rounded-md bg-gray-50 text-sm">
                                    <p>Current Dimensions: <span className="font-medium">{lengthM || 'Not Set'}</span>m L x <span className="font-medium">{widthM || 'Not Set'}</span>m W</p>
                                    <p>Calculated Usable Area: <span className="font-medium">{(Number(lengthM) * Number(widthM)).toFixed(2) || '0.00'} sq m</span></p>
                                </div>
                                <button onClick={handleOpenLandSizeModal} className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"> <SettingsIcon size={16} className="mr-2" /> Set Greenhouse Dimensions </button>
                                {saveError && <div role="alert" className="mt-4 text-sm text-red-700 bg-red-100 p-3 rounded border border-red-300"><AlertTriangle size={16} className="inline mr-1"/> {saveError}</div>}
                                {saveSuccess && <div role="status" className="mt-4 text-sm text-green-700 bg-green-100 p-3 rounded border border-green-300"><CheckCircle size={16} className="inline mr-1"/> {saveSuccess}</div>}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Render Land Size Modal (Conditionally) */}
            {isLandSizeModalOpen && userRole === 'Admin' && (
                <LandSizeModal
                    isOpen={isLandSizeModalOpen}
                    onClose={() => setIsLandSizeModalOpen(false)}
                    currentLength={Number(lengthM) || undefined}
                    currentWidth={Number(widthM) || undefined}
                    onSubmit={handleSaveLandSize}
                    isSaving={isSaving}
                />
            )}
        </div>
    );
}
