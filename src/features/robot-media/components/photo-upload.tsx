"use client";
import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { MAX_INPUT_BYTES } from "../model";

export function RobotPhotoUpload({
  eventKey,
  teamNumber,
}: {
  eventKey: string;
  teamNumber: number;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  function upload(file: File) {
    if (file.size > MAX_INPUT_BYTES) {
      setMessage("Choose a photo under 12 MB.");
      return;
    }
    if (!navigator.onLine) {
      setMessage(
        "Photo pending: upload it here when back online. Your text report can still be submitted.",
      );
      return;
    }
    const form = new FormData();
    form.set("eventKey", eventKey);
    form.set("teamNumber", String(teamNumber));
    form.set("photo", file);
    const request = new XMLHttpRequest();
    setBusy(true);
    setProgress(0);
    setMessage("");
    request.open("POST", "/api/robot-media");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        setProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      setBusy(false);
      let body: { error?: string } = {};
      try {
        body = JSON.parse(request.responseText);
      } catch {
        /* Show generic failure. */
      }
      if (request.status >= 200 && request.status < 300) {
        setProgress(100);
        setMessage("Photo saved. The Team page now shows it.");
        router.refresh();
      } else
        setMessage(
          body.error ?? "Photo upload failed. Select it again when connected.",
        );
    };
    request.onerror = () => {
      setBusy(false);
      setMessage(
        "Connection lost. Select the photo again when online; your text report is safe.",
      );
    };
    request.send(form);
  }
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) upload(file);
    event.target.value = "";
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex min-h-12 cursor-pointer items-center rounded-control border border-border px-4 py-3 font-bold">
          {busy ? "Uploading photo…" : "Take photo"}
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onChange={choose}
          />
        </label>
        <label className="inline-flex min-h-12 cursor-pointer items-center rounded-control border border-border px-4 py-3 font-bold">
          Choose existing photo
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            disabled={busy}
            onChange={choose}
          />
        </label>
      </div>
      {progress !== null && busy && (
        <div role="status">Uploading {progress}%</div>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <p className="text-sm text-muted">
        Up to four photos. Photos upload separately from the report.
      </p>
    </div>
  );
}
