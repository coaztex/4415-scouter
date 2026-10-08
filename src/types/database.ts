// Stable imports for callers; regenerate only database.generated.ts.
export * from "./database.generated";
import type { Database as GeneratedDatabase } from "./database.generated";

// PostgreSQL introspection cannot infer nullable text function arguments.
// Keep those documented RPC contracts here, outside generated output.
type Functions = GeneratedDatabase["public"]["Functions"];
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: Omit<
      Functions,
      | "correct_scouting_submission"
      | "store_nexus_pit_map"
      | "store_nexus_inspection"
    > & {
      correct_scouting_submission: Omit<
        Functions["correct_scouting_submission"],
        "Args"
      > & {
        Args: Omit<
          Functions["correct_scouting_submission"]["Args"],
          "reason"
        > & { reason: string | null };
      };
      store_nexus_pit_map: Omit<Functions["store_nexus_pit_map"], "Args"> & {
        Args: Omit<Functions["store_nexus_pit_map"]["Args"], "message"> & {
          message: string | null;
        };
      };
      store_nexus_inspection: Omit<
        Functions["store_nexus_inspection"],
        "Args"
      > & {
        Args: Omit<Functions["store_nexus_inspection"]["Args"], "message"> & {
          message: string | null;
        };
      };
    };
  };
};
export type ProfileRole =
  import("./database.generated").Database["public"]["Enums"]["profile_role"];
