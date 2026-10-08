import type { Database } from "@/types/database.generated";
// The installed migration is now covered by generated Supabase types.
export type StrategyBoardTable =
  Database["public"]["Tables"]["strategy_boards"];
export type StrategyBoardRow = StrategyBoardTable["Row"];
