import { useReadContracts } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "./constants";
import { useTotalRecords } from "./hooks";
import { GitBranch, ExternalLink, Clock } from "lucide-react";

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(timestamp: bigint) {
  const seconds = Math.floor(Date.now() / 1000 - Number(timestamp));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function ContributionFeed() {
  const { data: totalRecords } = useTotalRecords();
  const total = totalRecords ? Number(totalRecords) : 0;

  // Read up to last 5 records
  const indices = Array.from({ length: Math.min(total, 5) }, (_, i) => BigInt(total - 1 - i));

  const contracts = indices.map((index) => ({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getRecord" as const,
    args: [index] as const,
  }));

  const { data: records, isLoading } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  });

  return (
    <div className="mt-16 glass-strong rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-white/10 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
          <h3 className="font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Live Verification Feed
          </h3>
        </div>
        <span
          className="text-xs px-3 py-1 rounded-full"
          style={{
            background: "rgba(0,240,255,0.1)",
            border: "1px solid rgba(0,240,255,0.3)",
            color: "#00f0ff",
          }}
        >
          {total} Total Records
        </span>
      </div>

      <div className="divide-y divide-white/5">
        {isLoading && (
          <div className="p-8 text-center">
            <div className="inline-flex items-center gap-2 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-[#00f0ff]/40 border-t-[#00f0ff] rounded-full animate-spin" />
              Loading records from chain...
            </div>
          </div>
        )}

        {!isLoading && total === 0 && (
          <div className="p-8 text-center text-gray-500 text-sm">
            No contributions yet. Be the first to stake and submit a PR!
          </div>
        )}

        {records?.map((result, i) => {
          if (result.status !== "success") return null;
          const [user, data, timestamp] = result.result as [string, string, bigint];

          // data field may contain a PR ID or URL from Member B's backend
          const displayData = data.startsWith("PR#")
            ? data
            : data.length > 30
              ? data.slice(0, 30) + "…"
              : data;

          return (
            <div key={i} className="p-5 flex items-center gap-4 hover:bg-white/[0.02] transition-all group">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(0,240,255,0.1)", border: "1px solid rgba(0,240,255,0.2)" }}
              >
                <GitBranch className="w-5 h-5 text-[#00f0ff]" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-mono text-[#00f0ff]">{truncateAddress(user)}</span>
                  <span className="text-xs text-gray-500">•</span>
                  <span className="text-xs text-gray-400 truncate">{displayData}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  {timeAgo(timestamp)}
                </div>
              </div>

              <div
                className="text-xs px-2 py-1 rounded-full flex-shrink-0"
                style={{
                  background: "rgba(16,185,129,0.1)",
                  border: "1px solid rgba(16,185,129,0.3)",
                  color: "#10b981",
                }}
              >
                ✓ Verified
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
