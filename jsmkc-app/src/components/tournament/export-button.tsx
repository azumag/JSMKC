import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface ExportButtonProps {
  tournamentId: string;
  tournamentName?: string;
  mode?: "full" | "bm" | "mr" | "gp" | "ta";
  children?: React.ReactNode;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  size?: "default" | "sm" | "lg";
  disabled?: boolean;
}

export function ExportButton({ 
  tournamentId, 
  tournamentName = "tournament", 
  mode = "full",
  children,
  variant = "outline",
  size = "sm",
  disabled = false
}: ExportButtonProps) {
  const handleExport = async () => {
    try {
      const endpoint = mode === "full" 
        ? `/api/tournaments/${tournamentId}/export`
        : `/api/tournaments/${tournamentId}/${mode}/export`;
      
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error("Failed to export tournament");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      
      // Extract filename from response headers or generate one
      const contentDisposition = response.headers.get("content-disposition");
      let filename = `${tournamentName.replace(/[^a-zA-Z0-9]/g, "_")}-${mode}-export.xlsx`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
      // You could add a toast notification here
    }
  };

  return (
    <Button 
      onClick={handleExport} 
      variant={variant} 
      size={size}
      disabled={disabled}
    >
      <Download className="w-4 h-4 mr-2" />
      {children || `Export ${mode === "full" ? "All" : mode.toUpperCase()}`}
    </Button>
  );
}