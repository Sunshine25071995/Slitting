/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged, signInAnonymously, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import { Toaster, toast } from 'sonner';
import AdminDashboard from '@/components/AdminDashboard';
import UserDashboard from '@/components/UserDashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn, Loader2, Factory, User as UserIcon, ShieldCheck, ChevronRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminCreds, setAdminCreds] = useState({ username: '', password: '' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminCreds.username === 'Admin' && adminCreds.password === 'Admin.123') {
      try {
        setLoading(true);
        const result = await signInAnonymously(auth);
        const user = result.user;
        const docRef = doc(db, 'users', user.uid);
        const newProfile: UserProfile = {
          uid: user.uid,
          email: 'admin@slitmaster.pro',
          displayName: 'Administrator',
          role: 'admin',
          createdAt: new Date().toISOString(),
        };
        await setDoc(docRef, {
          ...newProfile,
          createdAt: serverTimestamp(),
        });
        setProfile(newProfile);
        toast.success('Admin login successful');
      } catch (error: any) {
        if (error.code === 'auth/operation-not-allowed' || error.code === 'auth/admin-restricted-operation') {
          toast.error('Login failed: Anonymous Auth is restricted or not enabled in Firebase Console. Please enable it under Authentication > Sign-in method and ensure "User signup" is enabled in Settings.');
        } else {
          toast.error(`Admin login failed: ${error.message}`);
        }
        console.error('Admin login error:', error);
      } finally {
        setLoading(false);
      }
    } else {
      toast.error('Invalid admin credentials');
    }
  };

  const handleOperatorLogin = async () => {
    try {
      setLoading(true);
      const result = await signInAnonymously(auth);
      const user = result.user;
      const docRef = doc(db, 'users', user.uid);
      const newProfile: UserProfile = {
        uid: user.uid,
        email: 'operator@slitmaster.pro',
        displayName: 'Operator',
        role: 'operator',
        createdAt: new Date().toISOString(),
      };
      await setDoc(docRef, {
        ...newProfile,
        createdAt: serverTimestamp(),
      });
      setProfile(newProfile);
      toast.success('Operator access granted');
    } catch (error: any) {
      if (error.code === 'auth/operation-not-allowed' || error.code === 'auth/admin-restricted-operation') {
        toast.error('Access failed: Anonymous Auth is restricted or not enabled in Firebase Console. Please enable it under Authentication > Sign-in method and ensure "User signup" is enabled in Settings.');
      } else {
        toast.error(`Operator access failed: ${error.message}`);
      }
      console.error('Operator login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setProfile(null);
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn: async () => {}, logout }}>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
        {!profile ? (
          <div className="flex h-screen items-center justify-center p-4 bg-[#f0f2f5]">
            <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Bento: Branding */}
              <div className="bg-primary rounded-3xl p-8 flex flex-col justify-between text-white shadow-xl shadow-primary/20">
                <div>
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-6">
                    <Factory className="h-7 w-7 text-white" />
                  </div>
                  <h1 className="text-4xl font-bold tracking-tight mb-2">Sunshine Pro</h1>
                  <p className="text-white/70 text-lg">PVC Shrink Film Slitting Department Data Entry System</p>
                </div>
                <div className="mt-8 space-y-4">
                  <div className="flex items-center gap-3 bg-white/10 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                    <ShieldCheck className="h-5 w-5 text-white" />
                    <p className="text-sm font-medium">Secure Admin Controls</p>
                  </div>
                  <div className="flex items-center gap-3 bg-white/10 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                    <Factory className="h-5 w-5 text-white" />
                    <p className="text-sm font-medium">Real-time Production Entry</p>
                  </div>
                </div>
              </div>

              {/* Right Bento: Auth Tabs */}
              <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 flex flex-col">
                <Tabs defaultValue="operator" className="w-full flex-grow flex flex-col">
                  <TabsList className="grid w-full grid-cols-2 mb-8 bg-slate-100 p-1 rounded-2xl h-12">
                    <TabsTrigger value="operator" className="rounded-xl font-bold text-xs data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">
                      OPERATOR
                    </TabsTrigger>
                    <TabsTrigger value="admin" className="rounded-xl font-bold text-xs data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">
                      ADMIN
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="operator" className="flex-grow flex flex-col justify-center">
                    <div className="text-center mb-8">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <UserIcon className="h-8 w-8 text-slate-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900">Operator Access</h2>
                      <p className="text-slate-500 text-sm mt-1">No credentials required for production entry</p>
                    </div>
                    <Button onClick={handleOperatorLogin} className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg shadow-primary/20 group">
                      Enter Dashboard
                      <ChevronRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </TabsContent>

                  <TabsContent value="admin">
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-slate-900">Admin Login</h2>
                      <p className="text-slate-500 text-sm mt-1">Enter your administrative credentials</p>
                    </div>
                    <form onSubmit={handleAdminLogin} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase text-slate-500 ml-1">Username</Label>
                        <Input 
                          placeholder="Admin" 
                          className="h-12 rounded-xl border-slate-200 font-medium"
                          value={adminCreds.username}
                          onChange={e => setAdminCreds({...adminCreds, username: e.target.value})}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase text-slate-500 ml-1">Password</Label>
                        <Input 
                          type="password" 
                          placeholder="••••••••" 
                          className="h-12 rounded-xl border-slate-200 font-medium"
                          value={adminCreds.password}
                          onChange={e => setAdminCreds({...adminCreds, password: e.target.value})}
                        />
                      </div>
                      <Button type="submit" className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg shadow-primary/20 mt-4">
                        <LogIn className="mr-2 h-5 w-5" />
                        Login as Admin
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
                <p className="text-center text-[10px] text-slate-400 mt-8 font-bold uppercase tracking-widest">
                  Sunshine Pro v2.1 • Industrial Systems
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-screen overflow-hidden">
            <header className="shrink-0 p-4 lg:p-6 bg-[#F3F4F6] z-50">
              <div className="bg-white px-6 h-16 sm:h-20 rounded-[1.5rem] sm:rounded-[2.5rem] flex items-center justify-between shadow-xl shadow-slate-200/50 border border-white">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#5B50D6] rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
                    <div className="relative">
                      <div className="w-6 h-6 sm:w-7 sm:h-7 border-2 border-white/40 rounded-lg" />
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 bg-white rounded-sm rotate-45" />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <h1 className="text-lg sm:text-2xl font-black tracking-tight text-slate-800 leading-none">Sunshine</h1>
                    <div className="flex items-center gap-1.5 mt-1 sm:mt-1.5">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                      <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Live System</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <button 
                    onClick={() => window.location.reload()}
                    className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-50 border border-slate-100 rounded-xl sm:rounded-2xl flex items-center justify-center text-slate-400 hover:text-[#5B50D6] hover:bg-white hover:shadow-md transition-all active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                  </button>
                  <button 
                    onClick={logout}
                    className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-50 border border-slate-100 rounded-xl sm:rounded-2xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-white hover:shadow-md transition-all active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  </button>
                </div>
              </div>
            </header>
            <main className="flex-grow overflow-hidden bg-[#F3F4F6]">
              {profile?.role === 'admin' ? <AdminDashboard /> : <UserDashboard />}
            </main>
          </div>
        )}
        <Toaster position="top-center" richColors />
      </div>
    </AuthContext.Provider>
  );
}

