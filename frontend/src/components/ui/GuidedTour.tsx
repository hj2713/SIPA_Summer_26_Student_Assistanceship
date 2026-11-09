import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, X, ChevronRight, ChevronLeft } from "lucide-react";

export interface TourStep {
  targetId: string;
  title: string;
  description: string;
  preferredPlacement?: "bottom" | "top" | "left" | "right";
}

interface GuidedTourProps {
  steps: TourStep[];
  isOpen: boolean;
  onClose: () => void;
  tourKey?: string;
}

export function GuidedTour({ steps, isOpen, onClose, tourKey }: GuidedTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const currentStep = steps[currentStepIndex];

  // Update target rect on step change or resize
  useEffect(() => {
    if (!isOpen || !currentStep) return;

    const updateRect = () => {
      const el = document.getElementById(currentStep.targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setTargetRect(el.getBoundingClientRect());
      } else {
        setTargetRect(null);
      }
    };

    updateRect();
    const timer = setTimeout(updateRect, 150);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [isOpen, currentStepIndex, currentStep]);

  if (!isOpen || !currentStep) return null;

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    if (tourKey) {
      try {
        localStorage.setItem(`tour_${tourKey}_completed`, "true");
      } catch {}
    }
    setCurrentStepIndex(0);
    onClose();
  };

  const progressPct = Math.round(((currentStepIndex + 1) / steps.length) * 100);

  // Compute Card Position relative to targetRect
  let cardStyle: React.CSSProperties = {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  };

  if (targetRect) {
    const margin = 14;
    const cardWidth = 340;
    const cardHeight = 220;

    // Check if bottom fits
    const fitsBottom = targetRect.bottom + cardHeight + margin < window.innerHeight;
    const fitsTop = targetRect.top - cardHeight - margin > 0;

    let top = targetRect.bottom + margin;
    let left = targetRect.left + targetRect.width / 2 - cardWidth / 2;

    if (!fitsBottom && fitsTop) {
      top = targetRect.top - cardHeight - margin;
    }

    // Keep within horizontal bounds
    left = Math.max(16, Math.min(left, window.innerWidth - cardWidth - 16));

    cardStyle = {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: `${cardWidth}px`,
      zIndex: 60,
    };
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto">
      {/* Click-away backdrop to advance or dismiss */}
      <div
        className="fixed inset-0 z-40 cursor-pointer"
        onClick={handleComplete}
      />

      {/* Subtle backdrop blur with cutout hole for target element */}
      <div
        className="fixed inset-0 z-40 pointer-events-none backdrop-blur-[1.5px] transition-all duration-300"
        style={{
          mask: "url(#tour-spotlight-mask)",
          WebkitMask: "url(#tour-spotlight-mask)",
        }}
      />

      {/* SVG Dimming Overlay with dynamic spotlight cutout */}
      <svg className="fixed inset-0 w-full h-full pointer-events-none z-45 transition-all duration-300">
        <defs>
          <mask id="tour-spotlight-mask">
            {/* White fills entire screen so overlay is rendered */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Black punches out a crystal-clear, unblurred hole over the target element */}
            {targetRect && (
              <rect
                x={targetRect.left - 6}
                y={targetRect.top - 6}
                width={targetRect.width + 12}
                height={targetRect.height + 12}
                rx={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        {/* Soft dimming (40% darkness rather than heavy 65% black) */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.40)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* Spotlight Ring framing the unblurred target element */}
      {targetRect && (
        <div
          style={{
            position: "fixed",
            top: `${targetRect.top - 6}px`,
            left: `${targetRect.left - 6}px`,
            width: `${targetRect.width + 12}px`,
            height: `${targetRect.height + 12}px`,
            zIndex: 48,
          }}
          className="rounded-xl border-2 border-primary shadow-[0_0_20px_rgba(11,79,72,0.35)] pointer-events-none transition-all duration-300 ring-4 ring-primary/25"
        />
      )}

      {/* Floating Tour Guide Card (DARE Style) */}
      <div
        ref={cardRef}
        style={cardStyle}
        className="bg-card text-card-foreground border border-border rounded-2xl shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Sparkles className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground tracking-tight">
                {currentStep.title}
              </h4>
            </div>
          </div>
          <button
            onClick={handleComplete}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {currentStep.description}
        </p>

        {/* Step Progress Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span>
              {currentStepIndex + 1} / {steps.length}
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
            <div
              style={{ width: `${progressPct}%` }}
              className="h-full bg-primary transition-all duration-300 rounded-full"
            />
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleComplete}
            className="text-xs text-muted-foreground hover:text-foreground h-8 px-2"
          >
            Skip tour
          </Button>

          <div className="flex items-center gap-1.5">
            {currentStepIndex > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                className="text-xs h-8 px-2.5 gap-1"
              >
                <ChevronLeft className="h-3 w-3" /> Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleNext}
              className="text-xs font-semibold h-8 px-3.5 gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {currentStepIndex < steps.length - 1 ? (
                <>
                  Next <ChevronRight className="h-3 w-3" />
                </>
              ) : (
                "Finish"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
