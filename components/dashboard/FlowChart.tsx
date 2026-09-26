"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { DailyStatRow } from "@/types/analytics";
import { formatUsdtExact } from "@/lib/utils/format";
import { EmptyState } from "./EmptyState";
import { LoadingSkeleton } from "./LoadingSkeleton";

interface FlowChartProps {
  data: DailyStatRow[];
  loading: boolean;
}

export function FlowChart({ data, loading }: FlowChartProps) {
  if (loading && data.length === 0) {
    return <LoadingSkeleton variant="chart" />;
  }

  const chartData = [...data]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      Deposits: d.depositAmount,
      Withdrawals: d.withdrawalAmount,
      "Net Cash Flow": d.netCashFlow,
    }));

  return (
    <article className="tn-card p-4 sm:p-5">
      <h2 className="text-lg font-bold text-[var(--tn-navy)]">Daily USDT Flow</h2>
      <p className="mt-1 text-sm text-[var(--tn-muted)]">
        Deposits, withdrawals, and net cash flow by UTC day
      </p>

      {chartData.length === 0 ? (
        <div className="mt-6">
          <EmptyState message="No blockchain transactions found for this period." />
        </div>
      ) : (
        <div className="mt-4 h-72 w-full sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickMargin={8}
              />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={56} />
              <Tooltip
                formatter={(value) =>
                  `${formatUsdtExact(Number(value ?? 0))} USDT`
                }
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
              />
              <Legend />
              <Bar dataKey="Deposits" fill="#15803d" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Withdrawals" fill="#c2410c" radius={[4, 4, 0, 0]} />
              <Line
                type="monotone"
                dataKey="Net Cash Flow"
                stroke="#1d4ed8"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
