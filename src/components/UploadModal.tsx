import React, { useState, useRef, useEffect } from "react";
import { X, Upload, Camera, Files, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { BillRecord } from "../types";

interface UploadModalProps {
  isOpen: boolean;
  initialTab?: "file" | "camera" | "batch";
  onClose: () => void;
  onUploadSuccess: (bill: BillRecord) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  initialTab = "file",
  onClose,
  onUploadSuccess
}) => {
  const [activeTab, setActiveTab] = useState<"file" | "camera" | "batch">(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (initialTab === "camera") {
        startCamera();
      }
    }
  }, [isOpen, initialTab]);

  // Single / Batch files
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; filename: string }>({
    current: 0,
    total: 0,
    filename: ""
  });
  const [error, setError] = useState<string | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setSelectedFiles([]);
      setError(null);
      setUploading(false);
    }
  }, [isOpen]);

  // Start Camera
  const startCamera = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCameraActive(true);
    } catch (err: any) {
      console.error("Camera access error:", err);
      setError("Unable to access camera. Please allow camera permissions or upload a file directly.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  // Capture image from camera
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `bill-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        setSelectedFiles([file]);
        stopCamera();
        setActiveTab("file");
      }
    }, "image/jpeg", 0.92);
  };

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArr = Array.from(e.target.files);
      setSelectedFiles(filesArr);
      setError(null);
    }
  };

  // Handle drag & drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArr = Array.from(e.dataTransfer.files);
      setSelectedFiles(filesArr);
      setError(null);
    }
  };

  // Process & Upload files
  const handleStartProcess = async () => {
    if (selectedFiles.length === 0) {
      setError("Please select or capture at least one bill file.");
      return;
    }

    setUploading(true);
    setError(null);
    setProgress({ current: 0, total: selectedFiles.length, filename: "" });

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setProgress({ current: i + 1, total: selectedFiles.length, filename: file.name });

        const formData = new FormData();
        formData.append("billFile", file);

        const res = await fetch("/api/bills/analyze", {
          method: "POST",
          body: formData
        });

        let data: any = null;
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await res.json();
        } else {
          const rawText = await res.text().catch(() => "");
          console.error("Server returned non-JSON response:", rawText);
          throw new Error(`Server returned unexpected error (${res.status}). Please check file format and try again.`);
        }

        if (!res.ok) {
          throw new Error(data?.error || `Failed to analyze ${file.name}`);
        }

        const billRecord: BillRecord = data;
        onUploadSuccess(billRecord);
      }

      setUploading(false);
      onClose();
    } catch (err: any) {
      console.error("Upload error:", err);
      setError(err.message || "An error occurred during invoice AI extraction.");
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-slate-900/95 border border-slate-800/90 rounded-2xl shadow-2xl max-w-2xl w-full text-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/80">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Upload Purchase Bill</h2>
              <p className="text-[11px] text-slate-400">Automated Gemini AI OCR & MIRA Tax Extraction</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            disabled={uploading}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800/80 bg-slate-950/60 px-6 pt-3 space-x-2">
          <button
            onClick={() => {
              stopCamera();
              setActiveTab("file");
            }}
            className={`flex items-center space-x-2 pb-3 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "file"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Single File</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("camera");
              startCamera();
            }}
            className={`flex items-center space-x-2 pb-3 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "camera"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Take Photo</span>
          </button>

          <button
            onClick={() => {
              stopCamera();
              setActiveTab("batch");
            }}
            className={`flex items-center space-x-2 pb-3 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "batch"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Files className="w-3.5 h-3.5" />
            <span>Batch Upload</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start space-x-2.5 shadow-sm">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* SINGLE / BATCH DROPZONE */}
          {(activeTab === "file" || activeTab === "batch") && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-slate-700/80 hover:border-emerald-500/80 bg-slate-950/60 rounded-2xl p-8 text-center transition-all cursor-pointer group hover:bg-slate-950/80"
              onClick={() => document.getElementById("billFileInput")?.click()}
            >
              <input
                id="billFileInput"
                type="file"
                multiple={activeTab === "batch"}
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/30 group-hover:text-emerald-400 group-hover:scale-110 transition-all duration-200">
                {activeTab === "batch" ? <Files className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
              </div>
              <p className="text-xs font-bold text-slate-100 group-hover:text-emerald-300 transition-colors">
                {activeTab === "batch"
                  ? "Drag & drop multiple bill images or PDFs here"
                  : "Drag & drop purchase bill image or PDF here"}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Supports PNG, JPG, WEBP, or PDF invoices
              </p>
            </div>
          )}

          {/* CAMERA CAPTURE */}
          {activeTab === "camera" && (
            <div className="bg-black/90 rounded-2xl overflow-hidden relative flex flex-col items-center justify-center min-h-[260px] border border-slate-800">
              {cameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full max-h-[320px] object-cover"
                  />
                  <div className="absolute bottom-4 flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-full shadow-lg flex items-center space-x-2 transition-transform active:scale-95 cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Capture Bill Photo</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-6 text-center space-y-3">
                  <Camera className="w-12 h-12 text-slate-500 mx-auto" />
                  <p className="text-xs text-slate-400">Click below to start camera feed</p>
                  <button
                    onClick={startCamera}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Start Camera
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Selected files preview */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Selected File(s) ({selectedFiles.length})
              </h3>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2.5 bg-slate-950/80 border border-slate-800/80 rounded-xl text-xs"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-slate-200 font-semibold truncate">{file.name}</span>
                    </div>
                    <span className="text-slate-400 font-mono text-[11px] ml-2 shrink-0">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress Indicator */}
          {uploading && (
            <div className="p-4 bg-slate-950/90 rounded-2xl border border-slate-800/90 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-400 font-bold flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI Extracting Data ({progress.current} of {progress.total})...
                </span>
                <span className="text-slate-400 font-mono text-[11px] truncate max-w-[200px]">{progress.filename}</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 text-center italic">
                Gemini AI is parsing supplier TIN, invoice number, line items, and GST amounts...
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/80 bg-slate-900/80">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            disabled={uploading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleStartProcess}
            disabled={uploading || selectedFiles.length === 0}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>
                  Process {selectedFiles.length > 0 ? `${selectedFiles.length} File(s)` : "Bill"} with AI
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
