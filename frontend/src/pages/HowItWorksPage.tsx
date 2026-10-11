import React from 'react';
import { Link } from 'react-router-dom';

export const HowItWorksPage: React.FC = () => {
  return (
    <div className="p-6 max-w-4xl w-full mx-auto space-y-8 text-13">
      {/* Header */}
      <div>
        <h1 className="text-20 font-semibold text-ink tracking-tight">How Jobflow Works</h1>
        <p className="text-13 text-muted">
          Architecture, lifecycle states, leases, and failure recovery.
        </p>
      </div>

      {/* Job Lifecycle States */}
      <section className="space-y-4">
        <h2 className="text-15 font-semibold text-ink border-b border-border pb-2">
          Job Lifecycle States
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-panel border border-border rounded p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-status-queued"></span>
              <span className="font-mono font-semibold text-13 text-ink">QUEUED</span>
            </div>
            <p className="text-muted leading-relaxed">
              The job has been accepted, validated, and stored in PostgreSQL and Redis. It is waiting for an idle worker thread to claim it. Jobs scheduled for the future (<code className="font-mono text-12">runAt</code>) remain queued until their execution time arrives.
            </p>
          </div>

          <div className="bg-panel border border-border rounded p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-status-running"></span>
              <span className="font-mono font-semibold text-13 text-ink">RUNNING</span>
            </div>
            <p className="text-muted leading-relaxed">
              An active worker has claimed the job and obtained an exclusive lease. The worker heartbeats every 10 seconds to renew this lease while the job's handler executes.
            </p>
          </div>

          <div className="bg-panel border border-border rounded p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-status-retrying"></span>
              <span className="font-mono font-semibold text-13 text-ink">Retrying (QUEUED)</span>
            </div>
            <p className="text-muted leading-relaxed">
              An attempt failed or timed out, but the job has attempts remaining (<code className="font-mono text-12">attempts &lt; maxAttempts</code>). Jobflow schedules the next attempt using exponential backoff with jitter, delaying the next claim.
            </p>
          </div>

          <div className="bg-panel border border-border rounded p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-status-succeeded"></span>
              <span className="font-mono font-semibold text-13 text-ink">SUCCEEDED</span>
            </div>
            <p className="text-muted leading-relaxed">
              The job handler completed without throwing an error. The output returned by the handler is safely persisted in the job's result field.
            </p>
          </div>

          <div className="bg-panel border border-border rounded p-4 space-y-2 md:col-span-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-status-dead"></span>
              <span className="font-mono font-semibold text-13 text-ink">DEAD</span>
            </div>
            <p className="text-muted leading-relaxed">
              All retry attempts have been exhausted. The job will not execute again unless manually requeued or retried from the Jobs dashboard or API.
            </p>
          </div>
        </div>
      </section>

      {/* Leases and Worker Crashes */}
      <section className="bg-panel border border-border rounded p-5 space-y-3">
        <h2 className="text-15 font-semibold text-ink">
          What happens when a worker crashes?
        </h2>
        <div className="text-muted space-y-3 leading-relaxed">
          <p>
            When a worker claims a job, it acquires a <strong>lease</strong> with a 30-second expiration. While processing, the worker automatically sends heartbeats every 10 seconds to extend the lease.
          </p>
          <p>
            If the worker process abruptly terminates, hardware fails, or network connectivity is severed:
          </p>
          <ol className="list-decimal list-inside space-y-1.5 pl-1 font-sans">
            <li>The worker stops renewing the lease.</li>
            <li>Within 30 seconds, the database lease timestamp expires.</li>
            <li>
              A background <strong>Reaper</strong> process inspects expired leases, marks the failed attempt as <code className="font-mono text-12">LEASE_LOST</code> ("Worker lost"), and re-enqueues the job if retries remain.
            </li>
            <li>If retries are exhausted, the job transitions to <code className="font-mono text-12">DEAD</code>.</li>
          </ol>
          <p>
            This guarantees <strong>at-least-once delivery</strong>: no job is permanently lost or abandoned if a worker node crashes mid-execution.
          </p>
        </div>
      </section>

      {/* Navigation footer */}
      <div className="pt-2 flex items-center justify-between border-t border-border">
        <Link to="/jobs" className="text-accent font-medium hover:underline text-13">
          ← Back to Jobs
        </Link>
        <Link to="/endpoints" className="text-accent font-medium hover:underline text-13">
          Configure Endpoints →
        </Link>
      </div>
    </div>
  );
};
