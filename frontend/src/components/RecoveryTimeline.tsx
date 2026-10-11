import React from 'react';

export const RecoveryTimeline: React.FC = () => {
  return (
    <div className="w-full bg-[#161615] border border-[#2B2B28] rounded p-4 font-mono text-12 text-[#FAF9F6]">
      <div className="flex items-center justify-between text-[#9A9892] text-12 mb-3 border-b border-[#2B2B28] pb-1.5">
        <span>WORKER EXECUTION &amp; RECOVERY</span>
        <span className="tabular-nums">t = 0s → 45s</span>
      </div>

      <div className="space-y-3 timeline-loop">
        {/* Lane 1: worker-1 */}
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-[#9A9892] text-12">worker-1</span>
          <div className="flex-1 h-7 bg-[#21211F] rounded-sm relative overflow-hidden flex items-center">
            {/* Active running bar */}
            <div className="timeline-w1-bar h-full bg-[#3B6EA8] flex items-center px-2 text-white text-12 truncate select-none">
              <span className="truncate">job 8f3a91c2 running</span>
            </div>

            {/* Worker lost marker */}
            <div
              className="timeline-w1-lost absolute flex items-center gap-1 z-10"
              style={{ left: '42%' }}
            >
              <span className="w-2 h-2 rounded-full bg-[#B0483F] shrink-0" />
              <span className="text-[#B0483F] font-semibold text-12 bg-[#161615]/90 px-1 rounded-sm border border-[#B0483F]/30">
                worker lost
              </span>
            </div>

            {/* Dashed lease expiration bar */}
            <div
              className="timeline-lease absolute h-full border-t border-b border-dashed border-[#B0483F]/60 bg-[#B0483F]/10 flex items-center px-1 text-[#B0483F] text-12 truncate select-none"
              style={{ left: '42%' }}
            >
              <span className="truncate pl-1 opacity-90">lease expires</span>
            </div>
          </div>
        </div>

        {/* Lane 2: worker-2 */}
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-[#9A9892] text-12">worker-2</span>
          <div className="flex-1 h-7 bg-[#21211F] rounded-sm relative flex items-center px-2">
            <span className="text-[#9A9892]/40 text-12 italic">idle</span>
          </div>
        </div>

        {/* Lane 3: worker-3 */}
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-[#9A9892] text-12">worker-3</span>
          <div className="flex-1 h-7 bg-[#21211F] rounded-sm relative overflow-hidden flex items-center">
            {/* Growing attempt bar at 64% */}
            <div
              className="timeline-w3-bar absolute h-full rounded-sm flex items-center px-2 text-white text-12 select-none"
              style={{ left: '64%' }}
            >
              <span className="timeline-w3-running-text truncate">attempt 2...</span>
              <span className="timeline-w3-success-text truncate absolute left-2 right-2 font-semibold">
                succeeded, attempt 2
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Time Axis */}
      <div className="mt-3 pt-2 border-t border-[#2B2B28] flex justify-between text-[#9A9892] text-12 tabular-nums">
        <span>0s</span>
        <span>15s</span>
        <span>30s (lease timeout)</span>
        <span>45s</span>
      </div>
    </div>
  );
};
