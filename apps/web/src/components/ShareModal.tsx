import { useEffect, useState, type RefObject } from "react";
import type Konva from "konva";

interface ShareModalProps {
  roomId: string;
  stageRef: RefObject<Konva.Stage | null>;
  onClose: () => void;
}

function exportBoardAsPng(stage: Konva.Stage): void {
  const dataUrl = stage.toDataURL({ pixelRatio: 2 });
  const link = document.createElement("a");
  link.download = "collabboard.png";
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function openTwitterIntent(text: string, url?: string): void {
  const params = new URLSearchParams({ text });
  if (url) params.set("url", url);
  window.open(`https://twitter.com/intent/tweet?${params.toString()}`, "_blank");
}

export function ShareModal({ roomId, stageRef, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  const viewUrl = `${window.location.origin}/view/${roomId}`;
  const shareUrl = `${window.location.origin}/share/${roomId}`;

  // Auto-capture preview and upload snapshot when modal opens
  useEffect(() => {
    if (!stageRef.current) return;
    const dataUrl = stageRef.current.toDataURL({ pixelRatio: 1 });
    setPreviewDataUrl(dataUrl);

    setSnapshotStatus("uploading");
    const hiResDataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });
    fetch(`/api/room/${roomId}/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: hiResDataUrl }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Upload failed");
        setSnapshotStatus("done");
        setTimeout(() => setSnapshotStatus("idle"), 2000);
      })
      .catch(() => {
        setSnapshotStatus("error");
        setTimeout(() => setSnapshotStatus("idle"), 3000);
      });
  }, []); // runs once on mount

  const handleDownloadPng = () => {
    if (!stageRef.current) return;
    exportBoardAsPng(stageRef.current);
  };

  const handleTweetWithImage = () => {
    if (!stageRef.current) return;
    exportBoardAsPng(stageRef.current);
    openTwitterIntent("Check out my CollabBoard!");
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(viewUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTweetLink = () => {
    openTwitterIntent("Check out my CollabBoard!", shareUrl);
  };

  const cardStyle: React.CSSProperties = {
    background: "#f8fafc",
    borderRadius: 12,
    padding: 20,
    border: "1px solid rgba(0,0,0,0.06)",
  };

  const btnBase: React.CSSProperties = {
    padding: "10px 16px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    transition: "all 0.2s",
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 16,
          padding: 32,
          width: "90%",
          maxWidth: 500,
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a202c", margin: 0 }}>
            Share Board
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280", padding: 4 }}
          >
            x
          </button>
        </div>

        {/* Card 1: Share Link (with auto-updated preview) */}
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", margin: 0 }}>
              Share Link
            </h3>
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: snapshotStatus === "done" ? "#10b981" : snapshotStatus === "error" ? "#ef4444" : "#6b7280",
            }}>
              {snapshotStatus === "uploading"
                ? "Updating preview..."
                : snapshotStatus === "done"
                  ? "Preview updated"
                  : snapshotStatus === "error"
                    ? "Preview failed"
                    : "Preview ready"}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
            Anyone with the link can view your board. Twitter will show a preview card.
          </p>

          {previewDataUrl && (
            <div style={{
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid #e2e8f0",
              marginBottom: 12,
              background: "#f1f5f9",
            }}>
              <img
                src={previewDataUrl}
                alt="Board preview"
                style={{ width: "100%", display: "block" }}
              />
              <div style={{ padding: "8px 12px", borderTop: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>CollabBoard - Check out this whiteboard!</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{window.location.host}</div>
              </div>
            </div>
          )}

          <div
            style={{
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              color: "#334155",
              fontFamily: "monospace",
              wordBreak: "break-all",
              marginBottom: 12,
            }}
          >
            {viewUrl}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleCopyLink}
              style={{
                ...btnBase,
                background: copied ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #6b7280, #4b5563)",
                color: "white",
                flex: 1,
              }}
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <button
              onClick={handleTweetLink}
              style={{ ...btnBase, background: "linear-gradient(135deg, #0ea5e9, #0284c7)", color: "white", flex: 1 }}
            >
              Tweet Link
            </button>
          </div>
        </div>

        {/* Card 2: Share as Image */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", margin: "0 0 4px" }}>
            Share as Image
          </h3>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
            Download the image, then attach it to your tweet
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleDownloadPng}
              style={{ ...btnBase, background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white", flex: 1 }}
            >
              Download as PNG
            </button>
            <button
              onClick={handleTweetWithImage}
              style={{ ...btnBase, background: "linear-gradient(135deg, #0ea5e9, #0284c7)", color: "white", flex: 1 }}
            >
              Tweet with Image
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
