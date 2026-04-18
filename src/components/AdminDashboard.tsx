import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { JobCard } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Search, Download, Edit2, Trash2, Loader2, Calendar as CalendarIcon, CheckCircle2, Scale, Factory } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export default function AdminDashboard() {
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobCard | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    jobNumber: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    sizes: '',
    micron: '',
    oneRollMeter: '',
    eachCoilQuantity: '',
    eachCoilRolls: '',
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
    job.jobNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const sizesArray = formData.sizes.split('+').map(s => parseFloat(s.trim())).filter(s => !isNaN(s));
      
      const jobData = {
        jobNumber: formData.jobNumber,
        date: formData.date,
        sizes: sizesArray,
        micron: parseFloat(formData.micron),
        oneRollMeter: parseFloat(formData.oneRollMeter),
        eachCoilQuantity: parseFloat(formData.eachCoilQuantity),
        eachCoilRolls: parseFloat(formData.eachCoilRolls),
        status: formData.status,
        updatedAt: serverTimestamp(),
      };

      if (editingJob) {
        await updateDoc(doc(db, 'jobCards', editingJob.id!), jobData);
        toast.success('Job card updated successfully');
      } else {
        await addDoc(collection(db, 'jobCards'), {
          ...jobData,
          createdAt: serverTimestamp(),
        });
        toast.success('Job card created successfully');
      }

      setIsDialogOpen(false);
      setEditingJob(null);
      setFormData({
        jobNumber: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        sizes: '',
        micron: '',
        oneRollMeter: '',
        eachCoilQuantity: '',
        eachCoilRolls: '',
        status: 'pending',
      });
    } catch (error) {
      toast.error('Failed to save job card');
      console.error(error);
    }
  };

  const handleEdit = (job: JobCard) => {
    setEditingJob(job);
    setFormData({
      jobNumber: job.jobNumber,
      date: job.date,
      sizes: job.sizes.join(' + '),
      micron: job.micron.toString(),
      oneRollMeter: job.oneRollMeter.toString(),
      eachCoilQuantity: job.eachCoilQuantity.toString(),
      eachCoilRolls: job.eachCoilRolls.toString(),
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
                sizes: '',
                micron: '',
                oneRollMeter: '',
                eachCoilQuantity: '',
                eachCoilRolls: '',
              });
            }
          }}>
            <DialogTrigger render={<Button className="h-10 font-bold shadow-lg shadow-primary/20" />}>
              <Plus className="mr-2 h-4 w-4" />
              New Job Card
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">{editingJob ? 'Edit Job Card' : 'Create New Job Card'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="jobNumber" className="text-[10px] font-bold uppercase text-slate-500">Job Number</Label>
                    <Input 
                      id="jobNumber" 
                      className="h-11 rounded-xl border-slate-200 font-mono font-bold"
                      value={formData.jobNumber} 
                      onChange={e => setFormData({...formData, jobNumber: e.target.value})}
                      required 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="date" className="text-[10px] font-bold uppercase text-slate-500">Date</Label>
                    <Input 
                      id="date" 
                      type="date" 
                      className="h-11 rounded-xl border-slate-200 font-mono font-bold"
                      value={formData.date} 
                      onChange={e => setFormData({...formData, date: e.target.value})}
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sizes" className="text-[10px] font-bold uppercase text-slate-500">Sizes (e.g. 250 + 300 + 150)</Label>
                  <Input 
                    id="sizes" 
                    className="h-11 rounded-xl border-slate-200 font-mono font-bold"
                    value={formData.sizes} 
                    onChange={e => setFormData({...formData, sizes: e.target.value})}
                    placeholder="250 + 300"
                    required 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="micron" className="text-[10px] font-bold uppercase text-slate-500">Micron</Label>
                    <Input 
                      id="micron" 
                      type="number" 
                      step="0.01"
                      className="h-11 rounded-xl border-slate-200 font-mono font-bold"
                      value={formData.micron} 
                      onChange={e => setFormData({...formData, micron: e.target.value})}
                      required 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="oneRollMeter" className="text-[10px] font-bold uppercase text-slate-500">1 Roll Meter</Label>
                    <Input 
                      id="oneRollMeter" 
                      type="number" 
                      className="h-11 rounded-xl border-slate-200 font-mono font-bold"
                      value={formData.oneRollMeter} 
                      onChange={e => setFormData({...formData, oneRollMeter: e.target.value})}
                      required 
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="eachCoilQuantity" className="text-[10px] font-bold uppercase text-slate-500">Each Coil Quantity</Label>
                    <Input 
                      id="eachCoilQuantity" 
                      type="number" 
                      className="h-11 rounded-xl border-slate-200 font-mono font-bold"
                      value={formData.eachCoilQuantity} 
                      onChange={e => setFormData({...formData, eachCoilQuantity: e.target.value})}
                      required 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="eachCoilRolls" className="text-[10px] font-bold uppercase text-slate-500">Each Coil Rolls</Label>
                    <Input 
                      id="eachCoilRolls" 
                      type="number" 
                      className="h-11 rounded-xl border-slate-200 font-mono font-bold"
                      value={formData.eachCoilRolls} 
                      onChange={e => setFormData({...formData, eachCoilRolls: e.target.value})}
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Status</Label>
                  <div className="flex gap-2">
                    {['pending', 'in-progress', 'completed'].map((status) => (
                      <Button
                        key={status}
                        type="button"
                        variant={formData.status === status ? 'default' : 'outline'}
                        size="sm"
                        className="h-9 text-[10px] font-bold uppercase px-4 rounded-xl flex-grow"
                        onClick={() => setFormData({...formData, status: status as any})}
                      >
                        {status}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button type="submit" className="w-full h-12 rounded-xl font-bold text-lg mt-2">
                  {editingJob ? 'Update Job Card' : 'Create Job Card'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0 px-1">
        {[
          { label: 'Total Jobs', value: jobCards.length, icon: Factory, color: 'text-[#5B50D6]', bg: 'bg-[#5B50D6]/5' },
          { label: 'Pending', value: jobCards.filter(j => j.status === 'pending').length, icon: Loader2, color: 'text-amber-500', bg: 'bg-amber-50' },
          { label: 'Completed', value: jobCards.filter(j => j.status === 'completed').length, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50' },
          { label: 'Avg Micron', value: jobCards.length ? (jobCards.reduce((acc, curr) => acc + curr.micron, 0) / jobCards.length).toFixed(1) : '0.0', icon: Scale, color: 'text-blue-500', bg: 'bg-blue-50' }
        ].map((stat, i) => (
          <div key={i} className={`p-3 sm:p-4 rounded-2xl border border-slate-200 bg-white flex items-center gap-3 sm:gap-4 shadow-sm`}>
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${stat.bg} flex items-center justify-center shrink-0`}>
              <stat.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${stat.color}`} />
            </div>
            <div>
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500">{stat.label}</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">{stat.value}</p>
            </div>
          </div>
        ))}
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
                  <th className="text-left py-3 px-4 border-b-2 border-slate-100 text-[10px] font-bold uppercase text-slate-400">Job No.</th>
                  <th className="text-left py-3 px-4 border-b-2 border-slate-100 text-[10px] font-bold uppercase text-slate-400">Date</th>
                  <th className="text-left py-3 px-4 border-b-2 border-slate-100 text-[10px] font-bold uppercase text-slate-400">Sizes (mm)</th>
                  <th className="text-left py-3 px-4 border-b-2 border-slate-100 text-[10px] font-bold uppercase text-slate-400">Micron</th>
                  <th className="text-right py-3 px-4 border-b-2 border-slate-100 text-[10px] font-bold uppercase text-slate-400">Actions</th>
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
                      <td className="py-3 px-4 border-b border-slate-100 font-mono font-bold text-primary">#{job.jobNumber}</td>
                      <td className="py-3 px-4 border-b border-slate-100 text-sm text-slate-600">{format(new Date(job.date), 'dd MMM yyyy')}</td>
                      <td className="py-3 px-4 border-b border-slate-100">
                        <div className="flex gap-1 flex-wrap">
                          {job.sizes.map((s, i) => (
                            <span key={i} className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded">
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 border-b border-slate-100 font-mono font-bold text-slate-700">{job.micron}μ</td>
                      <td className="py-3 px-4 border-b border-slate-100 text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
