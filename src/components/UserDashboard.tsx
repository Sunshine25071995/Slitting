import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { JobCard, SlittingEntry } from '../types';
import { useAuth } from '../App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Share2, Save, ChevronRight, ChevronDown, CheckCircle2, Factory, Scale, Ruler, Plus, Trash2, Search } from 'lucide-react';
import { calculateNetWeight, calculateMeter } from '../lib/calculations';
import { toast } from 'sonner';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import { syncToGoogleSheets } from '../services/api';

export default function UserDashboard() {
  const { user } = useAuth();
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, SlittingEntry[]>>({});
  const [activeSizeIndex, setActiveSizeIndex] = useState(0);
  const [savingDocs, setSavingDocs] = useState<Set<string>>(new Set());
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    // In a real app, we might filter by assignedTo, but here we show all pending/in-progress jobs
    const q = query(collection(db, 'jobCards'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JobCard));
      setJobCards(cards);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'jobCards');
    });

    return () => unsubscribe();
  }, []);

  const fetchEntries = async (jobId: string) => {
    try {
      const q = query(collection(db, 'jobCards', jobId, 'entries'), orderBy('timestamp', 'asc'));
      const snapshot = await getDocs(q);
      const jobEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SlittingEntry));
      
      if (jobEntries.length === 0) {
        // Pre-populate 20 entries for each size
        const job = jobCards.find(j => j.id === jobId);
        if (job) {
          const initialEntries: SlittingEntry[] = [];
            job.sizes.forEach(size => {
              const count = Math.max(20, job.eachCoilRolls || 0);
              for (let i = 0; i < count; i++) {
                const newDocRef = doc(collection(db, 'jobCards', jobId, 'entries'));
                initialEntries.push({
                  id: newDocRef.id,
                  jobId: job.id!,
                  coilSize: size,
                  grossWeight: 0,
                  coreWeight: 0,
                  netWeight: 0,
                  meter: 0,
                  operatorUid: user!.uid,
                  timestamp: new Date().toISOString(),
                });
              }
            });
          setEntries(prev => ({ ...prev, [jobId]: initialEntries }));
        }
      } else {
        // Ensure at least 20 rows even if some were saved
        const job = jobCards.find(j => j.id === jobId);
        if (job) {
          const finalEntries = [...jobEntries];
            job.sizes.forEach(size => {
              const sizeCount = finalEntries.filter(e => e.coilSize === size).length;
              if (sizeCount < 20) {
                for (let i = 0; i < (20 - sizeCount); i++) {
                  const newDocRef = doc(collection(db, 'jobCards', jobId, 'entries'));
                  finalEntries.push({
                    id: newDocRef.id,
                    jobId: job.id!,
                    coilSize: size,
                    grossWeight: 0,
                    coreWeight: 0,
                    netWeight: 0,
                    meter: 0,
                    operatorUid: user!.uid,
                    timestamp: new Date().toISOString(),
                  });
                }
              }
            });
          setEntries(prev => ({ ...prev, [jobId]: finalEntries }));
        }
      }
    } catch (error) {
      console.error('Error fetching entries:', error);
    }
  };

  const toggleJob = (jobId: string) => {
    if (expandedJob === jobId) {
      setExpandedJob(null);
    } else {
      setExpandedJob(jobId);
      setActiveSizeIndex(0);
      if (!entries[jobId]) {
        fetchEntries(jobId);
      }
    }
  };

  const handleAddMultiple = (job: JobCard, size: number, count: number) => {
    const newEntries: SlittingEntry[] = Array(count).fill(null).map(() => ({
      jobId: job.id!,
      coilSize: size,
      grossWeight: 0,
      coreWeight: 0,
      netWeight: 0,
      meter: 0,
      operatorUid: user!.uid,
      timestamp: new Date().toISOString(),
    }));
    setEntries(prev => ({
      ...prev,
      [job.id!]: [...(prev[job.id!] || []), ...newEntries]
    }));
  };

  const handleAddEntry = (job: JobCard, size: number) => {
    const newEntry: SlittingEntry = {
      jobId: job.id!,
      coilSize: size,
      grossWeight: 0,
      coreWeight: 0,
      netWeight: 0,
      meter: 0,
      operatorUid: user!.uid,
      timestamp: new Date().toISOString(),
    };
    setEntries(prev => ({
      ...prev,
      [job.id!]: [...(prev[job.id!] || []), newEntry]
    }));
  };

  const updateEntryField = async (jobId: string, index: number, field: keyof SlittingEntry, value: number) => {
    const jobEntries = [...(entries[jobId] || [])];
    const entry = { ...jobEntries[index], [field]: value };
    const job = jobCards.find(j => j.id === jobId);
    
    if (field === 'grossWeight' || field === 'coreWeight') {
      if (job) {
        entry.netWeight = calculateNetWeight(entry.grossWeight, entry.coreWeight);
        entry.meter = calculateMeter(entry.netWeight, job.micron, entry.coilSize);
      }
    }
    
    jobEntries[index] = entry;

    // Core Weight Auto-fill logic
    if (field === 'coreWeight' && job) {
      const coilSize = entry.coilSize;
      const matchingIndices = jobEntries
        .map((e, i) => e.coilSize === coilSize ? i : -1)
        .filter(i => i !== -1);
      
      // If this is the FIRST entry for this coil size, propagate to all others
      if (matchingIndices[0] === index) {
        matchingIndices.forEach(idx => {
          if (idx !== index) { // Skip the one we already updated
            jobEntries[idx] = {
              ...jobEntries[idx],
              coreWeight: value,
              netWeight: calculateNetWeight(jobEntries[idx].grossWeight, value),
              meter: calculateMeter(calculateNetWeight(jobEntries[idx].grossWeight, value), job.micron, jobEntries[idx].coilSize)
            };
          }
        });
      }
    }
    
    setEntries(prev => ({ ...prev, [jobId]: jobEntries }));

    // Auto-save logic: Robust saving with pre-generated IDs
    // If it was a coreWeight auto-fill from the first row, we should ideally save all affected rows that have grossWeight > 0
    const toSave = [jobEntries[index]];
    
    // If it was an auto-fill, add other affected entries that have grossWeight > 0 to the save queue
    if (field === 'coreWeight' && job) {
      const coilSize = entry.coilSize;
      const matchingIndices = jobEntries
        .map((e, i) => e.coilSize === coilSize ? i : -1)
        .filter(i => i !== -1);
      if (matchingIndices[0] === index) {
        matchingIndices.forEach(idx => {
          if (idx !== index && jobEntries[idx].id && jobEntries[idx].grossWeight > 0) {
            toSave.push(jobEntries[idx]);
          }
        });
      }
    }

    for (const item of toSave) {
      if (item.id && (field === 'coreWeight' || item.grossWeight > 0)) {
        setSavingDocs(prev => new Set(prev).add(item.id!));
        try {
          await setDoc(doc(db, 'jobCards', jobId, 'entries', item.id), {
            ...item,
            timestamp: serverTimestamp(),
          });

          // Live Sync to Google Sheets
          if (item.grossWeight > 0) {
            syncToGoogleSheets({ 
              ...item, 
              jobNumber: job?.jobNumber || 'Unknown' 
            }, 'PRODUCTION_ENTRY').catch(() => {});
          }
        } catch (err) {
          console.error('Auto-save failed:', err);
        } finally {
          setSavingDocs(prev => {
            const next = new Set(prev);
            next.delete(item.id!);
            return next;
          });
        }
      }
    }
  };

  const handleDeleteEntry = (jobId: string, index: number) => {
    const jobEntries = [...(entries[jobId] || [])];
    jobEntries.splice(index, 1);
    setEntries(prev => ({ ...prev, [jobId]: jobEntries }));
  };

  const saveEntries = async (jobId: string) => {
    try {
      const jobEntries = (entries[jobId] || []).filter(e => e.grossWeight > 0);
      
      const savePromises = jobEntries.map(entry => {
        const docRef = doc(db, 'jobCards', jobId, 'entries', entry.id!);
        return setDoc(docRef, {
          ...entry,
          timestamp: serverTimestamp(),
        }, { merge: true });
      });

      await Promise.all(savePromises);
      toast.success('Entries saved successfully');
      
      // Sync to Google Sheets (Batch)
      const job = jobCards.find(j => j.id === jobId);
      const batchData = jobEntries.map(entry => ({
        ...entry,
        jobNumber: job?.jobNumber || 'Unknown'
      }));

      if (batchData.length > 0) {
        await syncToGoogleSheets(batchData, 'PRODUCTION_BATCH');
        toast.success('Synced to Google Sheets');
      }
      
      fetchEntries(jobId); // Refresh to get IDs
    } catch (error) {
      toast.error('Failed to save entries');
      console.error(error);
    }
  };

  const shareViaWhatsApp = async (jobId: string) => {
    const element = cardRefs.current[jobId];
    if (!element) {
      toast.error('Could not find data to share');
      return;
    }

    try {
      toast.loading('Preparing image for sharing...', { id: 'share' });
      const canvas = await html2canvas(element, { 
        scale: 3, // Higher scale for better clarity
        useCORS: true,
        backgroundColor: '#F3F4F6',
        onclone: (clonedDoc) => {
          const noPrint = clonedDoc.querySelectorAll('.no-print');
          noPrint.forEach(el => (el as HTMLElement).style.display = 'none');
          
          // Ensure the cloned version is visible for capture
          const target = clonedDoc.querySelector(`[data-job-id="${jobId}"]`);
          if (target) {
            (target as HTMLElement).style.height = 'auto';
            (target as HTMLElement).style.overflow = 'visible';
          }
        }
      });
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.dismiss('share');
          return;
        }
        
        const fileName = `JobCard_${jobId}_${format(new Date(), 'ddMMMyy_HHmm')}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });
        
        toast.dismiss('share');
        
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Sunshine Production Data',
              text: `Slitting data for Job: ${jobCards.find(j => j.id === jobId)?.jobNumber}`,
            });
            toast.success('Shared successfully');
          } catch (err) {
            console.error('Share failed:', err);
            // Fallback to download on error
            const link = document.createElement('a');
            link.download = fileName;
            link.href = canvas.toDataURL('image/png');
            link.click();
            toast.warning('Share failed. Image downloaded instead.');
          }
        } else {
          // Fallback: Download image
          const link = document.createElement('a');
          link.download = fileName;
          link.href = canvas.toDataURL('image/png');
          link.click();
          toast.success('Image downloaded for sharing');
        }
      }, 'image/png', 0.9);
    } catch (error) {
      toast.dismiss('share');
      console.error('Canvas error:', error);
      toast.error('Failed to generate sharing image');
    }
  };

  const totals = (entries[expandedJob || ''] || []).reduce((acc, entry) => {
    acc.netWeight += entry.netWeight;
    acc.meter += entry.meter;
    return acc;
  }, { netWeight: 0, meter: 0 });

  const getCoilTotals = (jobId: string, size: number) => {
    const filtered = (entries[jobId] || []).filter(e => e.coilSize === size);
    return filtered.reduce((acc, e) => {
      acc.weight += e.netWeight;
      return acc;
    }, { weight: 0 });
  };

  const currentJob = expandedJob ? jobCards.find(j => j.id === expandedJob) : null;

  // View state: 'list' or 'entry'
  const view = (expandedJob && currentJob) ? 'entry' : 'list';

  const filteredJobCards = jobCards.filter(job => {
    const matchesSearch = job.jobNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || job.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full bg-[#F3F4F6] flex overflow-hidden relative">
      {/* Sidebar / List View */}
      <section className={`
        ${view === 'entry' ? 'hidden lg:flex' : 'flex'} 
        w-full lg:w-[400px] border-r border-slate-200 bg-white flex-col shrink-0 h-full overflow-hidden
      `}>
        <div className="p-6 space-y-6 shrink-0 bg-white border-b border-slate-50">
          <div>
            <h2 className="text-4xl font-extrabold text-[#111827] tracking-tight">Sunshine Live</h2>
            <p className="text-slate-500 font-semibold text-sm mt-1">Operator Production Console</p>
          </div>
          
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search job cards..." 
                className="w-full h-14 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 font-bold placeholder:text-slate-400 focus:ring-4 focus:ring-[#5B50D6]/10 focus:border-[#5B50D6] transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              {['All', 'Pending', 'In-Progress'].map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`flex-1 h-10 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${
                    statusFilter === status 
                    ? 'bg-[#5B50D6] border-[#5B50D6] text-white shadow-lg shadow-indigo-100' 
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto p-6 space-y-4 custom-scrollbar bg-slate-50/50">
          {filteredJobCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300 text-center py-12">
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-sm mb-4">
                <Factory className="h-10 w-10 opacity-20" />
              </div>
              <p className="text-sm font-bold">No active jobs assigned</p>
            </div>
          ) : (
            filteredJobCards.map((job) => {
              const statusColors = {
                'pending': { border: 'border-l-[#94A3B8]', badge: 'bg-[#94A3B8] text-white', shadow: 'shadow-slate-100' },
                'in-progress': { border: 'border-l-[#EAB308]', badge: 'bg-[#EAB308] text-white', shadow: 'shadow-yellow-100/50' },
                'completed': { border: 'border-l-[#10B981]', badge: 'bg-[#10B981] text-white', shadow: 'shadow-emerald-100/50' }
              };
              const colors = statusColors[job.status] || statusColors.pending;
              
              return (
                <div 
                  key={job.id} 
                  onClick={() => toggleJob(job.id!)}
                  className={`
                    group p-6 rounded-[2rem] border-2 border-slate-100 bg-white border-l-[6px] ${colors.border} ${colors.shadow}
                    transition-all cursor-pointer relative overflow-hidden shadow-xl hover:scale-[1.02] active:scale-[0.98]
                    ${expandedJob === job.id ? 'ring-2 ring-indigo-500/20' : ''}
                  `}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-black tracking-tighter text-slate-900 leading-none">
                        #{job.jobNumber}
                      </span>
                      <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black text-slate-400">
                        {format(new Date(job.date), 'dd/MM/yyyy')}
                      </span>
                    </div>
                    <div className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${colors.badge}`}>
                      {job.status}
                    </div>
                  </div>

                  <div className="mb-6">
                    <h4 className="font-black text-base text-slate-700 uppercase leading-tight">
                      {job.customerName || '000'}
                    </h4>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {[
                      { label: 'Micron', value: job.micron },
                      { label: 'Length', value: `${job.totalLength || 0} m` },
                      { label: 'Target', value: `${job.totalQuantity || 0} kg` }
                    ].map((stat, i) => (
                      <div key={i} className="bg-slate-50/80 rounded-2xl p-3 flex flex-col items-center justify-center border border-slate-100">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</span>
                        <span className="text-sm font-black text-slate-800">{stat.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 pt-4 border-t border-slate-50">
                    {(job.coilPlan || job.sizes.map(s => ({ size: s, rolls: job.eachCoilRolls }))).map((plan, idx) => {
                      // Note: we'd need to fetch actual entries to show real progress here, 
                      // but for the UI placeholders from the screenshot:
                      return (
                        <div key={idx} className="flex items-center justify-between px-2 bg-slate-50/30 py-2 rounded-xl">
                          <span className="text-xs font-black text-slate-600 font-mono tracking-tighter">{plan.size}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-[#5B50D6] font-mono">{(plan.rolls * (job.totalLength || 0) / (job.coilPlan?.length || 1)).toFixed(0)} m</span>
                            <span className="text-[10px] font-black text-emerald-500 font-mono">{(job.totalQuantity || 0).toFixed(1)} kg</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Main Content Area: Data Entry View */}
      <div className={`
        ${view === 'entry' ? 'flex' : 'hidden lg:flex'} 
        flex-grow flex-col h-full bg-[#F3F4F6] relative z-10
      `}>
        {expandedJob && currentJob ? (
          <div 
            className="flex flex-col h-full overflow-hidden" 
            ref={el => cardRefs.current[expandedJob!] = el}
            data-job-id={expandedJob}
          >
            {/* Header / Info Section (Fixed Container) */}
            <div className="flex flex-col h-full overflow-hidden">
              
              {/* Top Navigation / Progress (Fixed) */}
              <div className="px-4 lg:px-8 pt-3 lg:pt-4 flex flex-col gap-3 shrink-0 bg-[#F3F4F6] z-10">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setExpandedJob(null)}
                    className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm border border-slate-100 transition-all lg:hidden"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </button>
                  <div className="flex flex-col">
                    <h3 className="text-base font-black text-slate-900 leading-tight">Job: #{currentJob.jobNumber}</h3>
                    <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest">{currentJob.micron} Mic • {currentJob.eachCoilRolls} Target</p>
                  </div>
                  <div className="ml-auto">
                    <div className="bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm">
                       <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">Live</span>
                    </div>
                  </div>
                </div>

                {/* Slot Selection (Horizontal Scroll stays fixed) */}
                <div className="flex gap-1.5 overflow-x-auto pb-1.5 no-print hide-scrollbar shrink-0">
                  {currentJob.sizes.map((size, idx) => {
                    const isActive = activeSizeIndex === idx;
                    const coilTotal = getCoilTotals(expandedJob, size).weight;
                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveSizeIndex(idx)}
                        className={`flex flex-col items-start min-w-[110px] p-2.5 rounded-xl border-2 transition-all ${
                          isActive 
                            ? 'bg-[#111827] border-[#111827] text-white shadow-lg' 
                            : 'bg-white border-transparent text-slate-400 hover:bg-white/60'
                        }`}
                      >
                        <span className={`text-[8px] font-black uppercase tracking-tighter ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>
                          Slot {idx + 1}
                        </span>
                        <span className={`text-base font-black ${isActive ? 'text-white' : 'text-slate-900'}`}>
                          {size} <span className="text-[9px] font-bold">mm</span>
                        </span>
                        <div className="mt-0.5 flex items-center gap-1">
                          <span className={`text-[9px] font-mono font-bold ${isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {coilTotal.toFixed(1)} <span className="text-[7px] opacity-70">KG</span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Main Data Form / Table Container (Scrollable Area) */}
              <div className="flex-grow flex flex-col min-h-0 bg-white border-t border-slate-200 overflow-hidden lg:m-4 lg:rounded-2xl lg:border">
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/30 shrink-0">
                  <div className="flex items-center gap-2">
                    <Ruler className="h-3.5 w-3.5 text-[#5B50D6]" />
                    <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                      {currentJob.sizes[activeSizeIndex]} mm Slitting Log
                    </h2>
                    {savingDocs.size > 0 && (
                      <Loader2 className="h-3 w-3 animate-spin text-indigo-500 ml-1.5" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Rows</span>
                    <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono font-black text-[10px]">
                       {(entries[expandedJob] || []).filter(e => e.coilSize === currentJob.sizes[activeSizeIndex]).filter(e => e.grossWeight > 0).length}
                    </span>
                  </div>
                </div>

                <div className="flex-grow overflow-auto relative">
                  <table className="w-full border-separate border-spacing-0">
                    <thead className="bg-[#111827] sticky top-0 z-20">
                      <tr>
                        <th className="py-2 px-2 border-r border-slate-800 text-[8px] font-black uppercase text-slate-500 w-10 text-center">#</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-[8px] font-black uppercase text-slate-500 text-center">Meter</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-[8px] font-black uppercase text-slate-500 text-center">Gross</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-[8px] font-black uppercase text-slate-500 text-center">Core</th>
                        <th className="py-2 px-2 border-r border-slate-800 text-[8px] font-black uppercase text-[#10b981] text-center">Net</th>
                        <th className="py-2 px-2 border-slate-800 w-10 text-center bg-[#111827]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(entries[expandedJob] || [])
                        .filter(e => e.coilSize === currentJob.sizes[activeSizeIndex])
                        .map((entry, idx) => (
                          <tr key={idx} className="group hover:bg-slate-50/50 transition-all">
                            <td className="py-1 px-2 text-center border-r border-slate-50 bg-slate-50/10">
                              <span className="text-[9px] font-mono font-black text-slate-400">{idx + 1}</span>
                            </td>
                            <td className="py-0.5 px-2 border-r border-slate-50">
                              <input 
                                type="number" 
                                className="w-full h-7 bg-transparent font-mono font-bold text-slate-400 text-center focus:outline-none text-[10px]"
                                placeholder="..."
                                value={entry.meter || ''}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  const jobEntries = [...(entries[expandedJob!] || [])];
                                  const fullIdx = jobEntries.indexOf(entry);
                                  jobEntries[fullIdx] = { ...entry, meter: val };
                                  setEntries(prev => ({ ...prev, [expandedJob!]: jobEntries }));
                                }}
                                onBlur={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  const fullIdx = entries[expandedJob!].indexOf(entry);
                                  updateEntryField(expandedJob!, fullIdx, 'meter', val);
                                }}
                              />
                            </td>
                            <td className="py-0.5 px-2 border-r border-slate-50">
                              <input 
                                type="number" 
                                step="0.01"
                                className="w-full h-7 bg-transparent font-mono font-black text-slate-900 text-center focus:outline-none text-[10px]"
                                placeholder="0.00"
                                value={entry.grossWeight || ''}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  const jobEntries = [...(entries[expandedJob!] || [])];
                                  const fullIdx = jobEntries.indexOf(entry);
                                  jobEntries[fullIdx] = { ...entry, grossWeight: val };
                                  setEntries(prev => ({ ...prev, [expandedJob!]: jobEntries }));
                                }}
                                onBlur={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  const fullIdx = entries[expandedJob!].indexOf(entry);
                                  updateEntryField(expandedJob!, fullIdx, 'grossWeight', val);
                                }}
                              />
                            </td>
                            <td className="py-0.5 px-2 border-r border-slate-50">
                              <input 
                                type="number" 
                                step="0.1"
                                className="w-full h-7 bg-transparent font-mono font-black text-slate-900 text-center focus:outline-none text-[10px]"
                                placeholder="0.0"
                                value={entry.coreWeight || ''}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  const jobEntries = [...(entries[expandedJob!] || [])];
                                  const fullIdx = jobEntries.indexOf(entry);
                                  jobEntries[fullIdx] = { ...entry, coreWeight: val };
                                  setEntries(prev => ({ ...prev, [expandedJob!]: jobEntries }));
                                }}
                                onBlur={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  const fullIdx = entries[expandedJob!].indexOf(entry);
                                  updateEntryField(expandedJob!, fullIdx, 'coreWeight', val);
                                }}
                              />
                            </td>
                            <td className="py-0.5 px-2 border-r border-slate-50 bg-[#10b981]/5">
                              <div className="font-mono font-black text-[#10b981] text-center text-[10px]">
                                {entry.netWeight.toFixed(2)}
                              </div>
                            </td>
                            <td className="py-0.5 px-2 text-center no-print">
                              <button 
                                onClick={() => {
                                  const fullIdx = (entries[expandedJob] || []).indexOf(entry);
                                  handleDeleteEntry(expandedJob, fullIdx);
                                }}
                                className="p-0.5 text-slate-200 hover:text-red-500 rounded transition-all"
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  
                  {/* Add Rows Button inside scrollable area */}
                  <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-center no-print">
                    <button 
                      className="w-full h-10 border border-dashed border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-400 hover:border-[#5B50D6] hover:text-[#5B50D6] transition-all flex items-center justify-center gap-2"
                      onClick={() => handleAddMultiple(currentJob, currentJob.sizes[activeSizeIndex], 5)}
                    >
                      <Plus className="h-4 w-4" />
                      Add 5 More Rows
                    </button>
                  </div>
                </div>
              </div>

              {/* Summary & Fixed Actions Footer (Fixed) */}
              <div className="shrink-0 bg-white border-t border-slate-200 p-3 lg:p-4 space-y-3 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] z-10">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#F3F4F6] rounded-xl p-2 flex flex-col items-center justify-center border border-slate-100">
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Production Mtr</span>
                    <span className="text-base font-mono font-black text-[#111827]">{totals.meter.toLocaleString()}</span>
                  </div>
                  <div className="bg-[#10b981]/5 rounded-xl p-2 flex flex-col items-center justify-center border border-[#10b981]/20">
                    <span className="text-[7px] font-black text-[#10b981] uppercase tracking-widest mb-0.5">Total Net Wt</span>
                    <span className="text-base font-mono font-black text-[#10b981]">{totals.netWeight.toFixed(2)} KG</span>
                  </div>
                </div>

                <div className="flex gap-2 no-print">
                  <button 
                    className="flex-[2] h-11 bg-[#111827] rounded-xl text-white font-black text-xs shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
                    onClick={() => saveEntries(expandedJob)}
                  >
                    <Save className="h-3.5 w-3.5" />
                    SAVE DATA
                  </button>
                  <button 
                    className="flex-1 h-11 bg-white border border-slate-200 rounded-xl text-slate-600 font-black text-[9px] flex items-center justify-center gap-2"
                    onClick={() => shareViaWhatsApp(expandedJob)}
                  >
                    <Share2 className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center text-slate-300 p-12 lg:bg-white">
            <div className="w-40 h-40 bg-slate-50 rounded-[3rem] flex items-center justify-center shadow-inner mb-8">
              <Factory className="h-16 w-16 opacity-10" />
            </div>
            <h3 className="text-4xl font-black text-slate-400 tracking-tighter uppercase">No Job Selected</h3>
            <p className="text-slate-400 font-bold mt-2">Select an active production card from the left console</p>
          </div>
        )}
      </div>

      {/* Industrial Floating Indicator (Sunshine Watermark) */}
      <div className="fixed bottom-6 right-6 pointer-events-none opacity-5 no-print select-none">
        <span className="text-8xl font-black italic">SUNSHINE PRO</span>
      </div>
    </div>
  );
}
