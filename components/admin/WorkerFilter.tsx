"use client";

interface Worker {
  id: string;
  name: string;
}

interface WorkerFilterProps {
  workers: Worker[];
  selectedWorkerId: string; // "all" means "All workers", otherwise specific worker ID
  onWorkerChange: (workerId: string) => void;
}

export default function WorkerFilter({
  workers,
  selectedWorkerId,
  onWorkerChange,
}: WorkerFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-slate-600 font-medium">בחר עובד:</label>
      <select
        value={selectedWorkerId}
        onChange={(e) => {
          onWorkerChange(e.target.value);
        }}
        className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-right bg-white"
      >
        <option value="all">כל העובדים</option>
        {workers.map((worker) => (
          <option key={worker.id} value={worker.id}>
            {worker.name}
          </option>
        ))}
      </select>
    </div>
  );
}
