"use client";

import type { ComponentType } from "react";
import dynamic from "next/dynamic";

export interface WorkflowProps {
  onBack: () => void;
}

/**
 * Tool id → workflow screen. Each workflow is code-split so the dashboard
 * only downloads the screen the user opens. Tools missing here show the
 * "coming soon" placeholder.
 */
export const workflows: Record<string, ComponentType<WorkflowProps>> = {
  merge: dynamic(() => import("./MergeWorkflow"), { ssr: false }),
  split: dynamic(() => import("./SplitWorkflow"), { ssr: false }),
  extract: dynamic(() => import("./ExtractWorkflow"), { ssr: false }),
  reorder: dynamic(() => import("./ReorderWorkflow"), { ssr: false }),
  delete: dynamic(() => import("./DeleteWorkflow"), { ssr: false }),
  rotate: dynamic(() => import("./RotateWorkflow"), { ssr: false }),
  watermark: dynamic(() => import("./WatermarkWorkflow"), { ssr: false }),
  "page-numbers": dynamic(() => import("./PageNumbersWorkflow"), { ssr: false }),
  "add-text": dynamic(() => import("./AddTextWorkflow"), { ssr: false }),
  "add-image": dynamic(() => import("./AddImageWorkflow"), { ssr: false }),
  "header-footer": dynamic(() => import("./HeaderFooterWorkflow"), { ssr: false }),
  background: dynamic(() => import("./BackgroundWorkflow"), { ssr: false }),
  crop: dynamic(() => import("./CropWorkflow"), { ssr: false }),
};
