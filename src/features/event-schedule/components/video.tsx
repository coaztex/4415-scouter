import { youtubeVideoId } from "../model";
export function MatchVideo({ raw }: { raw: unknown }) {
  const id = youtubeVideoId(raw);
  return id ? (
    <iframe
      className="aspect-video w-full rounded-control border border-border"
      title="Official match video"
      loading="lazy"
      src={`https://www.youtube-nocookie.com/embed/${id}`}
      allow="encrypted-media; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  ) : (
    <p className="text-muted">No match video available.</p>
  );
}
