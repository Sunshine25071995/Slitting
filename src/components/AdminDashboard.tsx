import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { JobCard } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Search, Download, Edit2, Trash2, Loader2, Calendar as CalendarIcon, CheckCircle2, Scale, Factory, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { syncToGoogleSheets } from '../services/api';

export default function AdminDashboard() {
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobCard | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    jobNumber: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    customerName: '',
    micron: '',
    totalQuantity: '',
    totalLength: '',
    coilPlan: [{ size: '', rolls: '' }],
    status: 'pending' as 'pending' | 'in-progress' | 'completed',
  });

  useEffect(() => {
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

  const filteredJobs = jobCards.filter(job => 
    job.jobNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (job.customerName && job.customerName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const validCoilPlan = formData.coilPlan
        .map(p => ({ size: parseFloat(p.size as string), rolls: parseInt(p.rolls as string) }))
        .filter(p => !isNaN(p.size) && !isNaN(p.rolls));
      
      const sizesArray = validCoilPlan.map(p => p.size);
      
      const jobData = {
        jobNumber: formData.jobNumber,
        date: formData.date,
        customerName: formData.customerName,
        micron: parseFloat(formData.micron) || 0,
        totalQuantity: parseFloat(formData.totalQuantity) || 0,
        totalLength: parseFloat(formData.totalLength) || 0,
        coilPlan: validCoilPlan,
        status: formData.status,
        updatedAt: serverTimestamp(),
        // Compatibility fields
        sizes: sizesArray,
        eachCoilRolls: validCoilPlan[0]?.rolls || 0,
        oneRollMeter: (parseFloat(formData.totalLength) || 0) / (validCoilPlan[0]?.rolls || 1),
        eachCoilQuantity: parseFloat(formData.totalQuantity) || 0,
      };

      if (editingJob) {
        await updateDoc(doc(db, 'jobCards', editingJob.id!), jobData);
        toast.success('Job card updated successfully');
        try {
          await syncToGoogleSheets(jobData, 'JOB_SUMMARY');
          toast.success('Synced to Google Sheets');
        } catch (e) {
          console.warn('Google Sheets sync failed, but data saved to Firestore');
        }
      } else {
        await addDoc(collection(db, 'jobCards'), {
          ...jobData,
          createdAt: serverTimestamp(),
        });
        toast.success('Job card created successfully');
        try {
          await syncToGoogleSheets(jobData, 'JOB_SUMMARY');
          toast.success('Synced to Google Sheets');
        } catch (e) {
          console.warn('Google Sheets sync failed, but data saved to Firestore');
        }
      }

      setIsDialogOpen(false);
      setEditingJob(null);
      setFormData({
        jobNumber: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        customerName: '',
        micron: '',
        totalQuantity: '',
        totalLength: '',
        coilPlan: [{ size: '', rolls: '' }],
        status: 'pending',
      });
    } catch (error) {
      toast.error('Failed to save job card');
      console.error(error);
    }
  };

  const addCoil = () => {
    setFormData({
      ...formData,
      coilPlan: [...formData.coilPlan, { size: '', rolls: '' }]
    });
  };

  const removeCoil = (index: number) => {
    if (formData.coilPlan.length <= 1) return;
    const newPlan = [...formData.coilPlan];
    newPlan.splice(index, 1);
    setFormData({ ...formData, coilPlan: newPlan });
  };

  const updateCoil = (index: number, field: 'size' | 'rolls', value: string) => {
    const newPlan = [...formData.coilPlan];
    newPlan[index] = { ...newPlan[index], [field]: value };
    setFormData({ ...formData, coilPlan: newPlan });
  };

  const handleEdit = (job: JobCard) => {
    setEditingJob(job);
    setFormData({
      jobNumber: job.jobNumber,
      date: job.date,
      customerName: job.customerName || '',
      micron: job.micron?.toString() || '',
      totalQuantity: job.totalQuantity?.toString() || '',
      totalLength: job.totalLength?.toString() || '',
      coilPlan: job.coilPlan?.map(p => ({ size: p.size.toString(), rolls: p.rolls.toString() })) || [{ size: '', rolls: '' }],
      status: job.status,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this job card?')) {
      try {
        await deleteDoc(doc(db, 'jobCards', id));
        toast.success('Job card deleted');
      } catch (error) {
        toast.error('Failed to delete job card');
      }
    }
  };

  const exportToExcel = () => {
    const data = jobCards.map(job => ({
      'Job Number': job.jobNumber,
      'Date': job.date,
      'Sizes': job.sizes.join(', '),
      'Micron': job.micron,
      '1 Roll Meter': job.oneRollMeter,
      'Coil Quantity': job.eachCoilQuantity,
      'Coil Rolls': job.eachCoilRolls,
      'Status': job.status,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'JobCards');
    XLSX.writeFile(wb, `JobCards_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="h-full p-4 flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Admin Dashboard</h2>
          <p className="text-xs text-slate-500 font-medium">Manage job cards and production data</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="h-10 border-slate-200 font-bold text-slate-600">
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingJob(null);
              setFormData({
                jobNumber: '',
                date: format(new Date(), 'yyyy-MM-dd'),
                customerName: '',
                micron: '',
                totalQuantity: '',
                totalLength: '',
                coilPlan: [{ size: '', rolls: '' }],
                status: 'pending',
              });
            }
          }}>
            <DialogTrigger render={<Button className="h-10 font-bold shadow-lg shadow-primary/20 bg-[#111827] hover:bg-[#111827]/90 text-white" />}>
                <Plus className="mr-2 h-4 w-4" />
                New Job Card
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-0 rounded-[2rem] shadow-2xl">
              <div className="bg-[#111827] p-6 flex items-center gap-3">
                 <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
                   <Factory className="h-6 w-6 text-white" />
                 </div>
                 <h2 className="text-xl font-black text-white tracking-tight uppercase">Create Slitting Job Card</h2>
              </div>
              
              <form onSubmit={handleSave} className="p-8 space-y-6 bg-white overflow-y-auto max-h-[80vh]">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Date</Label>
                    <Input 
                      type="date" 
                      className="h-14 rounded-2xl border-slate-100 bg-slate-50/50 font-bold focus:ring-4 focus:ring-[#111827]/5 transition-all"
                      value={formData.date} 
                      onChange={e => setFormData({...formData, date: e.target.value})}
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Job No</Label>
                    <Input 
                      placeholder="e.g. 1005"
                      className="h-14 rounded-2xl border-slate-100 bg-slate-50/50 font-bold focus:ring-4 focus:ring-[#111827]/5 transition-all placeholder:text-slate-300"
                      value={formData.jobNumber} 
                      onChange={e => setFormData({...formData, jobNumber: e.target.value})}
                      required 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Select Party</Label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                    <Input 
                      placeholder="Search..." 
                      className="h-14 pl-12 rounded-2xl border-slate-100 bg-slate-50/50 font-bold focus:ring-4 focus:ring-[#111827]/5 transition-all placeholder:text-slate-300"
                      value={formData.customerName} 
                      onChange={e => setFormData({...formData, customerName: e.target.value})}
                      required 
                    />
                  </div>
                </div>

                <div className="p-6 rounded-3xl border-2 border-slate-50 bg-slate-50/20 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Coil Plan</h3>
                    <Button 
                      type="button" 
                      onClick={addCoil}
                      variant="ghost" 
                      className="h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#5B50D6] bg-indigo-50 hover:bg-indigo-100"
                    >
                      + Add Coil
                    </Button>
                  </div>
                  
                  {formData.coilPlan.map((coil, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr,1fr,40px] gap-3 items-end">
                      <div className="space-y-1.5">
                        <Label className="text-[8px] font-black uppercase tracking-widest text-slate-300">Size</Label>
                        <Input 
                          placeholder="e.g. 100mm"
                          className="h-12 rounded-xl border-slate-100 bg-white font-bold"
                          value={coil.size}
                          onChange={e => updateCoil(idx, 'size', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[8px] font-black uppercase tracking-widest text-slate-300">Rolls</Label>
                        <Input 
                          placeholder="0"
                          className="h-12 rounded-xl border-slate-100 bg-white font-bold text-center"
                          value={coil.rolls}
                          onChange={e => updateCoil(idx, 'rolls', e.target.value)}
                        />
                      </div>
                      {formData.coilPlan.length > 1 && (
                        <Button 
                          type="button" 
                          onClick={() => removeCoil(idx)}
                          variant="ghost" 
                          size="icon" 
                          className="h-12 w-10 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Micron</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      className="h-14 rounded-2xl border-slate-100 bg-slate-50/50 font-bold text-center"
                      value={formData.micron} 
                      onChange={e => setFormData({...formData, micron: e.target.value})}
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Qty (KG)</Label>
                    <Input 
                      type="number"
                      className="h-14 rounded-2xl border-slate-100 bg-slate-50/50 font-bold text-center"
                      value={formData.totalQuantity} 
                      onChange={e => setFormData({...formData, totalQuantity: e.target.value})}
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Length (M)</Label>
                    <Input 
                      type="number"
                      className="h-14 rounded-2xl border-slate-100 bg-slate-50/50 font-bold text-center"
                      value={formData.totalLength} 
                      onChange={e => setFormData({...formData, totalLength: e.target.value})}
                      required 
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full h-16 bg-[#111827] hover:bg-[#111827]/90 text-white rounded-2xl font-black text-lg tracking-tight uppercase shadow-xl shadow-slate-200 mt-4 active:scale-[0.98] transition-all">
                  {editingJob ? 'Update Job Card' : 'Create Job Card'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 flex flex-col flex-grow overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Production Job Cards</h3>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search job number..."
              className="pl-9 h-9 rounded-lg border-slate-200 text-xs"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-grow overflow-auto custom-scrollbar">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#5B50D6]" />
            </div>
          ) : (
            <div className="min-w-full overflow-x-auto">
              <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-white z-10">
                <tr>
                  <th className="text-left py-3 px-4 border-b-2 border-slate-100 text-[10px] font-black uppercase text-slate-400">Job No.</th>
                  <th className="text-left py-3 px-4 border-b-2 border-slate-100 text-[10px] font-black uppercase text-slate-400">Customer</th>
                  <th className="text-left py-3 px-4 border-b-2 border-slate-100 text-[10px] font-black uppercase text-slate-400">Sizes (mm)</th>
                  <th className="text-left py-3 px-4 border-b-2 border-slate-100 text-[10px] font-black uppercase text-slate-400">Micron</th>
                  <th className="text-right py-3 px-4 border-b-2 border-slate-100 text-[10px] font-black uppercase text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 text-sm font-medium">
                      No job cards found.
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job) => (
                    <tr key={job.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 border-b border-slate-100">
                        <div className="flex flex-col">
                          <span className="font-mono font-black text-[#5B50D6]">#{job.jobNumber}</span>
                          <span className="text-[8px] text-slate-400 font-bold uppercase">{format(new Date(job.date), 'dd MMM yyyy')}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 border-b border-slate-100">
                        <span className="text-xs font-black text-slate-700 uppercase">{job.customerName || 'N/A'}</span>
                      </td>
                      <td className="py-3 px-4 border-b border-slate-100">
                        <div className="flex gap-1 flex-wrap">
                          {(job.coilPlan || job.sizes.map(s => ({ size: s, rolls: job.eachCoilRolls }))).map((p, i) => (
                            <span key={i} className="bg-indigo-50 text-[#5B50D6] text-[9px] font-black px-2 py-0.5 rounded-lg border border-indigo-100/50">
                              {p.size}mm × {p.rolls}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 border-b border-slate-100 font-mono font-bold text-slate-700">{job.micron}μ</td>
                      <td className="py-3 px-4 border-b border-slate-100 text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            disabled={syncing === job.id}
                            onClick={async () => {
                              setSyncing(job.id!);
                              try {
                                await syncToGoogleSheets(job, 'JOB_SUMMARY');
                                toast.success('Manually synced to Sheets');
                              } catch (e: any) {
                                toast.error(e.message || 'Sync failed');
                              } finally {
                                setSyncing(null);
                              }
                            }} 
                            className="h-8 w-8 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${syncing === job.id ? 'animate-spin text-emerald-500' : ''}`} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(job)} className="h-8 w-8 text-slate-400 hover:text-primary hover:bg-primary/5">
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(job.id!)} className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
