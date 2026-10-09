import type { ComponentProps } from "react";
import { boardLanes } from "../model/swimlanes";
import { Board } from "./Board";

/** Fork addition: one `Board` per lane, stacked and scrolling sideways together (see swimlanes.css). */
export function Swimlanes({ by, ...props }: { by: string } & ComponentProps<typeof Board>) {
  const lanes = boardLanes(props.board, by);
  return (
    <div className="folia-lanes">
      {lanes.map((lane) => (
        <section key={lane.value} className="folia-lane" aria-label={lane.value || `No ${by}`}>
          <h3 className="folia-lane-title">
            {lane.value || `No ${by}`} <span className="folia-muted">{lane.count}</span>
          </h3>
          <Board {...props} board={{ ...props.board, columns: lane.columns }} wipLimits={{}} />
        </section>
      ))}
    </div>
  );
}
