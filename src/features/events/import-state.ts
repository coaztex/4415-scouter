export type ImportState = {
  message?: string;
  error?: string;
  preview?: {
    key: string;
    name: string;
    location: string;
    dates: string;
    teamCount: number;
    gameSlug: string;
  };
};
