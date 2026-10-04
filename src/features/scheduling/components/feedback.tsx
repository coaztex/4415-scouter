import type { ScheduleActionState } from "../model";
export function ScheduleFeedback({ state }: { state: ScheduleActionState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="my-4 font-semibold text-danger">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="my-4 font-semibold">
          {state.message}
        </p>
      )}
    </>
  );
}
