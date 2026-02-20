import React, { useState } from 'react';
import Webcam from "react-webcam";
import { CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button"; // Adjust path to your UI folder

const WebcamView = () => {
  const [enabled, setEnabled] = useState(false);

  return (
    <div className="flex w-full flex-col items-center justify-center gap-4">
      <div className="relative h-56 sm:h-72 w-full max-w-full sm:max-w-md rounded-lg border-2 border-dashed border-gray-300 bg-gray-100 flex items-center justify-center overflow-hidden">
        {enabled ? (
          <Webcam
            onUserMediaError={() => setEnabled(false)}
            mirrored={true}
            className="h-full w-full object-cover rounded-lg"
          />
        ) : (
          <CameraOff className="h-12 w-12 text-gray-400" />
        )}
      </div>

      <Button 
        variant={enabled ? "destructive" : "default"}
        onClick={() => setEnabled(!enabled)}
        className="w-full sm:w-auto"
      >
        {enabled ? "Disable Camera" : "Enable Camera"}
      </Button>
    </div>
  );
};

export default WebcamView;
