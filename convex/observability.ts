import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const SAMPLE_RATE_SUCCESS = 0.01;

export type MetricRecorder = (entry: {
  outcome: "success" | "error";
  errorClass?: string;
  durationMs: number;
  actorUserId?: Id<"users">;
  organizationId?: Id<"organizations">;
}) => Promise<void>;

export async function withMetrics<T>(
  ctx: MutationCtx,
  mutation: string,
  handler: (recorder: MetricRecorder) => Promise<T>
): Promise<T> {
  const start = Date.now();
  let recorded = false;

  const recorder: MetricRecorder = async (entry) => {
    if (recorded) return;
    recorded = true;
    if (entry.outcome === "success" && Math.random() > SAMPLE_RATE_SUCCESS) {
      return;
    }
    await ctx.db.insert("mutationMetrics", {
      mutation,
      actorUserId: entry.actorUserId,
      organizationId: entry.organizationId,
      durationMs: entry.durationMs,
      outcome: entry.outcome,
      errorClass: entry.errorClass,
      createdAt: Date.now()
    });
  };

  try {
    const result = await handler(recorder);
    if (!recorded) {
      await recorder({ outcome: "success", durationMs: Date.now() - start });
    }
    return result;
  } catch (error) {
    const errorClass = error instanceof Error ? error.name : "UnknownError";
    if (!recorded) {
      await recorder({ outcome: "error", errorClass, durationMs: Date.now() - start });
    }
    throw error;
  }
}
