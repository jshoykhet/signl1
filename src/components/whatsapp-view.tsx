"use client";

import { PageHeader } from "@/components/page-header";
import { WhatsAppSettings } from "@/components/whatsapp-settings";

export function WhatsAppView() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-[680px] flex-1 px-4 py-6 sm:px-5 sm:py-8">
        <PageHeader
          title="WhatsApp"
          description="Text Signl1 from WhatsApp to search the feed"
        />
        <div className="mt-6 sm:mt-8">
          <WhatsAppSettings />
        </div>
      </div>
    </div>
  );
}
